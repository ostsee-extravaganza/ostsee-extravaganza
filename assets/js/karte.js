/* ============================================================================
   karte.js — Leaflet + OpenStreetMap. Stays, route, spots, and pin dropping.
   Leaflet is loaded as a classic script, so it arrives as the global `L`.
   ========================================================================= */

import {
  mountChrome, mountWaves, loadAll, esc, dateRange, plural, failBox, initReveal,
} from './core.js';
import { allSpots, addSpot, removeSpot, readLocal, exportJSON } from './store.js';

const $ = (s) => document.querySelector(s);

const CENTER = [54.35, 12.95];
const ISSUE_BASE =
  'https://github.com/ostsee-extravaganza/ostsee-extravaganza/issues/new?labels=spot&template=spot.yml';

let map;
let catHex = {};
let catLabel = {};
let hidden = new Set();
const layers = { stays: null, route: null, spots: null, me: null };
let addMode = false;

/* --- markers ------------------------------------------------------------- */

function stayIcon(seq) {
  return L.divIcon({
    className: 'pin pin--stay',
    html: `<span class="pin__num">${seq}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function spotIcon(cat, local) {
  return L.divIcon({
    className: `pin pin--spot${local ? ' pin--local' : ''}`,
    html: `<span class="pin__dot" style="--pin:${catHex[cat] ?? '#7a8f99'}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -8],
  });
}

