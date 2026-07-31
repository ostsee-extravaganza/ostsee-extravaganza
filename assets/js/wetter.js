/* ============================================================================
   wetter.js — Open-Meteo forecast + marine sea-surface temperature, plus the
   precomputed 2015–2025 normals for the trip window in data/klima.json.
   No API key, no account, nothing personal sent.
   ========================================================================= */

import { mountChrome, mountWaves, loadJSON, esc, longDate, failBox, initReveal } from './core.js';

const $ = (s) => document.querySelector(s);

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const TZ = 'Europe/Berlin';

/* WMO weather codes, grouped down to what actually matters on a beach holiday */
const WMO = {
  0: ['Klar', '☀️'], 1: ['Meist klar', '🌤'], 2: ['Wolkig', '⛅'], 3: ['Bedeckt', '☁️'],
  45: ['Nebel', '🌫'], 48: ['Reifnebel', '🌫'],
  51: ['Nieseln', '🌦'], 53: ['Nieseln', '🌦'], 55: ['Nieseln', '🌦'],
  56: ['Nieseln, gefrierend', '🌧'], 57: ['Nieseln, gefrierend', '🌧'],
  61: ['Leichter Regen', '🌦'], 63: ['Regen', '🌧'], 65: ['Starker Regen', '🌧'],
  66: ['Regen, gefrierend', '🌧'], 67: ['Regen, gefrierend', '🌧'],
  71: ['Schnee', '🌨'], 73: ['Schnee', '🌨'], 75: ['Starker Schnee', '🌨'], 77: ['Graupel', '🌨'],
  80: ['Schauer', '🌦'], 81: ['Schauer', '🌦'], 82: ['Kräftige Schauer', '⛈'],
  85: ['Schneeschauer', '🌨'], 86: ['Schneeschauer', '🌨'],
  95: ['Gewitter', '⛈'], 96: ['Gewitter mit Hagel', '⛈'], 99: ['Gewitter mit Hagel', '⛈'],
};
const wmo = (c) => WMO[c] ?? ['—', '·'];

const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO',
                 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const dir = (deg) => COMPASS[Math.round((deg % 360) / 22.5) % 16];

const hhmm = (iso) => (iso ? iso.slice(11, 16) : '—');
const wd = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' });

/** Windstärke in words — the number alone means little. */
function windWord(kmh) {
  if (kmh < 12) return 'kaum Wind';
  if (kmh < 20) return 'frische Brise';
  if (kmh < 30) return 'windig';
  if (kmh < 40) return 'kräftig';
  if (kmh < 55) return 'sturmig';
  return 'Sturm';
}

/* --- fetching ------------------------------------------------------------ */

async function getJSON(base, params) {
  const url = `${base}?${new URLSearchParams(params)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${base.split('/').slice(-1)} → HTTP ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.reason || 'Open-Meteo error');
  return d;
}

function loadTown(t) {
  const [lat, lon] = t.coords;
  const [mlat, mlon] = t.seaCoords;
  return Promise.all([
    getJSON(FORECAST, {
      latitude: lat, longitude: lon, timezone: TZ, forecast_days: 7,
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,' +
             'precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,' +
             'wind_direction_10m_dominant,sunrise,sunset,uv_index_max',
    }),
    getJSON(MARINE, {
      latitude: mlat, longitude: mlon, timezone: TZ, forecast_days: 1,
      hourly: 'sea_surface_temperature',
    }).catch(() => null),   // the sea is a nice-to-have; never fail the page over it
  ]).then(([fc, marine]) => {
    let sst = null;
    const vals = (marine?.hourly?.sea_surface_temperature ?? []).filter((v) => v !== null);
    if (vals.length) sst = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { ...t, fc, sst };
  });
}

/* --- rendering ----------------------------------------------------------- */

function nowCard(t) {
  const c = t.fc.current;
  const [label, icon] = wmo(c.weather_code);
  return `
<div class="stat reveal">
  <span class="stat__lab">${esc(t.name)}</span>
  <span class="stat__val">${Math.round(c.temperature_2m)}<small> °C</small></span>
  <span class="stat__note">${icon} ${esc(label)}</span>
  <span class="stat__note">${Math.round(c.wind_speed_10m)} km/h aus ${esc(
    dir(c.wind_direction_10m)
  )} · ${esc(windWord(c.wind_speed_10m))}</span>
  <span class="stat__note">${
    t.sst !== null
      ? `Wasser <strong>${t.sst.toFixed(1)} °C</strong>`
      : '<span class="faint">Wassertemperatur nicht verfügbar</span>'
  }</span>
</div>`;
}

function forecastTable(t) {
  const d = t.fc.daily;
  const rows = d.time.map((day, i) => {
    const [label, icon] = wmo(d.weather_code[i]);
    const gust = d.wind_gusts_10m_max[i];
    return `<tr>
      <td><strong>${esc(wd(day))}</strong><br><span class="xs faint">${esc(
        day.slice(8, 10)
      )}.${esc(day.slice(5, 7))}.</span></td>
      <td>${icon} ${esc(label)}</td>
      <td class="right num">${Math.round(d.temperature_2m_max[i])}° / ${Math.round(
      d.temperature_2m_min[i]
    )}°</td>
      <td class="right num">${d.precipitation_sum[i].toFixed(1)} mm<br>
        <span class="xs faint">${d.precipitation_probability_max[i] ?? '–'} %</span></td>
      <td class="right num">${Math.round(d.wind_speed_10m_max[i])} km/h<br>
        <span class="xs faint">${esc(dir(d.wind_direction_10m_dominant[i]))}${
      gust ? `, Böen ${Math.round(gust)}` : ''
    }</span></td>
      <td class="right num">${esc(hhmm(d.sunrise[i]))}<br>
        <span class="xs faint">${esc(hhmm(d.sunset[i]))}</span></td>
    </tr>`;
  });
  return table(
    ['Tag', 'Wetter', { t: 'Max / Min', r: true }, { t: 'Regen', r: true },
     { t: 'Wind', r: true }, { t: 'Auf / Unter', r: true }],
    rows
  );
}

function table(head, rows, foot) {
  return `<table class="data">
    <thead><tr>${head
      .map((h) => `<th${h.r ? ' class="right"' : ''}>${esc(h.t ?? h)}</th>`)
      .join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
}

function klimaTable(klima) {
  const rows = Object.values(klima.towns).map(
    (t) => `<tr>
      <td><strong>${esc(t.name)}</strong></td>
      <td class="right num">${t.tempMax} ° / ${t.tempMin} °</td>
      <td class="right num">${t.rainPerDay} mm</td>
      <td class="right num">${t.wetDayShare} %</td>
      <td class="right num">${t.windMax} km/h</td>
      <td class="right num xs faint">${t.tempMaxWarmest} ° / ${t.tempMinCoolest} °</td>
    </tr>`
  );
  return table(
    ['Ort', { t: 'Ø Max / Min', r: true }, { t: 'Ø Regen/Tag', r: true },
     { t: 'Nasse Tage', r: true }, { t: 'Ø Wind', r: true }, { t: 'Extreme', r: true }],
    rows
  );
}

/* --- boot ---------------------------------------------------------------- */

let towns = [];
let active = 'zingst';

function renderForecast() {
  const t = towns.find((x) => x.id === active) ?? towns[0];
  if (!t) return;
  $('#forecast').innerHTML = forecastTable(t);
  document.querySelectorAll('#town-tabs .chip').forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.town === t.id))
  );
}

