import * as THREE from 'three';

// Tuning constants from the spec (§5) plus implementation-level knobs.
export const PHYSICS = {
  moveSpeed: 6.0,          // units/sec ground run speed
  airControl: 0.7,         // multiplier on horizontal control while airborne
  gravity: -28,            // units/sec^2
  jumpVelocity: 11,        // initial upward velocity on jump
  coyoteTime: 0.12,        // seconds after leaving ground you can still jump
  jumpBufferTime: 0.1,     // seconds a jump press is remembered before landing
  wallSlideSpeed: -3,      // capped fall speed while sliding on a wall
  wallJumpVelocity: { horizontal: 10, vertical: 10 }, // strong kick: single-wall climbing shouldn't gain height
  wallJumpControlLock: 0.25, // seconds of heavily reduced air control after a wall jump
  dashSpeed: 16,           // burst speed during dash
  dashDuration: 0.15,      // seconds dash lasts
  dashCooldownAfterLand: 0,
  wavedashWindow: 0.1,     // jump within this many seconds of dash end (near ground) => tech

  // Dash techs:
  // wavedash  = down-angled dash (Z+X) + jump near ground => low hop, most horizontal speed
  // superdash = horizontal dash (X) + jump mid-dash        => full jump height, less speed
  wavedashBoostMultiplier: 1.35,
  wavedashJumpMult: 0.7,
  wavedashFrictionSkip: 0.3,
  // The superdash keeps a FULL jump (vy 11) but is deliberately SLOW, so the
  // wavedash is the distance tech and the superdash is the height tech.
  // At the original 1.0 the superdash actually out-ranged the wavedash on
  // level ground — 16 * (2*11/28) = 12.6 against 21.6 * (2*7.7/28) = 11.9 —
  // because the taller arc buys hang time. That made every "wavedash gap"
  // clearable with a superdash.
  // 0.65 gives level ranges of 8.2 (superdash) vs 11.9 (wavedash), and,
  // more importantly, separates the two CHAINS that M3 gates on: with a
  // mid-air up-diagonal following the launch, reach is 12.75 (superdash)
  // vs 14.25 (wavedash). That chain gap closes fast as this rises — at
  // 0.78 it was only 1.0u — because the up-diagonal overwrites horizontal
  // speed and erases most of the launch difference. Raising this again
  // means re-checking M3, M4's superdash leg and M5's gates.
  superdashBoostMultiplier: 0.65,
  superdashFrictionSkip: 0.2,

  // Implementation tuning (not in spec)
  groundAccel: 70,         // how fast horizontal velocity approaches the target
  wallJumpGrace: 0.15,     // seconds after leaving a wall-slide a wall jump still works
  boostDecay: 3,           // excess-speed decay (units/sec^2) while friction-skip is active
  // Excess-speed decay once friction-skip expires. This is what makes the
  // WAVEDASH the distance technique: it is shielded from this for
  // wavedashFrictionSkip (0.3s) and launches at 21.6, while a superdash is
  // shielded for only 0.2s and launches slower. At the original 12 the decay
  // was so gentle that every launch converged on the same reach and the
  // superdash multiplier had no effect at all on a long hop (measured:
  // identical 17.0u reach at 0.5x and 0.78x). At 20 the routes separate —
  // see dev/m3reach.js byExcessDecay.
  normalExcessDecay: 20,
  dashRefillDelay: 0.1,    // ground can't refill the dash in its first moments (blocks infinite ground chains)
  dashFallSpeed: -1,       // tiny downward pull during horizontal dash so ground contact persists
  maxFallSpeed: -30,
  killY: -25,              // fall below this => silent respawn
  waterSpeedMult: 0.55,    // run-speed multiplier while wading
};

const EPS = 0.001;
// How far the bean is drawn INTO whatever it stands on (visual only).
const MESH_SINK = 0.08;

