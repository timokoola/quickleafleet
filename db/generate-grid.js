import pg from "pg";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const FINLAND_BOUNDS = {
  north: 70.0922,
  south: 59.808,
  east: 31.587,
  west: 19.0832,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load dictionary words
const words = fs
  .readFileSync(path.join(__dirname, "words.txt"), "utf-8")
  .split("\n")
  .filter((word) => word.length > 0);

function generateName() {
  return Array(4)
    .fill(0)
    .map(() => words[Math.floor(Math.random() * words.length)])
    .join("-");
}

// Convert meters to degrees at given latitude
function metersToDegreesLat(meters) {
  return meters / 111111;
}

function metersToDegreesLng(meters, lat) {
  return meters / (111111 * Math.cos((lat * Math.PI) / 180));
}

async function generateGrid(client, gridSize, color, type) {
  const gridSizeLat = metersToDegreesLat(gridSize);

  // Generate lines in smaller chunks to avoid memory issues
  for (let lat = FINLAND_BOUNDS.south; lat <= FINLAND_BOUNDS.north; lat += 1) {
    const gridSizeLng = metersToDegreesLng(gridSize, lat);

    // Generate horizontal lines
    for (
      let y = lat;
      y < Math.min(lat + 1, FINLAND_BOUNDS.north);
      y += gridSizeLat
    ) {
      const name = generateName();
      await client.query(
        `
        INSERT INTO geolines (name, color, line_type, geom)
        VALUES ($1, $2, $3, ST_MakeLine(
          ST_MakePoint($4, $5),
          ST_MakePoint($6, $5)
        ))
        ON CONFLICT (name) DO NOTHING
      `,
        [name, color, type, FINLAND_BOUNDS.west, y, FINLAND_BOUNDS.east]
      );
    }

    // Generate vertical lines
    for (
      let x = FINLAND_BOUNDS.west;
      x <= FINLAND_BOUNDS.east;
      x += gridSizeLng
    ) {
      const name = generateName();
      await client.query(
        `
        INSERT INTO geolines (name, color, line_type, geom)
        VALUES ($1, $2, $3, ST_MakeLine(
          ST_MakePoint($4, $5),
          ST_MakePoint($4, $6)
        ))
        ON CONFLICT (name) DO NOTHING
      `,
        [name, color, type, x, lat, Math.min(lat + 1, FINLAND_BOUNDS.north)]
      );
    }
  }
}

async function setupDatabase() {
  const client = new pg.Client({
    connectionString:
      process.env.POSTGRES_URL ||
      "postgres://postgres:postgres@localhost:5432/gis",
  });

  try {
    await client.connect();

    // Check if we need to generate data
    const result = await client.query("SELECT COUNT(*) FROM geolines");

    if (result.rows[0].count === "0") {
      console.log("Generating grid lines...");

      // Generate grids in parallel
      await Promise.all([
        generateGrid(client, 50, "#ff0000", "50m"),
        generateGrid(client, 100, "#0000ff", "100m"),
        generateGrid(client, 500, "#ffff00", "500m"),
      ]);

      console.log("Grid generation complete");
    } else {
      console.log("Database already contains grid lines");
    }
  } catch (error) {
    console.error("Error setting up database:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupDatabase();
}

export { setupDatabase };
