/* ============================================================================
   core.js — shared chrome, data loading and formatting.
   ES module, no dependencies, no build step.
   ========================================================================= */

export const PAGES = [
  { href: 'index.html', label: 'Start' },
  { href: 'plan.html', label: 'Der Plan' },
  { href: 'karte.html', label: 'Karte' },
  { href: 'spots.html', label: 'Spots' },
  { href: 'galerie.html', label: 'Galerie' },
  { href: 'logbuch.html', label: 'Logbuch' },
  { href: 'wetter.html', label: 'Wetter' },
  { href: 'packliste.html', label: 'Packliste' },
  { href: 'kilometer.html', label: 'Kilometer' },
  { href: 'superlative.html', label: 'Superlative' },
];

/* --- data ---------------------------------------------------------------- */

const _cache = new Map();

/** Load and cache a JSON file from /data. */
export async function loadJSON(name) {
  const path = name.includes('/') ? name : `data/${name}`;
  if (_cache.has(path)) return _cache.get(path);
  const p = fetch(path, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    return r.json();
  });
  _cache.set(path, p);
  return p;
}

/** Load several at once: loadAll('trip.json','stays.json') */
export function loadAll(...names) {
  return Promise.all(names.map(loadJSON));
}

/* --- formatting ---------------------------------------------------------- */

const DE = 'de-DE';

