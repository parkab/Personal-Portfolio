import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Player, PHYSICS } from './player.js';
import { Controls } from './controls.js';
import { FollowCamera } from './camera.js';
import { buildWorld } from './world.js';
import { createBerrySystem } from './strawberries.js';
import { createCheckpointSystem } from './checkpoints.js';
import { createMoonberrySystem } from './moonberries.js';
import { BerryUI } from './ui.js';
import { anyCardOpen, buildControlsCard, buildWelcomeCard } from './cards.js';

// ── Renderer / scene / camera ─────────────────────────────────
// The game renders into #game-stage (the bezel's screen), NOT the window:
// the page keeps its navbar, background and wave footer around the frame,
// and "fullscreen" is just a CSS class that grows the stage. Every size
// below therefore reads the stage, and a ResizeObserver re-fits on change,
// so the toggle never touches game state.
const stage = document.getElementById('game-stage');
const canvas = document.getElementById('game');
const stageSize = () => [
  Math.max(1, stage.clientWidth),
  Math.max(1, stage.clientHeight),
];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
// near 0.05 rather than 0.1: halves how far geometry has to be from the
// lens before it clips, which is what the camera's pull-in trades against.
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 300);

// Post-processing: restrained bloom for sun/water glints (sunny park, not
// neon). SSAO deliberately omitted — its depth/normal pre-passes don't fit
// the mobile frame budget.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.85);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function fitToStage() {
  const [w, h] = stageSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false); // false: CSS already sizes the canvas
  composer.setSize(w, h);
}
fitToStage();
new ResizeObserver(fitToStage).observe(stage);
window.addEventListener('resize', fitToStage);

// ── Lighting: one shadow-casting sun + hemisphere fill ────────
const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
sun.position.set(70, 110, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -130;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 140;
sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 340;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.5;
sun.target.position.set(-10, 0, -80);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xfdf6e0, 0x7f9c68, 1.0));

// ── World (geometry, colliders, sky, fog, leaves) ─────────────
const world = buildWorld(scene);

// ── Player / controls / camera ────────────────────────────────
const player = new Player(world.spawn);
player.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(player.mesh);

const controls = new Controls();
const followCam = new FollowCamera(camera, world.meshes);
followCam.snapTo(player.position);

// ── Strawberries + info UI + checkpoints + Moonberries ────────
const berries = createBerrySystem(scene);
const checkpoints = createCheckpointSystem(scene);
const moonberries = createMoonberrySystem(scene);
const ui = new BerryUI(stage);
const _playerBox = new THREE.Box3();
const INTERACT_RADIUS = 2.4; // C becomes interact inside this
const DISMISS_RADIUS = 6.5;  // open panel auto-closes beyond this
let openBerry = null;

// Active-checkpoint spawn (player center), kept in sync every frame; the
// fall-catch inside player.update teleports here, same as R.
const respawnTarget = new THREE.Vector3();
const respawnFacing = new THREE.Vector3();
function syncRespawnTarget() {
  checkpoints.activeSpawn(respawnTarget);
  respawnTarget.y += player.half.y + 0.05;
  const facing = checkpoints.activeFacing(respawnFacing);
  player.respawnFacing = facing ? respawnFacing : null;
}
syncRespawnTarget();
player.respawnTarget = respawnTarget;

// Every respawn path (fall-catch, R / touch, spikes) goes through here, so
// the camera always lands behind the checkpoint's facing rather than keeping
// whatever angle the death left it at.
function snapCameraToRespawn() {
  followCam.snapBehind(player.position, player.respawnFacing);
}

// Dev/verification hook: lets the headless QA harness drive the real
// Player class against the real colliders and reposition the camera.
window.__explore = { player, world, followCam, checkpoints, Player, PHYSICS, THREE };

// ── Fullscreen toggle ─────────────────────────────────────────
// CSS-expand is the mechanism (works everywhere, including iOS Safari,
// which won't fullscreen a non-video element); the native Fullscreen API
// is requested on top of it where available so the browser chrome hides
// too. Neither path recreates anything — the stage just changes size, so
// position / checkpoints / collected state all survive the toggle.
const cabinet = document.getElementById('cabinet');
const fullBtn = document.getElementById('btn-fullscreen');
let expanded = false;

function nativeEnter(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) Promise.resolve(fn.call(el)).catch(() => {}); // denied is fine, CSS covers it
}
function nativeExit() {
  if (!(document.fullscreenElement || document.webkitFullscreenElement)) return;
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn) Promise.resolve(fn.call(document)).catch(() => {});
}

function setExpanded(on) {
  if (expanded === on) return;
  expanded = on;
  document.body.classList.toggle('explore-fullscreen', on);
  fullBtn.textContent = on ? '⤢' : '⛶';
  fullBtn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  fullBtn.title = on ? 'Exit fullscreen' : 'Fullscreen';
  if (on) nativeEnter(cabinet);
  else nativeExit();
  fitToStage();
}

fullBtn.addEventListener('click', () => setExpanded(!expanded));

// Leaving native fullscreen by Esc or a browser gesture must also drop the
// CSS expansion, or the page would stay covered with no way back.
for (const evt of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(evt, () => {
    const native = document.fullscreenElement || document.webkitFullscreenElement;
    if (!native && expanded) setExpanded(false);
  });
}
// Esc with no native fullscreen active (iOS, or a denied request)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && expanded && !anyCardOpen()) setExpanded(false);
});

// ── Paper cards: Controls reference + Welcome ─────────────────
// Both use the same hand-drawn component (cards.js / paper.css), and both
// mount inside the stage so they show identically inlaid or fullscreen.
const cardLayer = document.getElementById('card-layer');
const controlsCard = buildControlsCard(cardLayer);
document.getElementById('btn-controls')
  .addEventListener('click', () => controlsCard.toggle());
