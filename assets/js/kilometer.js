/* ============================================================================
   kilometer.js — odometer + fuel log. Real consumption, and how the estimate held.

   Consumption maths assume every stop is a fill to full: the litres of a given
   fill covered the distance since the previous one. The first fill is measured
   from the pick-up odometer if we have it, and skipped otherwise — the tank was
   not necessarily full when we got the car.
   ========================================================================= */

import { mountChrome, mountWaves, loadAll, eur, esc, km, failBox, initReveal } from './core.js';
import { stateStore } from './store.js';

const $ = (s) => document.querySelector(s);

const odoStore = stateStore('odo', { start: null, end: null });
const fuelStore = stateStore('fuel', []);

/* de-DE decimal comma in, number out */
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const de = (n, d = 1) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

let plannedKm = 0;
let plannedDays = [];

/* --- derived ------------------------------------------------------------- */

/** Fill-ups sorted by odometer, each with the leg distance and l/100 km. */
function legs() {
  const odo = odoStore.read();
  const fills = [...fuelStore.read()].sort((a, b) => a.odo - b.odo);
  let prev = num(odo.start);
  return fills.map((f) => {
    const dist = prev !== null && f.odo > prev ? f.odo - prev : null;
    const per100 = dist && f.litres ? (f.litres / dist) * 100 : null;
    const cost = f.litres && f.ppl ? f.litres * f.ppl : null;
    prev = f.odo;
    return { ...f, dist, per100, cost };
  });
}

function totals() {
  const odo = odoStore.read();
  const start = num(odo.start);
  const end = num(odo.end);
  const ls = legs();

  const measured = ls.filter((l) => l.dist && l.per100);
  const distMeasured = measured.reduce((n, l) => n + l.dist, 0);
  const litresMeasured = measured.reduce((n, l) => n + l.litres, 0);

  const litresAll = ls.reduce((n, l) => n + (l.litres || 0), 0);
  const costAll = ls.reduce((n, l) => n + (l.cost || 0), 0);

  const totalKm = start !== null && end !== null && end > start ? end - start : distMeasured || null;

  return {
    start, end, totalKm,
    litresAll, costAll,
    per100: distMeasured ? (litresMeasured / distMeasured) * 100 : null,
    perKm: totalKm && costAll ? costAll / totalKm : null,
    stops: ls.length,
  };
}

/* --- rendering ----------------------------------------------------------- */

const tile = (val, lab, note) => `<div class="stat">
  <span class="stat__val">${val}</span>
  <span class="stat__lab">${esc(lab)}</span>
  ${note ? `<span class="stat__note">${esc(note)}</span>` : ''}
</div>`;

