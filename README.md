# Geographic Grid Visualization

An interactive web application that displays a dynamic geographic grid system centered on Helsinki. The grid adapts its size and style based on zoom levels, using Leaflet.js and OpenStreetMap.

## Features

- Dynamic grid system based on OSM zoom levels:
  * Zoom > 17: 50m grid (red/white striped)
  * Zoom > 13: 100m grid (blue/white dashed)
  * Zoom ≤ 13: 500m grid (yellow solid)
  * No grid shown for zoom ≤ 10
- Request throttling simulation:
  * Tracks concurrent grid requests
  * Adds exponential backoff delays
  * Accurately tracks active requests
  * Base delay: 100ms with exponential growth
  * Maximum delay: 10 seconds
  * Resets immediately when requests complete
  * Shows current delay and active request count
- Advanced caching system:
  * Two-level tile and content caching
  * Per-zoom level tile tracking
  * Content-based deduplication
  * Cache statistics in overlay
  * Visual feedback for cache hits
  * Interactive cache visualization mode:
    - Toggle between grid and cache views
    - Visual tile coverage with blue overlays
    - Hover effects for cached tiles
    - Dashed borders for tile boundaries
    - Real-time cache status updates
- Interactive map centered on Helsinki Railway Station
- Real-time information overlay showing:
  * Current zoom level
  * OSM tile range in view
  * Viewport dimensions in meters
  * View diagonal distance
  * Cache status and coverage
- Visual tile preview functionality:
  * Shows all fully visible tiles
  * Displays tile coordinates
  * Updates smoothly during panning
  * Maintains grid during viewport changes
- State persistence:
  * Map location saved in URL parameters
  * Location persists across page refreshes
  * Shareable URLs with map position
  * Fallback to localStorage if no URL parameters
  * Default to Helsinki Railway Station

## Development Setup

### Docker Environment

The application runs in a containerized environment with:
- Frontend (nginx) - serves static files and proxies API requests
- Backend (Node.js) - handles grid generation and map calculations
- Memcached - for future caching implementation
- PostgreSQL with PostGIS - for future spatial data storage

### Database Setup

The application uses PostgreSQL with PostGIS extension for storing grid lines:
- Automatically initializes database schema on startup
- Creates spatial tables for grid lines
- Generates grid lines for Finland:
  * 50m red grid lines
  * 100m blue grid lines
  * 500m yellow grid lines
- Each line has unique four-word name
- Includes spatial indexing for performance

### Network Configuration
- Frontend can access backend
- Backend can access all services
- Database and cache are isolated from each other

### Quick Start

1. Clone the repository
2. Run `npm install`
3. Start the development environment:
   ```bash
   npm run dev
   ```
4. Access the application at http://localhost:3000

### Development Commands
- `npm run dev` - Start all containers
- `npm run stop` - Stop containers
- `npm run clean` - Remove containers and volumes

## API Endpoints

### GET /api/grid

Returns a GeoJSON FeatureCollection containing grid lines for the specified bounds.

Query Parameters:
- `north`: Northern boundary latitude
- `south`: Southern boundary latitude
- `east`: Eastern boundary longitude
- `west`: Western boundary longitude
- `zoom`: Current OSM zoom level

### GET /api/info

Returns current map information including viewport dimensions and OSM tile coordinates.

Query Parameters:
- `lat`: Center latitude
- `lng`: Center longitude
- `zoom`: Current zoom level
- `north`, `south`, `east`, `west`: Viewport boundaries

Response includes:
- Current zoom level
- OSM tile range (x, y min/max)
- Viewport dimensions in meters
- View diagonal distance

## Technology Stack

- Frontend:
  - Leaflet.js for map visualization
  - OpenStreetMap for base map tiles
  - Vanilla JavaScript
  - HTML5 & CSS3

- Backend:
  - Node.js
  - Express.js
  - Static file serving
  - CORS support
  - Haversine distance calculation

## Project Structure

```
project-root/
├── public/           # Frontend static files
│   ├── index.html   # Main HTML file
│   ├── style.css    # Styles for the map
│   └── script.js    # Frontend JavaScript
├── server.js        # Backend API server
├── package.json     # Project configuration
└── README.md        # Documentation
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/geographic-grid-visualization.git
cd geographic-grid-visualization
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## How It Works

1. The frontend initializes a Leaflet map centered on Helsinki Railway Station
2. When the map viewport changes (pan/zoom), the client:
   - Shows "updating" status in the info overlay
   - Calculates current viewport bounds
   - Requests new grid from API with current zoom level
   - Fetches updated information from info API
   - Updates information overlay
3. The backend:
   - Queries PostGIS database for grid lines
   - Filters lines by viewport bounds using spatial index
   - Selects appropriate grid size based on zoom level
   - Calculates viewport dimensions using haversine formula
   - Returns GeoJSON with pre-generated lines and styling
4. The frontend:
   - Clears previous grid
   - Renders new grid with appropriate styling
   - Updates viewport information