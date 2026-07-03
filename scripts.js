document.addEventListener('DOMContentLoaded', () => {

  /* ── Navbar scroll ───────────────────────────────── */
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const tick = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  /* ── Active nav link ─────────────────────────────── */
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === page ||
      (page === 'index.html' && href === './'));
  });

  /* ── Reveal on scroll ────────────────────────────── */
  const revealIO = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); revealIO.unobserve(e.target); }
    }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach(el => revealIO.observe(el));

  /* ── Shared keyboard step functions ─────────────── */
  let stepXP   = null; // set below if on experience page
  let stepProj = null; // set below if on projects page

  function scrollToVisualCenter(el) {
    const navH = document.querySelector('.navbar')?.offsetHeight || 64;
    const rect = el.getBoundingClientRect();
    const elCenter = window.scrollY + rect.top + rect.height / 2;
    const target = elCenter - (navH + (window.innerHeight - navH) / 2);
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  /* ── Tab chevrons ────────────────────────────────── */
  const CHEVRON_SVG = `<svg class="tab-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  document.querySelectorAll('.xp-header').forEach(h => h.insertAdjacentHTML('beforeend', CHEVRON_SVG));
  document.querySelectorAll('.proj-collapsed').forEach(h => h.insertAdjacentHTML('beforeend', CHEVRON_SVG));

  /* ── Experience: controlled navigation ──────────── */
  const xpEntries = Array.from(document.querySelectorAll('.xp-entry'));
  if (xpEntries.length) {
    let cur = 0;
    const prevBtn = document.getElementById('xp-prev');
    const nextBtn = document.getElementById('xp-next');
    const counter = document.getElementById('xp-counter');
    const total   = xpEntries.length;

    function refreshXP() {
      if (counter) counter.textContent = `${cur + 1} / ${total}`;
      prevBtn?.classList.toggle('disabled', cur === 0);
      nextBtn?.classList.toggle('disabled', cur === total - 1);
    }

    function goXP(idx, scroll) {
      if (idx < 0 || idx >= total) return;
      // Toggle: clicking the active entry collapses it
      if (idx === cur && xpEntries[cur].classList.contains('active')) {
        xpEntries[cur].classList.remove('active');
        return;
      }
      const hadActive = xpEntries.some(x => x.classList.contains('active'));
      xpEntries.forEach(x => x.classList.remove('active'));
      cur = idx;
      refreshXP();
      if (hadActive) {
        // Let the collapse animation begin before expanding the new one
        requestAnimationFrame(() => {
          xpEntries[cur].classList.add('active');
          if (scroll !== false) {
            setTimeout(() => scrollToVisualCenter(xpEntries[cur]), 500);
          }
        });
      } else {
        xpEntries[cur].classList.add('active');
      }
    }

    stepXP = delta => goXP(cur + delta);

    /* Initial state — all closed */
    refreshXP();

    /* Click any header to jump to it (or toggle closed) */
    xpEntries.forEach((el, i) => {
      el.querySelector('.xp-header').addEventListener('click', () => goXP(i));
    });

    prevBtn?.addEventListener('click', () => goXP(cur - 1));
    nextBtn?.addEventListener('click', () => goXP(cur + 1));

    /* Hash deep-link from home page */
    if (location.hash) {
      const target = xpEntries.find(el => '#' + el.id === location.hash);
      if (target) setTimeout(() => goXP(xpEntries.indexOf(target)), 150);
    }
  }

  /* ── Projects: controlled navigation ────────────── */
  const projItems = Array.from(document.querySelectorAll('.proj-item'));
  if (projItems.length) {
    let cur = 0;
    const prevBtn = document.getElementById('proj-prev');
    const nextBtn = document.getElementById('proj-next');
    const counter = document.getElementById('proj-counter');
    const total   = projItems.length;

    function refreshProj() {
      if (counter) counter.textContent = `${cur + 1} / ${total}`;
      prevBtn?.classList.toggle('disabled', cur === 0);
      nextBtn?.classList.toggle('disabled', cur === total - 1);
    }

    function goProj(idx, scroll) {
      if (idx < 0 || idx >= total) return;
      // Toggle: clicking the active item collapses it
      if (idx === cur && projItems[cur].classList.contains('active')) {
        projItems[cur].classList.remove('active');
        return;
      }
      const hadActive = projItems.some(p => p.classList.contains('active'));
      projItems.forEach(p => p.classList.remove('active'));
      cur = idx;
      refreshProj();
      if (hadActive) {
        requestAnimationFrame(() => {
          projItems[cur].classList.add('active');
          initSlideshow(projItems[cur]);
          if (scroll !== false) {
            setTimeout(() => scrollToVisualCenter(projItems[cur]), 560);
          }
        });
      } else {
        projItems[cur].classList.add('active');
        initSlideshow(projItems[cur]);
      }
    }

    stepProj = delta => goProj(cur + delta);

    /* Initial state — all closed */
    refreshProj();

    /* Click collapsed header to jump (or toggle closed); ignore link clicks */
    projItems.forEach((el, i) => {
      el.querySelector('.proj-collapsed').addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        goProj(i);
      });
    });

    prevBtn?.addEventListener('click', () => goProj(cur - 1));
    nextBtn?.addEventListener('click', () => goProj(cur + 1));

    /* Hash deep-link from home page */
    if (location.hash) {
      const target = projItems.find(el => '#' + el.id === location.hash);
      if (target) setTimeout(() => goProj(projItems.indexOf(target)), 150);
    }
  }

  /* ── Keyboard navigation (↑↓ / W S) ─────────────── */
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const down = e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
    const up   = e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W';
    if (!down && !up) return;
    e.preventDefault();
    const delta = down ? 1 : -1;
    stepXP?.(delta);
    stepProj?.(delta);
  });

  /* ── Slideshow ───────────────────────────────────── */
  const slidesetUp = new WeakSet();

  function initSlideshow(container) {
    const ss = container.querySelector('.proj-slideshow');
    if (!ss || slidesetUp.has(ss)) return;
    slidesetUp.add(ss);

    const slides   = Array.from(ss.querySelectorAll('.proj-slide'));
    if (slides.length <= 1) return;

    const dotsWrap = ss.querySelector('.ss-controls');
    const btnPrev  = ss.querySelector('.ss-nav-btn.prev');
    const btnNext  = ss.querySelector('.ss-nav-btn.next');
    let cur = 0, timer;

    if (dotsWrap) {
      slides.forEach((_, i) => {
        const d = document.createElement('span');
        d.className = 'ss-dot' + (i === 0 ? ' active' : '');
        d.addEventListener('click', () => go(i));
        dotsWrap.appendChild(d);
      });
    }

    function go(idx) {
      slides[cur].classList.remove('active');
      dotsWrap?.children[cur]?.classList.remove('active');
      cur = (idx + slides.length) % slides.length;
      slides[cur].classList.add('active');
      dotsWrap?.children[cur]?.classList.add('active');
      clearInterval(timer);
      timer = setInterval(() => go(cur + 1), 4500);
    }

    btnPrev?.addEventListener('click', () => go(cur - 1));
    btnNext?.addEventListener('click', () => go(cur + 1));
    slides[0].classList.add('active');
    timer = setInterval(() => go(cur + 1), 4500);
  }

  document.querySelectorAll('.proj-slideshow').forEach(ss => {
    initSlideshow(ss.closest('.proj-item') || ss);
  });

});
