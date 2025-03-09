-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create enum for line types
CREATE TYPE grid_type AS ENUM ('50m', '100m', '500m');

-- Create table for grid lines
CREATE TABLE geolines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    color VARCHAR(7) NOT NULL,  -- hex color code
    line_type grid_type NOT NULL,
    geom GEOMETRY(LINESTRING, 4326) NOT NULL
);

-- Create spatial index
CREATE INDEX geolines_geom_idx ON geolines USING GIST (geom); 