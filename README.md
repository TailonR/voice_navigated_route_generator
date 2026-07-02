# RunRoute Voice Navigator

RunRoute is a static web app for planning running routes with map waypoints, loop generation, and audible turn-by-turn navigation cues.

## Features

- Plan a manual route by clicking the map or searching for places and addresses.
- Use your current location as the starting point.
- Build a route over walkable streets using OSRM routing.
- Generate automatic loop routes for preset distances: 1 mi, 2 mi, 5k, 4 mi, and 10k.
- Get route distance and turn-by-turn voice cues.
- Start voice navigation with browser geolocation tracking.
- Mobile layout with map-first controls, floating route actions, and a slide-up route panel.

## Tech Stack

This is a plain static web application. There is no Node.js build step or backend server.

- HTML, CSS, and vanilla JavaScript
- Leaflet for the interactive map
- OpenStreetMap tiles for map imagery
- OpenStreetMap Nominatim for search/geocoding
- OSRM demo routing API for route generation
- Lucide icons loaded from CDN
- Browser Geolocation API
- Browser Speech Synthesis API

## Run Locally

From the project directory:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/
```

If port `4173` is already in use, choose another port:

```bash
python3 -m http.server 4175
```

## Usage

1. Allow location access when prompted so the app can center the map and use your current location.
2. Add waypoints by clicking the map, using search, or tapping the crosshairs.
3. Select `Build route` to route through the waypoints.
4. Select `Start run` to begin voice navigation.
5. Use `Build auto route` to generate a loop from the current location for a preset distance.

## External Services

The app calls public third-party services directly from the browser:

- Map tiles: `https://tile.openstreetmap.org`
- Search/geocoding: `https://nominatim.openstreetmap.org`
- Routing: `https://router.project-osrm.org/route/v1/foot`

These services may have rate limits, availability limits, or usage policies. For production use, consider hosting or subscribing to dedicated tile, geocoding, and routing services.

## Project Files

- `index.html` - application markup and external script/style includes
- `styles.css` - responsive layout and component styling
- `app.js` - map setup, waypoint management, routing, search, geolocation, and voice navigation
- `LICENSE` - project license

## Notes

- Location features require a browser that supports the Geolocation API.
- Voice cues require a browser that supports the Speech Synthesis API.
- Some browsers require HTTPS for geolocation outside of `localhost`.
