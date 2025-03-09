import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { setupDatabase } from "./db/generate-grid.js";
import pg from "pg";
import { setTimeout } from "timers/promises";
import Memcached from "memcached";

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

// Initialize Memcached client
const memcached = new Memcached(process.env.MEMCACHED_URL || "memcache:11211", {
  retries: 3,
  retry: 1000,
  timeout: 500,
  reconnect: 1000,
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

// Create cache key from OSM tile name
function createTileKey(tileName) {
  // Validate tile name format (z/x/y)
  const parts = tileName.split("/");
  if (parts.length !== 3) {
    throw new Error(`Invalid tile name format: ${tileName}`);
  }

  // Add prefix to avoid collisions with other cache keys
  return `tile:${tileName}`;
}

// Create cache key for a set of tiles

// Create cache key from JSON content
function createContentKey(data) {
  // Stringify with sorted keys for consistency
  const str = JSON.stringify(data, Object.keys(data).sort());

  // Create a simple hash of the string
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to base36 for shorter strings
  const hashStr = Math.abs(hash).toString(36);

  // Add prefix and timestamp for versioning
  return `content:${hashStr}`;
}

// Store JSON in cache with expiration
function setCache(key, value, expires = 300) {
  // default 5 minutes
  return new Promise((resolve, reject) => {
    memcached.set(key, JSON.stringify(value), expires, (err) => {
      if (err) {
        console.error(`Cache set error for key ${key}:`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Retrieve JSON from cache
function getCache(key) {
  return new Promise((resolve, reject) => {
    memcached.get(key, (err, data) => {
      if (err) {
        console.error(`Cache get error for key ${key}:`, err);
        reject(err);
      } else {
        resolve(data ? JSON.parse(data) : null);
      }
    });
  });
}

// Get grid lines from database
async function getGridLines(bounds, zoomLevel) {
  // Don't query grid lines for zoom levels 10 or less
  if (zoomLevel <= 10) {
    return {
      cached: [],
      queried: [],
      cacheStats: {
        cached: 0,
        total: 0,
      },
    };
  }

  // Get tile names for this request
  const { tiles: tileNames } = getTileNames(bounds, zoomLevel);

  // Check if we have cached content keys for these tiles
  const cachedContentKeys = await Promise.all(
    tileNames.map((tile) => getCache(createTileKey(tile)))
  );

  // Track which tiles have cached content
  const cachedTiles = new Map();
  const uncachedTiles = new Set();

  tileNames.forEach((tile, index) => {
    if (cachedContentKeys[index]) {
      cachedTiles.set(tile, cachedContentKeys[index]);
    } else {
      uncachedTiles.add(tile);
    }
  });

  // If we have content keys, try to get content from cache
  const uniqueContentKeys = [...new Set(cachedContentKeys.filter(Boolean))];
  const cachedContents =
    uniqueContentKeys.length > 0
      ? await Promise.all(uniqueContentKeys.map((key) => getCache(key)))
      : [];

  // Collect all cached features
  const cachedFeatures = cachedContents.filter(Boolean).flat();

  // If everything is cached, return early
  if (uncachedTiles.size === 0) {
    return {
      cached: cachedFeatures,
      queried: [],
      cacheStats: {
        cached: cachedTiles.size,
        total: tileNames.length,
      },
    };
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

  // Calculate bounding box for uncached tiles
  const uncachedBounds = {
    north: -90,
    south: 90,
    east: -180,
    west: 180,
  };

  // Function to convert tile coordinates to lat/lng
  function tile2LatLng(z, x, y) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return {
      lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
      lng: (x / Math.pow(2, z)) * 360 - 180,
    };
  }

  // Calculate bounds for uncached area
  Array.from(uncachedTiles).forEach((tile) => {
    const [z, x, y] = tile.split("/").map(Number);
    const nw = tile2LatLng(z, x, y);
    const se = tile2LatLng(z, x + 1, y + 1);
    uncachedBounds.north = Math.max(uncachedBounds.north, nw.lat);
    uncachedBounds.south = Math.min(uncachedBounds.south, se.lat);
    uncachedBounds.east = Math.max(uncachedBounds.east, se.lng);
    uncachedBounds.west = Math.min(uncachedBounds.west, nw.lng);
  });

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
    [
      gridType,
      uncachedBounds.west,
      uncachedBounds.south,
      uncachedBounds.east,
      uncachedBounds.north,
    ]
  );

  // Convert query results to GeoJSON features
  const features = result.rows.map((row) => ({
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

  // Create content key and store in cache
  const contentKey = createContentKey(features);
  await setCache(contentKey, features);

  // Store content key in tile caches
  await Promise.all(
    Array.from(uncachedTiles).map((tile) =>
      setCache(createTileKey(tile), contentKey, 3600)
    )
  );

  return {
    cached: cachedFeatures,
    queried: features,
    cacheStats: {
      cached: cachedTiles.size,
      total: tileNames.length,
    },
  };
}

app.get("/api/grid", async (req, res) => {
  const bounds = {
    north: parseFloat(req.query.north) || 60.1819,
    south: parseFloat(req.query.south) || 60.1619,
    east: parseFloat(req.query.east) || 24.9514,
    west: parseFloat(req.query.west) || 24.9314,
  };

  const zoomLevel = parseFloat(req.query.zoom) || 15;

  try {
    // Start request tracking
    let delay = 0;
    let activeCount = 0;
    let requestId;

    // Get grid data first to check if everything is cached
    const { cached, queried, cacheStats } = await getGridLines(
      bounds,
      zoomLevel
    );

    // Only apply delay if we had to query the database
    if (queried.length > 0) {
      // Track request and apply delay if needed
      ({ delay, activeCount, requestId } = await requestTracker.trackRequest());
    }

    // Complete request tracking
    if (requestId) {
      requestTracker.completeRequest(requestId);
    }

    res.json({
      type: "FeatureCollection",
      features: [...cached, ...queried],
      metadata: {
        currentDelay: delay,
        activeRequests: activeCount,
        cacheInfo: {
          cached: cached.length,
          queried: queried.length,
          zoomLevel: zoomLevel,
          tilesInZoom: {
            cached: cacheStats.cached,
            total: cacheStats.total,
          },
        },
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

// Get all OSM tile names within bounds at zoom level
function getTileNames(bounds, zoomLevel) {
  // Get tile coordinates for bounds corners
  const nw = calculateOSMTile(bounds.north, bounds.west, zoomLevel);
  const se = calculateOSMTile(bounds.south, bounds.east, zoomLevel);

  // Create array to store tile names
  const tileNames = [];

  // Iterate over tile range
  for (let y = nw.tileY; y <= se.tileY; y++) {
    for (let x = nw.tileX; x <= se.tileX; x++) {
      tileNames.push(`${zoomLevel}/${x}/${y}`);
    }
  }

  // Get cache stats for this zoom level
  const zoomStats = {
    total: tileNames.length,
    zoom: zoomLevel,
    bounds: {
      x: { min: nw.tileX, max: se.tileX },
      y: { min: nw.tileY, max: se.tileY },
    },
  };

  return {
    tiles: tileNames,
    bounds: {
      x: { min: nw.tileX, max: se.tileX },
      y: { min: nw.tileY, max: se.tileY },
    },
    stats: zoomStats,
    count: tileNames.length,
  };
}

// Update the /api/info endpoint
app.get("/api/info", (req, res) => {
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
