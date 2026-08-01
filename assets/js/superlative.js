/* ============================================================================
   superlative.js — post-trip awards and closing numbers.
   Numbers come from whatever the other pages have actually recorded, so the
   page is honest about how much of the trip has been logged.
   ========================================================================= */

import { mountChrome, mountWaves, loadAll, esc, km, failBox, initReveal, daysUntil } from './core.js';
import { stateStore, readLocal } from './store.js';

const $ = (s) => document.querySelector(s);
const answers = stateStore('superlative', {});

let doc;

/* --- numbers ------------------------------------------------------------- */

function stats(trip, itin, photos, posts, spots) {
  const fuel = stateStore('fuel', []).read();
  const odo = stateStore('odo', { start: null, end: null }).read();
  const ticks = stateStore('packliste', {}).read();

  const driven =
    odo.start && odo.end && odo.end > odo.start
      ? odo.end - odo.start
      : null;
  const plannedKm = itin.days.reduce((n, d) => n + (d.driveKm ?? 0), 0);
  const ownPhotos = photos.groups
    .filter((g) => g.kind !== 'reference')
    .reduce((n, g) => n + g.items.length, 0);
  const realPosts = posts.posts.filter((p) => !p.placeholder).length;
  const ourSpots = readLocal().length;
  const litres = fuel.reduce((n, f) => n + (f.litres || 0), 0);

  return [
    { val: trip.days, lab: 'Tage', note: `${trip.nights} Nächte, ${trip.stats.stays} Betten` },
    {
      val: driven ? km(driven) : `~${km(plannedKm)}`,
      lab: driven ? 'Gefahren' : 'Geplant',
      note: driven
        ? `geplant waren ~${km(plannedKm)}`
        : 'Kilometerstand steht noch aus',
    },
    { val: ownPhotos, lab: 'Eigene Bilder', note: ownPhotos ? 'in der Galerie' : 'noch keine' },
    {
      val: litres ? `${litres.toFixed(1).replace('.', ',')} l` : '—',
      lab: 'Getankt',
      note: fuel.length ? `${fuel.length} Stopp(s)` : 'noch nichts erfasst',
    },
    { val: realPosts, lab: 'Logbuch', note: realPosts ? 'echte Einträge' : 'nur Platzhalter' },
    { val: ourSpots + (spots.spots?.length ?? 0), lab: 'Spots', note: `${ourSpots} davon von uns` },
    { val: Object.keys(ticks).length, lab: 'Abgehakt', note: 'auf der Packliste' },
    {
      val: Object.values(answers.read()).filter((v) => String(v || '').trim()).length,
      lab: 'Preise vergeben',
      note: `von ${doc.awards.length + doc.prompts.length}`,
    },
  ];
}

/* --- rendering ----------------------------------------------------------- */

function awardCard(a) {
  const v = answers.read()[a.id] ?? '';
  return `
<div class="award reveal${v ? ' is-filled' : ''}">
  <span class="award__icon" aria-hidden="true">${esc(a.icon)}</span>
  <h3 class="award__title">${esc(a.title)}</h3>
  <label class="visually-hidden" for="a-${esc(a.id)}">${esc(a.title)}</label>
  <input class="field award__input" id="a-${esc(a.id)}" data-award="${esc(a.id)}"
         type="text" value="${esc(v)}" placeholder="Gewinner eintragen …">
  <p class="award__hint">${esc(a.hint)}</p>
</div>`;
}

function promptBlock(p) {
  const v = answers.read()[p.id] ?? '';
  return `
<div class="card reveal">
  <div class="card__body">
    <label class="field__label" for="p-${esc(p.id)}">${esc(p.q)}</label>
    <textarea class="field" id="p-${esc(p.id)}" data-award="${esc(p.id)}" rows="3"
              placeholder="…">${esc(v)}</textarea>
  </div>
</div>`;
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let trip, itin, photos, posts, spots;
  try {
    [doc, trip, itin, photos, posts, spots] = await loadAll(
      'superlative.json', 'trip.json', 'itinerary.json', 'photos.json', 'posts.json', 'spots.json'
    );
  } catch (err) {
    failBox($('#awards'), err);
    return;
  }

  const left = daysUntil(doc.opensAfter);
  if (left > 0) {
    $('#zahlen').insertAdjacentHTML(
      'afterbegin',
      `<div class="wrap"><div class="notice notice--soon" style="margin-bottom:var(--sp-6)">
         <div class="notice__title">Noch ${left} ${left === 1 ? 'Tag' : 'Tage'} zu früh</div>
         <p>Die Reise hat noch nicht stattgefunden. Die Zahlen unten füllen sich von selbst,
            sobald Kilometerzähler, Galerie und Logbuch etwas zu sagen haben — eintragen kann man
            trotzdem schon, wenn jemand sehr sicher ist.</p>
       </div></div>`
    );
  }

  const render = () => {
    const s = stats(trip, itin, photos, posts, spots);
    $('#stats').innerHTML = s
      .slice(0, 4)
      .concat(s.slice(4))
      .map(
        (x) => `<div class="stat reveal">
          <span class="stat__val">${x.val}</span>
          <span class="stat__lab">${esc(x.lab)}</span>
          <span class="stat__note">${esc(x.note)}</span>
        </div>`
      )
      .join('');
    $('#head-facts').innerHTML = s
      .slice(0, 4)
      .map(
        (x) => `<div class="page-head__fact"><dt>${esc(x.lab)}</dt><dd>${x.val}</dd></div>`
      )
      .join('');
  };

  $('#awards').innerHTML = doc.awards.map(awardCard).join('');
  $('#prompts').innerHTML = doc.prompts.map(promptBlock).join('');
  $('#stats-note').textContent = doc.note;
  render();
  initReveal();

  /* save on input, without rebuilding the field you are typing into */
  document.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-award]');
    if (!el) return;
    const state = answers.read();
    const v = el.value.trim();
    if (v) state[el.dataset.award] = v;
    else delete state[el.dataset.award];
    answers.write(state);
    el.closest('.award')?.classList.toggle('is-filled', !!v);
    render();
  });

  document.addEventListener('click', (ev) => {
    if (ev.target.id === 'btn-export') {
      const json = JSON.stringify(answers.read(), null, 2);
      navigator.clipboard?.writeText(json).then(
        () => {
          ev.target.textContent = 'kopiert ✓';
          setTimeout(() => (ev.target.textContent = 'JSON kopieren'), 2200);
        },
        () => {
          const w = window.open('', '_blank');
          w.document.write(`<pre>${esc(json)}</pre>`);
        }
      );
    }
    if (ev.target.id === 'btn-clear') {
      if (!Object.keys(answers.read()).length) return;
      if (!confirm('Alle Antworten löschen?')) return;
      answers.clear();
      $('#awards').innerHTML = doc.awards.map(awardCard).join('');
      $('#prompts').innerHTML = doc.prompts.map(promptBlock).join('');
      render();
      initReveal();
    }
  });
})();