(async function main() {
  await mountChrome();
  mountWaves();

  let klima;
  try {
    klima = await loadJSON('klima.json');
  } catch (err) {
    failBox($('#now'), err);
    return;
  }

  /* normals render immediately — they need no network */
  $('#klima-note').textContent = klima.note;
  $('#klima').innerHTML = klimaTable(klima);
  $('#klima-src').innerHTML =
    `${esc(klima.samples ?? '')}Fenster ${esc(klima.window)}, Jahre ${esc(klima.years)}. ` +
    `Daten: <a href="${esc(klima.source)}" rel="noopener">Open-Meteo</a>, ERA5. ` +
    `Extreme = wärmster Tag und kälteste Nacht in diesem Fenster über den ganzen Zeitraum.`;

  const list = Object.entries(klima.towns).map(([id, t]) => ({ id, ...t }));

  $('#town-tabs').innerHTML = list
    .map(
      (t) => `<button class="chip" type="button" data-town="${esc(t.id)}" role="tab"
        aria-pressed="${t.id === active}">${esc(t.name)}</button>`
    )
    .join('');

  $('#now').innerHTML = `<p class="small dim">Wird geladen …</p>`;

  async function load() {
    $('#now').innerHTML = `<p class="small dim">Wird geladen …</p>`;
    try {
      towns = await Promise.all(list.map(loadTown));
    } catch (err) {
      $('#now').innerHTML = `<div class="notice notice--warn">
        <div class="notice__title">Wetterdienst nicht erreichbar</div>
        <p>Open-Meteo antwortet gerade nicht. Die Normalwerte unten stehen trotzdem — die kommen
           aus dem Repo und brauchen kein Netz.</p>
        <p class="xs faint">${esc(err.message)}</p></div>`;
      return;
    }
    $('#now').innerHTML = towns.map(nowCard).join('');
    const stamp = towns[0]?.fc?.current?.time;
    $('#now-note').innerHTML =
      `Stand ${esc(hhmm(stamp))} · Wassertemperatur ist der Tagesmittelwert an der ` +
      `küstennächsten Gitterzelle, also eine gute Näherung und kein Thermometer im Wasser. ` +
      `Daten von <a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a>.`;

    const last = towns[0].fc.daily.time.at(-1);
    $('#fc-note').textContent =
      `Sieben Tage, bis ${longDate(last)}. Die Reise beginnt am 31. August — solange die ` +
      `Vorhersage nicht so weit reicht, sind die Normalwerte weiter unten der bessere Anhaltspunkt.`;

    $('#head-facts').innerHTML = towns
      .map(
        (t) => `<div class="page-head__fact"><dt>${esc(t.name)}</dt>
          <dd>${Math.round(t.fc.current.temperature_2m)}°${
          t.sst !== null ? ` · ${t.sst.toFixed(0)}° 🌊` : ''
        }</dd></div>`
      )
      .join('');

    renderForecast();
    initReveal();
  }

  $('#town-tabs').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    active = c.dataset.town;
    renderForecast();
  });
  $('#btn-refresh').addEventListener('click', load);

  load();
  initReveal();
})();
