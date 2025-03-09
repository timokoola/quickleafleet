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
function generateGridLines(bounds) {
  const features = [];
  const gridSize = 100; // meters

  // Convert grid size to degrees at the center latitude
  const centerLat = (bounds.north + bounds.south) / 2;
  const gridSizeLat = metersToDegreesLat(gridSize);
  const gridSizeLng = metersToDegreesLng(gridSize, centerLat);

  // Find grid starting points (snap to grid)
  const startLat = snapToGrid(bounds.south / gridSizeLat, 1) * gridSizeLat;
  const startLng = snapToGrid(bounds.west / gridSizeLng, 1) * gridSizeLng;
  const endLat = bounds.north;
  const endLng = bounds.east;

  // Generate horizontal lines
  for (let lat = startLat; lat <= endLat; lat += gridSizeLat) {
    features.push({
      type: "Feature",
      properties: {
        color: generateColor(lat, startLng),
        name: `Latitude ${lat.toFixed(6)}`,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [bounds.west, lat],
          [bounds.east, lat],
        ],
      },
    });
  }

  // Generate vertical lines
  for (let lng = startLng; lng <= endLng; lng += gridSizeLng) {
    features.push({
      type: "Feature",
      properties: {
        color: generateColor(startLat, lng),
        name: `Longitude ${lng.toFixed(6)}`,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [lng, bounds.south],
          [lng, bounds.north],
        ],
      },
    });
  }

  return features;
}

app.get("/api/grid", (req, res) => {
  // Get bounds from query parameters or use default bounds around Helsinki Station
  const bounds = {
    north: parseFloat(req.query.north) || 60.1819,
    south: parseFloat(req.query.south) || 60.1619,
    east: parseFloat(req.query.east) || 24.9514,
    west: parseFloat(req.query.west) || 24.9314,
  };

  const geojson = {
    type: "FeatureCollection",
    features: generateGridLines(bounds),
  };

  res.json(geojson);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