export class Player {
  constructor(spawn) {
    this.position = spawn.clone();       // center of the collision AABB
    this.velocity = new THREE.Vector3();
    this.half = new THREE.Vector3(0.4, 0.7, 0.4); // AABB half-extents
    this.facing = new THREE.Vector3(0, 0, -1);

    this.onGround = false;
    this.inWater = false;
    this.state = 'idle';

    // Dash
    this.dashAvailable = true;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashDir = new THREE.Vector3(0, 0, -1); // may have a y component for angled dashes
    this.dashType = 'horizontal';               // 'horizontal' | 'up' | 'down'
    this.lastTech = '—';                        // 'wavedash' | 'superdash' (drives the tech-burst particles)
    this.timeSinceDashStart = Infinity;
    this.timeSinceDashEnd = Infinity;
    this.frictionSkipTimer = 0; // tech momentum preservation

    // Jump assists
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.controlLockTimer = 0; // after wall jump

    // Walls
    this.wallSliding = false;
    this.wallGraceTimer = 0;
    this.wallNormal = new THREE.Vector3();
    this._touchWallNormal = new THREE.Vector3();
    this._touchingWall = false;

    // Respawn
    this.safePos = spawn.clone();
    this._safeTimer = 0;
    this.respawnTarget = null; // Vector3 kept in sync by main.js (active checkpoint spawn)
    this.respawnFacing = null; // optional Vector3 kept in sync by main.js
    this.justRespawned = false;

    // One-frame event flags for effects (read by main.js after update)
    this.justLanded = false;
    this.lastTechEvent = null; // 'wavedash' | 'superdash' on the frame the tech fires

    // Scratch vectors (avoid per-frame allocation)
    this._wish = new THREE.Vector3();
    this._hv = new THREE.Vector2();
    this._target = new THREE.Vector2();
    this._feet = new THREE.Vector3();

    this.mesh = this._buildMesh();
  }

