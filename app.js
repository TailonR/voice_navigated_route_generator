const INITIAL_MAP_CENTER = [39.8283, -98.5795];
const INITIAL_MAP_ZOOM = 4;
const USER_MAP_ZOOM = 15;
const AUTO_ROUTE_SEARCH_ITERATIONS = 5;
const AUTO_ROUTE_PATTERNS = [
  {
    name: "Square",
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  },
  {
    name: "Diamond",
    points: [
      [0, 0],
      [0.7, 0.7],
      [0, 1.4],
      [-0.7, 0.7],
      [0, 0],
    ],
  },
  {
    name: "Wide loop",
    points: [
      [0, 0],
      [0, 1.35],
      [0.55, 1.35],
      [0.55, 0],
      [0, 0],
    ],
  },
  {
    name: "Tall loop",
    points: [
      [0, 0],
      [1.35, 0],
      [1.35, 0.55],
      [0, 0.55],
      [0, 0],
    ],
  },
];
const AUTO_ROUTE_BEARINGS = [0, 45, 90, 135];
const METERS_PER_MILE = 1609.344;
const SEARCH_RESULT_LIMIT = 10;
const SEARCH_VIEWBOX_DELTA = 0.35;

function initApp() {
const state = {
  waypoints: [],
  routeLayer: null,
  routePoints: [],
  routeCumulativeDistances: [],
  steps: [],
  activeStepIndex: 0,
  spokenSteps: new Set(),
  watchId: null,
  userMarker: null,
  isBuildingRoute: false,
  currentCity: "",
};

const els = {
  status: document.querySelector("#status"),
  waypointList: document.querySelector("#waypointList"),
  mobileControlsButton: document.querySelector("#mobileControlsButton"),
  mobileClearRouteButton: document.querySelector("#mobileClearRouteButton"),
  mobileCloseControlsButton: document.querySelector("#mobileCloseControlsButton"),
  mobileRouteAction: document.querySelector("#mobileRouteAction"),
  mobileBuildRouteButton: document.querySelector("#mobileBuildRouteButton"),
  mobileRunSummary: document.querySelector("#mobileRunSummary"),
  mobileStartRunButton: document.querySelector("#mobileStartRunButton"),
  mobileDistanceMetric: document.querySelector("#mobileDistanceMetric"),
  distanceMetric: document.querySelector("#distanceMetric"),
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  buildRouteButton: document.querySelector("#buildRouteButton"),
  undoButton: document.querySelector("#undoButton"),
  clearButton: document.querySelector("#clearButton"),
  locateButton: document.querySelector("#locateButton"),
  startRunButton: document.querySelector("#startRunButton"),
  autoRouteDistance: document.querySelector("#autoRouteDistance"),
  autoBuildRouteButton: document.querySelector("#autoBuildRouteButton"),
  reverseButton: document.querySelector("#reverseButton"),
  voiceToggle: document.querySelector("#voiceToggle"),
  spokenPreview: document.querySelector("#spokenPreview"),
  routerInput: document.querySelector("#routerInput"),
  cueDistanceInput: document.querySelector("#cueDistanceInput"),
  cueDistanceLabel: document.querySelector("#cueDistanceLabel"),
};

const map = L.map("map", {
  zoomControl: false,
}).setView(INITIAL_MAP_CENTER, INITIAL_MAP_ZOOM);

L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const waypointLayer = L.layerGroup().addTo(map);
const cueLayer = L.layerGroup().addTo(map);

const waypointIcon = (index) =>
  L.divIcon({
    className: "waypoint-pin",
    html: `<span>${index}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

const userIcon = L.divIcon({
  className: "user-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const pinStyle = document.createElement("style");
pinStyle.textContent = `
  .waypoint-pin span {
    align-items: center;
    background: #0e8f6d;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 5px 15px rgba(0,0,0,.25);
    color: white;
    display: flex;
    font-weight: 900;
    height: 30px;
    justify-content: center;
    width: 30px;
  }
  .user-pin span {
    background: #2266d8;
    border: 4px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 7px rgba(34,102,216,.2), 0 4px 14px rgba(0,0,0,.28);
    display: block;
    height: 24px;
    width: 24px;
  }
`;
document.head.append(pinStyle);

function setStatus(message) {
  els.status.textContent = message;
}

function formatMiles(meters) {
  return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function offsetLatLng(origin, northMeters, eastMeters) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + northMeters / metersPerDegreeLat,
    lng: origin.lng + eastMeters / metersPerDegreeLng,
  };
}

function rotateOffset(northMeters, eastMeters, bearingDegrees) {
  const radians = (bearingDegrees * Math.PI) / 180;
  return {
    north: northMeters * Math.cos(radians) - eastMeters * Math.sin(radians),
    east: northMeters * Math.sin(radians) + eastMeters * Math.cos(radians),
  };
}

function localMeters(point, origin) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * metersPerDegreeLng,
    y: (point.lat - origin.lat) * metersPerDegreeLat,
  };
}

function latLngFromLocalMeters(point, origin) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + point.y / metersPerDegreeLat,
    lng: origin.lng + point.x / metersPerDegreeLng,
  };
}

function closestPointOnSegment(point, start, end) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) return start;

  const rawT = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  return {
    x: start.x + segmentX * t,
    y: start.y + segmentY * t,
  };
}

function closestPointOnRoute(point, routePoints) {
  if (routePoints.length === 0) return point;
  if (routePoints.length === 1) return routePoints[0];

  let closest = routePoints[0];
  let closestDistance = Infinity;

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const origin = routePoints[index];
    const localPoint = localMeters(point, origin);
    const localStart = { x: 0, y: 0 };
    const localEnd = localMeters(routePoints[index + 1], origin);
    const candidate = closestPointOnSegment(localPoint, localStart, localEnd);
    const distanceSquared = (localPoint.x - candidate.x) ** 2 + (localPoint.y - candidate.y) ** 2;

    if (distanceSquared < closestDistance) {
      closestDistance = distanceSquared;
      closest = latLngFromLocalMeters(candidate, origin);
    }
  }

  return closest;
}

function cumulativeRouteDistances(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances[index] = distances[index - 1] + distanceMeters(points[index - 1], points[index]);
  }
  return distances;
}

function routeProgressForPoint(point, routePoints, cumulativeDistances = cumulativeRouteDistances(routePoints)) {
  if (routePoints.length < 2) return 0;

  let closestDistanceSquared = Infinity;
  let closestProgress = 0;

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const origin = routePoints[index];
    const localPoint = localMeters(point, origin);
    const localStart = { x: 0, y: 0 };
    const localEnd = localMeters(routePoints[index + 1], origin);
    const candidate = closestPointOnSegment(localPoint, localStart, localEnd);
    const distanceSquared = (localPoint.x - candidate.x) ** 2 + (localPoint.y - candidate.y) ** 2;

    if (distanceSquared < closestDistanceSquared) {
      const segmentLength = distanceMeters(routePoints[index], routePoints[index + 1]);
      const candidateProgressRatio = segmentLength === 0 ? 0 : distanceMeters(origin, latLngFromLocalMeters(candidate, origin)) / segmentLength;
      closestDistanceSquared = distanceSquared;
      closestProgress = cumulativeDistances[index] + segmentLength * Math.max(0, Math.min(1, candidateProgressRatio));
    }
  }

  return closestProgress;
}

function snapWaypointsToRoute(routePoints) {
  if (routePoints.length < 2) return;
  state.waypoints = state.waypoints.map((waypoint) => {
    const snapped = closestPointOnRoute(waypoint, routePoints);
    return {
      ...waypoint,
      lat: snapped.lat,
      lng: snapped.lng,
    };
  });
}

function totalDistance(points) {
  return points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + distanceMeters(points[index - 1], point);
  }, 0);
}

function speak(text, force = false) {
  els.spokenPreview.textContent = text;
  if (!els.voiceToggle.checked && !force) return;
  if (!("speechSynthesis" in window)) {
    setStatus("This browser does not support speech synthesis.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function addWaypoint(latlng, label = "Waypoint") {
  state.waypoints.push({
    id: crypto.randomUUID(),
    lat: latlng.lat,
    lng: latlng.lng,
    label,
  });
  resetRoute();
  renderWaypoints();
  setStatus(`${label} added. Add another point or build the route.`);
}

function appendManualLoopEndpoint(latlng) {
  const lastWaypoint = state.waypoints.at(-1);
  if (lastWaypoint?.label === "Current location" && state.waypoints.length > 1) {
    lastWaypoint.lat = latlng.lat;
    lastWaypoint.lng = latlng.lng;
    return;
  }

  state.waypoints.push({
    id: crypto.randomUUID(),
    lat: latlng.lat,
    lng: latlng.lng,
    label: "Current location",
  });
}

function addCurrentLocationAsWaypointOne(latlng) {
  if (state.waypoints.length > 0) return false;
  addWaypoint(latlng, "Current location");
  return true;
}

function setUserMarker(latlng) {
  if (!state.userMarker) {
    state.userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
  } else {
    state.userMarker.setLatLng(latlng);
  }
}

function cityFromAddress(address = {}) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    address.suburb ||
    address.county ||
    ""
  );
}

async function loadCurrentCity(latlng) {
  const params = new URLSearchParams({
    format: "json",
    lat: String(latlng.lat),
    lon: String(latlng.lng),
    zoom: "14",
    addressdetails: "1",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`City lookup failed: ${response.status}`);
  const payload = await response.json();
  state.currentCity = cityFromAddress(payload.address);
  return state.currentCity;
}

async function currentCityForSearch(searchOrigin) {
  if (state.currentCity) return state.currentCity;
  try {
    return await loadCurrentCity(searchOrigin);
  } catch {
    return "";
  }
}

function searchQueryWithCity(query, city) {
  if (!city || query.toLowerCase().includes(city.toLowerCase())) return query;
  return `${query}, ${city}`;
}

function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function openRouteControls() {
  document.body.classList.add("controls-open");
}

function closeRouteControls() {
  document.body.classList.remove("controls-open");
  setTimeout(() => map.invalidateSize(), 0);
}

function resetRoute() {
  state.steps = [];
  state.routePoints = [];
  state.routeCumulativeDistances = [];
  state.activeStepIndex = 0;
  state.spokenSteps.clear();
  cueLayer.clearLayers();
  if (state.routeLayer) {
    map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
  updateMetrics();
}

function renderWaypoints() {
  waypointLayer.clearLayers();
  els.waypointList.innerHTML = "";

  state.waypoints.forEach((wp, index) => {
    const marker = L.marker([wp.lat, wp.lng], { icon: waypointIcon(index + 1), draggable: true })
      .addTo(waypointLayer)
      .bindPopup(`<strong>${wp.label}</strong><br><button type="button" data-id="${wp.id}">Remove</button>`);

    marker.on("dragend", () => {
      const position = marker.getLatLng();
      wp.lat = position.lat;
      wp.lng = position.lng;
      resetRoute();
      renderWaypoints();
      setStatus("Waypoint moved. Build the route again when ready.");
    });

    const li = document.createElement("li");
    li.className = "waypoint-item";
    li.innerHTML = `
      <span class="waypoint-index">${index + 1}</span>
      <div>
        <strong>${wp.label}</strong>
        <span>${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</span>
      </div>
      <button class="icon-button move-up" type="button" aria-label="Move waypoint up" title="Move up"><i data-lucide="chevron-up"></i></button>
      <button class="icon-button move-down" type="button" aria-label="Move waypoint down" title="Move down"><i data-lucide="chevron-down"></i></button>
      <button class="icon-button danger remove-waypoint" type="button" aria-label="Remove waypoint" title="Remove"><i data-lucide="x"></i></button>
    `;
    li.querySelector(".move-up").disabled = index === 0;
    li.querySelector(".move-down").disabled = index === state.waypoints.length - 1;
    li.querySelector(".move-up").addEventListener("click", () => moveWaypoint(index, -1));
    li.querySelector(".move-down").addEventListener("click", () => moveWaypoint(index, 1));
    li.querySelector(".remove-waypoint").addEventListener("click", () => removeWaypoint(wp.id));
    els.waypointList.append(li);
  });

  if (window.lucide) window.lucide.createIcons();
  updateMetrics();
}

function moveWaypoint(index, delta) {
  const nextIndex = index + delta;
  const [wp] = state.waypoints.splice(index, 1);
  state.waypoints.splice(nextIndex, 0, wp);
  resetRoute();
  renderWaypoints();
}

function removeWaypoint(id) {
  state.waypoints = state.waypoints.filter((wp) => wp.id !== id);
  resetRoute();
  renderWaypoints();
  setStatus("Waypoint removed.");
}

function updateMetrics(distance = totalDistance(state.routePoints)) {
  els.distanceMetric.textContent = formatMiles(distance || 0);
  els.mobileDistanceMetric.textContent = formatMiles(distance || 0);
  els.buildRouteButton.disabled = state.waypoints.length < 2;
  els.mobileBuildRouteButton.disabled = state.waypoints.length < 2;
  els.startRunButton.disabled = state.steps.length === 0;
  els.mobileStartRunButton.disabled = state.steps.length === 0;
  els.undoButton.disabled = state.waypoints.length === 0;
  els.clearButton.disabled = state.waypoints.length === 0;
  els.mobileClearRouteButton.hidden = state.waypoints.length === 0;
  els.reverseButton.disabled = state.waypoints.length < 2;
  const hasBuiltRoute = state.steps.length > 0;
  els.mobileBuildRouteButton.hidden = hasBuiltRoute || state.isBuildingRoute;
  els.mobileRunSummary.hidden = !hasBuiltRoute;
}

function routeOriginFromMap() {
  if (state.waypoints[0]) {
    return {
      label: "Waypoint 1",
      latlng: { lat: state.waypoints[0].lat, lng: state.waypoints[0].lng },
    };
  }
  if (state.userMarker) {
    const markerPosition = state.userMarker.getLatLng();
    return {
      label: "Current location",
      latlng: { lat: markerPosition.lat, lng: markerPosition.lng },
    };
  }
  const center = map.getCenter();
  return {
    label: "Map center",
    latlng: { lat: center.lat, lng: center.lng },
  };
}

async function routeOrigin() {
  try {
    const position = await getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000,
    });
    const latlng = { lat: position.coords.latitude, lng: position.coords.longitude };
    setUserMarker(latlng);
    return { label: "Current location", latlng };
  } catch {
    return routeOriginFromMap();
  }
}

function buildLoopWaypoints(origin, scaleMeters, pattern = AUTO_ROUTE_PATTERNS[0], bearing = 0) {
  return pattern.points.map(([north, east], index) => {
    const offset = rotateOffset(north * scaleMeters, east * scaleMeters, bearing);
    const latlng = offsetLatLng(origin, offset.north, offset.east);
    const isLast = index === pattern.points.length - 1;
    return {
      ...latlng,
      label: index === 0 ? "Start" : isLast ? "Finish" : `Turn ${index}`,
    };
  }).map((wp) => ({
    id: crypto.randomUUID(),
    lat: wp.lat,
    lng: wp.lng,
    label: wp.label,
  }));
}

function cloneWaypoints(waypoints) {
  return waypoints.map((waypoint) => ({ ...waypoint }));
}

async function evaluateAutoRouteCandidate(waypoints, targetMeters) {
  try {
    const route = await fetchRouteForWaypoints(waypoints);
    const snappedWaypoints = waypoints.map((waypoint) => {
      const snapped = closestPointOnRoute(waypoint, route.points);
      return {
        ...waypoint,
        lat: snapped.lat,
        lng: snapped.lng,
      };
    });
    return {
      distance: route.distance,
      route,
      targetDelta: route.distance - targetMeters,
      waypoints: snappedWaypoints,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function findShortestRouteAtLeastTarget(origin, targetMeters) {
  let bestCandidate = null;

  for (const pattern of AUTO_ROUTE_PATTERNS) {
    for (const bearing of AUTO_ROUTE_BEARINGS) {
      let lowScale = targetMeters / 16;
      let highScale = targetMeters / 4;
      let highCandidate = null;

      for (let expansion = 0; expansion < 4; expansion += 1) {
        highCandidate = await evaluateAutoRouteCandidate(
          buildLoopWaypoints(origin, highScale, pattern, bearing),
          targetMeters,
        );
        if (!highCandidate) break;
        if (highCandidate.distance >= targetMeters) break;
        lowScale = highScale;
        highScale *= 1.45;
      }

      if (!highCandidate) continue;
      if (highCandidate.distance < targetMeters) continue;

      let localBest = highCandidate;
      for (let iteration = 0; iteration < AUTO_ROUTE_SEARCH_ITERATIONS; iteration += 1) {
        const midScale = (lowScale + highScale) / 2;
        const candidate = await evaluateAutoRouteCandidate(
          buildLoopWaypoints(origin, midScale, pattern, bearing),
          targetMeters,
        );
        if (!candidate) break;

        if (candidate.distance >= targetMeters) {
          localBest = candidate.distance < localBest.distance ? candidate : localBest;
          highScale = midScale;
        } else {
          lowScale = midScale;
        }
      }

      bestCandidate = !bestCandidate || localBest.distance < bestCandidate.distance
        ? localBest
        : bestCandidate;
    }
  }

  return bestCandidate;
}

async function buildAutomaticRoute() {
  const targetMeters = Number(els.autoRouteDistance.value);
  const selectedLabel = els.autoRouteDistance.options[els.autoRouteDistance.selectedIndex].text;

  els.autoBuildRouteButton.disabled = true;
  try {
    setStatus(`Creating a ${selectedLabel} route...`);
    const origin = await routeOrigin();
    map.setView(origin.latlng, USER_MAP_ZOOM);
    const chosenRoute = await findShortestRouteAtLeastTarget(origin.latlng, targetMeters);
    if (!chosenRoute) {
      setStatus("Could not build an automatic route. Try adding waypoints manually.");
      return;
    }

    state.waypoints = cloneWaypoints(chosenRoute.waypoints);
    resetRoute();
    drawRoute(chosenRoute.route.points, chosenRoute.route.distance);
    state.steps = chosenRoute.route.steps;
    renderWaypoints();
    renderCues();
    updateMetrics(chosenRoute.route.distance);
    const builtDistance = chosenRoute.distance || totalDistance(state.routePoints);
    const distanceText = formatMiles(builtDistance);
    const targetNote = builtDistance >= targetMeters ? "at least your target" : "under your target";
    setStatus(`Auto route built for ${selectedLabel}: ${distanceText}, ${targetNote}. Adjust waypoints if you want to fine tune it.`);
    speak(`Auto route ready. ${distanceText} planned.`, true);
    if (isMobileLayout()) closeRouteControls();
  } finally {
    els.autoBuildRouteButton.disabled = false;
  }
}

async function handleBuildRouteClick() {
  state.isBuildingRoute = true;
  updateMetrics();
  try {
    const route = await buildRoute();
    if (route && isMobileLayout()) closeRouteControls();
  } finally {
    state.isBuildingRoute = false;
    updateMetrics();
  }
}

async function buildRoute({ announce = true } = {}) {
  if (state.waypoints.length < 2) {
    setStatus("Add at least two waypoints before building a route.");
    return null;
  }
  setStatus("Building route...");

  try {
    const position = await getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000,
    });
    const latlng = { lat: position.coords.latitude, lng: position.coords.longitude };
    setUserMarker(latlng);
    loadCurrentCity(latlng).catch(() => {});
    appendManualLoopEndpoint(latlng);
    renderWaypoints();
  } catch (error) {
    setStatus(`Could not add current location to close the loop: ${error.message}`);
    return null;
  }

  resetRoute();

  try {
    const route = await fetchRoute();
    snapWaypointsToRoute(route.points);
    drawRoute(route.points, route.distance);
    state.steps = route.steps;
    renderWaypoints();
    renderCues();
    updateMetrics(route.distance);
    const cue = state.steps[0]?.text || "Route ready.";
    setStatus(`Route ready: ${formatMiles(route.distance)} with ${state.steps.length} voice cues.`);
    if (announce) speak(`Route ready. ${formatMiles(route.distance)} planned. ${cue}`, true);
    return route;
  } catch (error) {
    const fallback = buildFallbackRoute();
    snapWaypointsToRoute(fallback.points);
    drawRoute(fallback.points, fallback.distance, true);
    state.steps = fallback.steps;
    renderWaypoints();
    renderCues();
    updateMetrics(fallback.distance);
    setStatus("The routing service was unavailable, so a direct waypoint route was drawn.");
    if (announce) speak("Routing service unavailable. Direct waypoint route is ready.", true);
    console.error(error);
    return fallback;
  }
}

function clearRoute() {
  state.waypoints = [];
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  resetRoute();
  renderWaypoints();
  setStatus("Route cleared.");
}

async function fetchRoute() {
  return fetchRouteForWaypoints(state.waypoints);
}

async function fetchRouteForWaypoints(waypoints) {
  const base = els.routerInput.value.replace(/\/$/, "");
  const coords = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");
  const url = `${base}/${coords}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Route request failed: ${response.status}`);
  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route) throw new Error("No route returned.");

  const points = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  const cumulativeDistances = cumulativeRouteDistances(points);
  const steps = route.legs.flatMap((leg) =>
    leg.steps.map((step) => {
      const [lng, lat] = step.maneuver.location;
      const point = { lat, lng };
      return {
        lat,
        lng,
        distance: step.distance,
        progress: routeProgressForPoint(point, points, cumulativeDistances),
        text: instructionFromStep(step),
        short: shortInstruction(step),
      };
    }),
  );
  return { points, steps, distance: route.distance };
}

function buildFallbackRoute() {
  const points = state.waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng }));
  const cumulativeDistances = cumulativeRouteDistances(points);
  const steps = state.waypoints.slice(1).map((wp, index) => ({
    lat: wp.lat,
    lng: wp.lng,
    distance: distanceMeters(points[index], points[index + 1]),
    progress: cumulativeDistances[index + 1],
    text: `Continue to waypoint ${index + 2}.`,
    short: `Waypoint ${index + 2}`,
  }));
  return { points, steps, distance: totalDistance(points) };
}

function instructionFromStep(step) {
  const road = step.name ? ` onto ${step.name}` : "";
  const modifier = step.maneuver.modifier ? ` ${step.maneuver.modifier}` : "";
  const action = step.maneuver.type.replaceAll("_", " ");
  if (action === "depart") return `Start running${road}.`;
  if (action === "arrive") return "You have arrived at the finish.";
  if (action === "turn") return `Turn${modifier}${road}.`;
  if (action === "new name") return `Continue${road}.`;
  if (action === "roundabout") return `Enter the roundabout${road}.`;
  return `${capitalize(action)}${modifier}${road}.`;
}

function shortInstruction(step) {
  if (step.maneuver.type === "arrive") return "Finish";
  if (step.maneuver.type === "depart") return "Start";
  return step.maneuver.modifier || step.maneuver.type.replaceAll("_", " ");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function drawRoute(points, distance, dashed = false) {
  state.routePoints = points;
  state.routeCumulativeDistances = cumulativeRouteDistances(points);
  state.routeLayer = L.polyline(points, {
    color: dashed ? "#b17b10" : "#2266d8",
    dashArray: dashed ? "8 9" : null,
    lineCap: "round",
    opacity: 0.92,
    weight: 6,
  }).addTo(map);
  map.fitBounds(state.routeLayer.getBounds(), { padding: [38, 38] });
  updateMetrics(distance);
}

function renderCues() {
  cueLayer.clearLayers();
  state.steps.forEach((step, index) => {
    L.circleMarker([step.lat, step.lng], {
      color: "#18201f",
      fillColor: index === 0 ? "#0e8f6d" : "#b17b10",
      fillOpacity: 0.9,
      radius: 6,
      weight: 2,
    })
      .addTo(cueLayer)
      .bindTooltip(step.text);
  });
}

function startRun() {
  if (!state.steps.length) {
    setStatus("Build a route before starting navigation.");
    return;
  }
  window.speechSynthesis?.cancel();
  speak("Voice navigation started. Waiting for your location.", true);

  if (!navigator.geolocation) {
    setStatus("Geolocation is not available in this browser.");
    return;
  }

  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = navigator.geolocation.watchPosition(
    (position) => handlePosition(position.coords.latitude, position.coords.longitude),
    (error) => setStatus(`Location error: ${error.message}`),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 },
  );
  setStatus("Run navigation is active.");
}

function handlePosition(lat, lng) {
  const current = { lat, lng };
  setUserMarker(current);

  const cueDistance = Number(els.cueDistanceInput.value);
  const currentProgress = routeProgressForPoint(current, state.routePoints, state.routeCumulativeDistances);
  for (let index = state.activeStepIndex; index < state.steps.length; index += 1) {
    if (state.spokenSteps.has(index)) continue;
    const step = state.steps[index];
    const distanceToCue = step.progress - currentProgress;
    if (distanceToCue < -cueDistance) {
      state.spokenSteps.add(index);
      state.activeStepIndex = index + 1;
      continue;
    }
    if (distanceToCue <= cueDistance) {
      state.spokenSteps.add(index);
      state.activeStepIndex = index + 1;
      speak(`${step.text} In ${Math.round(Math.max(0, distanceToCue))} meters.`);
      updateMetrics();
    }
    break;
  }
}

function centerMapOnCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus("Location is not available in this browser. Click the map to add your first waypoint.");
    return;
  }

  setStatus("Finding your location...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = { lat: position.coords.latitude, lng: position.coords.longitude };
      map.setView(latlng, USER_MAP_ZOOM);
      setUserMarker(latlng);
      loadCurrentCity(latlng).catch(() => {});
      const addedWaypoint = addCurrentLocationAsWaypointOne(latlng);
      setStatus(
        addedWaypoint
          ? "Current location added as waypoint 1. Add another point or build the route."
          : "Centered on your location.",
      );
    },
    () => {
      setStatus("Could not access your location. Click the map to add your first waypoint.");
    },
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 12000 },
  );
}

async function searchPlace() {
  const query = els.searchInput.value.trim();
  if (!query) return;
  setStatus("Searching...");
  const searchOrigin = routeOriginFromMap().latlng;
  const currentCity = await currentCityForSearch(searchOrigin);
  const localizedQuery = searchQueryWithCity(query, currentCity);
  const lngDelta = SEARCH_VIEWBOX_DELTA / Math.max(Math.cos((searchOrigin.lat * Math.PI) / 180), 0.2);
  const params = new URLSearchParams({
    format: "json",
    q: localizedQuery,
    limit: String(SEARCH_RESULT_LIMIT),
    viewbox: [
      searchOrigin.lng - lngDelta,
      searchOrigin.lat + SEARCH_VIEWBOX_DELTA,
      searchOrigin.lng + lngDelta,
      searchOrigin.lat - SEARCH_VIEWBOX_DELTA,
    ].join(","),
  });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const places = await response.json();
  const place = places
    .map((candidate) => ({
      ...candidate,
      distanceFromOrigin: distanceMeters(searchOrigin, {
        lat: Number(candidate.lat),
        lng: Number(candidate.lon),
      }),
    }))
    .sort((a, b) => a.distanceFromOrigin - b.distanceFromOrigin)[0];
  if (!place) {
    setStatus(currentCity ? `No matching place found in ${currentCity}.` : "No matching place found.");
    return;
  }
  const latlng = { lat: Number(place.lat), lng: Number(place.lon) };
  map.setView(latlng, 15);
  addWaypoint(latlng, place.display_name.split(",")[0]);
}

function locateUser() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not available in this browser.");
    return;
  }
  setStatus("Finding your location...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = { lat: position.coords.latitude, lng: position.coords.longitude };
      map.setView(latlng, 16);
      setUserMarker(latlng);
      loadCurrentCity(latlng).catch(() => {});
      const addedWaypoint = addCurrentLocationAsWaypointOne(latlng);
      if (!addedWaypoint) setStatus("Centered on your location.");
    },
    (error) => setStatus(`Location error: ${error.message}`),
    { enableHighAccuracy: true, timeout: 12000 },
  );
}

map.on("click", (event) => addWaypoint(event.latlng, `Waypoint ${state.waypoints.length + 1}`));

waypointLayer.on("popupopen", (event) => {
  const button = event.popup.getElement().querySelector("button[data-id]");
  if (button) button.addEventListener("click", () => removeWaypoint(button.dataset.id));
});

els.mobileControlsButton.addEventListener("click", openRouteControls);
els.mobileCloseControlsButton.addEventListener("click", closeRouteControls);
els.buildRouteButton.addEventListener("click", handleBuildRouteClick);
els.mobileBuildRouteButton.addEventListener("click", handleBuildRouteClick);
els.undoButton.addEventListener("click", () => removeWaypoint(state.waypoints.at(-1)?.id));
els.clearButton.addEventListener("click", clearRoute);
els.mobileClearRouteButton.addEventListener("click", clearRoute);
els.locateButton.addEventListener("click", locateUser);
els.autoBuildRouteButton.addEventListener("click", buildAutomaticRoute);
els.startRunButton.addEventListener("click", startRun);
els.mobileStartRunButton.addEventListener("click", startRun);
els.reverseButton.addEventListener("click", () => {
  state.waypoints.reverse();
  resetRoute();
  renderWaypoints();
  setStatus("Waypoint order reversed.");
});
els.searchButton.addEventListener("click", searchPlace);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPlace();
});
els.cueDistanceInput.addEventListener("input", () => {
  els.cueDistanceLabel.textContent = `${els.cueDistanceInput.value} m`;
});

renderWaypoints();
if (window.lucide) window.lucide.createIcons();
centerMapOnCurrentLocation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
