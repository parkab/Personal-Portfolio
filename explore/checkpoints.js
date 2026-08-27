import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// DATA — checkpoint lantern posts along the main path.
// `position` is where the marker stands (surface y); `spawn` is the
// surface point the player teleports to with R / ↺ (kept slightly off
// the marker so the player doesn't reappear inside the post).
// ─────────────────────────────────────────────────────────────

export const CHECKPOINTS = [
  // Main path (redesigned ascent — placed on berry-free roofs at sensible intervals)
  { id: 'start',          position: { x: 4,     y: 0.4,  z: 4 },     spawn: { x: 2.8,  y: 0.4,  z: 4 } },
  { id: 'ferry-roof',     position: { x: -18,   y: 6.5,  z: -50 },   spawn: { x: -19,  y: 6.5,  z: -49 } },   // B3, after slider ferry #1
  { id: 'mid-ascent',     position: { x: 13,    y: 15.5, z: -74 },   spawn: { x: 12,   y: 15.5, z: -73 } },   // B6, after slider ferry #2
  { id: 'high-roof',      position: { x: -4,    y: 21,   z: -91 },   spawn: { x: -5,   y: 21,   z: -90 } },   // B8, after the west dash gap
  { id: 'crest',          position: { x: -16,   y: 28.5, z: -104 },  spawn: { x: -16,  y: 28.5, z: -102.2 } }, // centred on the crest roof; also serves the M3 detour that launches from here
  { id: 'plaza-entrance', position: { x: 9,     y: 0.4,  z: -138 },  spawn: { x: 8,    y: 0.4,  z: -139 } },
  // Moonberry starts (Stage 6) — one lantern at each sequence's entry
  { id: 'detour-drift',    position: { x: -18,   y: 6.7,  z: -17 },    spawn: { x: -18,   y: 6.7,  z: -16.2 }, facing: { x: -1, z: 0 } }, // M1 start perch, face left into the walljumps
  { id: 'detour-wavedash', position: { x: 13.2,  y: 3,    z: -42.8 },  spawn: { x: 12.2,  y: 3,    z: -42 },    facing: { x: 0.93, z: 0.37 } }, // M2, V1's east edge — looking up the line to the start pad at (17, 11, -40)
  // (M3 has no lantern of its own: it launches off the crest, and a second
  //  post on the same roof read as clutter. The centred 'crest' one covers it.)
  { id: 'detour-vault',    position: { x: 37,    y: 3.0,  z: -144.9 }, spawn: { x: 37,    y: 3.0,  z: -146.2 }, facing: { x: 1, z: 0 } }, // M4 start pad, facing down the chain
  // M5 gets exactly ONE lantern, at its mouth. That is the point of it: the
  // gauntlet is M1-M4 back to back and a miss anywhere restarts the whole run.
  { id: 'detour-gauntlet', position: { x: -30.5, y: 3.4,  z: -156.9 }, spawn: { x: -30.3, y: 3.4,  z: -157.4 }, facing: { x: -1, z: 0 } }, // M5, west island — facing WEST down the wavedash lane at §1's canyon (mouth x -45)
];

const ACTIVATE_RADIUS = 2.8;

// Lantern posts that light up when touched. The most recently touched one
// is the active respawn target (R / ↺); previously touched ones stay
// softly lit, and a pulsing aura marks the active one.
export function createCheckpointSystem(scene) {
  const postGeo = new THREE.BoxGeometry(0.18, 2.1, 0.18);
  const lanternGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const capGeo = new THREE.BoxGeometry(0.52, 0.1, 0.52);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x4f7048, flatShading: true });
  const offMat = new THREE.MeshStandardMaterial({ color: 0x707a68, flatShading: true });
  const onMat = new THREE.MeshBasicMaterial({ color: 0xffd98a }); // "lit from inside"

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffcf6e,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  aura.visible = false;
  scene.add(aura);

  // Small orange pennant flag: the checkpoint's unique silhouette marker,
  // so lanterns never get confused with the decorative arc street lamps.
  const flagPoleGeo = new THREE.BoxGeometry(0.06, 0.55, 0.06);
  const flagGeo = new THREE.BoxGeometry(0.55, 0.3, 0.05);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xd95f3b, flatShading: true });

  const markers = CHECKPOINTS.map((entry) => {
    const group = new THREE.Group();
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 1.05;
    const lantern = new THREE.Mesh(lanternGeo, offMat);
    lantern.position.y = 2.25;
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 2.52;
    const flagPole = new THREE.Mesh(flagPoleGeo, postMat);
    flagPole.position.y = 2.84;
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(0.3, 2.98, 0);
    group.add(post, lantern, cap, flagPole, flag);
    group.position.set(entry.position.x, entry.position.y, entry.position.z);
    scene.add(group);
    return { entry, group, lantern, pop: 0 };
  });

  // Single code path for activation visuals (lit material + aura placement)
  // so load-time state can never drift from the internal active flag.
  let active = null;
  function setActive(m) {
    active = m;
    m.lantern.material = onMat; // stays lit even if another activates later
    aura.visible = true;
    aura.position.copy(m.group.position);
    aura.position.y += 2.25; // wrap the lantern
  }

  // The start marker begins lit/active so R always has a sane target.
  setActive(markers[0]);

  const _p = new THREE.Vector3();
  let t = 0;

  function update(dt, playerPos) {
    t += dt;
    for (const m of markers) {
      if (m !== active) {
        const d = _p.copy(m.group.position).sub(playerPos).length();
        if (d < ACTIVATE_RADIUS) {
          setActive(m);
          m.pop = 1;
        }
      }
      if (m.pop > 0) {
        m.pop = Math.max(0, m.pop - dt * 3);
        const s = 1 + m.pop * 0.35;
        m.lantern.scale.set(s, s, s);
      }
    }
    aura.material.opacity = 0.18 + (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.14;
  }

  // Surface point to respawn at (caller adds the player's half-height)
  function activeSpawn(out = new THREE.Vector3()) {
    const s = active.entry.spawn;
    return out.set(s.x, s.y, s.z);
  }

  function activeFacing(out = new THREE.Vector3()) {
    if (!active.entry.facing) return null;
    const f = active.entry.facing;
    return out.set(f.x, 0, f.z);
  }

  return { update, activeSpawn, activeFacing };
}
