# Ostsee Extravaganza

A single-purpose website for one trip: **31 August – 8 September 2026**, Leipzig to the Baltic
and back. Rostock, Zingst and the Darß, Binz, Stralsund, Rostock again. Two people, one rented
Golf, five beds and a Deutschland-Ticket.

Live at: _(GitHub Pages URL goes here once the repo exists)_

## How it works

Static HTML, one CSS file, ES modules. **No build step, no framework, no package manager.**
Content lives as JSON in `data/`, and each page renders itself from that on load.

```
index.html          Start — poster hero, the five stays, live countdown
plan.html           Der Plan — day by day, trains, the car
karte.html          Karte — Leaflet + OpenStreetMap, route, stays, our own pins
spots.html          Spots — paste a link, get a card; it shows up on the Karte
galerie.html        Galerie — photos and clips by day and place, with a lightbox
logbuch.html        Logbuch — short dated posts, light markdown bodies
wetter.html         Wetter & Wasser — live forecast, Baltic sea temperature, September normals
packliste.html      Packliste — checkable list, car-rental documents built in
kilometer.html      Kilometerzähler — odometer and fuel log, real l/100 km and ct/km
superlative.html    Superlative — post-trip awards and closing numbers
sw.js               Service worker: offline pages, data and map tiles

assets/css/site.css Design system: tokens, components, light + dark
assets/js/core.js   Shared chrome, data loading, formatting
assets/js/store.js  Local scratch layer over data/spots.json (localStorage)
assets/js/*.js      One module per page
assets/fonts/       Oswald + Work Sans, self-hosted woff2 (OFL)
data/*.json         All content — the single source of truth
photos/             Trip photos, YYYY-MM-DD/ — see photos/README.md
tools/fotos.py      Rebuilds data/photos.json: web copies, thumbnails, EXIF
tools/instagram.py  Pulls new posts from Instagram into photos/ — docs/INSTAGRAM.md
.github/workflows/  instagram.yml: runs the sync twice a day and on demand
```

## Running it locally

The pages `fetch` their JSON, which browsers block on `file://`. Serve the folder:

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765>.

## Editing content

Everything visible is in `data/`. To change a day of the itinerary, edit
`data/itinerary.json` — no HTML involved. Same for stays, transport, costs and credits.

## Privacy

Booking confirmation numbers, PINs and host phone numbers are **not** in this repo. They live in
`PRIVAT.md`, which is gitignored, as is `screenshots/`. The site shows names, addresses, times and
prices only. Do not move any of that into `data/`.

No cookies, no analytics, no third-party requests. Fonts are self-hosted; the map uses
OpenStreetMap tiles.

## Images

Hero and place photography is placeholder material from Wikimedia Commons, each image under its
own licence with attribution rendered in the footer and next to each photo. See
`data/credits.json`. These get replaced with our own photographs as the trip produces them.

## Build order

1. ✅ Design system, page chrome, Start page
2. ✅ Data layer and Der Plan
3. ✅ Karte + Spots — Leaflet on OSM, geocoded stays, route line, category
   filters, click-to-drop pins, link parsing, GitHub-issue intake
4. ✅ Galerie + Logbuch — grouped grid, keyboard/swipe lightbox, photo pipeline,
   dated posts with a small markdown subset
5. ✅ Wetter & Wasser — live Open-Meteo forecast, marine sea-surface temperature,
   and 2015–2025 normals for the trip window precomputed into data/klima.json
6. ✅ Packliste + Kilometerzähler — 53-item list with critical-document flagging
   and per-person filtering; fuel log deriving real consumption and cost per km
7. ✅ Service worker, OG image, Superlative

The site is feature-complete. What remains is content: real photos, real logbook
entries, and the awards on the way home.

## Instagram

The Galerie can pull from a trip Instagram account. GitHub Actions does the fetching, so
the access token lives in an encrypted repository secret rather than in the page — this
repo is public, and anything the page can read, so can everyone else. Photos are
downloaded and committed rather than hotlinked: Instagram's media URLs expire, and
committed files work offline and outlive the account.

Setup, token handling and the failure modes: **`docs/INSTAGRAM.md`**.

## Offline

`sw.js` precaches all ten pages, every data file, the CSS, the fonts and Leaflet,
so the site opens cold with no network. Map tiles you have already looked at are
kept too, capped at 400 so the cache cannot grow without bound. Pages and data use
network-first, so an online visit always sees the current site and the cache only
steps in when the network does not answer. Verified by killing the dev server and
loading every page and every JSON file from cache alone.

Bump `VERSION` in `sw.js` when the precache list changes; the old caches are
dropped on activate.



## Deliberately not in this repo

Anything about what the trip costs, and the free-cancellation deadlines. One of us is paying and
the other is between gigs; putting a running total on a shared website would turn a holiday into
an invoice. Those live in `PRIVAT-Kosten.html` and `PLAN.md`, both gitignored, alongside the
booking confirmation numbers in `PRIVAT.md`.

The one exception is the €250 Enterprise deposit, which is on the Der Plan page because it goes
on the main driver's card at the counter and being surprised by it would be worse.

## Weather data

`data/klima.json` holds averages for 31 August – 8 September across 2015–2025, computed once from
the Open-Meteo ERA5 archive so the page needs no network for the useful part. The live forecast and
sea-surface temperature are fetched at view time; the sea call is allowed to fail without taking
the page down with it.

## Chart colours

`data/spots.json → categories` holds the category palette. If you add one, keep it distinguishable
— see the note in the file.
