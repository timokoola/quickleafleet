# Geographic Grid Visualization

An interactive web application that displays a geographic grid system centered on Helsinki, using Leaflet.js and OpenStreetMap. The grid lines are generated every 100 meters and colored based on their geographic coordinates.

## Features

- Interactive map centered on Helsinki Railway Station
- Geographic grid system aligned to 100-meter intervals
- Dynamic grid generation based on viewport
- Color patterns based on geographic coordinates
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
  - CORS support for cross-origin requests

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/geographic-grid-visualization.git
cd geographic-grid-visualization
```


## How It Works

1. The frontend initializes a Leaflet map centered on Helsinki Railway Station
2. When the map viewport changes, the client requests new grid lines from the API
3. The backend calculates grid lines at 100-meter intervals
4. Grid lines are snapped to fixed geographic coordinates
5. Colors are generated based on the absolute position of each line
6. The frontend clears the old grid and displays the new one

## API Endpoints

### GET /api/grid

Returns a GeoJSON FeatureCollection containing grid lines for the specified bounds.