import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// DATA — 5 Moonberries, one at the end of each hard detour (world.js §6).
// They behave exactly like strawberries: proximity teaser, C to open the
// reveal panel, C again / walking away to dismiss. No collection state —
// revisit any Moonberry anytime to see its image again.
// `image` paths point into explore/cats/, which doesn't exist yet: the
// panel (ui.js) shows a clearly-marked placeholder whenever an image
// fails to load, so dropping real photos into /cats/ with these
// filenames is all that's needed later.
// ─────────────────────────────────────────────────────────────

export const MOONBERRIES = [
  { id: 'moon-drift',     category: 'moon', title: 'Moonberry', image: 'cats/cat1.jpg', position: { x: -58.0, y: 20.58, z: -17 } },    // M1 platform beyond the second wall pair, at its top height
  { id: 'moon-movers',    category: 'moon', title: 'Moonberry', image: 'cats/cat2.jpg', position: { x: 43,    y: 13.4, z: -40 } },    // M2 slider-gauntlet finale (east of V1)
  { id: 'moon-wavedash',  category: 'moon', title: 'Moonberry', image: 'cats/cat3.jpg', position: { x: -59, y: 35.5, z: -104 } },    // M3 wavedash→up-diagonal route, platform B (west of the crest)
  { id: 'moon-superdash', category: 'moon', title: 'Moonberry', image: 'cats/cat4.jpg', position: { x: 62.4, y: 14.8, z: -146 } },  // M4 berry pad (top 13.5), centred on it and inside the x-64 boundary wall
  { id: 'moon-gauntlet',  category: 'moon', title: 'Moonberry', image: 'cats/cat5.jpg', position: { x: -67,   y: 30.2, z: -168 } }, // M5 gauntlet finish — on §4's berry pad, after M1→M2→M3→M4 in one run
];

// Moon-themed berries: pale blue-white body with an icy aura, visually
// distinct from the gold/teal strawberries at a glance.
export function createMoonberrySystem(scene) {
  const bodyGeo = new THREE.SphereGeometry(0.38, 7, 6);
  bodyGeo.scale(1, 1.15, 1);
  const leafGeo = new THREE.ConeGeometry(0.26, 0.24, 5);
  const auraGeo = new THREE.SphereGeometry(0.85, 12, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8eef8, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x8fa8c9, flatShading: true });

  const list = MOONBERRIES.map((entry, i) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 0.5;
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xbcd4ff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    group.add(body, leaf, aura);
    group.position.set(entry.position.x, entry.position.y, entry.position.z);
    scene.add(group);
    return { entry, group, auraMat, baseY: entry.position.y, phase: i * 2.1 };
  });

  let t = 0;
  function update(dt) {
    t += dt;
    for (const b of list) {
      b.group.position.y = b.baseY + Math.sin(t * 1.1 + b.phase) * 0.18;
      b.group.rotation.y += dt * 0.5;
      b.auraMat.opacity = 0.2 + (Math.sin(t * 1.8 + b.phase) * 0.5 + 0.5) * 0.16;
    }
  }

  // Nearest Moonberry within `radius` (same contract as the strawberry
  // system, so main.js can merge the two for the shared interact logic)
  function nearest(pos, radius) {
    let best = null;
    let bestDist = radius;
    for (const b of list) {
      const d = b.group.position.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  return { list, update, nearest };
}
