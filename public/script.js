// Helsinki Railway Station coordinates (default location)
const HELSINKI_STATION = {
  lat: 60.1719,
  lng: 24.9414,
};

// Get stored location or use default
const params = new URLSearchParams(window.location.search);
const storedLocation =
  params.has("lat") && params.has("lng") && params.has("zoom")
    ? {
        center: [parseFloat(params.get("lat")), parseFloat(params.get("lng"))],
        zoom: parseInt(params.get("zoom")),
      }
    : localStorage.getItem("mapState")
    ? JSON.parse(localStorage.getItem("mapState"))
    : {
        center: [HELSINKI_STATION.lat, HELSINKI_STATION.lng],
        zoom: 15,
      };

// Initialize the map with stored or default location
const map = L.map("map").setView(storedLocation.center, storedLocation.zoom);

// Add OpenStreetMap tiles
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// Store the current grid layer group
let gridLayerGroup = L.layerGroup().addTo(map);

// Store the cache visualization layer group
let cacheLayerGroup = L.layerGroup();

// Track current view mode
let isShowingCache = false;

// Create view toggle control
const viewToggle = L.control({ position: "bottomleft" });

viewToggle.onAdd = function () {
  this._div = L.DomUtil.create("div", "view-toggle-control");
  this._div.innerHTML = `
    <button class="view-toggle-button" title="Toggle between grid and cache view">
      <span class="view-label">Show Cache</span>
    </button>
  `;

  L.DomEvent.disableClickPropagation(this._div);

  this._div.querySelector("button").onclick = () => {
    isShowingCache = !isShowingCache;
    updateView();

    // Update button text
    const label = this._div.querySelector(".view-label");
    label.textContent = isShowingCache ? "Show Grid" : "Show Cache";
  };

  return this._div;
};

viewToggle.addTo(map);

// Create info control
const info = L.control();

info.onAdd = function () {
  this._div = L.DomUtil.create("div", "info-overlay");
  this.update();
  return this._div;
};

info.update = async function (isMoving = false) {
  if (isMoving) {
    this._div.classList.add("updating");
    this._div.innerHTML = `
      <h4>Map Information</h4>
      <i>Moving map... information will update when movement ends</i>
    `;
    return;
  }

  try {
    const bounds = map.getBounds();
    const center = map.getCenter();
    const zoom = map.getZoom();

    // Fetch info data
    const infoResponse = await fetch(
      `/api/info?lat=${center.lat}&lng=${
        center.lng
      }&zoom=${zoom}&north=${bounds.getNorth()}&south=${bounds.getSouth()}&east=${bounds.getEast()}&west=${bounds.getWest()}`
    );
    const info = await infoResponse.json();

    this._div.classList.remove("updating");
    this._div.innerHTML = `
      <h4>Map Information</h4>
      <p>Zoom level: ${info.zoom}</p>
      <p>Tiles: x(${info.tiles.x.min}-${info.tiles.x.max}), y(${info.tiles.y.min}-${info.tiles.y.max})</p>
      <p>Viewport: ${info.viewport.width}m × ${info.viewport.height}m</p>
      <p>Diagonal: ${info.viewport.diagonal}m</p>
    `;
  } catch (error) {
    console.error("Error fetching map information:", error);
    this._div.innerHTML = `<h4>Map Information</h4>Error loading data`;
  }
};

info.addTo(map);

// Add CSS for the overlay
const style = document.createElement("style");
style.textContent = `
  .info-overlay {
    padding: 6px 8px;
    font: 14px/16px Arial, Helvetica, sans-serif;
    background: white;
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.2);
    border-radius: 5px;
    transition: background-color 0.3s;
  }
  .info-overlay.updating {
    background: rgba(255, 255, 200, 0.8);
  }
  .info-overlay h4 {
    margin: 0 0 5px;
    color: #777;
  }
  .info-overlay i {
    color: #666;
    font-size: 0.9em;
  }
`;
document.head.appendChild(style);

// Keep track of current zoom level
let currentZoomLevel = map.getZoom();

