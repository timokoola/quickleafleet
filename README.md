# Geographic Grid Visualization

An interactive web application that displays a dynamic geographic grid system centered on Helsinki. The grid adapts its size and style based on zoom levels, using Leaflet.js and OpenStreetMap.

## Features

- Dynamic grid system based on OSM zoom levels:
  * Zoom > 17: 50m grid (red/white striped)
  * Zoom > 13: 100m grid (blue/white dashed)
  * Zoom ≤ 13: 500m grid (yellow/black striped)
- Interactive map centered on Helsinki Railway Station
- Real-time information overlay showing:
  * Current zoom level
  * OSM tile coordinates
  * Viewport dimensions in meters
  * View distance
  * Visual feedback during map movement
- Grid lines aligned to absolute geographic coordinates
- Popup information for each grid line
- Responsive design with full-screen map

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
   - Determines grid size based on zoom level
   - Generates grid lines aligned to absolute coordinates
   - Calculates viewport dimensions using haversine formula
   - Returns GeoJSON with styling information
4. The frontend:
   - Clears previous grid
   - Renders new grid with appropriate styling
   - Updates viewport information

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
- OSM tile coordinates (x, y)
- Viewport dimensions in meters