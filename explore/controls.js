// Desktop keyboard + mobile touch input. Both schemes are always active;
// the touch UI reveals itself on the first touch contact.
//
// Keyboard:
//   Arrows — move (raw screen axes; main.js rotates by camera yaw => camera-relative)
//   C      — jump, or interact when in range of a strawberry (main.js decides);
//            held while pressing X => dash angles upward
//   X      — dash (8-directional from current arrow input)
//   Z      — held while pressing X => dash angles downward (no other function)
//   R      — respawn at the active checkpoint (touch: ↺ button)
//
// Touch:
//   Virtual joystick (bottom-right)    — move, analog, same screen axes as arrows
//   Jump/Read button (bottom-left)     — C's dual role (jump / interact)
//   ▼ button (beside Jump)             — Z's role (down-dash modifier)
//   ↺ button (above ▼)                 — R's role (respawn at the checkpoint)
//   Swipe on the world (anywhere else) — dash toward the swipe, snapped to the
//     nearest of 8 directions. Screen-vertical swipes mean forward/back (the
//     same camera-relative axes as the arrows), so world-vertical dashes use
//     the SAME modifiers as desktop: hold Jump while swiping => up-dash,
//     hold ▼ while swiping => down-dash. No vertical gesture inference.
//   Straight up/down (neutral vertical dash): hold Jump (or ▼) and TAP the
//     world instead of swiping — a directionless dash, which the player
//     resolves to pure vertical, mirroring desktop C+X / Z+X with no arrows.
//   Joystick/buttons and swipes live on separate elements (and pointerIds),
//   so a joystick adjustment can never fire a spurious dash.

const KEY_MAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyC: 'c',
  KeyX: 'x',
  KeyZ: 'z',
  KeyR: 'r',
};

// The touch cluster scales with the frame (CSS custom properties on
// #touch-ui), so knob travel and the swipe threshold are derived from the
// live element sizes rather than fixed pixels — otherwise a dash would need
// a much bigger fraction of the screen in the small inlaid view than in
// fullscreen.
const JOY_TRAVEL = 0.375;  // knob travel as a fraction of the pad's width
const JOY_DEADZONE = 0.18; // fraction of radius before input registers
const SWIPE_FRACTION = 0.075; // swipe distance as a fraction of stage width
const SWIPE_MIN_PX = 18;   // …clamped to this floor
const SWIPE_MAX_PX = 34;   // …and this ceiling
const SWIPE_MAX_MS = 450;  // must cross the threshold within this window