function table(head, rows, foot) {
  return `<table class="data">
    <thead><tr>${head
      .map((h) => `<th${h.r ? ' class="right"' : ''}>${esc(h.t ?? h)}</th>`)
      .join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
}

function render() {
  const t = totals();
  const ls = legs();
  const odo = odoStore.read();

  $('#odo-start').value = odo.start ?? '';
  $('#odo-end').value = odo.end ?? '';

  /* head + odometer stats */
  $('#head-facts').innerHTML = [
    ['Gefahren', t.totalKm ? km(t.totalKm) : '—'],
    ['Verbrauch', t.per100 ? `${de(t.per100)} l` : '—'],
    ['Getankt', t.litresAll ? `${de(t.litresAll)} l` : '—'],
    ['Stopps', t.stops],
  ]
    .map(([dt, dd]) => `<div class="page-head__fact"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
    .join('');

  $('#odo-stats').innerHTML = [
    tile(t.totalKm ? km(t.totalKm) : '—', 'Gesamtstrecke',
      t.totalKm ? `geplant waren ~${km(plannedKm)}` : 'Kilometerstand eintragen'),
    tile(t.per100 ? `${de(t.per100)}<small> l/100</small>` : '—', 'Verbrauch',
      t.per100 ? `über ${t.stops - (ls[0]?.dist ? 0 : 1)} gemessene Etappe(n)` : 'braucht zwei Tankstopps'),
    tile(t.costAll ? eur(t.costAll) : '—', 'Sprit gesamt',
      t.litresAll ? `${de(t.litresAll)} l in ${t.stops} Stopp(s)` : 'noch nichts getankt'),
    tile(t.perKm ? `${de(t.perKm * 100, 1)}<small> ct/km</small>` : '—', 'Kosten je km',
      t.perKm ? 'nur Sprit, ohne Miete' : ''),
  ].join('');

  /* fill-ups */
  if (!ls.length) {
    $('#fuel-table').innerHTML =
      `<p class="small dim" style="padding:var(--sp-5)">Noch kein Tankstopp erfasst.</p>`;
    $('#consumption').innerHTML = '';
  } else {
    const rows = ls.map(
      (l) => `<tr>
        <td>${esc(l.date ?? '—')}${l.where ? `<br><span class="xs faint">${esc(l.where)}</span>` : ''}</td>
        <td class="right num">${new Intl.NumberFormat('de-DE').format(l.odo)}</td>
        <td class="right num">${l.dist ? km(l.dist) : '<span class="faint">—</span>'}</td>
        <td class="right num">${de(l.litres)} l</td>
        <td class="right num">${l.ppl ? `${de(l.ppl, 3)} €` : '—'}</td>
        <td class="right num">${l.cost ? eur(l.cost) : '—'}</td>
        <td class="right num">${
          l.per100 ? `<strong>${de(l.per100)}</strong>` : '<span class="faint">—</span>'
        }</td>
        <td class="right"><button type="button" class="spotcard__del" data-del="${esc(
          l.id
        )}">löschen</button></td>
      </tr>`
    );
    $('#fuel-table').innerHTML = table(
      ['Datum', { t: 'km-Stand', r: true }, { t: 'Etappe', r: true }, { t: 'Liter', r: true },
       { t: '€/l', r: true }, { t: 'Summe', r: true }, { t: 'l/100 km', r: true }, ''],
      rows,
      `<tr><td colspan="3">Gesamt</td>
        <td class="right num">${de(t.litresAll)} l</td><td></td>
        <td class="right num">${t.costAll ? eur(t.costAll) : '—'}</td>
        <td class="right num">${t.per100 ? de(t.per100) : '—'}</td><td></td></tr>`
    );

    /* one series, one hue — no categorical palette needed, and every bar is labelled */
    const measured = ls.filter((l) => l.per100);
    const worst = Math.max(...measured.map((l) => l.per100), 0);
    $('#consumption').innerHTML = measured.length
      ? `<h3 class="h4">Verbrauch je Etappe</h3>
         <ul class="hbars mt-4">${measured
           .map(
             (l) => `<li class="hbar">
               <span class="hbar__lab">${esc(l.where || l.date || '—')}</span>
               <span class="hbar__track">
                 <span class="hbar__fill" style="width:${(l.per100 / worst) * 100}%"></span>
               </span>
               <span class="hbar__val num">${de(l.per100)} l</span>
             </li>`
           )
           .join('')}</ul>
         <p class="xs faint mt-3">Je Etappe, gerechnet als Liter dieser Füllung auf die Kilometer
            seit der letzten. Setzt voraus, dass jedes Mal volltankt wurde.</p>`
      : `<p class="small dim">Verbrauch braucht mindestens zwei Volltankungen — oder einen
         eingetragenen Übernahme-Kilometerstand plus eine.</p>`;
  }

  /* plan vs reality */
  const t2 = totals();
  $('#planned').innerHTML = table(
    ['', { t: 'Geplant', r: true }, { t: 'Tatsächlich', r: true }, { t: 'Differenz', r: true }],
    [
      `<tr><td>Fahrstrecke</td>
        <td class="right num">~${km(plannedKm)}</td>
        <td class="right num">${t2.totalKm ? km(t2.totalKm) : '—'}</td>
        <td class="right num">${
          t2.totalKm
            ? `${t2.totalKm - plannedKm > 0 ? '+' : ''}${km(t2.totalKm - plannedKm)}`
            : '—'
        }</td></tr>`,
      ...plannedDays.map(
        (d) => `<tr><td class="xs">Tag ${d.day} · ${esc(d.base)}</td>
          <td class="right num xs">${d.driveKm ? km(d.driveKm) : '—'}</td>
          <td class="right xs faint">—</td><td class="right xs faint">—</td></tr>`
      ),
    ],
    null
  );
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let itin;
  try {
    [itin] = await loadAll('itinerary.json');
  } catch (err) {
    failBox($('#fuel-table'), err);
    return;
  }
  plannedDays = itin.days.filter((d) => d.car);
  plannedKm = plannedDays.reduce((n, d) => n + (d.driveKm ?? 0), 0);

  render();

  /* odometer */
  $('#odo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const start = num($('#odo-start').value);
    const end = num($('#odo-end').value);
    const fb = $('#odo-feedback');
    if (start !== null && end !== null && end < start) {
      fb.textContent = 'Rückgabe kann nicht kleiner sein als Übernahme.';
      return;
    }
    odoStore.write({ start, end });
    fb.textContent = 'Gespeichert.';
    setTimeout(() => (fb.textContent = ''), 2200);
    render();
  });

  /* fill-ups */
  $('#fuel-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const odo = num($('#f-odo').value);
    const litres = num($('#f-litres').value);
    const ppl = num($('#f-ppl').value);
    const fb = $('#fuel-feedback');

    if (odo === null || litres === null) {
      fb.className = 'field__help field__help--warn';
      fb.textContent = 'km-Stand und Liter brauche ich mindestens.';
      return;
    }
    const list = fuelStore.read();
    if (list.some((f) => f.odo === odo)) {
      fb.className = 'field__help field__help--warn';
      fb.textContent = 'Diesen km-Stand gibt es schon.';
      return;
    }
    list.push({
      id: `f${odo}-${list.length}`,
      date: $('#f-date').value || null,
      odo, litres, ppl,
      where: $('#f-where').value.trim() || null,
    });
    fuelStore.write(list);

    fb.className = 'field__help field__help--ok';
    fb.textContent = `${de(litres)} l bei ${new Intl.NumberFormat('de-DE').format(odo)} km gespeichert.`;
    $('#f-odo').value = '';
    $('#f-litres').value = '';
    $('#f-where').value = '';
    render();
  });

  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      fuelStore.write(fuelStore.read().filter((f) => f.id !== del.dataset.del));
      render();
      return;
    }
    if (e.target.id === 'btn-clear') {
      if (!fuelStore.read().length) return;
      if (!confirm('Alle Tankstopps löschen?')) return;
      fuelStore.clear();
      render();
      return;
    }
    if (e.target.id === 'btn-export') {
      const json = JSON.stringify({ odometer: odoStore.read(), fills: fuelStore.read() }, null, 2);
      navigator.clipboard?.writeText(json).then(
        () => {
          e.target.textContent = 'kopiert ✓';
          setTimeout(() => (e.target.textContent = 'JSON kopieren'), 2200);
        },
        () => {
          const w = window.open('', '_blank');
          w.document.write(`<pre>${esc(json)}</pre>`);
        }
      );
    }
  });

  initReveal();
})();
