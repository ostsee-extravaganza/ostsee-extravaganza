/* ============================================================================
   plan.js — Der Plan: day-by-day timeline, trains, car.
   ========================================================================= */

import {
  mountChrome, loadAll, mountWaves, km, esc, longDate, shortDate,
  initReveal, failBox, plural,
} from './core.js';

const $ = (s) => document.querySelector(s);

/* --- icons --------------------------------------------------------------- */

const ICON = {
  train: `<path d="M6 3h12v11a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V3Z"/><path d="M6 9h12"/><path d="m8 21 2-4M16 21l-2-4"/><circle cx="9.5" cy="13" r=".6" fill="currentColor"/><circle cx="14.5" cy="13" r=".6" fill="currentColor"/>`,
  car: `<path d="M4 16v-3l2-5h12l2 5v3"/><path d="M2 16h20v3H2z"/><circle cx="7" cy="19" r="1.7"/><circle cx="17" cy="19" r="1.7"/>`,
  checkin: `<path d="M14 3h5v18h-5"/><path d="M10 12H3"/><path d="m7 8 4 4-4 4"/>`,
  checkout: `<path d="M10 3H5v18h5"/><path d="M14 12h7"/><path d="m18 8 4 4-4 4"/>`,
};

const icon = (type) =>
  `<svg class="fixed-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
       ICON[type] ?? ICON.checkin
     }</svg>`;

/* --- day ----------------------------------------------------------------- */

function dayCard(d) {
  const fixed = (d.fixed ?? [])
    .map(
      (f) => `
<li class="fixed-item fixed-item--${esc(f.type)}">
  ${icon(f.type)}
  <div>
    <span class="fixed-item__time">${esc(f.time)}</span>
    <span class="fixed-item__label"> · ${esc(f.label)}</span>
    <div class="fixed-item__detail">${esc(f.detail)}</div>
  </div>
</li>`
    )
    .join('');

  const blocks = (d.blocks ?? [])
    .map(
      (b) => `<div class="block">
        <h4 class="block__label">${esc(b.label)}</h4>
        <p class="block__text">${esc(b.text)}</p>
      </div>`
    )
    .join('');

  const tips = (d.tips ?? [])
    .map((t) => `<div class="notice notice--info mt-4"><p>${esc(t)}</p></div>`)
    .join('');

  const meta = [
    `<span class="tag">${esc(d.base)}</span>`,
    d.car
      ? `<span class="tag tag--accent">${km(d.driveKm)}${
          d.driveTime ? ` · ${esc(d.driveTime)}` : ''
        }</span>`
      : `<span class="tag tag--foam">kein Auto</span>`,
  ].join('');

  return `
<article class="day${d.car ? '' : ' day--rest'} reveal" id="tag-${d.day}">
  <div class="day__rail">
    <div class="day__num"><small>Tag</small>${d.day}</div>
    <div class="day__date">${esc(shortDate(d.date))}
      <span class="day__weekday">${esc(d.weekday)}</span></div>
  </div>
  <div class="day__body">
    <h3 class="day__title">${esc(d.title)}</h3>
    <p class="day__sub">${esc(d.subtitle)}</p>
    <div class="day__meta">${meta}</div>
    ${fixed ? `<ul class="fixed-list">${fixed}</ul>` : ''}
    <div class="blocks">${blocks}</div>
    ${tips}
  </div>
</article>`;
}

/* --- trains -------------------------------------------------------------- */

function legRow(l) {
  if (l.transfer) {
    const mins = parseInt(l.transfer, 10);
    const tight = mins <= 8;
    return `<li class="leg leg--transfer${tight ? ' leg--tight' : ''}">
      <span class="leg__time">${esc(l.transfer)}</span>
      <span>Umstieg${l.note ? ` — ${esc(l.note)}` : ''}${
        tight ? ' — no slack at all' : ''
      }</span></li>`;
  }
  const isS = /^S\d/.test(l.line);
  return `
<li class="leg">
  <span class="leg__time">${esc(l.dep)}</span>
  <div>
    <span class="leg__line${isS ? ' leg__line--s' : ''}">${esc(l.line)}</span>
    <span class="leg__where">${esc(l.from)}</span>
    <div class="leg__detail">
      Gl. ${esc(l.fromPlatform ?? '?')} → ${esc(l.to)}, Gl. ${esc(l.toPlatform ?? '?')},
      an ${esc(l.arr)}${l.number ? ` · Zug ${esc(l.number)}` : ''}
    </div>
  </div>
</li>`;
}

