/* ============================================================================
   galerie.js — grouped grid plus a hand-rolled lightbox (keyboard + swipe).
   ========================================================================= */

import { mountChrome, mountWaves, loadJSON, esc, longDate, failBox, initReveal } from './core.js';

const $ = (s) => document.querySelector(s);

/** Flat list across all groups, so the lightbox can walk the whole gallery. */
let flat = [];
let at = -1;

/* --- rendering ----------------------------------------------------------- */

function tile(item, idx) {
  if (item.type === 'video') {
    return `
<figure class="tile tile--video reveal">
  <video controls preload="metadata" playsinline src="${esc(item.web)}"></video>
  ${item.caption ? `<figcaption class="tile__cap">${esc(item.caption)}</figcaption>` : ''}
</figure>`;
  }
  return `
<figure class="tile reveal">
  <button type="button" class="tile__btn" data-idx="${idx}"
          aria-label="${esc(item.caption || 'Bild')} — größer anzeigen">
    <img src="${esc(item.thumb ?? item.web)}" alt="${esc(item.caption || '')}"
         loading="lazy" decoding="async"${item.w ? ` width="${item.w}" height="${item.h}"` : ''}>
  </button>
  ${
    item.caption || item.credit
      ? `<figcaption class="tile__cap">${esc(item.caption)}${
          item.credit ? ` <span class="faint">· ${esc(item.credit)}</span>` : ''
        }</figcaption>`
      : ''
  }
</figure>`;
}

function groupBlock(g) {
  const count = g.items.length;
  const body = count
    ? `<div class="tilegrid mt-4">${g.items
        .map((it) => tile(it, flat.indexOf(it)))
        .join('')}</div>`
    : `<p class="small dim mt-3">Noch nichts hier.</p>`;

  return `
<section class="galgroup" id="g-${esc(g.id)}">
  <div class="galgroup__head">
    <div>
      <h2 class="h3">${esc(g.label)}</h2>
      ${g.date ? `<p class="xs faint">${esc(longDate(g.date))}</p>` : ''}
      ${g.note ? `<p class="small dim mt-2" style="max-width:60ch">${esc(g.note)}</p>` : ''}
    </div>
    <span class="tag${g.kind === 'reference' ? ' tag--ghost' : ''}">${count} ${
    count === 1 ? 'Bild' : 'Bilder'
  }</span>
  </div>
  ${body}
</section>`;
}

/* --- lightbox ------------------------------------------------------------ */

const lb = () => $('#lb');

function show(i) {
  if (!flat.length) return;
  at = (i + flat.length) % flat.length;
  const it = flat[at];
  $('#lb-stage').innerHTML = `<img src="${esc(it.web)}" alt="${esc(it.caption || '')}">`;
  const bits = [it.caption, it.credit && `${it.credit}${it.license ? `, ${it.license}` : ''}`]
    .filter(Boolean)
    .map(esc);
  $('#lb-cap').innerHTML =
    `${bits.join(' · ') || ''}<span class="lb__count">${at + 1} / ${flat.length}</span>`;
  lb().hidden = false;
  document.body.style.overflow = 'hidden';
  $('#lb-close').focus();
}

function hide() {
  lb().hidden = true;
  document.body.style.overflow = '';
  if (at >= 0) document.querySelector(`.tile__btn[data-idx="${at}"]`)?.focus();
}

function wireLightbox() {
  $('#lb-close').addEventListener('click', hide);
  $('#lb-prev').addEventListener('click', () => show(at - 1));
  $('#lb-next').addEventListener('click', () => show(at + 1));
  /* Dismiss on the backdrop only. Testing "outside the figure" instead would
     also catch the nav arrows and close the lightbox on every next/prev. */
  lb().addEventListener('click', (e) => {
    if (e.target === lb()) hide();
  });

  document.addEventListener('keydown', (e) => {
    if (lb().hidden) return;
    if (e.key === 'Escape') hide();
    else if (e.key === 'ArrowLeft') show(at - 1);
    else if (e.key === 'ArrowRight') show(at + 1);
  });

  /* swipe */
  let x0 = null;
  const stage = $('#lb-stage');
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  stage.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 45) show(at + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tile__btn');
    if (btn) show(+btn.dataset.idx);
  });
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let doc;
  try {
    doc = await loadJSON('photos.json');
  } catch (err) {
    failBox($('#groups'), err);
    return;
  }

  flat = doc.groups.flatMap((g) => g.items.filter((i) => i.type === 'photo'));

  const ours = doc.groups.filter((g) => g.kind !== 'reference');
  const oursCount = ours.reduce((n, g) => n + g.items.length, 0);
  const videos = flat.length
    ? doc.groups.flatMap((g) => g.items).filter((i) => i.type === 'video').length
    : 0;

  $('#head-facts').innerHTML = [
    ['Eigene Bilder', oursCount],
    ['Clips', videos],
    ['Gruppen', doc.groups.length],
  ]
    .map(([dt, dd]) => `<div class="page-head__fact"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
    .join('');

  $('#groups').innerHTML =
    (oursCount === 0
      ? `<div class="notice notice--soon" style="margin-bottom:var(--sp-7)">
           <div class="notice__title">Noch keine eigenen Bilder</div>
           <p>Nothing of ours in here yet — the trip has not happened. Below is the placeholder
              photography the site currently uses, so the page is not simply blank.</p>
         </div>`
      : '') + doc.groups.map(groupBlock).join('');

  wireLightbox();
  initReveal();
})();