export const eur = (n, opts = {}) =>
  new Intl.NumberFormat(DE, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(n ?? 0);

/** 2026-08-31 → "31. Aug" */
export const dayMon = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(DE, { day: 'numeric', month: 'short' });

/** 2026-08-31 → "Mo, 31. August 2026" */
export const longDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(DE, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/** 2026-08-31 → "31.08." */
export const shortDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(DE, { day: '2-digit', month: '2-digit' });

export const dateRange = (a, b) => `${dayMon(a)} – ${dayMon(b)}`;

export const km = (n) => `${new Intl.NumberFormat(DE).format(Math.round(n))} km`;

/** Whole days from now until an ISO datetime. Negative once past. */
export function daysUntil(iso) {
  const then = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Math.ceil((then - new Date()) / 86400000);
}

export const plural = (n, one, many) => `${n} ${Math.abs(n) === 1 ? one : many}`;

/** Escape for safe insertion into HTML. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/* --- svg fragments ------------------------------------------------------ */

/**
 * Scalloped wave divider, generated so the scallops span the full viewBox exactly.
 * Fill comes from the parent via currentColor; direction is flipped in CSS per band.
 */
export const waveSVG = () => {
  const W = 1200;
  const N = 8; // scallops across the full width
  const SEG = W / N;
  const BASE = 11; // flat land above the scallops
  const AMP = 13; // how deep each scallop dips
  let d = `M0 0H${W}V${BASE}`;
  for (let i = N; i > 0; i--) {
    const x0 = i * SEG;
    const x1 = (i - 1) * SEG;
    d += `Q${(x0 + x1) / 2} ${BASE + AMP} ${x1} ${BASE}`;
  }
  d += 'V0Z';
  return `<svg class="wave" viewBox="0 0 ${W} ${BASE + AMP}" preserveAspectRatio="none"
     aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
};

/** Fill every .wave-band on the page. Direction is a CSS concern. */
export function mountWaves(root = document) {
  const svg = waveSVG();
  root.querySelectorAll('.wave-band').forEach((el) => {
    el.innerHTML = svg;
  });
}

/** Lighthouse mark used as the site logo. */
const LIGHTHOUSE = `
<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 13h8l1.5 14h-11z"/>
    <path d="M13 8h6l1 5h-8z"/>
    <path d="M16 3v3"/>
    <path d="M11.5 20h9"/>
    <path d="M4 30c3-2 5-2 8 0 3-2 5-2 8 0 3-2 5-2 8 0" opacity=".75"/>
  </g>
</svg>`;

/* --- chrome -------------------------------------------------------------- */

function headerHTML(current) {
  const items = PAGES.map((p) => {
    const active = p.href === current;
    return `<li><a class="nav__link" href="${p.href}"${
      active ? ' aria-current="page"' : ''
    }>${esc(p.label)}</a></li>`;
  }).join('');

  return `
<a class="skip-link" href="#main">Zum Inhalt springen</a>
<header class="site-header">
  <div class="wrap site-header__bar">
    <a class="brand" href="index.html">
      ${LIGHTHOUSE}
      <span class="brand__text">Ostsee<br>Extravaganza<small>31.08. – 08.09.2026</small></span>
    </a>
    <nav class="nav" id="nav" aria-label="Hauptnavigation"><ul class="nav__list">${items}</ul></nav>
    <button class="theme-toggle" id="theme-toggle" type="button"
            aria-label="Farbschema wechseln" title="Farbschema wechseln">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>
    </button>
    <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M2 4h12M2 8h12M2 12h12"/></svg>
      Menü
    </button>
  </div>
</header>`;
}

function footerHTML(credits) {
  const links = PAGES.map((p) => `<li><a href="${p.href}">${esc(p.label)}</a></li>`).join('');
  const creditItems = (credits?.images ?? [])
    .filter((c, i, a) => a.findIndex((x) => x.commonsFile === c.commonsFile) === i)
    .map(
      (c) =>
        `<li>${esc(c.caption)} — ${esc(c.author)}, <a href="${esc(c.source)}" rel="noopener">${esc(
          c.license
        )}</a></li>`
    )
    .join('');

  return `
<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div>
        <h4>Ostsee Extravaganza</h4>
        <p>Eight nights on the Baltic — Rostock, the Darß and all around Rügen.
           Two of us, one Golf, five beds and a Deutschland-Ticket.</p>
        <p class="mt-3"><a href="plan.html">Der Plan</a> · <a href="karte.html">Karte</a> ·
           <a href="spots.html">Spots</a></p>
      </div>
      <div>
        <h4>Seiten</h4>
        <ul class="site-footer__links">${links}</ul>
      </div>
      <div>
        <h4>Bildnachweis</h4>
        <ul class="credit-list">${creditItems || '<li>—</li>'}</ul>
        <p class="xs mt-3">Placeholder photography from Wikimedia Commons, each image under its
           own licence. Being replaced with our own as we go.</p>
      </div>
    </div>
    <div class="site-footer__bottom">
      <span>Built for one trip, by two people who over-plan.</span>
      <span>No cookies, no trackers, no analytics.</span>
    </div>
  </div>
</footer>`;
}

/* --- behaviour ----------------------------------------------------------- */

function initTheme() {
  const KEY = 'ose:theme';
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const now = document.documentElement.dataset.theme || (systemDark ? 'dark' : 'light');
    const next = now === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY, next);
  });
}

function initNav() {
  const btn = document.getElementById('nav-toggle');
  const nav = document.getElementById('nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.dataset.open === 'true';
    nav.dataset.open = String(!open);
    btn.setAttribute('aria-expanded', String(!open));
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

/** Fade elements marked .reveal into view. */
export function initReveal(root = document) {
  const els = root.querySelectorAll('.reveal:not(.is-in)');
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  els.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
    io.observe(el);
  });
}

/* --- countdown ----------------------------------------------------------- */

export function initCountdown(el, startISO) {
  if (!el) return;
  const target = new Date(`${startISO}T09:22:00`);
  const cell = (n, lab) =>
    `<div class="countdown__cell"><span class="countdown__num">${n}</span><span class="countdown__lab">${lab}</span></div>`;

  const tick = () => {
    let ms = target - new Date();
    if (ms <= 0) {
      el.innerHTML = cell('0', 'Los!');
      return;
    }
    const d = Math.floor(ms / 86400000);
    ms -= d * 86400000;
    const h = Math.floor(ms / 3600000);
    ms -= h * 3600000;
    const m = Math.floor(ms / 60000);
    el.innerHTML =
      cell(d, d === 1 ? 'Tag' : 'Tage') + cell(String(h).padStart(2, '0'), 'Std') +
      cell(String(m).padStart(2, '0'), 'Min');
  };
  tick();
  setInterval(tick, 30000);
}

/* --- boot ---------------------------------------------------------------- */

/**
 * Inject header and footer, wire up nav/theme/reveal.
 * Call once per page, first thing.
 */
export async function mountChrome() {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.body.insertAdjacentHTML('afterbegin', headerHTML(current));
  initTheme();
  initNav();

  let credits = null;
  try {
    credits = await loadJSON('credits.json');
  } catch {
    /* footer degrades to no credit list */
  }
  document.body.insertAdjacentHTML('beforeend', footerHTML(credits));
  initReveal();
  initOfflineBadge();
  initServiceWorker();
  return { credits };
}

/* --- offline ------------------------------------------------------------- */

/** Register the service worker. Silently does nothing on file:// or older browsers. */
function initServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const go = () =>
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker not registered:', err.message);
    });
  /* mountChrome awaits, so `load` has usually already fired by the time we get
     here — hanging this on the event alone means it never runs. */
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

/** A quiet bar when the network drops — Rügen has real holes in it. */
function initOfflineBadge() {
  const bar = document.createElement('div');
  bar.className = 'offline-bar';
  bar.setAttribute('role', 'status');
  bar.hidden = true;
  bar.innerHTML =
    '<span class="offline-bar__dot" aria-hidden="true"></span>' +
    'Offline — gespeicherte Seiten und Karten funktionieren weiter, Wetter nicht.';
  document.body.append(bar);

  const sync = () => {
    bar.hidden = navigator.onLine;
  };
  addEventListener('online', sync);
  addEventListener('offline', sync);
  sync();
}

/** Show a friendly error in place of a section that failed to load. */
export function failBox(el, err) {
  if (!el) return;
  console.error(err);
  el.innerHTML = `<div class="notice notice--warn">
    <div class="notice__title">Daten nicht geladen</div>
    <p>Something went wrong reading the trip data. If you are opening this file directly from
       disk, run a local server instead — browsers block <code>fetch</code> on
       <code>file://</code>.</p>
    <p class="xs faint">${esc(err?.message ?? err)}</p></div>`;
}
