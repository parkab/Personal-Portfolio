// Shared hand-drawn "paper note" overlays (styling lives in paper.css).
//
// PaperCard is the reusable piece: a scrim + a notebook-paper card with an
// optional drawn X in the corner. The Controls reference and the Welcome
// card are both built from it, so the look only has to be maintained once.
//
// Cards mount INSIDE the game stage, so they cover the bezel view and the
// fullscreen view identically without any extra work.

const openCards = new Set();

/** True while any paper card is showing — main.js gates game input on this. */
export function anyCardOpen() {
  return openCards.size > 0;
}

export class PaperCard {
  /**
   * @param {HTMLElement} host   element the card mounts into (the card layer)
   * @param {object} opts
   *   title        heading text
   *   variant      'letter' (red margin rule) | 'wide' (two-column) | ''
   *   closeButton  show the drawn X (default true)
   *   onClose      called after the card closes, however it was dismissed
   */
  constructor(host, { title, variant = '', closeButton = true, onClose = null } = {}) {
    this.onClose = onClose;

    this.scrim = document.createElement('div');
    this.scrim.className = 'paper-scrim';

    this.card = document.createElement('div');
    this.card.className = 'paper-card';
    if (variant) this.card.classList.add(`paper-card--${variant}`);
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-label', title);
    this.card.tabIndex = -1;

    for (const side of ['l', 'r']) {
      const tape = document.createElement('span');
      tape.className = `paper-tape paper-tape--${side}`;
      this.card.append(tape);
    }

    if (closeButton) {
      this.closeBtn = document.createElement('button');
      this.closeBtn.type = 'button';
      this.closeBtn.className = 'paper-close';
      this.closeBtn.textContent = '✕';
      this.closeBtn.setAttribute('aria-label', 'Close');
      this.closeBtn.addEventListener('click', () => this.close());
      this.card.append(this.closeBtn);
    }

    const h2 = document.createElement('h2');
    h2.textContent = title;
    const rule = document.createElement('div');
    rule.className = 'paper-rule';
    this.card.append(h2, rule);

    // Only the body scrolls, so the heading, the X and the action button
    // stay put on a card taller than the frame.
    this.body = document.createElement('div');
    this.body.className = 'paper-body';
    this.card.append(this.body);

    this.actions = document.createElement('div');
    this.actions.className = 'paper-actions';
    this.card.append(this.actions);

    // Click the paper itself, not the scrim behind it, to keep reading.
    this.scrim.addEventListener('pointerdown', (e) => {
      if (e.target === this.scrim && closeButton) this.close();
    });

    this.scrim.append(this.card);
    host.append(this.scrim);
  }

  /** Adds a hand-drawn action button along the bottom of the card. */
  addAction(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'paper-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    this.actions.append(btn);
    return btn;
  }

  get isOpen() {
    return this.scrim.classList.contains('open');
  }

  open() {
    if (this.isOpen) return;
    this.scrim.classList.add('open');
    openCards.add(this);
    this.card.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.scrim.classList.remove('open');
    openCards.delete(this);
    if (this.onClose) this.onClose();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}

// Escape closes the topmost dismissible card.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || openCards.size === 0) return;
  const last = [...openCards].pop();
  if (last.closeBtn) last.close();
});

// ── Content ───────────────────────────────────────────────────
// Mirrors the bindings in controls.js. If a binding changes there,
// change it here too — these two lists are the whole control surface.

const DESKTOP = [
  ['← → ↑ ↓', 'Move'],
  ['C', 'Jump, or read a berry when you are next to one'],
  ['X', 'Dash: 8 directions, aimed by the arrows'],
  ['C + X', 'Up-dash (hold C, press X). No arrow held = straight up'],
  ['Z + X', 'Down-dash. No arrow held = straight down'],
  ['R', 'Respawn at the last checkpoint you lit'],
];

const TOUCH = [
  ['Stick', 'Move'],
  ['Jump / Read', 'Jump, or read a berry when you are next to one'],
  ['Swipe', 'Dash toward the swipe, snapped to 8 directions'],
  ['Jump + swipe', 'Up-dash'],
  ['▼ + swipe', 'Down-dash'],
  ['Jump / ▼ + tap', 'Straight up / straight down dash'],
  ['↺', 'Respawn at the last checkpoint you lit'],
];

function keyList(rows) {
  const ul = document.createElement('ul');
  ul.className = 'paper-list';
  for (const [key, what] of rows) {
    const li = document.createElement('li');
    const k = document.createElement('span');
    k.className = 'paper-key';
    k.textContent = key;
    const w = document.createElement('span');
    w.className = 'what';
    w.textContent = what;
    li.append(k, w);
    ul.append(li);
  }
  return ul;
}

function column(heading, rows) {
  const col = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = heading;
  col.append(h3, keyList(rows));
  return col;
}

/** Controls reference — opened by the Controls button, closed by the X. */
export function buildControlsCard(host) {
  const card = new PaperCard(host, { title: 'Controls', variant: 'wide' });

  const cols = document.createElement('div');
  cols.className = 'paper-cols';
  cols.append(column('Keyboard', DESKTOP), column('Touch', TOUCH));
  card.body.append(cols);

  const note = document.createElement('p');
  note.className = 'paper-note';
  note.textContent =
    'Your dash comes back the moment you touch the ground. Jumping during a ' +
    'down-diagonal dash makes you wavedash, gaining lots of horizontal momentum. ' +
    'Dashing during a horizontal dash makes you superdash, less speed but more height.';
  card.body.append(note);

  return card;
}

/** Welcome card — shown on every visit; Start hands control to the game. */
export function buildWelcomeCard(host, onStart) {
  const card = new PaperCard(host, {
    title: 'Welcome!',
    variant: 'letter',
    closeButton: false,
  });

  // The owner adopted this paragraph as final copy (the conspicuous
  // placeholder marker that used to sit above it has been removed at their
  // request). Edit it here — the card is sized for roughly this length.
  const p = document.createElement('p');
  p.textContent = 'Fun fact about me: I love precision platformers, and my favorite one is Celeste. From beating the main game to becoming invested in community-made mods like Strawberry Jam, I fell in love with repeatedly failing, learning more through each attempt, and the sense of success when finally beating a level that might have taken hours. This feeling of determination and perseverance has carried into many other aspects of my life, and with over 1000 hours in-game, Celeste holds a special place in my heart. This game uses Celeste\'s movement mechanics and models my resume, where every strawberry shows a meaningful work experience of mine. There are also 5 special moonberries off the main path that each hold pictures of my cats Kai and Fanta if you reach them. Have fun!';

  card.body.append(p);
  card.addAction('Start', () => {
    card.close();
    if (onStart) onStart();
  });

  return card;
}
