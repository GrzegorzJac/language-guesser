const map = L.map('map', {
  center: [20, 0],
  zoom: 2,
  minZoom: 2,
  maxBounds: [[-90, -180], [90, 180]],
  maxBoundsViscosity: 1.0
});

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  noWrap: true
}).addTo(map);

const display = document.getElementById('coordinates-display');
let marker = null;

const languageDisplay = document.getElementById('language-display');
let activePolygons = [];

map.on('click', function (e) {
  const lat = e.latlng.lat.toFixed(5);
  const lng = e.latlng.lng.toFixed(5);

  if (marker) {
    marker.setLatLng(e.latlng);
  } else {
    marker = L.marker(e.latlng).addTo(map);
  }

  display.textContent = `Lat: ${lat}  Lng: ${lng}`;

  // Clear previous polygons
  activePolygons.forEach(p => map.removeLayer(p));
  activePolygons = [];

  const languages = getLanguagesAtPoint(e.latlng.lat, e.latlng.lng);
  if (languages.length > 0) {
    // Deduplicate by language name + type
    const seen = new Set();
    const native = [];
    const regional = [];
    for (const l of languages) {
      const key = l.language + '|' + l.type;
      if (seen.has(key)) continue;
      seen.add(key);
      if (l.type === 'native') native.push(l);
      else regional.push(l);
    }

    const parts = [];
    if (native.length > 0) {
      parts.push('Native: ' + native.map(l => `${l.language} (${l.nativeName})`).join(', '));
    }
    if (regional.length > 0) {
      parts.push('Regional: ' + regional.map(l => `${l.language} (${l.nativeName})`).join(', '));
    }
    languageDisplay.textContent = parts.join('  |  ');

    // Draw polygons for matching zones
    const matchingZones = getMatchingZones(e.latlng.lat, e.latlng.lng);
    matchingZones.forEach(zone => {
      const color = zone.type === 'native' ? '#00e676' : '#ffab40';
      const poly = L.polygon(zone.polygon, {
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        interactive: false
      }).addTo(map);
      activePolygons.push(poly);
    });
  } else {
    languageDisplay.textContent = 'No language data for this location';
  }
});
