import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// World geometry, Stage 5c redesign: a forest-park valley ringed by
// distant mountains. One continuous trail — start clearing → hillside
// village ascent (experience wing) → crest → garden terraces down →
// open garden plaza (projects wing). All primitives, flat-shaded,
// instanced. No textures.
//
// TECHNIQUE SIZING RULES (verified by the headless input-sim harness,
// which drives the real Player class over these exact colliders):
//   plain jump ≈ 4.7u flat / +2.16 rise (falling extends flat reach)
//   jump+dash ≈ 10.5u flat (air momentum carries far)
//   jump+STRAIGHT-up-dash ≈ +9.1 rise with ~3-4u steer
//   jump+angled-up-dash ≈ 10.9u flat / +6.1 rise
//   wavedash ≈ 10.5-12u flat with only a +1.06 hop
// Therefore:
//   dash gap        = 6.5-7.5 flat (falling: 8.5-9.5) — plain jump fails
//   up-dash rise    = +3.5-4.8 — only up-dash reaches
//   chimney climb   = ≥10 (straight up-dash can't top it)
//   platform safety = anything not meant to be boarded from below sits
//                     >9.8 above every standable spot beneath it
//   WAVEDASH GATE   = 8.5-9.5 gap UNDER A CEILING 2.8 above the floor —
//                     all jump/up-dash arcs bonk; only the low wavedash
//                     hop fits. Gate ceiling tops are spiked (they'd
//                     otherwise be platforms past the gate).
//   long-dash gap   = 9.5-10.5 flat uncapped (jump+dash or better)
//
// ── Strawberry anchors (strawberries.js) — redesigned ascent roofs ──
//   dellicker (-1, 7.5, -46) B2 · njit (-18, 13, -64) B4 ·
//   pseg (-7, 16.5, -70) B5 · qpc (11, 22, -88) B7 ·
//   merck (-13, 25.5, -93) B9 · barclays (-16, 34, -114) peak ·
//   candidats (10, 8.2, -144) plaza NE · decibel (-13, 6.2, -151) pavilion ·
//   athena (13, 6.2, -158.6) mini tower · lexicogs (-32.6, 4.4, -160) west island

const C = {
  grass:      0x8fb573,
  grassLight: 0x9fc57f,
  mossPatch:  0x7ba06a,
  dirt:       0xb9a87c,
  sand:       0xcfc0a0,
  reed:       0x6d9155,
  plazaStone: 0xcdc5a3,
  padStone:   0xbfb694,
  sage:       0x9caf88,
  moss:       0x7e9e6b,
  stone:      0xb9b193,
  pale:       0xa8bb8f,
  clay:       0xc2a06b,
  cream:      0xd9cfae,
  darkGreen:  0x6b8f63,
  trim:       0x4f7048,
  trimWarm:   0x8a6b4a,
  hedge:      0x5d8a4e,
  trunk:      0x8a6b4a,
  wood:       0xa9805a,
  foliageA:   0x6f9e55,
  foliageB:   0x86ab5e,
  foliageC:   0x5e8f52,
  roofRust:   0xb4573f,
  roofSlate:  0x5c6e5a,
  window:     0x3d5a44,
  shutter:    0x77543a,
  crate:      0xa98d5f,
  rock:       0x9a9a8c,
  water:      0x9fc7c0,
  lampGlow:   0xe8d29a,
  flowerA:    0xe8c957,
  flowerB:    0xd97f4e,
  flowerC:    0xf2efe4,
  spike:      0x9c3a30,
  mountainA:  0x8fa89b,
  mountainB:  0x97ab9e,
  mountainC:  0x8aa091,
  hillA:      0x86a77b,
  hillB:      0x8fae80,
  snow:       0xf4f2e8,
};

