# Washington Mountaineering Hub

Explore Washington peaks on real 3D terrain, then plan camps, dates, weather, hazards and gear for each route.
Static site: no build step, no server, no API keys required.

## Put it on GitHub Pages

1. Create a repository and push everything in this folder to the `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Deploy from a branch**, pick `main` and `/ (root)`.
3. Open `https://<you>.github.io/<repo>/` a minute later.

### Custom domain

The `CNAME` file sets the site's address to `mountain.johnsencorey.com`. At the DNS host, add one record:

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `mountain` | `<your-github-username>.github.io` |

Then in **Settings → Pages**, confirm the custom domain shows and tick **Enforce HTTPS** once the certificate is issued.

To run it locally, serve the folder (the browser will not load the data files from `file://`):

```
python3 -m http.server 8000
```

The landing page is `index.html`; the app itself is `map.html`. Links can point at a peak or a route: `…/map.html#rainier` opens the mountain top-down with every route shown,
`…/map.html#rainier/dc` goes straight to that route in 3D
(old `…/#rainier/dc` links still work: the landing page forwards them to the map).

## What is live, and where it comes from

| What | Source | Key needed |
| --- | --- | --- |
| 3D terrain | Mapzen terrarium tiles on AWS Open Data | no |
| Satellite and topo imagery | USGS The National Map | no |
| Hourly forecast per waypoint (temperature at that elevation, wind aloft, freezing level, snow) | Open-Meteo | no (free for non-commercial use) |
| Text forecast and active alerts for the summit | National Weather Service API | no |
| Avalanche danger for the zone | avalanche.org map layer for NWAC | no |
| Park alerts (optional) | National Park Service API | yes, free; set `npsApiKey` in `js/config.js` |
| Route and access reports | `data/updates.json` in this repository | — |

Every source is configured in `js/config.js`. Each one fails on its own: if a service is down the panel says so and the rest keeps working.

The forecast reaches 7 days. For a summit day further out, the app falls back to seasonal typicals and says so.
On the Weather tab, **My numbers** lets you override the forecast by hand.

### Keeping `data/updates.json` fresh

Ranger blogs and trip reports have no API, so this file is curated. Each entry:

```json
{ "date": "2026-10-06", "peak": "helens", "route": "monitor", "title": "…", "body": "…", "source": "…", "url": "https://…" }
```

`peak` is a peak id, or `"*"` to show on every peak. `route` is optional. Update `checked` at the top when you review the file.

## Adding or changing peaks and routes

Two ways, and they produce the same file.

**In the app.** Click **Edit data**. You can drag waypoints on the map, trace a section by clicking along it, import a GPX track,
edit section terrain, mileage, hazards and notes, add markers, and create a new peak. Edits are kept in your browser as a draft.
**Download** the peak file, save it as `data/peaks/<id>.json`, and commit. A new peak also needs one line in `data/index.json`
(the editor shows the exact line).

**By hand.** Copy a file in `data/peaks/` and edit it. The app checks the file when it loads and lists problems in the browser console.

### Peak file format (`data/peaks/<id>.json`)

Coordinates are `[longitude, latitude]`. Elevations are feet.

```jsonc
{
  "schema": 2,
  "id": "rainier",                 // lowercase, matches the file name
  "name": "Mount Rainier", "short": "Rainier", "elev": 14410,
  "summit": [-121.7604, 46.8529],
  "range": "…", "blurb": "…",
  "treeline": 6000, "snowline": 7200,
  "permit": "…",
  "manager": { "name": "…", "url": "https://…" },
  "links": [ { "label": "…", "url": "https://…" } ],
  "npsParkCode": "mora",           // optional, for park alerts
  "routes": [ {
    "id": "dc", "name": "Disappointment Cleaver", "grade": "Grade II · glacier, to 40°",
    "level": 2,                    // 1 hiker with axe … 4 advanced alpine
    "days": [2, 3],                // typical trip length
    "season": [4.5, 8.8],          // months: 0 = Jan 1, 5.5 = mid-June. May wrap past 12 for winter routes
    "prime": [5.5, 7.8],
    "kit": ["axe", "glacier", "helmet", "blue"],   // drives the gear list; see js/gear.js
    "summary": "…", "skills": ["…"],
    "line": { "quality": "approximate", "asOf": "2026-10", "source": "…" },   // approximate | traced | gps
    "waypoints": [                 // in order, trailhead first, summit last
      { "name": "Paradise", "type": "trailhead", "ele": 5400, "at": [-121.7352, 46.7861] },
      { "name": "Camp Muir", "type": "camp", "ele": 10188, "at": [-121.7319, 46.8356], "note": "…", "sleep": true }
    ],
    "sections": [                  // one per gap between waypoints
      { "miles": 2.2, "terrain": "trail",          // trail | snow | glacier | scramble | rock | ice
        "hazards": { "nav": 1 },                   // crev rock ice avy fall nav alt, each 1–3
        "note": "…",
        "via": [[-121.7345, 46.7935]] }            // shaping points between the two waypoints; may carry a third value, feet
    ]
  } ],
  "pois": [ { "name": "Cathedral Gap", "type": "hazard", "at": [-121.7308, 46.84], "ele": 10640, "note": "…", "routes": ["dc"] } ]
}
```

Marker types: `hazard`, `crux`, `water`, `viewpoint`, `toilet`, `ranger`. Leave `routes` off to show a marker on every route.

Hazard numbers are the normal-season rating. The app raises or lowers them for the chosen date and conditions (`hzAdj` in `js/calc.js`).
Times come from distance, gain and terrain (`secTime` in `js/calc.js`).

## Read this before trusting the data

- **Route lines are approximate.** Every line shipped here was placed by hand from memory, not surveyed, and is drawn dashed.
  Replace them with recorded GPS tracks in the editor. Glacier routes move every season even when the track is real.
- **Route facts are unverified.** Elevations, mileages, camp details, grades and permit rules were written from general knowledge.
  Check them against the land manager and a current guidebook.
- **Weather numbers are model output**, not a mountain forecast written by a person. Read the NWS and NWAC forecasts as well.
- This is a planning aid. It is not a navigation tool.

## Layout

```
index.html        landing page: peaks, routes, features, latest reports
map.html          app shell
css/app.css       styles (light and dark follow the system setting)
css/home.css      landing page styles
js/home.js        landing page: builds the skyline and route cards from the data files
js/config.js      every outside service and tile URL
js/main.js        boot and wiring
js/map.js         MapLibre 3D view, route lines, markers, fly-through
js/panel.js       the tabs
js/calc.js        times, itinerary, hazard ratings, sun and moon
js/gear.js        gear rules
js/live.js        forecast, alerts, avalanche fetchers
js/data.js        loading, validation, geometry, GPX, elevation lookups
js/editor.js      the in-app editor
data/index.json   list of peaks
data/peaks/*.json one file per peak
data/updates.json curated reports
```

Trip plans, gear ticks, the climb log and editor drafts are stored in the browser's local storage on the device you use.

## Credits

Map rendering by MapLibre GL JS. Terrain © Mapzen, hosted by AWS Open Data. Imagery and topo: USGS The National Map.
Weather data by Open-Meteo.com. Forecast text and alerts: US National Weather Service. Avalanche danger: Northwest Avalanche Center via avalanche.org.
