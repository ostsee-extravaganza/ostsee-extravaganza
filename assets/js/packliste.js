/* ============================================================================
   packliste.js — checkable list, ticks saved per device.
   ========================================================================= */

import { mountChrome, mountWaves, loadJSON, esc, failBox, initReveal } from './core.js';
import { stateStore } from './store.js';

const $ = (s) => document.querySelector(s);

const ticks = stateStore('packliste', {});
const WHO = {
  all: 'Alles',
  vedran: 'Vedran',
  karl: 'Karl',
  shared: 'Gemeinsam',
};

let doc;
let who = 'all';
let hideDone = false;

const visible = (it) => who === 'all' || it.who === who;

/* --- rendering ----------------------------------------------------------- */

function row(it) {
  const done = !!ticks.read()[it.id];
  if (hideDone && done) return '';
  return `
<li class="pack ${done ? 'is-done' : ''}${it.critical ? ' pack--critical' : ''}">
  <label class="pack__label">
    <input type="checkbox" class="pack__box" data-id="${esc(it.id)}"${done ? ' checked' : ''}>
    <span class="pack__text">
      <span class="pack__name">${esc(it.label)}</span>
      <span class="pack__tags">
        ${
          it.who !== 'shared'
            ? `<span class="tag tag--ghost">${esc(WHO[it.who] ?? it.who)}</span>`
            : ''
        }
        ${it.critical ? '<span class="tag tag--accent">wichtig</span>' : ''}
      </span>
      ${it.note ? `<span class="pack__note">${esc(it.note)}</span>` : ''}
    </span>
  </label>
</li>`;
}

function groupBlock(g) {
  const items = g.items.filter(visible);
  const rows = items.map(row).join('');
  if (!items.length) return '';
  const state = ticks.read();
  const done = items.filter((i) => state[i.id]).length;

  return `
<section class="packgroup reveal">
  <div class="packgroup__head">
    <div>
      <h2 class="h3">${esc(g.label)}</h2>
      ${g.note ? `<p class="small dim mt-2" style="max-width:64ch">${esc(g.note)}</p>` : ''}
    </div>
    <span class="tag${done === items.length ? ' tag--foam' : ''}">${done} / ${items.length}</span>
  </div>
  ${rows ? `<ul class="packlist mt-4">${rows}</ul>` : '<p class="small faint mt-3">Alles erledigt.</p>'}
</section>`;
}

function renderProgress() {
  const all = doc.groups.flatMap((g) => g.items).filter(visible);
  const state = ticks.read();
  const done = all.filter((i) => state[i.id]).length;
  const crit = all.filter((i) => i.critical);
  const critOpen = crit.filter((i) => !state[i.id]);
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;

  $('#progress').innerHTML = `
<div class="progress__bar" role="img"
     aria-label="${done} von ${all.length} Punkten erledigt, ${pct} Prozent">
  <span class="progress__fill" style="width:${pct}%"></span>
</div>
<div class="progress__meta">
  <span><strong class="num">${done}</strong> von <strong class="num">${all.length}</strong> erledigt</span>
  ${
    critOpen.length
      ? `<span class="progress__warn">Noch ${critOpen.length} wichtige offen: ${critOpen
          .slice(0, 3)
          .map((i) => esc(i.label))
          .join(', ')}${critOpen.length > 3 ? ' …' : ''}</span>`
      : `<span class="progress__ok">Alles Wichtige abgehakt.</span>`
  }
</div>`;
}

function renderFacts() {
  const state = ticks.read();
  const all = doc.groups.flatMap((g) => g.items);
  $('#head-facts').innerHTML = [
    ['Punkte', all.length],
    ['Erledigt', all.filter((i) => state[i.id]).length],
    ['Wichtig offen', all.filter((i) => i.critical && !state[i.id]).length],
  ]
    .map(([dt, dd]) => `<div class="page-head__fact"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
    .join('');
}

/** Just the "3 / 8" chip on each group — no DOM replacement. */
function renderGroupCounts() {
  const state = ticks.read();
  doc.groups.forEach((g, n) => {
    const items = g.items.filter(visible);
    if (!items.length) return;
    const chip = document.querySelectorAll('.packgroup')[
      doc.groups.slice(0, n).filter((x) => x.items.filter(visible).length).length
    ]?.querySelector('.packgroup__head .tag');
    if (!chip) return;
    const done = items.filter((i) => state[i.id]).length;
    chip.textContent = `${done} / ${items.length}`;
    chip.classList.toggle('tag--foam', done === items.length);
  });
}

/** Cheap update after a tick: nothing is replaced, so focus and scroll survive. */
function refreshCounters() {
  renderProgress();
  renderGroupCounts();
  renderFacts();
}

function render() {
  $('#groups').innerHTML = doc.groups.map(groupBlock).join('') ||
    '<p class="small dim">Nichts in dieser Auswahl.</p>';
  renderProgress();
  renderFacts();

  document.querySelectorAll('#who-tabs .chip').forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.who === who))
  );
  initReveal();
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  try {
    doc = await loadJSON('packliste.json');
  } catch (err) {
    failBox($('#groups'), err);
    return;
  }

  $('#lede').textContent = doc.weatherBasis;

  $('#who-tabs').innerHTML = Object.entries(WHO)
    .map(
      ([k, label]) => `<button class="chip" type="button" data-who="${esc(k)}"
        aria-pressed="${k === who}">${esc(label)}</button>`
    )
    .join('');

  render();

  $('#who-tabs').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    who = c.dataset.who;
    render();
  });

  $('#groups').addEventListener('change', (e) => {
    const box = e.target.closest('.pack__box');
    if (!box) return;
    const state = ticks.read();
    if (box.checked) state[box.dataset.id] = true;
    else delete state[box.dataset.id];
    ticks.write(state);
    /* Only a full rebuild when hiding done items actually removes the row.
       Otherwise touch the row and the counters, so ticking through a long list
       does not keep yanking the page out from under you. */
    if (hideDone) {
      render();
    } else {
      box.closest('.pack').classList.toggle('is-done', box.checked);
      refreshCounters();
    }
  });

  $('#btn-hide-done').addEventListener('click', (e) => {
    hideDone = !hideDone;
    e.currentTarget.setAttribute('aria-pressed', String(hideDone));
    e.currentTarget.textContent = hideDone ? 'Erledigte zeigen' : 'Erledigte ausblenden';
    render();
  });

  $('#btn-reset').addEventListener('click', () => {
    const n = Object.keys(ticks.read()).length;
    if (!n) return;
    if (!confirm(`${n} Haken entfernen?`)) return;
    ticks.clear();
    render();
  });
})();
