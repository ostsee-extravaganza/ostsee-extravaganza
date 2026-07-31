/* ============================================================================
   store.js — the local scratch layer.

   Repo JSON in data/ is the source of truth. Anything added in the browser is
   kept in localStorage, flagged as local, and merged on read. Nothing is lost
   when the repo data changes; nothing local reaches the other person until it
   is exported and committed.
   ========================================================================= */

const KEY = 'ose:spots:v1';

/* --- generic per-device state -------------------------------------------- */

/**
 * A tiny namespaced localStorage box. Used by the packing list and the fuel
 * log — both are per-device by nature, and both say so on the page.
 * Never throws: a corrupt or blocked store degrades to the fallback.
 */
export function stateStore(name, fallback) {
  const k = `ose:${name}:v1`;
  return {
    read() {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return structuredClone(fallback);
        const v = JSON.parse(raw);
        return v ?? structuredClone(fallback);
      } catch {
        console.warn(`Store ${k} unreadable; using defaults.`);
        return structuredClone(fallback);
      }
    },
    write(v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (err) {
        console.error(`Could not save ${k}`, err);
        return false;
      }
    },
    clear() {
      try {
        localStorage.removeItem(k);
      } catch {
        /* nothing useful to do */
      }
    },
  };
}

/** Read the local additions. Never throws — a corrupt store just reads empty. */
export function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    console.warn('Local spot store unreadable; starting empty.');
    return [];
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    console.error('Could not save locally', err);
    return false;
  }
}

/** Stable-ish id without Date.now(), so two adds in the same tick differ. */
let seq = 0;
function newId(name) {
  const slug =
    String(name || 'spot')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'spot';
  return `local-${slug}-${(seq++).toString(36)}${Math.floor(performance.now())
    .toString(36)
    .slice(-4)}`;
}

/** Add a spot. Returns the stored object. */
export function addSpot({ name, category = 'sonstiges', note = '', url = '', coords = null }) {
  const list = readLocal();
  const spot = {
    id: newId(name),
    name: String(name || '').trim() || 'Unbenannter Spot',
    category,
    note: String(note || '').trim(),
    url: String(url || '').trim(),
    coords: Array.isArray(coords) && coords.length === 2 ? [+coords[0], +coords[1]] : null,
    source: 'local',
    added: new Date().toISOString().slice(0, 10),
  };
  list.push(spot);
  writeLocal(list);
  return spot;
}

export function removeSpot(id) {
  const list = readLocal().filter((s) => s.id !== id);
  writeLocal(list);
  return list;
}

export function updateSpot(id, patch) {
  const list = readLocal().map((s) => (s.id === id ? { ...s, ...patch } : s));
  writeLocal(list);
  return list;
}

/** Repo spots first, then local ones. */
export function allSpots(repoDoc) {
  return [...(repoDoc?.spots ?? []), ...readLocal()];
}

export const localCount = () => readLocal().length;

/** Pretty JSON of the local spots, ready to paste into data/spots.json. */
export function exportJSON() {
  return JSON.stringify(readLocal(), null, 2);
}

/* --- link parsing -------------------------------------------------------- */

/**
 * Pull coordinates out of a pasted URL where we can.
 * Handles the common Google Maps shapes plus OSM and Apple Maps.
 * Returns { coords, name, url } — coords is null when nothing was found.
 */
export function parseLink(input) {
  const url = String(input || '').trim();
  if (!url) return { coords: null, name: '', url: '' };

  const num = '(-?\\d+\\.\\d+)';
  const patterns = [
    new RegExp(`@${num},${num}`), //           google  /@54.31,13.09,15z
    new RegExp(`!3d${num}!4d${num}`), //       google  place data blob
    new RegExp(`[?&]q=${num},\\s*${num}`), //  google  ?q=lat,lng
    new RegExp(`[?&]ll=${num},\\s*${num}`), // apple   ?ll=lat,lng
    new RegExp(`[?&]mlat=${num}[^]*?[?&]mlon=${num}`), // osm
    new RegExp(`#map=\\d+/${num}/${num}`), //  osm     #map=15/54.31/13.09
    new RegExp(`[?&]daddr=${num},\\s*${num}`),
  ];

  let coords = null;
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lon = parseFloat(m[2]);
      // sanity: anywhere on Earth, and warn if it is nowhere near the Baltic
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        coords = [lat, lon];
        break;
      }
    }
  }

  /* A readable name guess from the URL itself. Better to offer nothing than
     to offer a coordinate blob the user then has to delete. */
  let name = '';
  const place = url.match(/\/place\/([^/@?]+)/);
  if (place) {
    name = decodeURIComponent(place[1]).replace(/\+/g, ' ').trim();
  } else if (/^https?:\/\//i.test(url) || /^[\w-]+(\.[\w-]+)+\//.test(url)) {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
      const looksLikeCoords = /^@?-?\d+[.,]\d+/.test(last);
      const decoded = last && !looksLikeCoords
        ? decodeURIComponent(last).replace(/[-_+]/g, ' ')
        : '';
      name = (decoded || u.hostname.replace(/^www\./, '')).slice(0, 60);
    } catch {
      name = '';
    }
  }

  return { coords, name, url };
}

/** Rough check: is this anywhere near Mecklenburg-Vorpommern? */
export const nearBaltic = (coords) =>
  !!coords && coords[0] > 53.2 && coords[0] < 55.2 && coords[1] > 10.5 && coords[1] < 14.6;
