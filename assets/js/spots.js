/* ============================================================================
   spots.js — paste a link, get a card. Local scratch layer over data/spots.json.
   ========================================================================= */

import { mountChrome, mountWaves, loadJSON, esc, initReveal, failBox } from './core.js';
import {
  allSpots, addSpot, removeSpot, readLocal, exportJSON, parseLink, nearBaltic,
} from './store.js';

const $ = (s) => document.querySelector(s);

const REPO = 'https://github.com/ostsee-extravaganza/ostsee-extravaganza';
let catHex = {};
let catLabel = {};
let hidden = new Set();
let doc;

/* --- cards --------------------------------------------------------------- */

function card(s) {
  const gmaps = s.coords
    ? `https://www.openstreetmap.org/?mlat=${s.coords[0]}&mlon=${s.coords[1]}#map=15/${s.coords[0]}/${s.coords[1]}`
    : null;

  return `
<article class="spotcard reveal" data-cat="${esc(s.category)}">
  <span class="spotcard__bar" style="--pin:${catHex[s.category] ?? '#7a8f99'}"></span>
  <div class="spotcard__body">
    <div class="cluster" style="gap:var(--sp-2)">
      <span class="tag" style="border-color:${catHex[s.category] ?? '#7a8f99'}">${esc(
    catLabel[s.category] ?? s.category
  )}</span>
      ${s.source === 'local' ? '<span class="tag tag--ghost">lokal</span>' : ''}
      ${!s.coords ? '<span class="tag tag--ghost">ohne Koordinaten</span>' : ''}
    </div>
    <h3 class="h4 mt-3">${esc(s.name)}</h3>
    ${s.note ? `<p class="small dim mt-2">${esc(s.note)}</p>` : ''}
    <div class="spotcard__foot">
      ${gmaps ? `<a href="${esc(gmaps)}" rel="noopener">Karte ↗</a>` : ''}
      ${s.url ? `<a href="${esc(s.url)}" rel="noopener">Link ↗</a>` : ''}
      ${
        s.source === 'local'
          ? `<button type="button" class="spotcard__del" data-del="${esc(s.id)}">Löschen</button>`
          : ''
      }
    </div>
  </div>
</article>`;
}

function render() {
  const spots = allSpots(doc);
  const local = spots.filter((s) => s.source === 'local');
  const seeded = spots.filter((s) => s.source !== 'local' && !hidden.has(s.category));

  $('#ours-count').textContent = local.length
    ? `${local.length} ${local.length === 1 ? 'Spot' : 'Spots'} gesammelt`
    : 'Noch nichts gesammelt';

  $('#ours').innerHTML = local.length
    ? local.map(card).join('')
    : `<p class="small dim">Paste a link above and it appears here. Dropping a pin on the
       <a href="karte.html">Karte</a> works too.</p>`;

  $('#seeded').innerHTML = seeded.map(card).join('');
  initReveal();
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  try {
    doc = await loadJSON('spots.json');
  } catch (err) {
    failBox($('#ours'), err);
    return;
  }

  catHex = Object.fromEntries(doc.categories.map((c) => [c.id, c.hex]));
  catLabel = Object.fromEntries(doc.categories.map((c) => [c.id, c.label]));

  $('#seed-note').textContent = doc.note;

  $('#f-cat').innerHTML = doc.categories
    .map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`)
    .join('');

  $('#filters').innerHTML = doc.categories
    .map(
      (c) => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="true">
        <span class="chip__dot" style="--pin:${c.hex}"></span>${esc(c.label)}</button>`
    )
    .join('');

  $('#btn-issue').href = `${REPO}/issues/new?labels=spot&template=spot.yml`;

  render();

  /* --- paste a link: fill in what we can work out ---------------------- */
  const onUrl = () => {
    const raw = $('#f-url').value.trim();
    const fb = $('#url-feedback');
    if (!raw) {
      fb.textContent = 'Coordinates get pulled out of the link automatically where they are in there.';
      fb.className = 'field__help';
      return;
    }
    const { coords, name } = parseLink(raw);
    if (coords) {
      $('#f-lat').value = coords[0].toFixed(5);
      $('#f-lon').value = coords[1].toFixed(5);
      if (nearBaltic(coords)) {
        fb.textContent = `Koordinaten gefunden: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
        fb.className = 'field__help field__help--ok';
      } else {
        fb.textContent = `Koordinaten gefunden (${coords[0].toFixed(3)}, ${coords[1].toFixed(
          3
        )}) — die liegen aber nicht an der Ostsee. Stimmt der Link?`;
        fb.className = 'field__help field__help--warn';
      }
    } else {
      fb.textContent =
        'Keine Koordinaten im Link. Kein Problem — Name und Notiz reichen, oder trag lat/lon unten ein.';
      fb.className = 'field__help field__help--warn';
    }
    if (name && !$('#f-name').value.trim()) $('#f-name').value = name;
  };
  $('#f-url').addEventListener('input', onUrl);
  $('#f-url').addEventListener('paste', () => setTimeout(onUrl, 0));

  /* --- save ------------------------------------------------------------ */
  $('#addform').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#f-name').value.trim();
    if (!name) {
      $('#f-name').focus();
      return;
    }
    const lat = parseFloat($('#f-lat').value);
    const lon = parseFloat($('#f-lon').value);
    const coords = Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;

    addSpot({
      name,
      category: $('#f-cat').value,
      note: $('#f-note').value,
      url: $('#f-url').value.trim(),
      coords,
    });

    $('#addform').reset();
    onUrl();
    render();
    const fb = $('#save-feedback');
    fb.textContent = `„${name}" gespeichert`;
    setTimeout(() => (fb.textContent = ''), 2600);
    $('#unsere').scrollIntoView({ block: 'start' });
  });

  /* --- delete / export / filter ---------------------------------------- */
  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      removeSpot(del.dataset.del);
      render();
      return;
    }

    if (e.target.id === 'btn-export') {
      const n = readLocal().length;
      if (!n) {
        e.target.textContent = 'nichts da';
        setTimeout(() => (e.target.textContent = 'JSON kopieren'), 1800);
        return;
      }
      const json = exportJSON();
      navigator.clipboard?.writeText(json).then(
        () => {
          e.target.textContent = `${n} kopiert ✓`;
          setTimeout(() => (e.target.textContent = 'JSON kopieren'), 2400);
        },
        () => {
          const w = window.open('', '_blank');
          w.document.write(`<pre>${esc(json)}</pre>`);
        }
      );
      return;
    }

    const chip = e.target.closest('.chip');
    if (chip) {
      const on = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!on));
      if (on) hidden.add(chip.dataset.cat);
      else hidden.delete(chip.dataset.cat);
      render();
    }
  });
})();