  _buildMesh() {
    // Clean bean: one capsule body with a shirt band, a face, a fluffy hair
    // cap, and a backpack riding flat on the back. No arms, hands, legs or
    // shoes — the silhouette reads better as a single rounded shape, and
    // limbs on a capsule with no shoulders never sat right.
    // Group origin sits at the player's FEET; local +Z is the front (eyes side).
    const group = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.55, 4, 10), mat(0xff7a3c));
    body.position.y = 0.7;
    body.scale.set(1, 1.04, 0.95);
    // No shirt band: the body is one unbroken orange capsule. (A cream ring
    // used to sit at y 0.43-0.77; it read as a stripe rather than clothing
    // once the arms were gone.)
    group.add(body);

    // Face: eyes with glints, blush cheeks, a small smile arc
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2016 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
      eye.position.set(side * 0.15, 0.93, 0.335);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), glintMat);
      glint.position.set(side * 0.17, 0.96, 0.39);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), mat(0xff9d6b));
      cheek.position.set(side * 0.26, 0.83, 0.29);
      cheek.scale.set(1, 0.6, 0.5);
      group.add(eye, glint, cheek);
    }
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.02, 6, 12, Math.PI * 0.85),
      new THREE.MeshStandardMaterial({ color: 0x5a2c1e })
    );
    smile.position.set(0, 0.82, 0.36);
    smile.rotation.z = -Math.PI * 0.925; // arc opens upward => smile
    smile.rotation.x = -0.12;
    group.add(smile);

    // Fluffy hair: a cap of overlapping blobs
    const hairMat = mat(0x9c4f26);
    const hairBlobs = [
      [0, 1.33, -0.02, 0.25], [0.15, 1.29, 0.07, 0.17], [-0.16, 1.29, 0.05, 0.17],
      [0.03, 1.31, 0.17, 0.16], [-0.04, 1.29, -0.19, 0.18],
      [0.11, 1.4, -0.09, 0.15], [-0.12, 1.39, -0.06, 0.14], [0.01, 1.44, 0.03, 0.14],
    ];
    for (const [hx, hy, hz, hr] of hairBlobs) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(hr, 1), hairMat);
      blob.position.set(hx, hy, hz);
      blob.rotation.y = Math.random() * Math.PI;
      group.add(blob);
    }

    // Backpack: bag + flap + buckle + side pockets + bedroll, all sitting
    // ON the back. The old over-shoulder straps are GONE on purpose: a
    // capsule has no shoulder to run them over, so they either buried
    // themselves in the body or poked out through the character's chest.
    // A compression strap across the bag itself gives the same read with
    // no geometry anywhere near the front.
    // Depth budget: the body's back surface sits at z ≈ -0.38, so every
    // piece below stays at z < -0.30 and nothing can breach the front.
    const packMat = mat(0x6b8f63);
    const packDark = mat(0x59784f);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.26), packMat);
    pack.position.set(0, 0.74, -0.47);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.17, 0.28), packDark);
    flap.position.set(0, 0.97, -0.47);
    const cinch = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.28), packDark);
    cinch.position.set(0, 0.66, -0.47);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), mat(0xd9c37a));
    buckle.position.set(0, 0.66, -0.615);
    group.add(pack, flap, cinch, buckle);
    for (const side of [-1, 1]) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.24, 0.19), packDark);
      pocket.position.set(side * 0.25, 0.72, -0.46);
      group.add(pocket);
    }
    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 7), mat(0x8f5a43));
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(0, 1.06, -0.46);
    group.add(bedroll);

    return group;
  }

  // input: { moveX, moveZ, jumpPressed, dashPressed, dashUpMod, dashDownMod }
  // waterVolumes: optional Box3 list — feet inside one => wading (slower run)
  update(dt, input, colliders, waterVolumes = null) {
    const P = PHYSICS;
    this.justLanded = false;
    this.lastTechEvent = null;
    this.justRespawned = false;

    // ── Water check (feet submerged in a water volume) ──────
    this.inWater = false;
    if (waterVolumes) {
      const feet = this._feet.set(
        this.position.x,
        this.position.y - this.half.y + 0.05,
        this.position.z
      );
      for (const w of waterVolumes) {
        if (w.containsPoint(feet)) {
          this.inWater = true;
          break;
        }
      }
    }

    // ── Timers ──────────────────────────────────────────────
    this.timeSinceDashStart += dt;
    this.timeSinceDashEnd += dt;
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    this.wallGraceTimer = Math.max(0, this.wallGraceTimer - dt);
    this.frictionSkipTimer = Math.max(0, this.frictionSkipTimer - dt);
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.controlLockTimer = Math.max(0, this.controlLockTimer - dt);
    if (input.jumpPressed) this.jumpBufferTimer = P.jumpBufferTime;

    // ── Input direction (fixed world XZ axes) ───────────────
    const wish = this._wish.set(input.moveX, 0, input.moveZ);
    if (wish.lengthSq() > 0) {
      wish.normalize();
      this.facing.copy(wish);
    }

    // ── Dash start ──────────────────────────────────────────
    if (input.dashPressed && this.dashAvailable && !this.dashing) {
      this.dashing = true;
      this.dashAvailable = false;
      this.dashTimer = P.dashDuration;
      this.timeSinceDashStart = 0;
      const hasDir = wish.lengthSq() > 0;
      const hx = hasDir ? wish.x : this.facing.x;
      const hz = hasDir ? wish.z : this.facing.z;
      // Z modifier angles down, C modifier angles up (down wins if both —
      // Z is unambiguous intent, C may just be held over from a jump).
      // With no directional input held, a modified dash is PURELY vertical.
      if (input.dashDownMod) {
        this.dashType = 'down';
        if (hasDir) this.dashDir.set(hx, -1, hz).multiplyScalar(Math.SQRT1_2); // 45° down
        else this.dashDir.set(0, -1, 0); // straight down
      } else if (input.dashUpMod) {
        this.dashType = 'up';
        if (hasDir) this.dashDir.set(hx, 1, hz).multiplyScalar(Math.SQRT1_2); // 45° up
        else this.dashDir.set(0, 1, 0); // straight up
      } else {
        this.dashType = 'horizontal';
        this.dashDir.set(hx, 0, hz);
      }
      this._setScale(1.25, 0.75);
    }

    // ── Velocity update ─────────────────────────────────────
    if (this.dashing) {
      this.velocity.copy(this.dashDir).multiplyScalar(P.dashSpeed);
      if (this.dashType === 'horizontal') this.velocity.y = P.dashFallSpeed; // keep ground contact
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.timeSinceDashEnd = 0;
      }
    } else {
      // Horizontal
      const hv = this._hv.set(this.velocity.x, this.velocity.z);
      const target = this._target.set(wish.x, wish.z)
        .multiplyScalar(P.moveSpeed * (this.inWater ? P.waterSpeedMult : 1));
      const speed = hv.length();
      let control = this.onGround ? 1 : P.airControl;
      if (this.controlLockTimer > 0) control *= 0.15; // can't steer straight back to the wall

      if (speed > P.moveSpeed + 0.05 && hv.dot(target) >= 0) {
        // Carrying extra speed (post-dash / tech): preserve momentum,
        // decay the excess, and let input gently steer the direction.
        const decay = this.frictionSkipTimer > 0 ? P.boostDecay : P.normalExcessDecay;
        const newSpeed = Math.max(P.moveSpeed, speed - decay * dt);
        const dir = hv.normalize();
        if (target.lengthSq() > 0) {
          const targetDir = target.normalize();
          dir.lerp(targetDir, Math.min(1, 6 * control * dt)).normalize();
        }
        hv.copy(dir).multiplyScalar(newSpeed);
      } else {
        // Normal accelerate-toward-target movement
        const maxStep = P.groundAccel * control * dt;
        const dx = target.x - hv.x;
        const dy = target.y - hv.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxStep && dist > 0) {
          hv.x += (dx / dist) * maxStep;
          hv.y += (dy / dist) * maxStep;
        } else {
          hv.set(target.x, target.y);
        }
      }
      this.velocity.x = hv.x;
      this.velocity.z = hv.y;

      // Vertical
      this.velocity.y += P.gravity * dt;
      if (this.velocity.y < P.maxFallSpeed) this.velocity.y = P.maxFallSpeed;
      if (this.wallSliding && this.velocity.y < P.wallSlideSpeed) {
        this.velocity.y = P.wallSlideSpeed;
      }
    }

    // ── Buffered jump (ground / coyote first, then wall) ────
    if (this.jumpBufferTimer > 0) {
      if (this.onGround || this.coyoteTimer > 0) {
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        const dashActive = this.dashing || this.timeSinceDashEnd < P.wavedashWindow;
        const hLen = Math.hypot(this.dashDir.x, this.dashDir.z) || 1;
        if (dashActive && this.dashType === 'down') {
          // Wavedash: low hop, biggest horizontal boost
          const boost = P.dashSpeed * P.wavedashBoostMultiplier;
          this.velocity.x = (this.dashDir.x / hLen) * boost;
          this.velocity.z = (this.dashDir.z / hLen) * boost;
          this.velocity.y = P.jumpVelocity * P.wavedashJumpMult;
          this.frictionSkipTimer = P.wavedashFrictionSkip;
          this.dashing = false;
          this.lastTech = 'wavedash';
          this.lastTechEvent = 'wavedash';
        } else if (dashActive && this.dashType === 'horizontal') {
          // Superdash: full jump height, moderate boost
          const boost = P.dashSpeed * P.superdashBoostMultiplier;
          this.velocity.x = (this.dashDir.x / hLen) * boost;
          this.velocity.z = (this.dashDir.z / hLen) * boost;
          this.velocity.y = P.jumpVelocity;
          this.frictionSkipTimer = P.superdashFrictionSkip;
          this.dashing = false;
          this.lastTech = 'superdash';
          this.lastTechEvent = 'superdash';
        } else {
          this.velocity.y = P.jumpVelocity;
        }
        this.onGround = false;
        this._setScale(0.85, 1.2);
      } else if (this.wallSliding || this.wallGraceTimer > 0) {
        this.jumpBufferTimer = 0;
        this.wallGraceTimer = 0;
        this.wallSliding = false;
        this.velocity.x = this.wallNormal.x * P.wallJumpVelocity.horizontal;
        this.velocity.z = this.wallNormal.z * P.wallJumpVelocity.horizontal;
        this.velocity.y = P.wallJumpVelocity.vertical;
        this.controlLockTimer = P.wallJumpControlLock;
        this.facing.set(this.wallNormal.x, 0, this.wallNormal.z).normalize();
        this._setScale(0.85, 1.2);
      }
    }

    // ── Integrate + collide (per axis: X, Z, then Y) ────────
    const wasOnGround = this.onGround;
    const impactVy = this.velocity.y;
    this._touchingWall = false;

    this.position.x += this.velocity.x * dt;
    this._resolveAxis(colliders, 'x');
    this.position.z += this.velocity.z * dt;
    this._resolveAxis(colliders, 'z');

    this.onGround = false;
    this.position.y += this.velocity.y * dt;
    this._resolveAxis(colliders, 'y');

    if (wasOnGround && !this.onGround && this.velocity.y <= 0) {
      this.coyoteTimer = PHYSICS.coyoteTime;
    }
    if (!wasOnGround && this.onGround) {
      if (impactVy < -6) this.justLanded = true;   // dust puff threshold
      if (impactVy < -10) this._setScale(1.2, 0.75); // landing squash
    }

    // ── Wall slide state ────────────────────────────────────
    this.wallSliding =
      !this.onGround &&
      !this.dashing &&
      this._touchingWall &&
      this.velocity.y < 0 &&
      wish.lengthSq() > 0 &&
      wish.dot(this._touchWallNormal) < -0.3; // pressing into the wall
    if (this.wallSliding) {
      this.wallNormal.copy(this._touchWallNormal);
      this.wallGraceTimer = P.wallJumpGrace;
    }

    // ── Dash refill on ground contact ───────────────────────
    if (this.onGround && !this.dashing && this.timeSinceDashStart > P.dashRefillDelay) {
      this.dashAvailable = true;
    }

    // ── Respawn point + falling off the world ───────────────
    if (this.onGround) {
      this._safeTimer += dt;
      if (this._safeTimer > 0.3) {
        this.safePos.copy(this.position);
        this._safeTimer = 0;
      }
    } else {
      this._safeTimer = 0;
    }
    // Fall-catch: instant respawn at the active checkpoint (same destination
    // R uses); safePos is only the fallback if no target has been wired up.
    if (this.position.y < P.killY) {
      const rp = this.respawnTarget || this.safePos;
      this.teleport(rp.x, rp.y, rp.z);
      this.justRespawned = true;
    }

    // ── State label (drives squash/stretch, room for more animation) ───────
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.dashing) this.state = 'dash';
    else if (this.wallSliding) this.state = 'wallslide';
    else if (!this.onGround) this.state = this.velocity.y > 0 ? 'jump' : 'fall';
    else this.state = hSpeed > 0.5 ? 'run' : 'idle';

    // ── Mesh sync ───────────────────────────────────────────
    // The bean's own geometry bottoms out at the group origin, so this puts
    // it on the collider's bottom face, minus MESH_SINK. The sink matters
    // because the bean's underside is a hemisphere: sitting it exactly on
    // the surface leaves a contact patch a few centimetres wide and the
    // whole character reads as hovering. Sinking 0.08 cuts a ~0.48-wide
    // flat where it meets the ground — over half the bean's width — which
    // is what actually looks planted.
    // Physics is untouched: half.y and the AABB are unchanged, so this can
    // be re-tuned freely. Every standable surface in world.js draws its top
    // flush with its collider top (see world.js building() and the terrain
    // displacement), so the sink looks identical on all of them.
    this.mesh.position.set(this.position.x, this.position.y - this.half.y - MESH_SINK, this.position.z);
    this.mesh.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    const s = this.mesh.scale;
    const k = Math.min(1, 10 * dt);
    s.x += (1 - s.x) * k;
    s.y += (1 - s.y) * k;
    s.z += (1 - s.z) * k;
  }

  _setScale(xz, y) {
    this.mesh.scale.set(xz, y, xz);
  }

  // Player-initiated respawn (R / touch ↺). The automatic fall-catch at
  // killY still uses safePos; this just moves both to the checkpoint.
  teleport(x, y, z, facing = null) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.dashing = false;
    this.dashAvailable = true;
    this.wallSliding = false;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    const respawnFacing = facing || this.respawnFacing;
    if (respawnFacing && respawnFacing.lengthSq() > 0) {
      this.facing.copy(respawnFacing).normalize();
    }
    this.safePos.copy(this.position);
    this._safeTimer = 0;
    this._setScale(1.15, 0.85); // small arrival squash
  }

  // Push the player AABB out of any collider it overlaps, along one axis.
  _resolveAxis(colliders, axis) {
    const p = this.position;
    const h = this.half;
    for (const c of colliders) {
      const overlaps =
        p.x - h.x < c.max.x - EPS && p.x + h.x > c.min.x + EPS &&
        p.y - h.y < c.max.y - EPS && p.y + h.y > c.min.y + EPS &&
        p.z - h.z < c.max.z - EPS && p.z + h.z > c.min.z + EPS;
      if (!overlaps) continue;

      const half = axis === 'y' ? h.y : (axis === 'x' ? h.x : h.z);
      const center = (c.min[axis] + c.max[axis]) / 2;
      const pushedNegative = p[axis] < center;

      if (pushedNegative) {
        p[axis] = c.min[axis] - half - EPS;
        if (this.velocity[axis] > 0) this.velocity[axis] = 0;
      } else {
        p[axis] = c.max[axis] + half + EPS;
        if (this.velocity[axis] < 0) this.velocity[axis] = 0;
        if (axis === 'y') this.onGround = true;
      }

      if (axis !== 'y' && !this.onGround) {
        this._touchingWall = true;
        this._touchWallNormal.set(0, 0, 0);
        this._touchWallNormal[axis] = pushedNegative ? -1 : 1;
      }
    }
  }
}
