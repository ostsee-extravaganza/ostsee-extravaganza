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
galerie.html        Galerie — photos and clips by day and place
logbuch.html        Logbuch — short dated posts
wetter.html         Wetter & Wasser — forecast, sea temperature, wind, sun times
packliste.html      Packliste — shared checkable list plus the car-rental documents
kilometer.html      Kilometerzähler — odometer and fuel log, real l/100 km

assets/css/site.css Design system: tokens, components, light + dark
assets/js/core.js   Shared chrome, data loading, formatting
assets/js/store.js  Local scratch layer over data/spots.json (localStorage)
assets/js/*.js      One module per page
assets/fonts/       Oswald + Work Sans, self-hosted woff2 (OFL)
data/*.json         All content — the single source of truth
photos/             Trip photos, YYYY-MM-DD/
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
4. ◻︎ Galerie + Logbuch
5. ◻︎ Wetter & Wasser + Packliste
6. ◻︎ Kilometerzähler
7. ◻︎ Service worker, OG image, Superlative

The seven pages not yet built are scaffolded: they carry the shared chrome and list
what is coming, so nothing 404s and the navigation is complete.



## Deliberately not in this repo

Anything about what the trip costs, and the free-cancellation deadlines. One of us is paying and
the other is between gigs; putting a running total on a shared website would turn a holiday into
an invoice. Those live in `PRIVAT-Kosten.html` and `PLAN.md`, both gitignored, alongside the
booking confirmation numbers in `PRIVAT.md`.

The one exception is the €250 Enterprise deposit, which is on the Der Plan page because it goes
on the main driver's card at the counter and being surprised by it would be worse.

## Chart colours

`data/spots.json → categories` holds the category palette. If you add one, keep it distinguishable
— see the note in the file.