export class Controls {
  constructor() {
    this.held = { left: false, right: false, up: false, down: false, c: false, x: false, z: false, r: false };
    this.cPressed = false;
    this.xPressed = false;
    this.rPressed = false;
    this.joyX = 0;
    this.joyZ = 0;
    this._swipe = null;      // {x, z} for one frame after a swipe-dash
    this._tapDash = false;   // one-frame directionless dash (modifier + tap)
    this._interactMode = null;

    window.addEventListener('keydown', (e) => {
      const key = KEY_MAP[e.code];
      if (!key) return;
      e.preventDefault();
      if (e.repeat) return;
      this.held[key] = true;
      if (key === 'c') this.cPressed = true;
      if (key === 'x') this.xPressed = true;
      if (key === 'r') this.rPressed = true;
    });

    window.addEventListener('keyup', (e) => {
      const key = KEY_MAP[e.code];
      if (!key) return;
      this.held[key] = false;
    });

    // Don't leave keys stuck if the tab loses focus mid-press
    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.held)) this.held[k] = false;
    });

    this._initTouch();
  }

  _initTouch() {
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    const btnJump = document.getElementById('btn-jump');
    const btnDown = document.getElementById('btn-down');
    const btnRespawn = document.getElementById('btn-respawn');
    const canvas = document.getElementById('game');
    if (!joy || !knob || !btnJump || !btnDown || !canvas) return;
    this._btnJump = btnJump;

    // Reveal the touch UI on first actual touch (supports hybrid devices
    // without cluttering pure-desktop screens). ?touch forces it on for
    // desktop debugging/QA of the mobile layout.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') document.body.classList.add('touch-active');
    });
    if (new URLSearchParams(location.search).has('touch')) {
      document.body.classList.add('touch-active');
    }

    // ── Joystick ──
    let joyPointer = null;
    let joyCenter = { x: 0, y: 0 };
    let joyRadius = 44; // recomputed from the pad on each touch-down
    const applyJoy = (e) => {
      const dx = e.clientX - joyCenter.x;
      const dy = e.clientY - joyCenter.y;
      const len = Math.hypot(dx, dy);
      const clampMul = len > joyRadius ? joyRadius / len : 1;
      const kx = dx * clampMul;
      const ky = dy * clampMul;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      let nx = kx / joyRadius;
      let ny = ky / joyRadius;
      if (Math.hypot(nx, ny) < JOY_DEADZONE) { nx = 0; ny = 0; }
      this.joyX = nx;
      this.joyZ = ny; // screen-down = +Z (toward camera), same as the down arrow
    };
    joy.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      joyPointer = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      joyRadius = Math.max(20, r.width * JOY_TRAVEL);
      applyJoy(e);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyPointer) applyJoy(e);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== joyPointer) return;
      joyPointer = null;
      this.joyX = 0;
      this.joyZ = 0;
      knob.style.transform = 'translate(0, 0)';
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    // ── Buttons: Jump/Read = C, ▼ = Z (down-dash modifier) ──
    const bindButton = (el, key) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('pressed');
        this.held[key] = true;
        if (key === 'c') this.cPressed = true;
        if (key === 'r') this.rPressed = true;
      });
      const release = () => {
        el.classList.remove('pressed');
        this.held[key] = false;
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    };
    bindButton(btnJump, 'c');
    bindButton(btnDown, 'z');
    if (btnRespawn) bindButton(btnRespawn, 'r');

    // ── Swipe-dash on the world canvas ──
    // The dash fires the moment the swipe crosses the distance threshold
    // (not on release) so it feels immediate. One dash per gesture.
    let swipeStart = null; // {id, x0, y0, t0, done}
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault();
      swipeStart = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), done: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      const s = swipeStart;
      if (!s || e.pointerId !== s.id || s.done) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      const threshold = Math.min(SWIPE_MAX_PX,
        Math.max(SWIPE_MIN_PX, canvas.clientWidth * SWIPE_FRACTION));
      if (Math.hypot(dx, dy) < threshold) return;
      s.done = true;
      if (performance.now() - s.t0 > SWIPE_MAX_MS) return; // slow drag, not a swipe
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      this._swipe = { x: Math.round(Math.cos(ang)), z: Math.round(Math.sin(ang)) };
    });
    canvas.addEventListener('pointerup', (e) => {
      const s = swipeStart;
      if (!s || e.pointerId !== s.id) return;
      // Modifier + quick tap (never crossed the swipe threshold) => a
      // directionless dash: pure straight-up (Jump held) or straight-down
      // (▼ held). An unmodified tap does nothing, so stray taps are inert.
      if (!s.done && performance.now() - s.t0 < 250 && (this.held.c || this.held.z)) {
        this._tapDash = true;
      }
      swipeStart = null;
    });
    canvas.addEventListener('pointercancel', (e) => {
      if (swipeStart && e.pointerId === swipeStart.id) swipeStart = null;
    });
  }

  // Keeps the Jump button's label in sync with C's contextual role
  setInteractMode(inRange) {
    if (!this._btnJump || this._interactMode === inRange) return;
    this._interactMode = inRange;
    this._btnJump.textContent = inRange ? 'Read' : 'Jump';
  }

  // -1..1 on each axis, in screen space: up = -Z before camera-yaw rotation.
  // Keyboard and joystick combine; joystick is analog.
  get moveX() {
    const kb = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    return Math.max(-1, Math.min(1, kb + this.joyX));
  }

  get moveZ() {
    const kb = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
    return Math.max(-1, Math.min(1, kb + this.joyZ));
  }

  // {x, z} snapped to 8 directions, present for one frame after a swipe
  get swipeDash() {
    return this._swipe;
  }

  // One-frame directionless dash from modifier + tap (touch only)
  get tapDash() {
    return this._tapDash;
  }

  endFrame() {
    this.cPressed = false;
    this.xPressed = false;
    this.rPressed = false;
    this._swipe = null;
    this._tapDash = false;
  }
}
