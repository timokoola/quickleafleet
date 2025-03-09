import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

app.use(cors());

// Serve static files from the public directory
app.use(express.static(join(__dirname, "public")));

// Convert meters to degrees (approximate)
const metersToDegreesLat = (meters) => meters / 111111;
const metersToDegreesLng = (meters, lat) =>
  meters / (111111 * Math.cos((lat * Math.PI) / 180));

// Generate a color based on coordinates
function generateColor(lat, lng) {
  // Use modular arithmetic to create repeating patterns
  const hue = (((lat * 100 + lng * 100) % 360) + 360) % 360;
  const saturation = 70;
  const lightness = 50;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Find the nearest grid line start point
function snapToGrid(coord, gridSize) {
  return Math.floor(coord / gridSize) * gridSize;
}

// Generate grid lines for the given bounds
function generateGridLines(bounds, zoomLevel) {
  const features = [];

  // Determine grid size and style based on zoom level
  let gridSize, lineStyle;
  if (zoomLevel < 250) {
    gridSize = 50; // 50x50 meters
    lineStyle = {
      color: "red",
      dashArray: "10, 10",
      weight: 2,
      opacity: 0.7,
    };
  } else if (zoomLevel < 1500) {
    gridSize = 100; // 100x100 meters
    lineStyle = {
      color: "blue",
      dashArray: "15, 10",
      weight: 2,
      opacity: 0.7,
    };
  } else {
    gridSize = 500; // 500x500 meters
    lineStyle = {
      color: "yellow",
      dashArray: "20, 20",
      weight: 3,
      opacity: 0.8,
    };
  }

  // Convert grid size to degrees at the center latitude
  const centerLat = (bounds.north + bounds.south) / 2;
  const gridSizeLat = metersToDegreesLat(gridSize);
  const gridSizeLng = metersToDegreesLng(gridSize, centerLat);

  // Calculate grid starting points based on fixed origin (0,0)
  const startLat = Math.floor(bounds.south / gridSizeLat) * gridSizeLat;
  const endLat = Math.ceil(bounds.north / gridSizeLat) * gridSizeLat;
  const startLng = Math.floor(bounds.west / gridSizeLng) * gridSizeLng;
  const endLng = Math.ceil(bounds.east / gridSizeLng) * gridSizeLng;

  // Generate horizontal lines at fixed intervals
  for (let lat = startLat; lat <= endLat; lat += gridSizeLat) {
    features.push({
      type: "Feature",
      properties: {
        ...lineStyle,
        name: `${gridSize}m grid line at ${lat.toFixed(6)}°N`,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [startLng, lat],
          [endLng, lat],
        ],
      },
    });
  }

  // Generate vertical lines at fixed intervals
  for (let lng = startLng; lng <= endLng; lng += gridSizeLng) {
    features.push({
      type: "Feature",
      properties: {
        ...lineStyle,
        name: `${gridSize}m grid line at ${lng.toFixed(6)}°E`,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [lng, startLat],
          [lng, endLat],
        ],
      },
    });
  }

  return features;
}

app.get("/api/grid", (req, res) => {
  const bounds = {
    north: parseFloat(req.query.north) || 60.1819,
    south: parseFloat(req.query.south) || 60.1619,
    east: parseFloat(req.query.east) || 24.9514,
    west: parseFloat(req.query.west) || 24.9314,
  };

  const zoomLevel = parseFloat(req.query.zoom) || 1000;

  const geojson = {
    type: "FeatureCollection",
    features: generateGridLines(bounds, zoomLevel),
  };

  res.json(geojson);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