function trainCard(o) {
  const dirLabel = o.direction === 'outbound' ? 'Hinfahrt' : 'Rückfahrt';
  return `
<div class="ticket reveal">
  <div class="cluster" style="justify-content:space-between">
    <span class="tag${o.recommended ? ' tag--mustard' : ''}">${esc(dirLabel)}${
    o.recommended ? ' · Vorschlag' : ''
  }</span>
    <span class="tag tag--ghost">${esc(longDate(o.date))}</span>
  </div>
  <h3 class="h3 mt-4">${esc(o.depart)} – ${esc(o.arrive)}</h3>
  <p class="small dim">${esc(o.duration)} · ${plural(o.changes, 'Umstieg', 'Umstiege')}</p>
  <ul class="legs mt-4">${o.legs.map(legRow).join('')}</ul>
</div>`;
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let trip, stays, transport, itin;
  try {
    [trip, stays, transport, itin] = await loadAll(
      'trip.json', 'stays.json', 'transport.json', 'itinerary.json'
    );
  } catch (err) {
    failBox($('#timeline'), err);
    return;
  }

  const car = transport.car;
  const totalKm = itin.days.reduce((n, d) => n + (d.driveKm ?? 0), 0);

  /* head facts */
  $('#head-facts').innerHTML = [
    ['Tage', trip.days],
    ['Nächte', trip.nights],
    ['Betten', trip.stats.stays],
    ['Fahrstrecke', `~${km(totalKm)}`],
    ['Feste Termine', 'nur Betten + Auto'],
  ]
    .map(([dt, dd]) => `<div class="page-head__fact"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
    .join('');

  /* days */
  $('#timeline').innerHTML = itin.days.map(dayCard).join('');

  /* trains */
  $('#ticket-note').textContent = transport.trains.ticketNote;
  $('#train-options').innerHTML = transport.trains.options.map(trainCard).join('');

  /* car */
  const h = car.branchHours;
  $('#car-facts').innerHTML = `
<div class="ticket ticket--alt reveal">
  <span class="tag tag--accent">${esc(car.supplier)}</span>
  <h3 class="h3 mt-4">${esc(car.vehicle)}</h3>
  <p class="small dim">${esc(car.gearbox)} · ${car.seats} Sitze · ${esc(car.doors)} Türen</p>
  <div class="table-scroll mt-5">
    <table class="data">
      <tbody>
        <tr><th>Abholung</th><td>Di, 1. Sep, 11:00 · ${esc(car.branch)}</td></tr>
        <tr><th>Rückgabe</th><td>Di, 8. Sep, 11:00 · ${esc(car.branch)}</td></tr>
        <tr><th>Filiale</th><td>${esc(car.branchAddress)}<br><span class="xs faint">Tel. ${esc(
    car.branchPhone
  )}</span></td></tr>
        <tr><th>Öffnungszeiten</th><td>Mo–Fr ${esc(h.monFri)} · Sa ${esc(h.sat)} · So ${esc(
    h.sun
  )}<br><span class="xs faint">Checked ${esc(h.checked)} — ${esc(h.source)}</span></td></tr>
        <tr><th>Hauptfahrer</th><td>${esc(car.mainDriver)}</td></tr>
        <tr><th>Dauer</th><td>${car.days} Tage</td></tr>
        <tr><th>Kaution</th><td>${esc(car.deposit)} € Sicherheit<br><span class="xs faint">${esc(
    car.depositNote
  )}</span></td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="notice notice--soon reveal">
  <div class="notice__title">Rückgabe am Montag statt Dienstag</div>
  <p>The branch shuts at 18:00 on weekdays and the return train leaves Rostock at 11:06 — six
     minutes after the contractual 11:00 drop-off, at a different location. Handing the car back
     on Monday evening after checking in solves both, and means no hotel garage to find either.</p>
</div>`;

  $('#car-checklist').innerHTML = car.checklist
    .map(
      (c) => `<li><span class="checklist__box" aria-hidden="true"></span>
        <span><strong>${esc(c.item)}</strong>
        <span class="checklist__why">${esc(c.why)}</span></span></li>`
    )
    .join('');

  $('#car-warnings').innerHTML = car.warnings
    .map((w) => `<div class="notice notice--warn reveal"><p>${esc(w)}</p></div>`)
    .join('');

  initReveal();

  /* jump to a hash target once everything is rendered */
  if (location.hash) {
    const t = document.querySelector(location.hash);
    if (t) t.scrollIntoView({ block: 'start' });
  }
})();
