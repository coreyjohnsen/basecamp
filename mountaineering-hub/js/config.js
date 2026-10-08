// Every outside service the app talks to is listed here, so sources can be swapped in one place.
export const CONFIG = {
  dataRoot: 'data/',

  map: {
    // Base layers. Add an entry to offer another one (e.g. a Mapbox or MapTiler style with your own key).
    layers: {
      satellite: {
        label: 'Satellite',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        maxzoom: 16,
        attribution: 'Imagery: USGS The National Map'
      },
      topo: {
        label: 'Topo',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
        maxzoom: 16,
        attribution: 'Topo: USGS The National Map'
      }
    },
    // Elevation: Mapzen terrarium tiles on AWS Open Data. Free, no key.
    dem: {
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      maxzoom: 14,
      attribution: 'Terrain: Mapzen / AWS Open Data'
    },
    exaggeration: 1.2
  },

  weather: {
    // Open-Meteo: free for non-commercial use, no key. https://open-meteo.com
    url: 'https://api.open-meteo.com/v1/forecast',
    days: 7,
    ttlMinutes: 30,
    timezone: 'America/Los_Angeles'
  },

  nws: 'https://api.weather.gov',

  avalanche: {
    // National Avalanche Center public map layer for one center.
    url: 'https://api.avalanche.org/v2/public/products/map-layer/',
    center: 'NWAC',
    site: 'https://nwac.us/'
  },

  // Optional. A free key from https://www.nps.gov/subjects/developer/get-started.htm turns on
  // park alerts for peaks that set "npsParkCode". Anything in this file is public once deployed.
  npsApiKey: ''
};