function carIcon() {
  return L.divIcon({
    className: 'pin pin--car',
    html: `<span class="pin__dot" style="--pin:var(--c-tomato)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -9],
  });
}

/* --- popups -------------------------------------------------------------- */

const stayPopup = (s) => `
  <strong class="pop__title">${esc(s.town)}</strong>
  <span class="pop__sub">${esc(s.name)}</span>
  <span class="pop__meta">${esc(dateRange(s.checkIn, s.checkOut))} · ${plural(
  s.nights, 'Nacht', 'Nächte'
)}</span>
  <span class="pop__meta">Anreise ${esc(s.checkInWindow)}</span>
  ${s.coordsPrecision === 'street' ? '<span class="pop__warn">nur straßengenau</span>' : ''}
  <a class="pop__link" href="plan.html">Im Plan ansehen</a>`;

const spotPopup = (s) => `
  <strong class="pop__title">${esc(s.name)}</strong>
  <span class="pop__sub">${esc(catLabel[s.category] ?? s.category)}${
    s.source === 'local' ? ' · lokal' : ''
  }</span>
  ${s.note ? `<span class="pop__meta">${esc(s.note)}</span>` : ''}
  ${s.url ? `<a class="pop__link" href="${esc(s.url)}" rel="noopener">Link öffnen</a>` : ''}
  ${
    s.source === 'local'
      ? `<button class="pop__del" data-del="${esc(s.id)}" type="button">Löschen</button>`
      : ''
  }`;

/* --- drawing ------------------------------------------------------------- */

function drawStays(stays, car) {
  const g = L.layerGroup();
  stays.forEach((s) => {
    L.marker(s.coords, { icon: stayIcon(s.seq), title: `${s.seq}. ${s.town}` })
      .bindPopup(stayPopup(s), { className: 'pop' })
      .addTo(g);
  });
  if (car?.coords) {
    L.marker(car.coords, { icon: carIcon(), title: 'Enterprise Rostock Downtown' })
      .bindPopup(
        `<strong class="pop__title">Enterprise</strong>
         <span class="pop__sub">${esc(car.branch)}</span>
         <span class="pop__meta">${esc(car.branchAddress)}</span>
         <span class="pop__meta">Mo–Fr ${esc(car.branchHours.monFri)}</span>`,
        { className: 'pop' }
      )
      .addTo(g);
  }
  return g.addTo(map);
}

/** Dashed line through the stays in order, which is roughly the driving route. */
function drawRoute(stays) {
  const pts = stays.map((s) => s.coords);
  return L.polyline(pts, {
    color: '#e04a2f',
    weight: 3,
    opacity: 0.85,
    dashArray: '7 7',
    lineCap: 'round',
  }).addTo(map);
}

function drawSpots(spots) {
  layers.spots?.remove();
  const g = L.layerGroup();
  spots
    .filter((s) => s.coords && !hidden.has(s.category))
    .forEach((s) => {
      L.marker(s.coords, { icon: spotIcon(s.category, s.source === 'local'), title: s.name })
        .bindPopup(spotPopup(s), { className: 'pop' })
        .addTo(g);
    });
  layers.spots = g.addTo(map);
}

/* --- side lists ---------------------------------------------------------- */

function renderRouteList(stays) {
  $('#routelist').innerHTML = stays
    .map(
      (s) => `<li class="routelist__item">
      <button type="button" class="routelist__btn" data-lat="${s.coords[0]}" data-lon="${s.coords[1]}">
        <span class="routelist__seq">${s.seq}</span>
        <span>
          <strong>${esc(s.town)}</strong>
          <span class="routelist__meta">${esc(dateRange(s.checkIn, s.checkOut))} · ${esc(s.name)}</span>
        </span>
      </button></li>`
    )
    .join('');
}

function renderSpotList(spots) {
  const local = spots.filter((s) => s.source === 'local');
  const seeded = spots.filter((s) => s.source !== 'local');

  const row = (s) => `<li class="spotrow">
    <span class="spotrow__dot" style="--pin:${catHex[s.category] ?? '#7a8f99'}"></span>
    <button type="button" class="spotrow__btn"
      ${s.coords ? `data-lat="${s.coords[0]}" data-lon="${s.coords[1]}"` : 'disabled'}>
      <strong>${esc(s.name)}</strong>
      <span class="spotrow__meta">${esc(catLabel[s.category] ?? s.category)}${
    s.coords ? '' : ' · keine Koordinaten'
  }${s.source === 'local' ? ' · lokal' : ''}</span>
    </button>
    ${s.url ? `<a class="spotrow__link" href="${esc(s.url)}" rel="noopener" title="Link öffnen">↗</a>` : ''}
  </li>`;

  $('#spotlist').innerHTML = `
    ${
      local.length
        ? `<h3 class="h4">Von uns (${local.length})</h3>
           <ul class="spotlist mt-3">${local.map(row).join('')}</ul>
           <div class="cluster mt-4">
             <button class="btn btn--sm btn--ghost" id="btn-export" type="button">JSON kopieren</button>
             <span class="xs faint">to commit into <code>data/spots.json</code></span>
           </div>`
        : `<p class="small dim">Nothing added yet. <a href="spots.html">Paste a link</a> or drop a
             pin on the map.</p>`
    }
    <h3 class="h4 mt-6">Vorschläge (${seeded.length})</h3>
    <ul class="spotlist mt-3">${seeded.map(row).join('')}</ul>`;
}

/* --- interaction --------------------------------------------------------- */

function renderFilters(cats) {
  $('#filters').innerHTML = cats
    .map(
      (c) => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="true">
        <span class="chip__dot" style="--pin:${c.hex}"></span>${esc(c.label)}</button>`
    )
    .join('');
}

function setAddMode(on) {
  addMode = on;
  const btn = $('#btn-addmode');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'Abbrechen' : 'Pin setzen';
  $('#map').classList.toggle('is-adding', on);
  $('#map-hint').innerHTML = on
    ? '<strong>Click the map</strong> to place your pin. Press Escape to stop.'
    : 'Turn on <strong>Pin setzen</strong>, then click the map where you want it.';
}

function fitTo(stays, spots) {
  const pts = [...stays.map((s) => s.coords), ...spots.filter((s) => s.coords).map((s) => s.coords)];
  if (!pts.length) return;
  /* invalidateSize first: the container is laid out by CSS after the map is
     constructed, and fitting against a stale size lands on the wrong zoom. */
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(pts), { padding: [26, 26], maxZoom: 11 });
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let stays, transport, spotsDoc;
  try {
    [stays, transport, spotsDoc] = await loadAll('stays.json', 'transport.json', 'spots.json');
  } catch (err) {
    failBox($('#spotlist'), err);
    return;
  }

  catHex = Object.fromEntries(spotsDoc.categories.map((c) => [c.id, c.hex]));
  catLabel = Object.fromEntries(spotsDoc.categories.map((c) => [c.id, c.label]));

  map = L.map('map', { center: CENTER, zoom: 8, scrollWheelZoom: false });
  map.on('click', onMapClick);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  /* scroll-zoom only once the map has focus, so the page still scrolls past it */
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());

  const ordered = [...stays.stays].sort((a, b) => a.seq - b.seq);
  layers.route = drawRoute(ordered);
  layers.stays = drawStays(ordered, transport.car);

  const refresh = () => {
    const spots = allSpots(spotsDoc);
    drawSpots(spots);
    renderSpotList(spots);
  };

  renderFilters(spotsDoc.categories);
  renderRouteList(ordered);
  refresh();
  map.whenReady(() => fitTo(ordered, allSpots(spotsDoc)));

  /* --- add a pin by clicking --- */
  function onMapClick(e) {
    if (!addMode) return;
    const name = prompt('Was ist das? (Name)');
    if (name === null || !name.trim()) {
      setAddMode(false);
      return;
    }
    const cats = spotsDoc.categories.map((c) => c.id).join(', ');
    const category = (prompt(`Kategorie?\n${cats}`, 'sonstiges') || 'sonstiges').trim().toLowerCase();
    const note = prompt('Notiz (optional)') || '';
    addSpot({
      name,
      category: catHex[category] ? category : 'sonstiges',
      note,
      coords: [e.latlng.lat, e.latlng.lng],
    });
    setAddMode(false);
    refresh();
  }

  $('#btn-addmode').addEventListener('click', () => setAddMode(!addMode));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addMode) setAddMode(false);
  });

  $('#btn-fit').addEventListener('click', () => fitTo(ordered, allSpots(spotsDoc)));

  $('#btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Dieser Browser kann den Standort nicht bestimmen.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = [pos.coords.latitude, pos.coords.longitude];
        layers.me?.remove();
        layers.me = L.circleMarker(p, {
          radius: 8, color: '#2f5fb8', weight: 3, fillColor: '#2f5fb8', fillOpacity: 0.35,
        })
          .bindPopup('<strong class="pop__title">Hier sind wir</strong>', { className: 'pop' })
          .addTo(map);
        map.setView(p, 13);
      },
      () => alert('Standort nicht verfügbar — vermutlich in den Browser-Einstellungen blockiert.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  /* category filters */
  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const cat = btn.dataset.cat;
    const on = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!on));
    if (on) hidden.add(cat);
    else hidden.delete(cat);
    drawSpots(allSpots(spotsDoc));
  });

  /* fly to a list entry */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lat]');
    if (btn) {
      map.flyTo([+btn.dataset.lat, +btn.dataset.lon], 14, { duration: 0.7 });
      document.querySelector('.map-shell')?.scrollIntoView({ block: 'center' });
      return;
    }
    /* delete a local pin from its popup */
    const del = e.target.closest('[data-del]');
    if (del) {
      removeSpot(del.dataset.del);
      map.closePopup();
      refresh();
      return;
    }
    /* export */
    if (e.target.id === 'btn-export') {
      const json = exportJSON();
      navigator.clipboard?.writeText(json).then(
        () => {
          e.target.textContent = `${readLocal().length} kopiert ✓`;
          setTimeout(() => (e.target.textContent = 'JSON kopieren'), 2200);
        },
        () => {
          const w = window.open('', '_blank');
          w.document.write(`<pre>${esc(json)}</pre>`);
        }
      );
    }
  });

  /* an issue link so Karl can add a spot without touching the repo */
  const issue = document.createElement('p');
  issue.className = 'xs faint mt-4';
  issue.innerHTML = `Karl can add one without any of this: <a href="${ISSUE_BASE}" rel="noopener">
    open a spot issue on GitHub</a> — a free account is all it needs.`;
  $('#spotlist').after(issue);

  initReveal();
})();
