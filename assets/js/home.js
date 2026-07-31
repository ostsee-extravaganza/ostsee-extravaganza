/* ============================================================================
   home.js — the Start page.
   ========================================================================= */

import {
  mountChrome, loadAll, mountWaves, km, esc, dateRange, longDate,
  initCountdown, initReveal, failBox, plural,
} from './core.js';

const $ = (sel) => document.querySelector(sel);

/* --- pieces -------------------------------------------------------------- */

function heroMeta(trip) {
  const items = [
    ['Nächte', trip.nights],
    ['Unterkünfte', trip.stats.stays],
    ['Orte', trip.stats.towns],
    ['Auto', '7 Tage'],
  ];
  return items
    .map(([dt, dd]) => `<div class="hero__metaitem"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
    .join('');
}

function placeCard(s, i, dayNum) {
  const img = s.image.replace(/\.jpg$/, '');
  return `
<a class="place reveal" href="plan.html#tag-${dayNum}" aria-label="${esc(s.town)}, ${esc(s.name)}">
  <div class="place__media">
    <span class="place__seq" aria-hidden="true">${s.seq}</span>
    <img src="${esc(s.image)}"
         srcset="${esc(img)}-sm.jpg 700w, ${esc(s.image)} 1400w"
         sizes="(min-width: 62em) 22rem, (min-width: 40em) 45vw, 90vw"
         alt="${esc(s.town)}" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async">
    <span class="place__nights">${plural(s.nights, 'Nacht', 'Nächte')}</span>
  </div>
  <div class="place__body">
    <p class="place__dates">${esc(dateRange(s.checkIn, s.checkOut))}</p>
    <h3 class="place__town">${esc(s.town)}</h3>
    <p class="place__name">${esc(s.name)}</p>
    <p class="place__blurb">${esc(s.blurb)}</p>
    <div class="place__foot">
      <span class="place__price">${esc(s.kind)}</span>
      <span class="place__per">${esc(s.checkInWindow.split('–')[0].trim())} Anreise</span>
    </div>
  </div>
</a>`;
}

function statTile(val, lab, note) {
  return `<div class="stat reveal">
    <span class="stat__val">${val}</span>
    <span class="stat__lab">${esc(lab)}</span>
    ${note ? `<span class="stat__note">${esc(note)}</span>` : ''}
  </div>`;
}

function landscapeTile(c) {
  const base = c.file.replace(/\.jpg$/, '');
  return `
<figure class="card reveal" style="overflow:hidden">
  <img src="${esc(c.file)}" srcset="${esc(base)}-sm.jpg 700w, ${esc(c.file)} 1400w"
       sizes="(min-width: 62em) 22rem, 90vw" alt="${esc(c.caption)}"
       loading="lazy" decoding="async" style="aspect-ratio:4/3;object-fit:cover;width:100%">
  <figcaption class="card__body">
    <h3 class="h4">${esc(c.caption)}</h3>
    <p class="xs faint mt-3">${esc(c.author)} ·
      <a href="${esc(c.source)}" rel="noopener">${esc(c.license)}</a></p>
  </figcaption>
</figure>`;
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let trip, stays, transport, credits, itin;
  try {
    [trip, stays, transport, credits, itin] = await loadAll(
      'trip.json', 'stays.json', 'transport.json', 'credits.json', 'itinerary.json'
    );
  } catch (err) {
    failBox($('#places'), err);
    return;
  }

  /** Which day of the trip does this stay start on? */
  const dayOf = (iso) => itin.days.find((d) => d.date === iso)?.day ?? 1;

  /* hero */
  initCountdown($('#countdown'), trip.start);
  $('#hero-meta').innerHTML = heroMeta(trip);

  /* places */
  $('#places').innerHTML = stays.stays
    .map((s, i) => placeCard(s, i, dayOf(s.checkIn)))
    .join('');

  /* numbers — the shape of the trip, not the shape of the bill */
  const car = transport.car;
  const totalKm = itin.days.reduce((n, d) => n + (d.driveKm ?? 0), 0);
  const drivingDays = itin.days.filter((d) => d.car).length;

  $('#stats').innerHTML = [
    statTile(
      `${trip.nights}<small> / ${trip.stats.stays}</small>`,
      'Nächte / Betten',
      `${trip.stats.towns} Orte: Rostock, Zingst, Binz, Stralsund`
    ),
    statTile(`~${km(totalKm)}`, 'Autokilometer',
      `${drivingDays} Tage mit dem Golf, ${itin.days.length - drivingDays} ohne`),
    statTile('6½ h', 'Bahn je Richtung',
      'Deutschland-Ticket deckt jede Etappe ab — nichts zu buchen'),
    statTile('0', 'Feste Termine',
      'Beyond the beds and the car, nothing on this trip is booked'),
  ].join('');

  $('#stats-note').innerHTML =
    `Die Betten und das Auto stehen. Alles andere — welcher Strand, welche Kneipe, ` +
    `ob wir überhaupt aufstehen — entscheiden wir morgens.`;

  /* landscape */
  const wanted = ['place-jasmund.jpg', 'extra-weststrand.jpg', 'extra-binz-kurhaus.jpg'];
  const tiles = wanted
    .map((f) => credits.images.find((c) => c.file.endsWith(f)))
    .filter(Boolean);
  $('#landscape').innerHTML = tiles.map(landscapeTile).join('');

  /* crew */
  $('#crew-list').innerHTML = trip.travellers
    .map(
      (t) => `<div class="ticket ticket--alt reveal">
        <h3 class="h3">${esc(t.name)} <span class="faint" style="font-weight:400">· ${t.age}</span></h3>
        <p class="small dim mt-3">${esc(t.role)}</p>
      </div>`
    )
    .join('');

  /* notes */
  $('#trip-notes').innerHTML =
    trip.notes
      .map((n) => `<div class="notice notice--info reveal"><p>${esc(n)}</p></div>`)
      .join('') +
    `<div class="notice notice--warn reveal">
       <div class="notice__title">Autorückgabe</div>
       <p>${esc(car.branch)} sits at ${esc(car.branchAddress)} — not at the Hbf — and closes at
          ${esc(car.branchHours.monFri.split('–')[1].trim())} on weekdays. Handing the Golf back on
          Monday evening means Tuesday morning is entirely free.</p>
     </div>`;

  /* dynamic headline — same reckoning as the countdown, which targets the 09:22 departure */
  const d = Math.floor((new Date(`${trip.start}T09:22:00`) - new Date()) / 86400000);
  const h = document.querySelector('#vorfreude-h');
  if (h) h.textContent = d > 0 ? `Noch ${plural(d, 'Tag', 'Tage')} Vorfreude` : 'Es geht los';

  document.querySelectorAll('[data-startdate]').forEach((el) => {
    el.textContent = longDate(trip.start);
  });

  initReveal();
})();