// Function to fetch and display GeoJSON data
async function fetchAndDisplayGeoJSON() {
  try {
    // Get current zoom level
    const zoom = map.getZoom();

    // Always clear layers on zoom change or if zoom hasn't been set
    const zoomChanged = zoom !== currentZoomLevel;
    if (zoomChanged) {
      gridLayerGroup.clearLayers();
    }

    const bounds = map.getBounds();

    // Update info overlay
    info.update();

    // Use relative path for API with zoom level
    const response = await fetch(
      `/api/grid?north=${bounds.getNorth()}&south=${bounds.getSouth()}&east=${bounds.getEast()}&west=${bounds.getWest()}&zoom=${zoom}`
    );
    const geojsonData = await response.json();

    // Update current zoom level after successful fetch
    if (zoomChanged) {
      currentZoomLevel = zoom;
    }

    // Remove old delay info if it exists
    const oldDelayInfo = document.querySelector(".delay-info-container");
    if (oldDelayInfo) {
      oldDelayInfo.remove();
    }

    // Create new delay info
    const delayInfo = document.createElement("div");
    delayInfo.className = "delay-info-container";
    delayInfo.innerHTML = `
      <p>Load simulation:</p>
      <p class="delay-info ${
        geojsonData.metadata.currentDelay > 0 ? "active" : ""
      }">
        Delay: <span class="delay-value">${
          geojsonData.metadata.currentDelay
        }</span>ms
        (${geojsonData.metadata.activeRequests} active)
        <br>
        Cache: ${geojsonData.metadata.cacheInfo.cached} cached, 
        ${geojsonData.metadata.cacheInfo.queried} queried
        <br>
        Zoom ${geojsonData.metadata.cacheInfo.zoomLevel} tiles: 
        <span class="cache-stats ${
          geojsonData.metadata.cacheInfo.tilesInZoom.cached ===
          geojsonData.metadata.cacheInfo.tilesInZoom.total
            ? "all-cached"
            : ""
        }">
          ${geojsonData.metadata.cacheInfo.tilesInZoom.cached}/${
      geojsonData.metadata.cacheInfo.tilesInZoom.total
    }
        </span> in cache
      </p>
    `;
    document.querySelector(".info-overlay").appendChild(delayInfo);

    // Add GeoJSON to the layer group
    L.geoJSON(geojsonData, {
      style: function (feature) {
        return {
          color: feature.properties.color,
          weight: feature.properties.weight,
          opacity: feature.properties.opacity,
          dashArray: feature.properties.dashArray,
        };
      },
      onEachFeature: function (feature, layer) {
        if (feature.properties && feature.properties.name) {
          layer.bindPopup(feature.properties.name);
        }
      },
    }).addTo(gridLayerGroup);
  } catch (error) {
    console.error("Error fetching GeoJSON data:", error);
  }
}

// Call the function when the page loads and when map moves or zooms
fetchAndDisplayGeoJSON();
map.on("movestart", () => info.update(true));
map.on("zoomstart", () => info.update(true));
map.on("moveend", () => {
  // Clear grid if zoom changed during movement
  if (map.getZoom() !== currentZoomLevel) {
    gridLayerGroup.clearLayers();
  }
  updateView();
  info.update();
  const center = map.getCenter();
  const state = {
    center: [center.lat, center.lng],
    zoom: map.getZoom(),
  };

  // Update localStorage
  localStorage.setItem("mapState", JSON.stringify(state));

  // Update URL without reloading the page
  const newUrl = `${window.location.pathname}?lat=${center.lat}&lng=${
    center.lng
  }&zoom=${map.getZoom()}`;
  window.history.replaceState(state, "", newUrl);
});
map.on("zoomend", () => {
  // Clear grid on zoom change
  gridLayerGroup.clearLayers();
  updateView();
  info.update();
});

// Add OSM tile preview control
const tilePreview = L.control({ position: "bottomright" });

tilePreview.onAdd = function () {
  this._div = L.DomUtil.create("div", "tile-preview-control");
  this._div.innerHTML = `
    <div class="tile-button" title="Click to show current OSM tile">
      <svg width="20" height="20" viewBox="0 0 20 20">
        <rect x="2" y="2" width="16" height="16" fill="none" stroke="black" stroke-width="2"/>
        <rect x="4" y="4" width="12" height="12" fill="rgba(255,255,255,0.6)"/>
      </svg>
    </div>
  `;

  // Prevent map click events when clicking the control
  L.DomEvent.disableClickPropagation(this._div);

  this._div.onclick = () => this.showTilePopup();
  return this._div;
};

// Add function to calculate fully visible tiles in viewport
function getVisibleTiles(bounds, zoom) {
  const nwPoint = map.project(bounds.getNorthWest(), zoom);
  const sePoint = map.project(bounds.getSouthEast(), zoom);

  const tileMin = nwPoint.divideBy(256).ceil();
  const tileMax = sePoint.divideBy(256).floor();

  const tiles = [];
  // Only add tiles if they're fully visible (min is less than max)
  if (tileMin.x <= tileMax.x && tileMin.y <= tileMax.y) {
    // Calculate grid dimensions
    const gridWidth = tileMax.x - tileMin.x + 1;
    const gridHeight = tileMax.y - tileMin.y + 1;

    // Set the grid template columns to match the actual tile layout
    const gridStyle = `grid-template-columns: repeat(${gridWidth}, 64px);`;

    // Collect tiles in map order (top to bottom)
    for (let y = tileMin.y; y <= tileMax.y; y++) {
      for (let x = tileMin.x; x <= tileMax.x; x++) {
        tiles.push({ x, y, z: zoom });
      }
    }

    return { tiles, gridStyle, width: gridWidth, height: gridHeight };
  }
  return { tiles: [], gridStyle: "", width: 0, height: 0 };
}

