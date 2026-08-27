import * as THREE from 'three';

// DOM overlay for strawberries: a small teaser pill when in interact range,
// and the full floating panel (title / date / bullets / tags / link) once
// interacted. Both are anchored to the berry by projecting its world
// position to screen space each frame — movement stays live while reading.

const ACCENT = {
  experience: '#c98f2e',
  project: '#2fa08c',
  moon: '#7da7d9',
};
const CATEGORY_LABEL = {
  experience: 'Experience',
  project: 'Project',
  moon: 'Secret',
};

export class BerryUI {
  /** @param {HTMLElement} stage the game stage — panels project against its box, not the window's */
  constructor(stage) {
    this.stage = stage;
    const hud = document.getElementById('hud');
    this.teaserEl = document.createElement('div');
    this.teaserEl.className = 'berry-teaser';
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'berry-panel';
    hud.append(this.teaserEl, this.panelEl);
    this._teaserId = null;
    this._panelId = null;
    this._v = new THREE.Vector3();
  }

  _project(camera, anchor, yOffset) {
    this._v.set(anchor.x, anchor.y + yOffset, anchor.z).project(camera);
    if (this._v.z > 1) return null; // behind the camera
    return {
      x: (this._v.x * 0.5 + 0.5) * this.stage.clientWidth,
      y: (-this._v.y * 0.5 + 0.5) * this.stage.clientHeight,
    };
  }

  _fillTeaser(entry) {
    this.teaserEl.textContent = entry.title;
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = 'C';
    this.teaserEl.append(key);
  }

  _fillPanel(entry) {
    const el = this.panelEl;
    el.textContent = '';
    el.style.setProperty('--accent', ACCENT[entry.category]);

    const cat = document.createElement('div');
    cat.className = 'cat';
    cat.textContent = CATEGORY_LABEL[entry.category];
    el.append(cat);

    const h2 = document.createElement('h2');
    h2.textContent = entry.title;
    el.append(h2);

    // Moonberries show a photo (or a marked placeholder) instead of the
    // date/bullets/tags block — same panel, same open/dismiss behavior.
    if (entry.category === 'moon') {
      const photo = document.createElement('div');
      photo.className = 'moon-photo';
      const img = document.createElement('img');
      img.alt = 'Cat photo';
      img.src = entry.image;
      img.addEventListener('error', () => {
        photo.textContent = '';
        const ph = document.createElement('div');
        ph.className = 'photo-placeholder';
        const icon = document.createElement('div');
        icon.className = 'ph-icon';
        icon.textContent = '🐱';
        const label = document.createElement('div');
        label.textContent = 'Cat photo goes here';
        ph.append(icon, label);
        photo.append(ph);
      });
      photo.append(img);
      el.append(photo);
      return;
    }

    if (entry.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = entry.subtitle;
      el.append(sub);
    }

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = entry.date;
    el.append(date);

    const ul = document.createElement('ul');
    for (const b of entry.bullets) {
      const li = document.createElement('li');
      li.textContent = b;
      ul.append(li);
    }
    el.append(ul);

    if (entry.tags && entry.tags.length) {
      const tags = document.createElement('div');
      tags.className = 'tags';
      for (const t of entry.tags) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t;
        tags.append(tag);
      }
      el.append(tags);
    }

    if (entry.link) {
      const a = document.createElement('a');
      a.className = 'link';
      a.href = entry.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Live Demo ↗';
      el.append(a);
    }
  }

  // berry args are { entry, group } from the berry system, or null
  update(camera, teaserBerry, panelBerry) {
    if (teaserBerry) {
      if (this._teaserId !== teaserBerry.entry.id) {
        this._fillTeaser(teaserBerry.entry);
        this._teaserId = teaserBerry.entry.id;
      }
      const p = this._project(camera, teaserBerry.group.position, 1.1);
      if (p) {
        this.teaserEl.style.left = `${p.x}px`;
        this.teaserEl.style.top = `${p.y}px`;
        this.teaserEl.classList.add('visible');
      } else {
        this.teaserEl.classList.remove('visible');
      }
    } else {
      this.teaserEl.classList.remove('visible');
      this._teaserId = null;
    }

    if (panelBerry) {
      if (this._panelId !== panelBerry.entry.id) {
        this._fillPanel(panelBerry.entry);
        this._panelId = panelBerry.entry.id;
      }
      const p = this._project(camera, panelBerry.group.position, 1.4);
      if (p) {
        // Clamp inside the stage (the panel hangs above its anchor)
        const w = this.panelEl.offsetWidth;
        const h = this.panelEl.offsetHeight;
        const sw = this.stage.clientWidth;
        const sh = this.stage.clientHeight;
        const x = Math.min(Math.max(p.x, w / 2 + 10), sw - w / 2 - 10);
        const y = Math.min(Math.max(p.y, h + 10), sh - 10);
        this.panelEl.style.left = `${x}px`;
        this.panelEl.style.top = `${y}px`;
        this.panelEl.classList.add('visible');
      } else {
        this.panelEl.classList.remove('visible');
      }
    } else {
      this.panelEl.classList.remove('visible');
      this._panelId = null;
    }
  }
}
