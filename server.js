import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { setupDatabase } from "./db/generate-grid.js";
import pg from "pg";
import { setTimeout } from "timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;

app.use(cors());

// Serve static files from the public directory
app.use(express.static(join(__dirname, "public")));

// Create database pool
const pool = new pg.Pool({
  connectionString:
    process.env.POSTGRES_URL || "postgres://postgres:postgres@db:5432/gis",
});

// Add request tracking
const requestTracker = {
  activeRequests: 0,
  lastRequestTime: 0,
  baseDelay: 100, // Base delay in ms
  maxDelay: 10000, // Maximum delay in ms
  windowSize: 500, // Time window in ms to consider requests "concurrent"
  activeRequests: new Set(), // Track active request IDs
  lastRequestId: 0,

  getCurrentDelay() {
    const activeCount = this.activeRequests.size;
    if (activeCount === 0) {
      return 0;
    }

    return Math.min(this.baseDelay * Math.pow(2, activeCount), this.maxDelay);
  },

  async trackRequest() {
    const requestId = ++this.lastRequestId;
    this.activeRequests.add(requestId);

    // Calculate delay based on concurrent requests
    const activeCount = this.activeRequests.size;
    const delay = Math.min(
      this.baseDelay * Math.pow(2, activeCount - 1),
      this.maxDelay
    );

    // Apply delay if needed
    if (delay > 0) {
      console.log(
        `Delaying request ${requestId} by ${delay}ms (active: ${activeCount})`
      );
      await setTimeout(delay);
    }
    return { delay, activeCount, requestId };
  },

  completeRequest(requestId) {
    this.activeRequests.delete(requestId);
  },
};

// Get grid lines from database
async function getGridLines(bounds, zoomLevel) {
  // Don't query grid lines for zoom levels 10 or less
  if (zoomLevel <= 10) {
    return [];
  }

  // Determine grid type based on zoom level
  let gridType;
  if (zoomLevel > 17) {
    gridType = "50m";
  } else if (zoomLevel > 13) {
    gridType = "100m";
  } else {
    gridType = "500m";
  }

  // Query database for grid lines
  const result = await pool.query(
    `
    SELECT 
      name,
      color,
      ST_AsGeoJSON(geom)::json as geometry
    FROM geolines 
    WHERE line_type = $1
    AND ST_Intersects(
      geom,
      ST_MakeEnvelope($2, $3, $4, $5, 4326)
    )
  `,
    [gridType, bounds.west, bounds.south, bounds.east, bounds.north]
  );

  // Convert to GeoJSON features
  return result.rows.map((row) => ({
    type: "Feature",
    properties: {
      name: row.name,
      color: row.color,
      weight: 2,
      opacity: 0.7,
      dashArray:
        gridType === "50m"
          ? "10, 10"
          : gridType === "100m"
          ? "15, 10"
          : undefined,
    },
    geometry: row.geometry,
  }));
}

app.get("/api/grid", async (req, res) => {
  const bounds = {
    north: parseFloat(req.query.north) || 60.1819,
    south: parseFloat(req.query.south) || 60.1619,
    east: parseFloat(req.query.east) || 24.9514,
    west: parseFloat(req.query.west) || 24.9314,
  };

  const zoomLevel = parseFloat(req.query.zoom) || 1000;

  try {
    // Track request and apply delay if needed
    const { delay, activeCount, requestId } =
      await requestTracker.trackRequest();

    const features = await getGridLines(bounds, zoomLevel);

    // Complete request tracking
    requestTracker.completeRequest(requestId);

    res.json({
      type: "FeatureCollection",
      features,
      metadata: {
        currentDelay: delay,
        activeRequests: activeCount,
      },
    });
  } catch (error) {
    // Ensure request is marked complete even on error
    if (requestId) {
      requestTracker.completeRequest(requestId);
    }

    console.error("Error fetching grid lines:", error);
    res.status(500).json({
      type: "FeatureCollection",
      features: [],
    });
  }
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

// Add database check on startup
async function checkDatabase() {
  try {
    await setupDatabase();
  } catch (error) {
    console.error("Failed to setup database:", error);
    process.exit(1);
  }
}

// Call before starting server
await checkDatabase();

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