export function buildWorld(scene) {
  const solidBoxes = []; // {x, y(center), z, w, h, d, color} — collidable
  const decoBoxes = [];  // visual only; optional ry
  const cones = [];      // {x, y(base), z, r, h, color, ry?} — trees/roofs/mountains/spikes
  const colliders = [];
  const movers = [];
  const hazards = [];
  const fountainSurfs = []; // [x,y,z,w,d] — built after the water material exists

  function solid(x, baseY, z, w, h, d, color) {
    solidBoxes.push({ x, y: baseY + h / 2, z, w, h, d, color });
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, baseY, z - d / 2),
      new THREE.Vector3(x + w / 2, baseY + h, z + d / 2)
    ));
  }
  function deco(x, baseY, z, w, h, d, color, ry = 0) {
    decoBoxes.push({ x, y: baseY + h / 2, z, w, h, d, color, ry });
  }

  // Buildings with variety: roof styles, trim/roof colors, windows,
  // shutters, base skirt. Route buildings use roof:'flat' (standable).
  function building(x, z, w, d, h, color, opts = {}) {
    solid(x, 0, z, w, h, d, color);
    deco(x, 0, z, w + 0.5, 0.9, d + 0.5, opts.skirt || 0x9a916f); // base skirt
    const roof = opts.roof || 'flat';
    if (roof === 'flat') {
      // Top sits 0.01 ABOVE the collider top (h), not 0.15: the deco spans
      // the whole roof, so its top face IS the surface you see yourself
      // standing on. At +0.15 the player read as sunk 0.18 into every roof.
      // The 0.01 keeps the two faces off the same plane — 0.001 was inside
      // the depth buffer's precision at range and still flickered.
      deco(x, h - 0.49, z, w + 0.6, 0.5, d + 0.6, opts.trim || C.trim);
    } else if (roof === 'pyramid') {
      cones.push({ x, y: h - 0.05, z, r: Math.max(w, d) * 0.8, h: opts.roofH || Math.max(w, d) * 0.5, color: opts.roofColor || C.roofRust, ry: Math.PI / 4 });
    } else if (roof === 'slab') {
      // Same rule as the flat roof: capping slab flush with the collider top
      // (it still overhangs in x/z, so it still reads as a slab).
      deco(x, h - 0.39, z, w + 0.9, 0.4, d + 0.9, opts.roofColor || C.roofSlate);
    }
    if (opts.windows !== false && h >= 5) {
      // Framed inset windows (Tier 3): protruding sill/jambs/lintel with
      // the glass set behind the frame lip, so openings read as recessed.
      const frameCol = opts.frame || C.cream;
      const rows = Math.min(3, Math.floor(h / 4.5));
      for (let r = 0; r < rows; r++) {
        for (const side of [-1, 1]) {
          const wx = x + side * w * 0.24;
          const wy = 1.5 + r * 3.6;
          const wz = z + d / 2;
          deco(wx, wy - 0.15, wz + 0.08, 1.55, 0.2, 0.34, frameCol);   // sill
          deco(wx - 0.72, wy, wz + 0.03, 0.18, 2.0, 0.22, frameCol);   // jambs (base wy → top wy+2); 0.01 shy of the lintel/sill so the corners don't share a plane
          deco(wx + 0.72, wy, wz + 0.03, 0.18, 2.0, 0.22, frameCol);
          deco(wx, wy + 1.85, wz + 0.05, 1.55, 0.18, 0.22, frameCol);  // lintel, sits 0.01 proud of the jambs
          deco(wx, wy + 0.05, wz + 0.02, 1.2, 1.75, 0.06, C.window);   // glass
          if (opts.shutters) {
            deco(wx - 1.0, wy + 0.15, wz + 0.03, 0.38, 1.5, 0.08, C.shutter);
            deco(wx + 1.0, wy + 0.15, wz + 0.03, 0.38, 1.5, 0.08, C.shutter);
          }
        }
      }
    }
  }

  // Cottage (Tier 3): wood-textured walls, stone foundation course,
  // overhanging pyramid roof, chimney, framed door/window + flower box.
  function house(x, z, w, d, h, bodyColor, roofColor) {
    solid(x, 0, z, w, h, d, bodyColor);
    // Pyramid roof gets a stepped collider so landing on a cottage stands
    // ON the roof instead of clipping inside the cone
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w * 0.34, h, z - d * 0.34),
      new THREE.Vector3(x + w * 0.34, h + Math.max(w, d) * 0.3, z + d * 0.34)
    ));
    deco(x, -0.02, z, w + 0.35, 0.55, d + 0.35, 0x9a916f);          // stone foundation
    cones.push({ x, y: h - 0.05, z, r: Math.max(w, d) * 0.95, h: Math.max(w, d) * 0.55, color: roofColor, ry: Math.PI / 4 }); // overhanging roof
    deco(x - w * 0.3, h - 0.4, z - d * 0.18, 0.5, 1.7, 0.5, 0x9a916f); // chimney
    deco(x - w * 0.3, h + 1.3, z - d * 0.18, 0.66, 0.16, 0.66, 0x77543a);
    deco(x + w * 0.18, 0, z + d / 2 + 0.05, 0.85, 1.55, 0.12, C.cream); // door frame
    deco(x + w * 0.18, 0, z + d / 2 + 0.09, 0.62, 1.42, 0.08, 0x6b4a33); // door
    deco(x - w * 0.2, 0.75, z + d / 2 + 0.05, 0.9, 0.9, 0.1, C.cream);  // window frame
    deco(x - w * 0.2, 0.83, z + d / 2 + 0.08, 0.66, 0.66, 0.06, C.window);
    deco(x - w * 0.2, 0.42, z + d / 2 + 0.16, 0.9, 0.24, 0.22, 0x77543a); // flower box
    for (let i = 0; i < 3; i++) {
      deco(x - w * 0.2 - 0.26 + i * 0.26, 0.62, z + d / 2 + 0.18, 0.14, 0.14, 0.14,
        [C.flowerA, C.flowerB, C.flowerC][i], Math.random());
    }
  }

  // Tier 2 trees: the collider stays the same slim box as before
  // (gameplay untouched, visual popped); trunks render as tapered
  // cylinders, broadleaf canopies as clustered icosahedron blobs,
  // conifers as taller stacked cones.
  const trunks = [];   // {x, z, h, r}
  const canopies = []; // {x, y, z, r, color}
  function tree(x, z, s = 1, kind = 0) {
    solid(x, 0, z, 0.55 * s, 1.6 * s, 0.55 * s, C.trunk);
    solidBoxes.pop();
    if (kind === 2) { // conifer
      trunks.push({ x, z, h: 1.7 * s, r: 0.24 * s });
      cones.push({ x, y: 1.1 * s, z, r: 1.5 * s, h: 2.4 * s, color: C.foliageC });
      cones.push({ x, y: 2.7 * s, z, r: 1.15 * s, h: 1.9 * s, color: C.foliageA });
      cones.push({ x, y: 4.1 * s, z, r: 0.8 * s, h: 1.5 * s, color: C.foliageB });
    } else { // broadleaf
      const col = kind % 2 ? C.foliageB : C.foliageA;
      trunks.push({ x, z, h: 2.7 * s, r: 0.3 * s });
      canopies.push({ x, y: 3.3 * s, z, r: 1.55 * s, color: col });
      canopies.push({ x: x + 0.95 * s, y: 2.9 * s, z: z + 0.35 * s, r: 1.05 * s, color: C.foliageC });
      canopies.push({ x: x - 0.85 * s, y: 3.0 * s, z: z - 0.45 * s, r: 1.0 * s, color: kind % 2 ? C.foliageA : C.foliageB });
      canopies.push({ x: x + 0.15 * s, y: 4.15 * s, z: z - 0.2 * s, r: 0.95 * s, color: col });
    }
  }
  function bush(x, z, s = 1, baseY = 0) {
    deco(x, baseY, z, 1.6 * s, 1 * s, 1.4 * s, C.hedge, Math.random() * Math.PI);
  }
  function rock(x, z, s = 1, baseY = 0) {
    deco(x, baseY, z, 2 * s, 1.1 * s, 1.6 * s, C.rock, Math.random() * Math.PI);
    // Solid: slightly smaller than the rotated visual so there's no
    // invisible-wall feel at the corners
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - 0.75 * s, baseY, z - 0.65 * s),
      new THREE.Vector3(x + 0.75 * s, baseY + 0.95 * s, z + 0.65 * s)
    ));
  }
  function bench(x, z, ry, baseY = 0.4) {
    deco(x, baseY, z, 1.8, 0.5, 0.7, C.trunk, ry);
  }
  function flowers(cx, cz, n = 7, baseY = 0) {
    const palette = [C.flowerA, C.flowerB, C.flowerC];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 2.2;
      deco(cx + Math.cos(a) * r, baseY, cz + Math.sin(a) * r,
        0.24, 0.28 + Math.random() * 0.2, 0.24, palette[i % 3], Math.random() * Math.PI);
    }
  }
  // Ground color patch (deco, sits 0.05 proud of the grass)
  function patch(x, z, w, d, color, ry = 0) {
    deco(x, -0.03, z, w, 0.08, d, color, ry);
  }
  // Decorative ARC street lamp: post + horizontal arm + hanging warm cube.
  // Deliberately distinct from checkpoint lanterns (pedestal + cap + FLAG
  // + gold aura when active) so the two never read as the same object.
  function lamp(x, z, baseY = 0, armDir = 1) {
    solid(x, baseY, z, 0.22, 3.2, 0.22, C.trim);
    deco(x, baseY + 3.0, z + armDir * 0.62, 0.16, 0.15, 1.3, C.trim); // top 3.15, clear of the post's 3.2 top
    deco(x, baseY + 2.62, z + armDir * 1.15, 0.4, 0.42, 0.4, C.lampGlow);
  }
  function crate(x, baseY, z, s) {
    solid(x, baseY, z, s, s, s, C.crate);
  }
  function reeds(cx, cz) {
    for (let i = 0; i < 5; i++) {
      const h = 0.6 + Math.random() * 0.55;
      const rx = cx + (Math.random() - 0.5) * 1.2;
      const rz = cz + (Math.random() - 0.5) * 0.9;
      deco(rx, 0, rz, 0.07, h, 0.07, C.reed, Math.random());
      if (i % 2) deco(rx, h, rz, 0.1, 0.16, 0.1, C.trimWarm);
    }
  }
  // Tier 4 mountains: craggy sub-peaks for silhouette variation, and a
  // distance haze that mixes far ridges toward the fog tint so the
  // backdrop reads as atmospheric depth instead of a flat cutout.
  const _hazeCol = new THREE.Color();
  const _fogCol = new THREE.Color(0xdbe6c3);
  function mountain(x, z, r, h, color, snow = false) {
    const dist = Math.hypot(x, z + 75);
    const haze = Math.min(0.62, Math.max(0, (dist - 85) / 220));
    const col = _hazeCol.set(color).lerp(_fogCol, haze).getHex();
    cones.push({ x, y: -0.5, z, r, h, color: col, ry: Math.random() * Math.PI });
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      cones.push({
        x: x + Math.cos(a) * r * 0.5,
        y: -0.5,
        z: z + Math.sin(a) * r * 0.5,
        r: r * (0.42 + Math.random() * 0.26),
        h: h * (0.45 + Math.random() * 0.32),
        color: col,
        ry: Math.random() * Math.PI,
      });
    }
    if (snow) {
      const snowCol = _hazeCol.set(C.snow).lerp(_fogCol, haze * 0.7).getHex();
      cones.push({ x, y: h * 0.55 - 0.5, z, r: r * 0.47, h: h * 0.47, color: snowCol });
    }
  }
  function spikes(x, baseY, z) {
    for (let n = 0; n < 4; n++) {
      cones.push({
        x: x + (Math.random() - 0.5) * 0.55, y: baseY, z: z + (Math.random() - 0.5) * 0.55,
        r: 0.13 + Math.random() * 0.05, h: 0.38 + Math.random() * 0.14, color: C.spike,
      });
    }
    cones.push({ x, y: baseY, z, r: 0.16, h: 0.55, color: C.spike });
    hazards.push(new THREE.Box3(
      new THREE.Vector3(x - 0.42, baseY, z - 0.42),
      new THREE.Vector3(x + 0.42, baseY + 0.5, z + 0.42)
    ));
  }
  // Movers oscillate their center along one axis ('y' = bobbing pad,
  // 'x'/'z' = sliding platform). The rider-carry in update() applies the
  // exact frame delta on every axis, so horizontal movers drag the player
  // along with them.
  function registerMover(axis, amp, speed, phase) {
    movers.push({
      b: solidBoxes[solidBoxes.length - 1],
      box: colliders[colliders.length - 1],
      axis, amp, speed,
      phase: phase !== undefined ? phase : Math.random() * Math.PI * 2,
      cur: null, // current center; initialized from the base on first update
    });
  }
  function moverPad(x, z, w, d, topLow, topHigh, speed, phase) {
    const h = 0.8;
    solid(x, (topLow + topHigh) / 2 - h, z, w, h, d, C.padStone);
    registerMover('y', (topHigh - topLow) / 2, speed, phase);
  }
  function moverH(axis, aLow, aHigh, other, top, w, d, speed, phase) {
    const mid = (aLow + aHigh) / 2;
    const x = axis === 'x' ? mid : other;
    const z = axis === 'z' ? mid : other;
    solid(x, top - 0.8, z, w, 0.8, d, C.padStone);
    registerMover(axis, (aHigh - aLow) / 2, speed, phase);
  }

  // ── Ground + mountain ring ─────────────────────────────────
  // The gameplay ground stays a FLAT collider at y=0 (physics untouched);
  // its box visual is popped and replaced by the displaced terrain mesh,
  // which is kept dead flat at y=0 inside the playable corridor.
  solid(0, -1, -75, 420, 1, 500, C.grass); // top y = 0
  solidBoxes.pop();
  const mountainDefs = [
    [-150, 40, 46, 55], [-172, -30, 55, 70], [-160, -110, 48, 60], [-140, -182, 42, 48],
    [-70, -232, 50, 62], [10, -252, 60, 75], [92, -236, 48, 58], [150, -182, 52, 64],
    [166, -100, 45, 55], [160, -20, 55, 68], [140, 56, 44, 50], [60, 92, 50, 58],
    [-40, 96, 46, 52], [-112, 82, 40, 46],
  ];
  mountainDefs.forEach(([mx, mz, r, h], i) =>
    mountain(mx, mz, r, h, [C.mountainA, C.mountainB, C.mountainC][i % 3], h >= 55));
  const hillDefs = [
    [-95, -10, 26, 11], [-100, -92, 30, 13], [-86, -162, 24, 10], [-20, -206, 32, 12],
    [62, -196, 26, 11], [105, -140, 28, 12], [110, -55, 24, 10], [95, 22, 26, 11],
    [20, 72, 30, 12], [-60, 62, 26, 10],
  ];
  hillDefs.forEach(([hx, hz, r, h], i) => mountain(hx, hz, r, h, i % 2 ? C.hillA : C.hillB));

  // Ground color variation along the whole route
  const dirtPatches = [[0, 2, 9, 13], [2, -16, 7, 13], [8, -30, 8, 11], [2, -48, 9, 15],
    [-6, -70, 11, 16], [6, -100, 9, 20], [4, -124, 9, 12], [9, -139, 7, 8]];
  for (const [px, pz, pw, pd] of dirtPatches) patch(px, pz, pw, pd, C.dirt, Math.random() * 0.4);
  const mossPatches = [[-18, -30, 14, 10], [20, -60, 15, 11], [-22, -86, 12, 13],
    [24, -120, 17, 11], [-20, -146, 10, 8], [-46, -150, 12, 9]];
  for (const [px, pz, pw, pd] of mossPatches) patch(px, pz, pw, pd, C.mossPatch, Math.random() * 0.5);
  const lightPatches = [[16, 8, 12, 10], [-24, -14, 10, 12], [28, -40, 13, 15], [-28, -64, 15, 11],
    [18, -90, 13, 10], [-14, -120, 12, 10], [26, -166, 12, 12], [-24, -172, 14, 10], [-58, -166, 13, 10]];
  for (const [px, pz, pw, pd] of lightPatches) patch(px, pz, pw, pd, C.grassLight, Math.random() * 0.5);

  // ── 1. Start clearing ──────────────────────────────────────
  solid(0, 0, 1, 24, 0.4, 18, C.plazaStone); // top 0.4, spawn stands here
  for (const [px, pz] of [[-10, -6], [10, -6], [-10, 8], [10, 8]]) {
    solid(px, 0.4, pz, 2, 0.9, 2, C.hedge);
  }
  bench(-6, 6, 0.5); bench(6, 1, -2.2);
  lamp(-7, 9, 0.4, -1); lamp(7, -5, 0.4, 1);
  flowers(-15, 3); flowers(15, 9); flowers(-4, 14);
  solid(-3.5, 0, -9.5, 0.8, 4.2, 0.8, C.stone); // gateway posts
  solid(3.5, 0, -9.5, 0.8, 4.2, 0.8, C.stone);
  // Lintel is SOLID (it used to be deco, so the arch had no collision) and
  // seated flush on the posts at 4.2 rather than sunk 0.3 into them.
  solid(0, 4.2, -9.5, 8.6, 0.7, 1, C.trim);

  // Treehouse landmark (charm, not gameplay). Rebuilt so no two pieces
  // occupy the same space: the deck is four planks that TILE around the
  // trunk (leaving a 1.4x1.4 hole = the trunk's exact footprint), the hut
  // stands BESIDE the trunk on the east half of the deck instead of the
  // trunk running through it, and the canopy starts above the hut's roof
  // rather than swallowing the whole hut the way it used to.
  const thX = 16, thZ = -2;
  solid(thX, 0, thZ, 1.4, 11, 1.4, C.trunk);              // trunk 0..11
  solid(thX - 1.9, 4.8, thZ, 2.4, 0.5, 6.2, C.wood);      // deck, west plank
  solid(thX + 1.9, 4.8, thZ, 2.4, 0.5, 6.2, C.wood);      // deck, east plank
  solid(thX, 4.8, thZ - 1.9, 1.4, 0.5, 2.4, C.wood);      // deck, north infill
  solid(thX, 4.8, thZ + 1.9, 1.4, 0.5, 2.4, C.wood);      // deck, south infill
  deco(thX + 1.9, 5.3, thZ, 2.4, 2.1, 3.4, 0xc7995f);     // hut, west face flush with the trunk
  colliders.push(new THREE.Box3(                          // hut walls (visual is deco)
    new THREE.Vector3(thX + 0.7, 5.3, thZ - 1.7),
    new THREE.Vector3(thX + 3.1, 7.4, thZ + 1.7)));
  deco(thX + 2.0, 7.4, thZ, 2.6, 0.35, 3.8, C.roofRust);  // hut roof, overhangs in z only
  cones.push({ x: thX, y: 8.6, z: thZ, r: 3.9, h: 3.6, color: C.foliageA });
  cones.push({ x: thX, y: 10.8, z: thZ, r: 2.7, h: 2.6, color: C.foliageB });
  deco(thX - 1.9, 0, thZ + 3.2, 0.7, 5.0, 0.12, C.wood);  // ladder to the deck's south edge

  // Tutorial pads (gentle) + stream crossing
  solid(0, 0, -14, 5, 1.2, 5, C.padStone);
  // Tutorial mover: a slow horizontal shuttle teaches platform riding
  // before the climb (replaces the old static middle pad)
  moverH('x', 3.5, 8.5, -20.5, 2.2, 3.5, 3.5, 0.55, 0);
  solid(11, 0, -27, 5, 2.4, 5, C.padStone);
  crate(-3, 0, -13, 1.15); // 1.2 put its top exactly level with the pad's, which fought
  rock(-6, -22, 1.2); bush(-2, -25); flowers(4, -6, 5);

  // ── 2. Ascent — full redesign (NO wall-jumping required) ──
  // One winding climb from V1 (roof 3) to the crest (roof 28.5), fully
  // clearable with dash / up-dash / plain-jump only. Wall-jumping is now
  // EXCLUSIVE to the Moonberry detours. Four new movers bridge the widest
  // gaps so the crossing feels expansive. Beat order (technique bracketed):
  //   pad3 →[dash 6.5]→ V1(3) →[up-dash +3.5]→ B2(6.5)
  //   →[slider ferry ~9u]→ B3(6.5) →[bob lift +5.5, jump]→ B4(12)
  //   →[up-dash +3.5]→ B5(15.5) →[slider ferry ~9u]→ B6(15.5)
  //   →[bob lift +5.5, jump]→ B7(21) →[dash ~8u]→ B8(21)
  //   →[up-dash +3.5]→ B9(24.5) →[up-dash +4]→ crest(28.5).
  // Movers use the exact-delta rider carry, so LIVE timing (not the static
  // harness) is what the ride steps depend on — verified geometrically.
  building(10, -40, 9, 8, 3, C.clay, { trim: C.trimWarm });        // V1 (kept: M2 detour launches off its roof)

  // Beat 2 — up-dash +3.5 west onto B2
  building(-1, -46, 9, 8, 6.5, C.sage, { shutters: true });        // B2 [dellicker]

  // Beat 3 — MOVER 1: x-slider ferry west across a ~9u chasm. Board from
  // B2's west edge at the slider's east extreme, ride to B3.
  moverH('x', -12, -7, -47, 6.5, 3, 3, 0.55, 0);  // west extreme stops FLUSH with B3's east face (x -13.5); at -13 the platform drove 1u into the building
  building(-18, -50, 9, 9, 6.5, C.moss, { trim: C.trimWarm });     // B3 (checkpoint)

  // Beat 4 — MOVER 2: bobbing pad lift +5.5. Board at its low point level
  // with B3, ride up, plain-jump south onto B4 at the apex.
  // z -56.5, not -56: B3's roof TRIM overhangs its footprint by 0.3 (to
  // z -54.8) and the pad's south face at -54.5 was cutting into it. The
  // mover-sweep audit misses this class — trim is deco, so it has no
  // collider to collide with. Boarding is still a flush step off B3.
  moverPad(-18, -56.5, 3, 3, 6.5, 12.0, 0.75);
  building(-18, -64, 9, 9, 12, C.stone, { shutters: true });       // B4 [njit]

  // Beat 5 — up-dash +3.5 onto B5
  building(-7, -70, 9, 8, 15.5, C.cream, { shutters: true });      // B5 [pseg]

  // Beat 6 — MOVER 3: x-slider ferry east across a ~9u chasm
  moverH('x', -1, 7, -71, 15.5, 3, 3, 0.6, Math.PI);
  building(13, -74, 9, 9, 15.5, C.darkGreen, { trim: C.trimWarm }); // B6 (checkpoint)

  // Beat 7 — MOVER 4: bobbing pad lift +5.5, plain-jump south onto B7
  moverPad(13, -81, 3, 3, 15.5, 21.0, 0.75, Math.PI);
  building(11, -88, 9, 9, 21, C.pale, { windows: false });         // B7 [qpc]

  // Beat 8 — dash gap ~6.5u west onto B8
  building(-4, -91, 8, 8, 21, C.clay, { trim: C.trimWarm });       // B8 (checkpoint)

  // Beat 9 — up-dash +3.5 onto B9 (small perch, clears the crest footprint)
  building(-13, -93, 6, 6, 24.5, C.stone, { shutters: true });     // B9 [merck]

  // Beat 10 — up-dash +4 onto the crest (M3 detour launches off it)
  building(-16, -104, 10, 10, 28.5, C.stone, { trim: C.trimWarm }); // crest

  // Beat 11 — final up-dash +4.5 onto the peak, the route's high point
  building(-16, -114, 7, 7, 33, C.stone, { trim: C.trimWarm });    // peak [barclays]

  // Decorative village houses off the route (pyramid roofs = clearly
  // not platforms; charm/density only)
  house(-28, -44, 3.6, 3, 2.8, 0xc7995f, 0x8f5a43); // wood-walled cottages
  house(-28, -74, 4, 3.4, 3, C.wood, C.roofSlate);
  house(24, -98, 4.5, 4, 3.4, 0xc7995f, C.roofRust);
  house(-27, -124, 4, 3.4, 3, C.wood, C.roofSlate);

  // Street dressing along the ascent (ground level, kept clear of the
  // building footprints and mover lanes)
  crate(20, 0, -44, 1.4); crate(20, 1.4, -44, 1.0);
  crate(-25, 0, -58, 1.3);
  lamp(4, -33, 0, 1); lamp(-10, -57, 0, -1); lamp(20, -68, 0, 1); lamp(-15, -85, 0, -1); lamp(2, -101, 0, 1);
  rock(23, -54, 1.4); rock(-26, -68, 1.1); rock(5, -103, 1.3);
  bush(22, -40); bush(-24, -52); bush(3, -60); bush(21, -80); bush(-22, -92); bush(2, -108);
  flowers(24, -62, 5); flowers(-26, -46, 5); flowers(18, -94, 5); flowers(-22, -100, 5);

  // ── 3. Crest railing ───────────────────────────────────────
  // SOLID, not deco: it reads as a barrier at the crest's north lip and used
  // to be walked straight through. At 1.1 high it is a hop, not a wall, and
  // the beat-11 up-dash to the peak rises far above it.
  for (let i = 0; i < 4; i++) {
    solid(-20 + i * 2.6, 28.5, -108.6, 0.25, 1.1, 0.25, C.trim);
  }
  solid(-16, 29.4, -108.6, 8, 0.15, 0.2, C.trim);

  // ── 4. Descent — garden terraces ───────────────────────────
  function terrace(x, topY, z, w, d) {
    solid(x, topY - 1.2, z, w, 1.2, d, C.padStone);
    solid(x, 0, z, 1.2, topY - 1.2, 1.2, C.stone);
  }
  terrace(-6, 18, -114, 8, 6);
  terrace(4, 10.5, -122, 8, 6);
  terrace(12, 4.5, -130, 8, 6);
  bush(-6, -112, 0.8, 18); flowers(4, -122, 4, 10.5); bush(12, -128.5, 0.7, 4.5);
  tree(20, -118, 1.1, 1); rock(-14, -124, 1.2);

  // ── 5. Projects plaza — open garden ────────────────────────
  solid(0, 0, -153, 46, 0.4, 34, C.plazaStone); // x -23..23, z -170..-136

  solid(0, 0.4, -153, 5.5, 0.9, 5.5, C.stone); // fountain
  deco(0, 1.28, -153, 4.3, 0.3, 4.3, C.water);
  solid(0, 1.3, -153, 1.2, 1.6, 1.2, C.stone);
  deco(0, 2.95, -153, 0.8, 0.4, 0.8, C.water);
  fountainSurfs.push([0, 1.6, -153, 4.2, 4.2], [0, 3.37, -153, 0.76, 0.76]);
  bench(-4.6, -150, 0.8); bench(4.6, -156, -0.8); bench(-3.8, -157, 2.4); bench(4.2, -149.5, -2.3);

  for (const [cx, cz] of [[-15.6, -153.6], [-10.4, -153.6], [-15.6, -148.4], [-10.4, -148.4]]) {
    solid(cx, 0.4, cz, 0.7, 4.2, 0.7, C.stone); // pavilion columns
  }
  solid(-13, 4.6, -151, 7.4, 0.6, 7.4, C.trim); // pavilion roof, top ~5.2

  building(13, -160, 5, 5, 5.2, C.moss, { trim: C.trimWarm }); // mini tower + windmill
  deco(13, 5.2, -160, 0.4, 1.8, 0.4, C.trunk);

  // Greenhouse landmark: the collider is registered but its visual box
  // is popped — the body renders as a separate transparent glass mesh.
  solid(17, 0.4, -165, 6, 3, 4.6, C.pale);
  solidBoxes.pop();
  deco(17, 0.4, -165, 6.2, 0.25, 4.8, C.trimWarm);   // base curb
  deco(17, 3.25, -165, 6.2, 0.18, 4.8, C.trimWarm);  // eaves band
  for (const [gx, gz] of [[-2.9, -2.2], [2.9, -2.2], [-2.9, 2.2], [2.9, 2.2]]) {
    deco(17 + gx, 0.4, -165 + gz, 0.22, 3, 0.22, C.trimWarm);
  }

  // Hedgerows / planters / lamps / trees around the plaza
  solid(4, 0.4, -145, 6, 1, 1.2, C.hedge);
  solid(-4, 0.4, -161, 6, 1, 1.2, C.hedge);
  solid(20, 0.4, -153, 1.2, 1, 8, C.hedge);
  solid(-19, 0.4, -143, 2, 0.9, 2, C.hedge);
  solid(8, 0.4, -167, 2, 0.9, 2, C.hedge);
  solid(-16, 0.4, -165, 5, 1, 1.2, C.hedge);
  solid(-19, 0.4, -162, 1.2, 0.98, 5, C.hedge); // 0.02 shorter than the arm it meets, so the corner's tops don't fight
  solid(13, 0.4, -141, 1.2, 1, 5, C.hedge);
  lamp(-21, -139, 0.4, 1); lamp(21, -167, 0.4, -1); lamp(-21, -167, 0.4, -1); lamp(21, -139, 0.4, 1);
  flowers(-16, -159, 8, 0.4); flowers(15, -147, 8, 0.4); flowers(-8, -143, 6, 0.4); flowers(6, -159, 6, 0.4);
  tree(-18, -168, 1.2, 0); tree(18, -141, 1.0, 2); tree(-6, -141, 0.9, 1); tree(9, -157, 1.1, 0);

  // Islands off the plaza edges (detour launch points, visible from it)
  solid(32, 0, -146, 5, 2.4, 5, C.padStone);    // east island: ~6.5 dash
  solid(-32, 0, -159, 5, 3.4, 5, C.padStone);   // west island
  moverPad(-27.5, -159, 3.5, 3.5, 0.8, 3.6, 0.7); // bobbing bridge to it

  // Strawberry parkour (Stage 6): each project berry now needs a small
  // climb instead of sitting at ground level.
  // CandidATS — spiral staircase: eight steps wind up the center post
  // to a top deck at 7.
  solid(10, 0.4, -144, 1.2, 6.1, 1.2, C.stone); // center post
  for (let i = 0; i < 8; i++) {
    const a = (i * 45) * Math.PI / 180;
    solid(10 + Math.cos(a) * 2.1, 0.4 + i * 0.72, -144 + Math.sin(a) * 2.1, 1.5, 0.5, 1.5, C.padStone);
  }
  solid(10, 6.5, -144, 2.8, 0.5, 2.8, C.padStone); // top deck, top 7
  // Decibel — planter-and-crates climb onto the pavilion roof
  solid(-18.5, 0.4, -147, 2, 1.4, 2, C.hedge);      // planter, top 1.8
  solid(-17.4, 0.4, -150.4, 1.6, 3, 1.6, C.crate);  // crate stack, top 3.4
  // Athena — climbing tree with a bridge plank onto the mini tower
  solid(22, 0.4, -158.2, 1.6, 1.1, 1.6, C.rock);    // stepping stone, top 1.5
  solid(20.8, 0.4, -161.6, 1.5, 2.3, 1.5, C.rock);  // boulder, top 2.7
  solid(19.3, 0, -161, 1.3, 4.1, 1.3, C.trunk);     // climbing tree trunk
  solid(19.3, 4.1, -161, 2.6, 0.5, 2.6, C.wood);    // tree platform, top 4.6
  solid(16.4, 4.65, -160.3, 4.2, 0.35, 1.2, C.wood); // bridge plank onto the tower
  canopies.push({ x: 19.3, y: 5.6, z: -161, r: 1.9, color: C.foliageA });
  canopies.push({ x: 20.2, y: 6.4, z: -160.3, r: 1.3, color: C.foliageB });
  // Lexicogs — a low cairn on the flats south of the west island. It used
  // to stand on the island's south edge, which put it squarely in M5's
  // launch lane; down here the island's whole rim stays clear.
  rock(-36.4, -150.6, 1.15);
  rock(-32.0, -153.4, 0.95);
  rock(-35.0, -147.8, 0.85);
  solid(-33.2, 0, -150.6, 2.8, 1.5, 2.6, C.rock);   // cairn top, 1.5
  solid(-31.0, 0, -150.6, 1.6, 0.7, 1.5, C.rock);   // step up to it, top 0.7

  // ── 6. Rivers with dressed banks ───────────────────────────
  const waterVolumes = [];
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x6db3cd, transparent: true, opacity: 0.5, flatShading: true, depthWrite: false,
  });
  // Tier 4 water surface: scrolling normal-mapped ripples + sun specular.
  // Deliberately NOT three's mirror Water object: that re-renders the
  // whole scene per plane (4 rivers + fountain here), which can't hold
  // the 60fps mobile guardrail. This surface animates and glints at a
  // tiny fraction of the cost; wading volumes/logic are untouched.
  // Served from the GitHub tag, not the npm package: three's npm tarball
  // ships examples/jsm but NOT examples/textures, so the npm path 404s.
  const waterNorm = new THREE.TextureLoader().load(
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/waternormals.jpg',
    (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
  );
  const waterSurfMat = new THREE.MeshPhongMaterial({
    color: 0x79bcd6,
    normalMap: waterNorm,
    normalScale: new THREE.Vector2(0.7, 0.7),
    shininess: 110,
    specular: 0xbbe4f2,
    transparent: true,
    opacity: 0.82,
  });
  function waterSurf(x, y, z, w, d) {
    const geo = new THREE.PlaneGeometry(w, d);
    const uv = geo.attributes.uv; // scale UVs so ripples tile ~8u everywhere
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 8, uv.getY(i) * d / 8);
    const m = new THREE.Mesh(geo, waterSurfMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
  }
  function water(x, z, w, d) {
    const h = 0.27;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), waterMat);
    m.position.set(x, -0.05 + h / 2, z);
    scene.add(m);
    waterSurf(x, 0.235, z, w, d);
    waterVolumes.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, -0.05, z - d / 2),
      new THREE.Vector3(x + w / 2, 0.22, z + d / 2)
    ));
    // Banks: sandy lips + alternating rocks and reed clusters (kept to
    // the segment's own width so joins don't overlap adjacent water)
    // 0.56 not 0.55: at 0.55 the strip's inner face lands exactly on the
    // water box's edge plane, which fights wherever something else shares it.
    deco(x, -0.02, z - d / 2 - 0.56, w + 0.4, 0.16, 1.1, C.sand);
    deco(x, -0.02, z + d / 2 + 0.56, w + 0.4, 0.16, 1.1, C.sand);
    const n = Math.max(2, Math.floor(w / 11));
    for (let i = 0; i < n; i++) {
      const bx = x - w / 2 + (i + 0.5) * (w / n) + (Math.random() - 0.5) * 3;
      const side = i % 2 ? 1 : -1;
      const rz = z + side * (d / 2 + 1.1);
      // Don't let a bank rock land on the start pad — the tutorial stream
      // runs right beside it, so its collider would clip the landing.
      if (!(Math.abs(bx) < 3.4 && rz > -17.2 && rz < -11)) rock(bx, rz, 0.6 + Math.random() * 0.45);
      reeds(bx + 2.2, z - side * (d / 2 + 0.9));
    }
  }
  water(0, -10.6, 64, 2.0);   // tutorial stream (start plaza → first pad)
  // Plaza-approach river: three segments sharing exact x-boundaries at
  // ±10 (no overlap, no gap) — the jog stays continuous because their
  // z-ranges overlap by 2u across each shared edge.
  water(-42.5, -130, 65, 4);  // x -75..-10
  water(0, -132, 20, 4);      // x -10..10
  water(42.5, -134, 65, 3.8); // x 10..75
  for (const [fx, fy, fz, fw, fd] of fountainSurfs) waterSurf(fx, fy, fz, fw, fd);

  // ── 7. Moonberry signature obstacles (Stage 6 redesign) ────
  // Gate physics (harness-verified): plain jump 4.7 flat / +2.16 rise;
  // jump+dash & superdash ≈ 10.5 flat; straight up-dash +9.1 rise;
  // angled up-dash 10.9 flat / +6.1 rise; wavedash 10.5-12 flat, +1.06
  // hop. Ceilings 2.8 above a floor block every jump/up-dash arc.
  // Anything not meant to be boarded from below sits >9.8 above every
  // standable spot within drift range, or its landing is spiked.

  // M1 — Two wall-pairs. A helper stone leads up to the taller
  // start perch, then the player can jump straight to the first pair,
  // wall-jump up and forward through the higher second pair, and finish
  // on the Moonberry platform farther out beyond the second wall. All wall
  // tops are fully spiked.
  solid(-13.5, 0, -17, 2.8, 1.0, 2.8, C.rock);        // helper stone before the start perch
  solid(-18, 3.2, -17, 5.8, 3.5, 4.8, C.rock);         // start perch / checkpoint perch

  solid(-29.5, 8.6, -19.2, 14.0, 7.2, 1.2, C.stone);    // pair 1, south wall (top 15.8)
  solid(-29.5, 8.6, -14.8, 14.0, 7.2, 1.2, C.pale);     // pair 1, north wall
  // Pair 2 is 12.5 long, not 14, and centred at -41.75 rather than -41: that
  // keeps its WEST end at -48 (so the 8.4u exit to the platform is unchanged)
  // and its east end at -35.5, which cuts the overlap with pair 1 from 2.5u
  // to 1.0u. The pairs still overlap on purpose — that shared unit is where
  // the climb hands off from one to the other — but 2.5u was visibly one
  // wall driven through the other. 1.18 not 1.2 so their z faces don't share
  // a plane across that overlap.
  solid(-41.75, 12.8, -19.2, 12.5, 7.2, 1.18, C.stone);  // pair 2, south wall (top 20.0)
  solid(-41.75, 12.8, -14.8, 12.5, 7.2, 1.18, C.pale);   // pair 2, north wall
  solid(-58.0, 19.4, -17, 3.2, 0.6, 3.2, C.padStone);    // Moonberry platform beyond pair 2, still requiring an up-diagonal dash

  // M2 — Horizontal mover gauntlet (east off V1's roof, in view of the
  // first dash beat). Up-dash to the start pad, then two phase-offset
  // sliders with WIDE travel: gaps swing 1.5-13u, so every hop/dash
  // must be timed across both movers in sequence. Everything sits >9.8
  // above the ground, so nothing can be boarded from below.
  solid(17, 10.4, -40, 3, 0.6, 3, C.padStone);        // start pad, top 11 (up-dash +8 from V1's roof)
  moverH('x', 21.5, 27.5, -40, 11.3, 3, 3, 0.7, 0);       // slider A
  moverH('x', 32, 38, -40, 11.6, 3, 3, 0.95, Math.PI);    // slider B (anti-phase)
  solid(43, 11.6, -40, 2.5, 0.6, 2.5, C.padStone);    // berry pad, top 12.2 → M2

  // M3 — Two hops west off the crest, each: WAVEDASH toward the next
  // platform (a grounded down-dash refills the dash while its boost throws
  // you out low and fast) then a mid-air up-diagonal dash with that regained
  // dash to reach the landing. Both platforms sit ABOVE the launch, and are
  // placed so BOTH inputs are required: too far for the up-diagonal alone,
  // too high for the wavedash's low hop alone.
  // A superdash cannot substitute: PHYSICS.superdashBoostMultiplier is tuned
  // so a wavedash out-ranges it (see player.js), which is what makes this a
  // wavedash obstacle rather than a "pick either tech" one.
  // Gaps are 16.25u edge-to-edge with a +3 rise. That is only spannable by
  // riding the wavedash's flat 21.6 launch a long way and firing the
  // up-diagonal LATE — the up-diagonal overwrites horizontal speed with the
  // dash's 11.3, so spending it early throws the launch speed away. See
  // dev/m3reach.js for the reach of each chain and dev/m3verify.js for the
  // working timing window.
  //   Hop 1: LEFT (-x) → platform A (far west, +3 higher)
  //   Hop 2: LEFT (-x) → platform B = the Moonberry (same again, +3 higher)
  solid(-39, 30.9, -104, 3.5, 0.6, 3.5, C.padStone);   // A, top 31.5 (hop 1, left)
  solid(-59, 33.9, -104, 3.5, 0.6, 3.5, C.padStone);   // B, top 34.5 (hop 2, left) → M3

  // M4 — Four objects, no spikes: start pad → small pad → wall → berry pad.
  // The chain (all distances measured with dev/m4probe.js against the real
  // Player, not estimated):
  //   1. Plain-jump off the START pad (top 3.0) and dash HORIZONTALLY near
  //      the apex. The dash must come late: fire it early and it cancels the
  //      jump's rise (a horizontal dash zeroes vy) and you fall short.
  //   2. Land on the SMALL pad — half the usual 3u pad, 1.5u square, top 5.0
  //      (+2.0, i.e. jump height) and 6.0u out. A plain jump carries +2.15 at
  //      4u but is back down by 6u, so the dash is what buys the crossing.
  //   3. Jump the instant you touch down. The leg-1 dash is still RECENT
  //      (superdash needs timeSinceDashEnd < 0.1s), so that jump becomes a
  //      SUPERDASH — while the landing itself has already refilled the dash.
  //      One dash pays for the crossing AND the boosted launch, which is the
  //      only way to still hold a dash later: a wall-jump never refills, and
  //      the pad is far too small (1.5u vs the 2.4u a dash covers) to do a
  //      grounded dash on. The pad's distance and height are what put
  //      touchdown inside that 0.1s window — see dev/m4tune.js.
  //   4. The superdash arc meets the WALL 6.5u on, at about +2.8 over the pad.
  //      (That distance is set by PHYSICS.superdashBoostMultiplier — the wall
  //      moved in from 9u when the superdash was slowed to 0.65.)
  //      Hold into it and wall-jump once: the kick throws you BACK toward the
  //      start and upward.
  //   5. Straight up-dash near that apex, then steer back over the wall and
  //      land ON TOP of it. The rise happens in a FIXED column at x 48.7 (an
  //      up-dash zeroes horizontal speed), 3.7u short of the wall's near
  //      face, so the drift across is the last precise thing you do.
  //      The wall top is 13.5 because that is the HIGHEST it can be and
  //      still work across the whole input window: at 14.5 the slower end of
  //      the window no longer has the headroom to drift across (swept in
  //      dev/m4tune.js). The wall floats from 4.5 so it is a slab rather
  //      than a tower, while still hanging low enough to catch the
  //      superdash, which meets it around y 6.8.
  //   6. From the wall top, a 4.8u level gap east to the berry pad — past a
  //      plain jump's 4.25 reach, inside a jump+dash's 6.25. Landing on the
  //      wall refills the dash, so it is there to spend. (The pad has to stop
  //      short of x 64: that is the corridor's invisible boundary wall.)
  solid(37, 2.4, -146, 3, 0.6, 3, C.padStone);       // 1. start pad, top 3.0 (step up from the island)
  solid(43, 4.4, -146, 1.5, 0.6, 1.5, C.padStone);   // 2. small pad, top 5.0 (+2.0, jump height), 6.0 out, HALF a normal pad
  solid(51, 4.5, -146, 3.5, 10.0, 8, C.stone);     // 3. wall, FLOATING: 4.5 up to 13.5, face at x 49.5, 3.5 thick so its top is a landable ledge with a run-up
  solid(60, 13.9, -146, 3, 0.6, 3.5, C.padStone);  // 4. berry pad, top 13.5, level with the wall top → M4. Full 3u pad, moved in so its east edge (63.9) clears the corridor's invisible boundary wall at x 64 — the player can only ever stand out to 63.6, so nothing east of that was reachable anyway. Shortening the gap to 7.15u is what lets a superdash reach it as well as a wavedash.

  // M5 — THE GAUNTLET. M1, M2, M3 and M4 replayed back to back, in that
  // order, on ONE life. No checkpoint inside it — the only lantern is at the
  // mouth, on the west island — so a miss anywhere restarts the whole run.
  //
  // §2-§4 are their Moonberries' geometry TRANSLATED, not reinterpreted:
  // same mover travel and phases, same 16.25/16.5 wavedash gaps, same
  // +6/+15/+27 vault offsets. That is load-bearing — those sections are
  // already proven possible by the Moonberry each copies, so the gauntlet is
  // "do all four cleanly in a row" rather than a fresh set of distances to
  // tune. dev/m5verify.js check A asserts the distances still match.
  //
  // EVERYTHING SITS AT z ≤ -155 AND x ≤ -37, deliberately. The Barclays peak
  // (x -19.5..-12.5, z -117.5..-110.5, roof 33) and M3's platforms (z -104,
  // up to y 34.5) are both high enough to launch from, and an earlier layout
  // ran close enough to the peak that M5's later sections could be dropped
  // into from its roof. Keep new geometry in the corner; if anything moves
  // back toward z -130, re-check it against those two.

  // ── §1: one wall pair, entered by a WAVEDASH (3.4 → 11) ───────
  // A single 12u slot, 3.2 wide, standing on the ground rather than floating,
  // with NO pad at its mouth: you wavedash straight off the island's west rim
  // into the canyon and grab a wall on the way down.
  //
  // The wavedash is required by DASH ECONOMY, not by distance. A grounded
  // down-dash refills on the ground before the jump fires, so a wavedash puts
  // you in the air still holding a dash; a jump+dash covers the same 10.5u but
  // spends it. Wall-jumps never refill, and the wall tops are spiked, so the
  // dash you arrive with is the only one you will have for the 8.4u exit.
  // Cross it any other way and you climb the whole slot to find you cannot
  // leave.
  //
  // The walls FLOAT, base 4.0. That is what stops the canyon being entered
  // from below, and it replaces a 22u field of ground spikes that used to do
  // the same job. A standing jump from the ground tops out at feet 2.16, so
  // the player's head reaches 3.58 — short of 4.0, with nothing to grab. Every
  // other way up from the ground (up-dash, up-diagonal) clears 4.0 easily but
  // SPENDS the dash getting there, and then the spiked tops and the 8.4u exit
  // leave no way out. So the ground route is self-defeating rather than
  // blocked, and needs no hazard to enforce it.
  // Wall length is set by the CLIMB, not by eye: a wall-jump drifts only
  // about 1u along the slot, so from the entry grab at x -47.9 the player
  // tops out around x -49 however long the walls are. Six units is what the
  // climb actually uses — at twelve, most of the slot was dead length and the
  // exit platform ended up further west than any dash could reach.
  // Slot 2.6, not 3.2. Raising the base to 4.0 shortened the window in which
  // the incoming wavedash can still touch a wall (contact needs the player's
  // head above 4.0, i.e. feet above 2.58, and they launch at 3.4). At 3.2 wide
  // the 1.6u of air-control drift needed to reach a face took longer than that
  // window lasted and the entry flew straight through the canyon.
  // Four units long, because that is all the climb uses: the wavedash grabs
  // at x -45.5, a wall-jump drifts ~1u along the slot, and the player tops
  // out by x -46.3. Anything longer is dead stone that pushes the exit
  // platform out of dash range.
  solid(-44.75, 3.9, -160.3, 2.5, 6, 1.2, C.stone); // south wall, 3.9 → 9.9
  solid(-44.75, 3.9, -156.5, 2.5, 6, 1.2, C.pale);  // north wall — slot 2.6, mouth at x -43.5, west end -46
  // Exit platform: SQUARE 3.2, top 9.6, east edge -51.7 — 5.7u past the walls.
  // How far out it can sit is squeezed from BOTH sides, and both bounds were
  // found the hard way:
  //   FLOOR y 9.4. Below that a jump+up-dash straight off the flat ground
  //   (rise 9.24) lands on it and skips §1 entirely — caught by verify6 at a
  //   trial height of 8.0. That is why the platform cannot simply be dropped
  //   to push it further west.
  //   CEILING west. Placed off the traced exit arc (m5verify C_s1_exitArc):
  //   the dash leaves the wall at (-44.7, 7.5), peaks near x -49.6 at
  //   11.8-13.2 by timing, then falls through 9.6 between x -52.0 and -53.1.
  //   Past -51.7 the earliest timing is already below the top and hits the
  //   platform's east FACE instead of landing on it.
  // With the walls at 2.5u long (all the climb uses) that leaves 5.7u —
  // comfortably past a plain jump's 4.7u, which is the point.
  solid(-53.3, 9.0, -158.4, 3.2, 0.6, 3.2, C.padStone); // exit platform, top 9.6

  // ── §2: M2's sliders, bent into an L (11.6 → 13.4) ────────
  // Same 6u travel, same anti-phase, same speeds. Slider A runs west; slider
  // B turns the corner and runs north, so the transfer needs BOTH at the
  // right end of their travel at once — misaligned it opens to 8.6u, past a
  // jump+dash's reach. §1's exit platform doubles as the start pad.
  moverH('x', -67.2, -61.2, -158.4, 10.3, 3, 3, 0.7, 0);      // slider A, west
  moverH('z', -170, -164, -72, 10.6, 3, 3, 0.95, Math.PI);    // slider B, north (anti-phase)

  // ── §3: M3's two wavedashes, along the north edge (11.4 → 17.4) ─
  // The same 16.25u then 16.5u edge-to-edge gaps, each +3 up: wavedash out
  // low and fast, then spend the regained dash on a LATE up-diagonal. Run
  // east along z -175 rather than folded into the corner, because folding
  // hop 2 south put platform B directly over §1's wall tops — within a
  // jump+up-dash's 9.24 rise of them, which would have skipped §2 entirely.
  // The launch pad's height is set by the hop off slider B, not by taste: a
  // dash zeroes vertical speed, so a rise of +1.8 onto it could not be made
  // at ANY phase of B's travel. At +0.8 a plain jump clears it.
  solid(-78, 10.8, -175, 5, 0.6, 4, C.padStone);        // launch pad, top 11.4 (also §2's exit)
  solid(-57.5, 13.8, -175, 3.5, 0.6, 3.5, C.padStone);  // A, top 14.4 (16.25u east, +3)
  solid(-37.5, 16.8, -175, 3.5, 0.6, 3.5, C.padStone);  // B, top 17.4 (16.5u east, +3)

  // ── §4: M4's vault, mirrored to run west (18.4 → 28.9) ─────
  // Same offsets from the start pad as M4 (+6 small pad, +15 wall, +27 berry
  // pad) and the same heights: air-dash onto the small pad, jump the instant
  // you touch down to convert that dash into a superdash, meet the wall,
  // wall-jump, up-dash back onto its top, then the last gap to the berry.
  solid(-40, 17.8, -168, 3, 0.6, 3, C.padStone);       // start pad, top 18.4
  solid(-46, 19.8, -168, 1.5, 0.6, 1.5, C.padStone);   // small pad, top 20.4 (+2.0, 6.0 out)
  solid(-54, 19.9, -168, 3.5, 10.0, 8, C.stone);        // wall, floating 19.9 → 28.9, far face at x -56.75
  solid(-67, 29.3, -168, 3, 0.6, 3.5, C.padStone);     // berry pad, top 28.9, level with the wall top → M5

  // ── 8. Anti-skip spikes — one specific bypass each ─────────
  const spikeRow = (cx, baseY, z, count = 10, width = 14, depth = 0.7, rows = 2) => {
    const halfW = width / 2;
    const halfD = depth / 2;
    for (let i = 0; i < count; i++) {
      const x = cx - halfW + (i + 0.5) * (width / count);
      for (let j = 0; j < rows; j++) {
        const zz = z - halfD + (j + 0.5) * (depth / rows);
        spikes(x, baseY, zz);
      }
    }
  };
  // M1: the top of every wall is covered so there is no lip skip. Sized to
  // the wall each row sits on rather than left on spikeRow's defaults (width
  // 14, 2 rows), which overhung: a spike's visual reach is ±0.455 once its
  // random jitter is counted, and TWO rows inside a 1.2u thickness put that
  // 0.03 proud of both z faces. ONE row down the centre line sits clean, and
  // the widths stop 0.5 short of each end.
  spikeRow(-29.5, 15.8, -19.2, 10, 13.0, 0.4, 1);  // pair 1, x -36.5..-22.5
  spikeRow(-29.5, 15.8, -14.8, 10, 13.0, 0.4, 1);
  spikeRow(-41.75, 20.0, -19.2, 9, 11.5, 0.4, 1);  // pair 2, x -48..-35.5
  spikeRow(-41.75, 20.0, -14.8, 9, 11.5, 0.4, 1);
  // (M3 redesigned as an open two-platform wavedash→up-diagonal route — no
  // walls/ceilings/spikes; the platform distances alone enforce the tech.)
  // (M4 rebuilt as four open objects — the barriers those spikes guarded are
  // gone, and nothing in the new chain can be skipped by landing on a top.)
  // M5 §1 is M1's walls translated, so it carries M1's spiked tops too.
  // M5 §1: wall tops spiked so the slot cannot be topped out and walked.
  // (The ground beneath needs nothing — the walls float at 4.0, above a
  //  standing jump's 3.58 head height. See §18.)
  // Rows are sized to the wall they sit on: width 5.0 inside a 6u wall, ONE
  // row inside a 1.2u thickness, because a spike's footprint is ±0.42 and
  // spikeRow's defaults (width 14, 2 rows) overhang anything smaller.
  spikeRow(-44.75, 9.9, -160.3, 3, 1.5, 0.4, 1);
  spikeRow(-44.75, 9.9, -156.5, 3, 1.5, 0.4, 1);
  // (§2-§4 copy M2/M3/M4, none of which need spikes: their distances
  //  alone enforce the technique, and nothing there can be boarded from
  //  below — every surface floats >9.8 above the next standable thing.)

  // Trail trees (whole-route forest density)
  const trailTrees = [
    [-8, 10, 1.0, 0], [10, 12, 0.9, 1], [-14, -2, 1.1, 2], [20, 6, 1.0, 0], [26, -6, 0.9, 2],
    [-20, 4, 1.2, 1], [-26, -8, 1.0, 0], [-22, -24, 0.9, 2], [-30, -34, 1.2, 0], [-20, -40, 0.9, 1],
    [24, -14, 1.0, 2], [30, -28, 1.1, 0], [34, -44, 0.9, 1], [-32, -52, 1.0, 2], [-24, -60, 1.2, 0],
    [30, -72, 1.0, 1], [-34, -78, 0.9, 2], [20, -84, 1.1, 0], [-22, -92, 1.0, 1], [28, -92, 0.9, 2],
    [-28, -100, 1.2, 0], [34, -106, 1.0, 1], [-26, -116, 0.9, 2], [24, -118, 1.1, 0], [-18, -126, 1.0, 1],
    [30, -124, 0.9, 2], [-28, -140, 1.1, 0], [36, -150, 0.9, 1], [-48, -170, 1.0, 2], [-58, -172, 1.1, 0],
    [-68, -150, 0.9, 1], [24, -172, 1.0, 2], [36, -170, 1.1, 0], [-6, -176, 1.0, 1], [6, -174, 0.9, 2],
    [14, -173, 1.0, 0], [-38, -120, 1.0, 2], [-52, -136, 0.9, 0], [42, -120, 1.1, 1], [48, -136, 0.9, 2],
  ];
  for (const [tx, tz, ts, tk] of trailTrees) tree(tx, tz, ts, tk);

  // ── Corridor boundary ──────────────────────────────────────
  // Invisible walls at the playable-corridor edge: beyond it the rising
  // terrain is visual-only (the physics ground stays flat), so wandering
  // out would sink the player into hills. A soft tree-line marks it.
  const WALL_H = 80;
  colliders.push(
    new THREE.Box3(new THREE.Vector3(-88, 0, -190), new THREE.Vector3(-84, WALL_H, 30)),
    new THREE.Box3(new THREE.Vector3(64, 0, -190), new THREE.Vector3(68, WALL_H, 30)),
    new THREE.Box3(new THREE.Vector3(-88, 0, -190), new THREE.Vector3(68, WALL_H, -186)),
    new THREE.Box3(new THREE.Vector3(-88, 0, 26), new THREE.Vector3(68, WALL_H, 30))
  );
  const borderTrees = [
    [-82, -20, 1.2, 2], [-82, -60, 1.0, 0], [-82, -110, 1.3, 2], [-82, -150, 1.0, 1],
    [62, -30, 1.2, 2], [62, -80, 1.0, 1], [62, -120, 1.2, 0], [62, -160, 1.0, 2],
    [-40, 22, 1.1, 0], [10, 22, 1.2, 2], [40, 22, 1.0, 1],
    [-30, -183, 1.1, 2], [20, -183, 1.2, 0], [50, -183, 1.0, 1],
  ];
  for (const [tx, tz, ts, tk] of borderTrees) tree(tx, tz, ts, tk);

  // ── Build instanced meshes (Tier 1: textured material groups) ──
  const meshes = [];
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Procedural CanvasTextures. Box textures are painted near-white so the
  // per-instance colors keep the established palette (map × instanceColor).
  const noise = makeNoise2(7);
  const stuccoTex = canvasTexture(256, 1, paintStucco());
  const stoneTex = canvasTexture(256, 1, paintStone());
  const woodTex = canvasTexture(256, 1, paintWood());
  const mottleTex = canvasTexture(256, 1, paintMottle());

  // Boxes are routed to a texture group by their palette color — no call
  // sites change, and colliders/movers are untouched.
  const TEX_GROUPS = {
    wall:  { map: stuccoTex, colors: [0x9caf88, 0x7e9e6b, 0xa8bb8f, 0xc2a06b, 0xd9cfae, 0x6b8f63, 0xb9b193, 0xc7b089] },
    stone: { map: stoneTex,  colors: [0xcdc5a3, 0x9a9a8c, 0x9a916f] },
    // Platform pads get RoundedBoxGeometry so edges read as worn stone
    // (radius scales with the instance — pads are 2.5-8u, so ~0.15-0.45)
    pad:   { map: stoneTex,  colors: [0xbfb694], geo: new RoundedBoxGeometry(1, 1, 1, 2, 0.055) },
    wood:  { map: woodTex,   colors: [0x8a6b4a, 0xa9805a, 0xa98d5f, 0xc7995f, 0x77543a, 0x6b4a33] },
    plain: { map: null,      colors: [] },
  };
  const colorToGroup = new Map();
  for (const [name, g] of Object.entries(TEX_GROUPS)) {
    for (const c of g.colors) colorToGroup.set(c, name);
  }

  const boxLoc = new Map(); // box entry -> {mesh, index}; movers re-link below
  function instanceGroup(list, map, geo) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(
      geo || new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ flatShading: true, map }),
      list.length
    );
    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((b, i) => {
      quat.setFromAxisAngle(yAxis, b.ry || 0);
      im.setMatrixAt(i, mat.compose(pos.set(b.x, b.y, b.z), quat, scl.set(b.w, b.h, b.d)));
      im.setColorAt(i, col.set(b.color));
      boxLoc.set(b, { mesh: im, index: i });
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
    meshes.push(im);
    return im;
  }
  const grouped = { wall: [], stone: [], pad: [], wood: [], plain: [] };
  for (const b of [...solidBoxes, ...decoBoxes]) {
    grouped[colorToGroup.get(b.color) || 'plain'].push(b);
  }
  for (const [name, list] of Object.entries(grouped)) {
    instanceGroup(list, TEX_GROUPS[name].map, TEX_GROUPS[name].geo);
  }
  for (const m of movers) {
    const loc = boxLoc.get(m.b);
    m.im = loc.mesh;
    m.idx = loc.index;
  }

  const coneIM = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    new THREE.MeshStandardMaterial({ flatShading: true, map: mottleTex }),
    cones.length
  );
  {
    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    cones.forEach((c, i) => {
      quat.setFromAxisAngle(yAxis, c.ry || 0);
      coneIM.setMatrixAt(i, mat.compose(pos.set(c.x, c.y + c.h / 2, c.z), quat, scl.set(c.r, c.h, c.r)));
      coneIM.setColorAt(i, col.set(c.color));
    });
  }
  coneIM.castShadow = true;
  coneIM.receiveShadow = true;
  scene.add(coneIM);
  meshes.push(coneIM);

  // ── Terrain: heightmap-displaced plane (visual only) ───────
  // Flat at EXACTLY y=0 inside the playable corridor — the same height as
  // the flat ground collider, so the player stands on the grass it can see
  // rather than hovering 0.06 over it. Rolls into hills past the corridor.
  const grassTex = canvasTexture(512, 56, paintGrass());
  const terrainGeo = new THREE.PlaneGeometry(420, 500, 140, 160);
  terrainGeo.rotateX(-Math.PI / 2);
  {
    const posAttr = terrainGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const wx = posAttr.getX(i);
      const wz = posAttr.getZ(i) - 75; // mesh sits at z = -75
      const dx = Math.max(0, Math.abs(wx + 10) - 75);
      const dz = Math.max(0, Math.abs(wz + 80) - 105);
      const edge = Math.min(1, Math.hypot(dx, dz) / 35);
      const n = noise(wx * 0.018, wz * 0.018) + 0.5 * noise(wx * 0.05, wz * 0.05);
      posAttr.setY(i, edge * (2.2 + 3.8 * (n * 0.5 + 0.5)));
      const shade = 0.86 + 0.26 * (noise(wx * 0.03 + 9, wz * 0.03) * 0.5 + 0.5);
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade * 0.95;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();
  }
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true })
  );
  terrain.position.set(0, 0, -75);
  terrain.receiveShadow = true;
  scene.add(terrain);
  meshes.push(terrain);

  // ── Tier 2: vegetation & ground life ───────────────────────
  const _iMat = new THREE.Matrix4();
  const _iQuat = new THREE.Quaternion();
  const _iPos = new THREE.Vector3();
  const _iScl = new THREE.Vector3();
  const _iCol = new THREE.Color();

  // Tree trunks (tapered cylinders) + broadleaf canopy blobs
  const trunkIM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.68, 1, 1, 6),
    new THREE.MeshStandardMaterial({ flatShading: true, map: woodTex, color: 0x8a6b4a }),
    trunks.length
  );
  trunks.forEach((tr, i) => {
    _iQuat.setFromAxisAngle(yAxis, Math.random() * Math.PI);
    trunkIM.setMatrixAt(i, _iMat.compose(_iPos.set(tr.x, tr.h / 2 - 0.04, tr.z), _iQuat, _iScl.set(tr.r, tr.h, tr.r)));
    const v = 0.88 + Math.random() * 0.24;
    trunkIM.setColorAt(i, _iCol.setRGB(v, v, v));
  });
  trunkIM.castShadow = trunkIM.receiveShadow = true;
  scene.add(trunkIM);
  meshes.push(trunkIM);

  const canopyIM = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ flatShading: true, map: mottleTex }),
    canopies.length
  );
  canopies.forEach((cb, i) => {
    _iQuat.setFromAxisAngle(yAxis, Math.random() * Math.PI * 2);
    canopyIM.setMatrixAt(i, _iMat.compose(_iPos.set(cb.x, cb.y, cb.z), _iQuat, _iScl.set(cb.r, cb.r * 0.82, cb.r)));
    canopyIM.setColorAt(i, _iCol.set(cb.color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06));
  });
  canopyIM.castShadow = canopyIM.receiveShadow = true;
  scene.add(canopyIM);
  meshes.push(canopyIM);

  // Shared scatter exclusions (plazas + water)
  const scatterBlocked = (x, z) =>
    (Math.abs(x) < 13 && z > -9.5 && z < 11) ||
    (Math.abs(x) < 24 && z > -171 && z < -135) ||
    waterVolumes.some((w) => x > w.min.x - 0.8 && x < w.max.x + 0.8 && z > w.min.z - 0.8 && z < w.max.z + 0.8);

  // Instanced grass: tapered blades in clumps, denser along the route
  // band, with a cheap vertex-shader wind sway driven by time + world
  // position. No cast shadows (perf guardrail).
  const GRASS_COUNT = 9500;
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.07, 0, 0, 0.07, 0, 0, 0.04, 0.55, 0, -0.04, 0.55, 0,
  ]), 3));
  bladeGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ]), 3));
  bladeGeo.setIndex([0, 1, 2, 0, 2, 3]);
  let grassWind = null;
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gw = clamp(transformed.y / 0.55, 0.0, 1.0);
        gw *= gw;
        vec2 gpos = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        transformed.x += gw * (sin(uTime * 1.9 + gpos.x * 0.4 + gpos.y * 0.35) * 0.09 + sin(uTime * 3.7 + gpos.y) * 0.03);
        transformed.z += gw * cos(uTime * 1.6 + gpos.x * 0.3) * 0.05;`);
    grassWind = shader;
  };
  const grassIM = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_COUNT);
  {
    let gi = 0;
    let guard = 0;
    while (gi < GRASS_COUNT && guard++ < 60000) {
      const band = Math.random() < 0.6;
      const cx = band ? -48 + Math.random() * 94 : -83 + Math.random() * 145;
      const cz = band ? -178 + Math.random() * 188 : -185 + Math.random() * 209;
      if (scatterBlocked(cx, cz)) continue;
      const n = 5 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n && gi < GRASS_COUNT; k++) {
        const bx = cx + (Math.random() - 0.5) * 1.9;
        const bz = cz + (Math.random() - 0.5) * 1.9;
        if (scatterBlocked(bx, bz)) continue;
        _iQuat.setFromAxisAngle(yAxis, Math.random() * Math.PI);
        const s = 0.75 + Math.random() * 0.6;
        grassIM.setMatrixAt(gi, _iMat.compose(_iPos.set(bx, -0.05, bz), _iQuat, _iScl.set(s, s, s)));
        grassIM.setColorAt(gi, _iCol.setHSL(0.24 + Math.random() * 0.05, 0.45 + Math.random() * 0.15, 0.34 + Math.random() * 0.16));
        gi++;
      }
    }
    grassIM.count = gi;
  }
  grassIM.receiveShadow = true;
  scene.add(grassIM); // not in `meshes` — camera shouldn't collide with grass

  // Pebbles + fallen leaves near the route
  const pebbleIM = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ flatShading: true, map: stoneTex }),
    170
  );
  for (let i = 0; i < 170; i++) {
    let px = 0, pz = 0, ok = false;
    for (let a = 0; a < 8 && !ok; a++) {
      px = -80 + Math.random() * 142;
      pz = -184 + Math.random() * 206;
      ok = !scatterBlocked(px, pz);
    }
    _iQuat.setFromEuler(new THREE.Euler(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6));
    const s = 0.1 + Math.random() * 0.26;
    pebbleIM.setMatrixAt(i, _iMat.compose(_iPos.set(px, 0.02, pz), _iQuat, _iScl.set(s, s * 0.6, s)));
    const v = 0.7 + Math.random() * 0.4;
    pebbleIM.setColorAt(i, _iCol.setRGB(v, v, v * 0.97));
  }
  pebbleIM.castShadow = pebbleIM.receiveShadow = true;
  scene.add(pebbleIM);

  const leafLitterIM = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    380
  );
  const litterPalette = [0xd9b44a, 0xc46a3f, 0x9fbf5f, 0xb4864f];
  for (let i = 0; i < 380; i++) {
    let px = 0, pz = 0, ok = false;
    for (let a = 0; a < 8 && !ok; a++) {
      px = -80 + Math.random() * 142;
      pz = -184 + Math.random() * 206;
      ok = !scatterBlocked(px, pz);
    }
    _iQuat.setFromEuler(new THREE.Euler(-Math.PI / 2 + (Math.random() - 0.5) * 0.5, 0, Math.random() * Math.PI * 2, 'YXZ'));
    leafLitterIM.setMatrixAt(i, _iMat.compose(_iPos.set(px, 0.0, pz), _iQuat, _iScl.set(1, 1, 1)));
    leafLitterIM.setColorAt(i, _iCol.set(litterPalette[i % 4]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
  }
  leafLitterIM.receiveShadow = true;
  scene.add(leafLitterIM);

  // Greenhouse glass (transparent, non-instanced)
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xcfe8e2, transparent: true, opacity: 0.35, flatShading: true, depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.8, 4.4), glassMat);
  glass.position.set(17, 1.85, -165);
  scene.add(glass);
  const glassRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.5, 4), glassMat);
  glassRoof.position.set(17, 4.1, -165);
  glassRoof.rotation.y = Math.PI / 4;
  scene.add(glassRoof);

  // Windmill blades on the mini tower
  const windmill = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: C.pale, flatShading: true });
  const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.12), bladeMat);
  const bladeB = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.12), bladeMat);
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.4), new THREE.MeshStandardMaterial({ color: C.trunk, flatShading: true }));
  windmill.add(bladeA, bladeB, hub);
  windmill.position.set(13, 7.1, -157.2);
  scene.add(windmill);

  // ── Splash particles ───────────────────────────────────────
  const SPLASH_COUNT = 40;
  const splashIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xd6ecf4 }),
    SPLASH_COUNT
  );
  splashIM.frustumCulled = false;
  scene.add(splashIM);
  const splashes = Array.from({ length: SPLASH_COUNT }, () => ({
    life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  }));
  const _sMat = new THREE.Matrix4();
  const _sQuat = new THREE.Quaternion();
  const _sPos = new THREE.Vector3();
  const _sScl = new THREE.Vector3();
  for (let i = 0; i < SPLASH_COUNT; i++) {
    splashIM.setMatrixAt(i, _sMat.compose(_sPos.set(0, -50, 0), _sQuat, _sScl.set(0, 0, 0)));
  }
  let splashCursor = 0;
  let splashCooldown = 0;
  function emitSplash(x, y, z) {
    if (splashCooldown > 0) return;
    splashCooldown = 0.05;
    for (let n = 0; n < 3; n++) {
      const s = splashes[splashCursor];
      splashCursor = (splashCursor + 1) % SPLASH_COUNT;
      s.life = 0.4 + Math.random() * 0.2;
      s.x = x + (Math.random() - 0.5) * 0.5;
      s.y = y + 0.1;
      s.z = z + (Math.random() - 0.5) * 0.5;
      s.vx = (Math.random() - 0.5) * 2.6;
      s.vy = 2 + Math.random() * 2;
      s.vz = (Math.random() - 0.5) * 2.6;
    }
  }

  // ── Dust & tech puffs ──────────────────────────────────────
  const PUFF_COUNT = 60;
  const puffIM = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.13, 0.13, 0.13),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    PUFF_COUNT
  );
  puffIM.frustumCulled = false;
  scene.add(puffIM);
  const puffs = Array.from({ length: PUFF_COUNT }, () => ({
    life: 0, maxLife: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0,
  }));
  const _pCol = new THREE.Color();
  for (let i = 0; i < PUFF_COUNT; i++) {
    puffIM.setMatrixAt(i, _sMat.compose(_sPos.set(0, -50, 0), _sQuat, _sScl.set(0, 0, 0)));
    puffIM.setColorAt(i, _pCol.set(0xffffff));
  }
  let puffCursor = 0;
  function spawnPuff(x, y, z, vx, vy, vz, grav, life, color) {
    const i = puffCursor;
    puffCursor = (puffCursor + 1) % PUFF_COUNT;
    const p = puffs[i];
    p.life = p.maxLife = life;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.grav = grav;
    puffIM.setColorAt(i, _pCol.set(color));
    puffIM.instanceColor.needsUpdate = true;
  }
  function emitDust(x, y, z) {
    for (let n = 0; n < 6; n++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 1.2;
      spawnPuff(x, y + 0.05, z, Math.cos(a) * r, 0.7 + Math.random() * 0.9, Math.sin(a) * r,
        -3, 0.35 + Math.random() * 0.15, 0xcbc3a6);
    }
  }
  const TECH_COLORS = { wavedash: 0xffb054, superdash: 0xfff2a8 };
  function emitTechBurst(x, y, z, velX, velZ, type) {
    const len = Math.hypot(velX, velZ) || 1;
    const bx = -velX / len;
    const bz = -velZ / len;
    for (let n = 0; n < 8; n++) {
      const spread = (Math.random() - 0.5) * 1.8;
      spawnPuff(x, y + 0.1, z,
        bx * (2 + Math.random() * 2.5) - bz * spread,
        0.5 + Math.random() * 1.6,
        bz * (2 + Math.random() * 2.5) + bx * spread,
        -6, 0.3 + Math.random() * 0.15, TECH_COLORS[type] || 0xffe08a);
    }
  }
  let trailCooldown = 0;
  function emitTechTrail(x, y, z, type) {
    if (trailCooldown > 0) return;
    trailCooldown = 0.04;
    spawnPuff(
      x + (Math.random() - 0.5) * 0.3, y + 0.08, z + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8,
      -2, 0.25 + Math.random() * 0.1, TECH_COLORS[type] || 0xffe08a);
  }

  // ── Atmosphere ─────────────────────────────────────────────
  scene.background = makeSkyGradient();
  scene.fog = new THREE.Fog(0xdbe6c3, 55, 240); // extended so mountains read hazy, not clipped
  // NOTE: the drifting leaf/pollen particle field (spec §3) was REMOVED — 220
  // unlit tumbling quads around the camera read as confetti and made the
  // frame busy. Sky gradient + fog + wind grass carry the atmosphere now.

  // ── Per-frame animation ────────────────────────────────────
  const moverMat = new THREE.Matrix4();
  const moverQuat = new THREE.Quaternion();
  const moverPos = new THREE.Vector3();
  const moverScl = new THREE.Vector3();
  let t = 0;
  function update(dt, playerPos) {
    t += dt;
    for (const m of movers) {
      if (!m.cur) m.cur = { x: m.b.x, y: m.b.y, z: m.b.z };
      const osc = Math.sin(t * m.speed + m.phase) * m.amp;
      const nx = m.axis === 'x' ? m.b.x + osc : m.b.x;
      const ny = m.axis === 'y' ? m.b.y + osc : m.b.y;
      const nz = m.axis === 'z' ? m.b.z + osc : m.b.z;
      // Rider carry: feet resting on the current top + footprint overlap
      // => move the player by the exact frame delta on every axis, so
      // riding is glued for bobbing AND sliding platforms.
      const feet = playerPos.y - 0.7; // player half-height (see Player.half)
      if (feet > m.box.max.y - 0.12 && feet < m.box.max.y + 0.25 &&
          playerPos.x > m.box.min.x - 0.35 && playerPos.x < m.box.max.x + 0.35 &&
          playerPos.z > m.box.min.z - 0.35 && playerPos.z < m.box.max.z + 0.35) {
        playerPos.x += nx - m.cur.x;
        playerPos.y += ny - m.cur.y;
        playerPos.z += nz - m.cur.z;
      }
      m.cur.x = nx; m.cur.y = ny; m.cur.z = nz;
      m.box.min.set(nx - m.b.w / 2, ny - m.b.h / 2, nz - m.b.d / 2);
      m.box.max.set(nx + m.b.w / 2, ny + m.b.h / 2, nz + m.b.d / 2);
      m.im.setMatrixAt(m.idx, moverMat.compose(
        moverPos.set(nx, ny, nz), moverQuat, moverScl.set(m.b.w, m.b.h, m.b.d)
      ));
      m.im.instanceMatrix.needsUpdate = true;
    }
    windmill.rotation.z += dt * 0.9;
    if (grassWind) grassWind.uniforms.uTime.value = t;
    waterNorm.offset.x = t * 0.02;   // scrolling ripples on all water
    waterNorm.offset.y = t * 0.012;

    splashCooldown = Math.max(0, splashCooldown - dt);
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const s = splashes[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy -= 12 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const k = Math.max(0, s.life / 0.5);
      splashIM.setMatrixAt(i, _sMat.compose(_sPos.set(s.x, s.y, s.z), _sQuat, _sScl.set(k, k, k)));
    }
    splashIM.instanceMatrix.needsUpdate = true;

    trailCooldown = Math.max(0, trailCooldown - dt);
    for (let i = 0; i < PUFF_COUNT; i++) {
      const p = puffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.maxLife);
      puffIM.setMatrixAt(i, _sMat.compose(_sPos.set(p.x, p.y, p.z), _sQuat, _sScl.set(k, k, k)));
    }
    puffIM.instanceMatrix.needsUpdate = true;
  }

  return {
    meshes,
    colliders,
    waterVolumes,
    hazards,
    // Dev introspection for dev/audit.js: the raw box lists and the mover
    // definitions, so the audit can compare what is DRAWN against what is
    // SOLID and sweep each mover's travel. Inert for players.
    solidBoxes,
    decoBoxes,
    movers,
    emitSplash,
    emitDust,
    emitTechBurst,
    emitTechTrail,
    spawn: new THREE.Vector3(0, 1.5, 6),
    update,
  };
}

function makeSkyGradient() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#a5d8cf');
  grad.addColorStop(0.55, '#cfe4c9');
  grad.addColorStop(1, '#f5efd8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


// ─────────────────────────────────────────────────────────────
// Tier 1 rendering foundations: inline gradient noise + procedural
// CanvasTextures (256-512px; the detail comes from the pattern).
// ─────────────────────────────────────────────────────────────

function makeNoise2(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const lerp = (a, b, t) => a + (b - a) * t;
  return (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    return lerp(
      lerp(grad(p[p[X] + Y], xf, yf), grad(p[p[X + 1] + Y], xf - 1, yf), u),
      lerp(grad(p[p[X] + Y + 1], xf, yf - 1), grad(p[p[X + 1] + Y + 1], xf - 1, yf - 1), u),
      v
    ) * 0.7;
  };
}

function canvasTexture(size, repeat, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Painted in actual greens (the terrain has no instance tint; large-scale
// variation comes from terrain vertex colors).
function paintGrass() {
  return (ctx, s) => {
    ctx.fillStyle = '#7da45c';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 240; i++) {
      const g = 120 + Math.random() * 55 | 0;
      ctx.fillStyle = `rgba(${g - 45}, ${g}, ${55 + Math.random() * 30 | 0}, 0.16)`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 6 + Math.random() * 24, 4 + Math.random() * 16, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < 70; i++) { // dirt speckle
      ctx.fillStyle = `rgba(${150 + Math.random() * 30 | 0}, ${125 + Math.random() * 25 | 0}, 85, 0.12)`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 3 + Math.random() * 9, 2 + Math.random() * 6, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < 1100; i++) { // blade strokes
      const x = Math.random() * s;
      const y = Math.random() * s;
      const light = Math.random() < 0.55;
      ctx.strokeStyle = light ? 'rgba(196,222,138,0.30)' : 'rgba(58,92,44,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() * 2 - 1) * 1.5, y - 2.5 - Math.random() * 4);
      ctx.stroke();
    }
  };
}

// Box-batch textures are near-white so instance colors keep the palette.
function paintStucco() {
  return (ctx, s) => {
    ctx.fillStyle = '#dcd8cd';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 320; i++) {
      const v = 200 + Math.random() * 45 | 0;
      ctx.fillStyle = `rgba(${v}, ${v - 3}, ${v - 10}, 0.25)`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 3 + Math.random() * 12, 2 + Math.random() * 9, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,110,95,0.14)'; // faint coursing lines
    ctx.lineWidth = 2;
    for (let y = 20; y < s; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * 4);
      ctx.lineTo(s, y + Math.random() * 4);
      ctx.stroke();
    }
    for (let i = 0; i < 14; i++) { // hairline cracks
      ctx.strokeStyle = 'rgba(105,95,80,0.18)';
      ctx.lineWidth = 1;
      let x = Math.random() * s;
      let y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 26;
        y += Math.random() * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  };
}

function paintStone() {
  return (ctx, s) => {
    ctx.fillStyle = '#d3cec1';
    ctx.fillRect(0, 0, s, s);
    const rows = 5;
    const bh = s / rows;
    for (let r = 0; r < rows; r++) { // running-bond blocks
      const off = (r % 2) * (s / 6);
      for (let x = -s / 3; x < s; x += s / 3) {
        const v = 195 + Math.random() * 40 | 0;
        ctx.fillStyle = `rgba(${v}, ${v - 4}, ${v - 14}, 0.55)`;
        ctx.fillRect(x + off + 2, r * bh + 2, s / 3 - 4, bh - 4);
      }
    }
    ctx.strokeStyle = 'rgba(110,100,85,0.35)'; // mortar
    ctx.lineWidth = 3;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * bh);
      ctx.lineTo(s, r * bh);
      ctx.stroke();
    }
    for (let i = 0; i < 260; i++) { // wear speckle
      const v = 170 + Math.random() * 60 | 0;
      ctx.fillStyle = `rgba(${v}, ${v}, ${v - 12}, 0.18)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2 + Math.random() * 3);
    }
    // moss/edge-wear tint around the tile border (reads as worn edges)
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.62);
    g.addColorStop(0, 'rgba(120,150,95,0)');
    g.addColorStop(1, 'rgba(110,145,88,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  };
}

