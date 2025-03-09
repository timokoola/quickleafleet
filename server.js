import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;

app.use(cors());

// Serve static files from the public directory
app.use(express.static(join(__dirname, "public")));

// Convert meters to degrees (approximate)
const metersToDegreesLat = (meters) => meters / 111111;
const metersToDegreesLng = (meters, lat) =>
  meters / (111111 * Math.cos((lat * Math.PI) / 180));

// Generate a color based on coordinates

// Find the nearest grid line start point

// Generate grid lines for the given bounds
function generateGridLines(bounds, zoomLevel) {
  const features = [];

  // Don't generate grid lines for zoom levels 10 or less
  if (zoomLevel <= 10) {
    return features;
  }

  // Determine grid size and style based on zoom level
  let gridSize, lineStyle;
  if (zoomLevel > 17) {
    gridSize = 50; // 50x50 meters
    lineStyle = {
      color: "red",
      dashArray: "10, 10",
      weight: 2,
      opacity: 0.7,
    };
  } else if (zoomLevel > 13) {
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
      weight: 1.5, // Reduced from 3 to 1.5
      opacity: 0.7, // Slightly reduced opacity
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

// Calculate distance between two points in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate OSM tile coordinates
function calculateOSMTile(lat, lng, zoom) {
  const tileX = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const tileY = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  return { tileX, tileY };
}

// Update the /api/info endpoint
app.get("/api/info", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const zoom = parseInt(req.query.zoom);
  const bounds = {
    north: parseFloat(req.query.north),
    south: parseFloat(req.query.south),
    east: parseFloat(req.query.east),
    west: parseFloat(req.query.west),
  };

  // Calculate viewport dimensions using haversine formula
  const viewportWidth = calculateDistance(
    bounds.north,
    bounds.west,
    bounds.north,
    bounds.east
  );
  const viewportHeight = calculateDistance(
    bounds.north,
    bounds.west,
    bounds.south,
    bounds.west
  );

  // Calculate diagonal distance
  const viewDiagonal = Math.sqrt(
    Math.pow(viewportWidth, 2) + Math.pow(viewportHeight, 2)
  );

  // Get tile range for the viewport
  const nw = calculateOSMTile(bounds.north, bounds.west, zoom);
  const se = calculateOSMTile(bounds.south, bounds.east, zoom);

  const info = {
    zoom,
    tiles: {
      zoom,
      x: { min: nw.tileX, max: se.tileX },
      y: { min: nw.tileY, max: se.tileY },
    },
    viewport: {
      width: Math.round(viewportWidth),
      height: Math.round(viewportHeight),
      diagonal: Math.round(viewDiagonal),
    },
  };

  res.json(info);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