// Shown on every visit, per spec — no "seen it" persistence.
buildWelcomeCard(cardLayer).open();

// ── Loop ──────────────────────────────────────────────────────
const clock = new THREE.Clock();
const frameInput = { moveX: 0, moveZ: 0, jumpPressed: false, dashPressed: false, dashUpMod: false, dashDownMod: false };

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30); // clamp so tab-switches don't explode physics

  // While a paper card (Welcome / Controls) is up, the game keeps rendering
  // behind it but takes no input — keys and taps belong to the card.
  const cardUp = anyCardOpen();

  // Interact takes priority over jump on C while in range of a strawberry
  // OR a Moonberry (whichever is closer) — identical panel behavior.
  // Panel toggles on interact, and auto-dismisses when the player leaves.
  const nearBerry = berries.nearest(player.position, INTERACT_RADIUS);
  const nearMoon = moonberries.nearest(player.position, INTERACT_RADIUS);
  let near = nearBerry;
  if (nearMoon && (!near ||
      nearMoon.group.position.distanceTo(player.position) <
      near.group.position.distanceTo(player.position))) {
    near = nearMoon;
  }
  if (openBerry && openBerry.group.position.distanceTo(player.position) > DISMISS_RADIUS) {
    openBerry = null;
  }
  const interactInRange = near !== null;
  controls.setInteractMode(interactInRange); // keeps the touch Jump/Read label in sync
  if (controls.cPressed && interactInRange && !cardUp) {
    openBerry = openBerry === near ? null : near;
  }

  // Camera-relative movement: rotate input by the camera's current yaw so
  // up = away from camera. The camera's yaw is frozen during a dash, so a
  // dash's direction (chosen at dash start) can't shift mid-dash.
  // A touch swipe-dash supplies its own 8-way direction for this frame,
  // going through the same rotation as arrow/joystick input.
  const yaw = followCam.yaw;
  const swipe = cardUp ? null : controls.swipeDash;
  const mx = cardUp ? 0 : (swipe ? swipe.x : controls.moveX);
  const mz = cardUp ? 0 : (swipe ? swipe.z : controls.moveZ);
  const hasMoveInput = mx !== 0 || mz !== 0;
  // Screen-space forwardness (1 = up/forward, 0 = sideways, -1 = backward):
  // the camera skips its chase only for near-directly-backward input,
  // which breaks the small-circle feedback loop when walking backward.
  const inputLen = Math.hypot(mx, mz);
  const forwardness = inputLen > 0 ? -mz / inputLen : 0;
  frameInput.moveX = mx * Math.cos(yaw) + mz * Math.sin(yaw);
  frameInput.moveZ = -mx * Math.sin(yaw) + mz * Math.cos(yaw);
  frameInput.jumpPressed = controls.cPressed && !interactInRange && !cardUp;
  // tapDash (touch modifier + tap) adds a directionless dash press; with no
  // joystick input held the player resolves it to pure vertical.
  frameInput.dashPressed =
    !cardUp && (controls.xPressed || swipe !== null || controls.tapDash);
  frameInput.dashUpMod = !cardUp && controls.held.c;
  frameInput.dashDownMod = !cardUp && controls.held.z;

  player.update(dt, frameInput, world.colliders, world.waterVolumes);

  // Fall-catch fired inside player.update → it already teleported to the
  // active checkpoint; snap the camera and drop any open panel.
  if (player.justRespawned) {
    snapCameraToRespawn();
    openBerry = null;
  }

  // Checkpoint activation + player-initiated respawn (R / touch ↺)
  checkpoints.update(dt, player.position);
  syncRespawnTarget();
  if (controls.rPressed && !cardUp) {
    player.teleport(respawnTarget.x, respawnTarget.y, respawnTarget.z);
    snapCameraToRespawn();
    openBerry = null;
  }

  // Hazards: touching a spike cluster = instant respawn at the active
  // checkpoint (same destination as R and the fall-catch)
  _playerBox.min.set(
    player.position.x - player.half.x,
    player.position.y - player.half.y,
    player.position.z - player.half.z);
  _playerBox.max.set(
    player.position.x + player.half.x,
    player.position.y + player.half.y,
    player.position.z + player.half.z);
  for (const hz of world.hazards) {
    if (hz.intersectsBox(_playerBox)) {
      world.emitDust(player.position.x, player.position.y - player.half.y, player.position.z);
      player.teleport(respawnTarget.x, respawnTarget.y, respawnTarget.z);
      snapCameraToRespawn();
      openBerry = null;
      break;
    }
  }

  moonberries.update(dt);

  // Effects: wading splashes, landing dust, tech burst + momentum trail
  const feetY = player.position.y - player.half.y;
  if (player.inWater && player.onGround &&
      Math.hypot(player.velocity.x, player.velocity.z) > 2) {
    world.emitSplash(player.position.x, feetY, player.position.z);
  }
  if (player.justLanded && !player.inWater) {
    world.emitDust(player.position.x, feetY, player.position.z);
  }
  if (player.lastTechEvent) {
    world.emitTechBurst(player.position.x, feetY, player.position.z,
      player.velocity.x, player.velocity.z, player.lastTechEvent);
  }
  if (player.frictionSkipTimer > 0) {
    world.emitTechTrail(player.position.x, feetY, player.position.z, player.lastTech);
  }

  followCam.update(dt, player.position, player.facing, player.dashing, hasMoveInput, forwardness);
  world.update(dt, player.position);
  berries.update(dt);
  ui.update(camera, near && near !== openBerry ? near : null, openBerry);
  controls.endFrame();

  composer.render();
});
