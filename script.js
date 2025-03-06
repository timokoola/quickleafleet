// Helsinki Railway Station coordinates
const HELSINKI_STATION = {
  lat: 60.1719,
  lng: 24.9414,
};

// Initialize the map
const map = L.map("map").setView(
  [HELSINKI_STATION.lat, HELSINKI_STATION.lng],
  15 // Increased zoom level to better see the grid
);

// Add OpenStreetMap tiles
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// Store the current grid layer
let currentGridLayer = null;

// Function to fetch and display GeoJSON data
async function fetchAndDisplayGeoJSON() {
  try {
    // Clear previous grid
    if (currentGridLayer) {
      map.removeLayer(currentGridLayer);
    }

    const bounds = map.getBounds();
    const response = await fetch(
      `http://localhost:3000/api/grid?north=${bounds.getNorth()}&south=${bounds.getSouth()}&east=${bounds.getEast()}&west=${bounds.getWest()}`
    );
    const geojsonData = await response.json();

    // Add GeoJSON to map with custom styling
    currentGridLayer = L.geoJSON(geojsonData, {
      style: function (feature) {
        return {
          color: feature.properties.color,
          weight: 2,
          opacity: 0.7,
        };
      },
      onEachFeature: function (feature, layer) {
        if (feature.properties && feature.properties.name) {
          layer.bindPopup(feature.properties.name);
        }
      },
    }).addTo(map);
  } catch (error) {
    console.error("Error fetching GeoJSON data:", error);
  }
}

// Call the function when the page loads and when map moves
fetchAndDisplayGeoJSON();
map.on("moveend", fetchAndDisplayGeoJSON);
