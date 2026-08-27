import * as THREE from 'three';

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

// Third-person follow camera that trails BEHIND the player's movement
// direction. The yaw rotation speed is capped so the camera never whips
// around, and yaw is frozen entirely while a dash is active (the dash
// direction chosen at dash-start shouldn't shift on screen mid-dash).
// When directional input is released, the yaw target stops updating and
// the residual rotation eases to a stop over ~0.3s — it decelerates in
// place rather than drifting toward the last-faced heading.
//
// Feedback-loop guard: because input is camera-relative, chasing the
// facing direction while the player holds DIRECTLY backward re-rotates
// the input every frame and the chase never converges (small-circle
// walk). Near-backward input (within ~20° of straight back in screen
// space) therefore doesn't rotate the camera — the character just walks
// toward it. Every other direction chases at full rate as before, so
// held sideways/diagonals still steer the camera around.
export class FollowCamera {
  constructor(camera, obstacles) {
    this.camera = camera;
    this.obstacles = obstacles; // meshes the camera should not clip through
    this.distance = 9.5;
    this.height = 5.5;
    this.lookOffset = new THREE.Vector3(0, 1.6, 0);
    this.smoothing = 5;          // position smoothing (higher = snappier)
    this.yawResponsiveness = 2.0; // how eagerly yaw chases the facing direction
    this.maxYawSpeed = 1.3;      // rad/s hard cap on rotation

    this.yaw = 0; // orbital angle; 0 => camera sits toward +Z looking toward -Z
    this.idleSettleTau = 0.12; // s; yaw velocity decay time constant on input release (~95% gone in 3τ)
    this._yawVel = 0;
    this._smoothed = null;
    // Occlusion probe. A single centre ray leaves two holes: geometry can
    // sit beside the line (a gate post, the edge of a lintel) and never be
    // hit, and the pulled-in distance used to be clamped to a floor of 1.5
    // even when the hit was NEARER than that — which parked the camera
    // inside the thing it was avoiding and clipped straight through it.
    // So: probe with a small cross of parallel rays, and let the camera come
    // in to 0.9 (still outside the bean's 0.42 radius, so it never ends up
    // inside the player either).
    this.minDistance = 0.9;
    this.probeRadius = 0.32;
    this.pullOutSpeed = 6;   // eases back OUT; pulls IN instantly
    this._camDist = this.distance;
    this._ray = new THREE.Raycaster();
    this._anchor = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._probeOrigin = new THREE.Vector3();
    this._sideA = new THREE.Vector3();
    this._sideB = new THREE.Vector3();
  }

  _desiredPos(target, out) {
    return out.set(
      target.x + Math.sin(this.yaw) * this.distance,
      target.y + this.height,
      target.z + Math.cos(this.yaw) * this.distance
    );
  }

  snapTo(target) {
    this._smoothed = this._desiredPos(target, new THREE.Vector3());
    this._camDist = this.distance;
  }

  // Snap, AND swing the orbit behind a given facing direction so the view
  // starts pointed the same way the player does. Respawning without this
  // left the camera wherever it happened to be when you died, which on a
  // retry means looking away from the obstacle you are about to attempt.
  snapBehind(target, facing) {
    if (facing && facing.lengthSq() > 1e-6) {
      this.yaw = Math.atan2(-facing.x, -facing.z);
      this._yawVel = 0;
    }
    this.snapTo(target);
  }

  // Nearest obstruction between the anchor and the camera, probed with a
  // centre ray plus four offset by probeRadius perpendicular to it.
  // Infinity when the line of sight is clear.
  _probe(anchor, dir, dist) {
    const a = this._sideA, b = this._sideB;
    // any vector not parallel to dir works as the seed for the basis
    a.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.9) a.set(1, 0, 0);
    a.crossVectors(dir, a).normalize();
    b.crossVectors(dir, a).normalize();
    const r = this.probeRadius;
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const o = this._probeOrigin.copy(anchor);
      if (i === 1) o.addScaledVector(a, r);
      else if (i === 2) o.addScaledVector(a, -r);
      else if (i === 3) o.addScaledVector(b, r);
      else if (i === 4) o.addScaledVector(b, -r);
      this._ray.set(o, dir);
      this._ray.far = dist;
      const hits = this._ray.intersectObjects(this.obstacles, false);
      if (hits.length > 0 && hits[0].distance < best) best = hits[0].distance;
    }
    return best;
  }

  // facing: horizontal unit vector of the player's movement/facing direction
  // freezeYaw: true while a dash is active
  // hasMoveInput: true only while directional input is held; on release the
  // current rotation eases to a stop instead of chasing any heading
  // forwardness: screen-space forward component of the raw input, -1..1
  // (1 = pure up/forward, 0 = pure sideways, -1 = pure backward)
  update(dt, target, facing, freezeYaw, hasMoveInput, forwardness = 1) {
    if (freezeYaw) {
      this._yawVel = 0; // dash: hard freeze, and no residual glide afterward
    } else if (hasMoveInput && forwardness > -0.92 && facing.lengthSq() > 0) {
      // Behind the player => camera offset is opposite the facing direction
      const targetYaw = Math.atan2(-facing.x, -facing.z);
      const diff = wrapAngle(targetYaw - this.yaw);
      const maxStep = this.maxYawSpeed * dt;
      let step = diff * Math.min(1, this.yawResponsiveness * dt);
      step = Math.max(-maxStep, Math.min(maxStep, step));
      this.yaw = wrapAngle(this.yaw + step);
      this._yawVel = dt > 0 ? step / dt : 0;
    } else if (this._yawVel !== 0) {
      // Idle settle: decelerate the leftover rotation exponentially
      this._yawVel *= Math.exp(-dt / this.idleSettleTau);
      if (Math.abs(this._yawVel) < 0.02) this._yawVel = 0;
      this.yaw = wrapAngle(this.yaw + this._yawVel * dt);
    }

    const anchor = this._anchor.copy(target).add(this.lookOffset);
    const desired = this._desiredPos(target, this._desired);

    if (!this._smoothed) this._smoothed = desired.clone();
    this._smoothed.lerp(desired, 1 - Math.exp(-this.smoothing * dt));

    // Collision avoidance: pull in if something sits between anchor and camera
    const dir = this._dir.copy(this._smoothed).sub(anchor);
    const dist = dir.length();
    dir.normalize();

    const hit = this._probe(anchor, dir, dist);
    const wanted = hit === Infinity
      ? dist
      : Math.max(hit - 0.3, this.minDistance);

    // Snap IN the instant something intrudes (being late here is what
    // renders the inside of a wall) but ease back OUT, so brushing past a
    // post doesn't fling the camera and the arch doesn't read as a jolt.
    this._camDist = wanted < this._camDist
      ? wanted
      : this._camDist + (wanted - this._camDist) * (1 - Math.exp(-this.pullOutSpeed * dt));

    this.camera.position.copy(anchor).addScaledVector(dir, this._camDist);
    this.camera.lookAt(anchor);
  }
}