function paintWood() {
  return (ctx, s) => {
    ctx.fillStyle = '#dcc9ab';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 3) { // vertical grain streaks
      const wob = Math.sin(x * 0.22) * 4;
      const v = 165 + Math.random() * 55 | 0;
      ctx.strokeStyle = `rgba(${v}, ${v - 28}, ${v - 62}, ${0.14 + Math.random() * 0.14})`;
      ctx.lineWidth = 1 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x + wob, 0);
      ctx.bezierCurveTo(x + wob + 4, s * 0.33, x + wob - 4, s * 0.66, x + wob, s);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(90,64,40,0.5)'; // plank seams
    ctx.lineWidth = 2;
    for (let x = 0; x <= s; x += s / 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) { // knots
      ctx.strokeStyle = 'rgba(96,66,40,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 3 + Math.random() * 4, 5 + Math.random() * 6, 0, 0, 7);
      ctx.stroke();
    }
  };
}

function paintMottle() {
  return (ctx, s) => {
    ctx.fillStyle = '#d9d9d2';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      const v = 190 + Math.random() * 55 | 0;
      ctx.fillStyle = `rgba(${v}, ${v}, ${v - 8}, 0.3)`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 4 + Math.random() * 13, 3 + Math.random() * 10, Math.random() * 3, 0, 7);
      ctx.fill();
    }
  };
}