// Update the tile preview popup
tilePreview.showTilePopup = function () {
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const center = map.getCenter();

  const { tiles, gridStyle, width, height } = getVisibleTiles(bounds, zoom);

  const content = document.createElement("div");
  content.className = "tile-popup";
  content.innerHTML = `
    <h4>Visible OSM Tiles</h4>
    <p>Zoom Level: ${zoom} (${width}×${height} tiles)</p>
    <div class="tile-grid" style="${gridStyle}">
      ${tiles
        .map(
          (tile) => `
        <div class="tile-container">
          <img src="https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png" 
               width="64" height="64" 
               title="${tile.z}/${tile.x}/${tile.y}"
               alt="OSM tile">
        </div>
      `
        )
        .join("")}
    </div>
  `;

  // Calculate popup size based on grid dimensions
  const popupWidth = width * 64 + (width - 1) * 2 + 4; // tile width + gaps + padding
  const maxWidth = Math.max(200, popupWidth); // ensure minimum width of 200px

  L.popup({
    maxWidth: maxWidth,
    minWidth: maxWidth, // Force exact width
    className: "tile-popup-container",
  })
    .setLatLng(center)
    .setContent(content)
    .openOn(map);
};

tilePreview.addTo(map);

// Update the CSS
const tileStyle = document.createElement("style");
tileStyle.textContent = `
  .tile-preview-control {
    background: white;
    padding: 5px;
    border-radius: 4px;
    box-shadow: 0 1px 5px rgba(0,0,0,0.4);
    cursor: pointer;
  }
  
  .tile-preview-control:hover {
    background: #f4f4f4;
  }
  
  .tile-button {
    width: 20px;
    height: 20px;
  }
  
  .tile-popup {
    text-align: center;
    padding: 12px 12px 14px;
  }
  
  .tile-popup h4 {
    margin: 0 0 8px;
    color: #333;
    font-size: 14px;
  }
  
  .tile-popup p {
    margin: 0 0 12px;
    font-size: 12px;
    color: #666;
  }
  
  .tile-grid {
    display: grid;
    gap: 1px;
    background: #ddd;
    border-radius: 3px;
    justify-content: center;
    padding: 1px;
  }
  
  .tile-container {
    width: 64px;
    height: 64px;
    background: white;
  }
  
  .tile-container img {
    display: block;
    width: 100%;
    height: 100%;
  }
  
  .tile-popup-container .leaflet-popup-content-wrapper {
    padding: 0;
    overflow: hidden;
    border-radius: 4px;
  }
  
  .tile-popup-container .leaflet-popup-content {
    margin: 0;
    width: auto !important;
  }
  
  .tile-popup-container .leaflet-popup-tip {
    background: white;
  }
`;
document.head.appendChild(tileStyle);

// Function to convert tile coordinates to bounds
function getTileBounds(z, x, y) {
  function tile2lat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function tile2lng(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }

  const north = tile2lat(y, z);
  const south = tile2lat(y + 1, z);
  const west = tile2lng(x, z);
  const east = tile2lng(x + 1, z);

  return L.latLngBounds([south, west], [north, east]);
}

// Function to update the current view
function updateView() {
  // Clear both layers before switching views
  gridLayerGroup.clearLayers();
  cacheLayerGroup.clearLayers();

  if (isShowingCache) {
    map.addLayer(cacheLayerGroup);
    updateCacheVisualization();
  } else {
    map.addLayer(gridLayerGroup);
    fetchAndDisplayGeoJSON();
  }
}

// Function to visualize cached tiles
async function updateCacheVisualization() {
  const bounds = map.getBounds();
  const zoom = map.getZoom();

  // Get current cache status
  const response = await fetch(
    `/api/grid?north=${bounds.getNorth()}&south=${bounds.getSouth()}&east=${bounds.getEast()}&west=${bounds.getWest()}&zoom=${zoom}`
  );
  const data = await response.json();

  // Get tile information
  const { tiles: tileNames } = getTileNames(
    {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    },
    zoom
  );

  // Create rectangles for cached tiles
  tileNames.forEach(async (tileName) => {
    const [z, x, y] = tileName.split("/").map(Number);
    const key = createTileKey(tileName);

    try {
      const contentKey = await getCache(key);
      if (contentKey) {
        const bounds = getTileBounds(z, x, y);
        L.rectangle(bounds, {
          color: "#2980b9", // Darker blue border
          weight: 2, // Thicker border
          fillColor: "#3498db", // Lighter blue fill
          fillOpacity: 0.4, // More opaque
          dashArray: "5, 5", // Dashed border
          className: "cache-box", // Add class for hover effects
        }).addTo(cacheLayerGroup);
      }
    } catch (error) {
      console.error("Error checking cache for tile:", tileName, error);
    }
  });
}
