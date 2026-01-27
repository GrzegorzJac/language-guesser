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

map.on('click', function (e) {
  const lat = e.latlng.lat.toFixed(5);
  const lng = e.latlng.lng.toFixed(5);

  if (marker) {
    marker.setLatLng(e.latlng);
  } else {
    marker = L.marker(e.latlng).addTo(map);
  }

  display.textContent = `Lat: ${lat}  Lng: ${lng}`;

  const languages = getLanguagesAtPoint(e.latlng.lat, e.latlng.lng);
  if (languages.length > 0) {
    const native = languages.filter(l => l.type === 'native');
    const regional = languages.filter(l => l.type === 'regional');
    const parts = [];
    if (native.length > 0) {
      parts.push('Native: ' + native.map(l => `${l.language} (${l.nativeName})`).join(', '));
    }
    if (regional.length > 0) {
      parts.push('Regional: ' + regional.map(l => `${l.language} (${l.nativeName})`).join(', '));
    }
    languageDisplay.textContent = parts.join('  |  ');
  } else {
    languageDisplay.textContent = 'No language data for this location';
  }
});
