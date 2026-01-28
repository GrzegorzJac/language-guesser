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
    // Deduplicate by language name
    const seen = new Set();
    const uniqueLanguages = [];
    for (const l of languages) {
      if (seen.has(l.language)) continue;
      seen.add(l.language);
      uniqueLanguages.push(l);
    }

    // Get full zone data for metadata display
    const localZones = getMatchingZones(e.latlng.lat, e.latlng.lng);
    const zoneByLang = new Map();
    for (const z of localZones) {
      if (!zoneByLang.has(z.language)) zoneByLang.set(z.language, z);
    }

    // Get ALL zones worldwide for detected languages
    const allZones = getAllZonesForLanguages(localZones);

    // Display as: "nativeName (language) [family] ..."
    languageDisplay.innerHTML = uniqueLanguages
      .map(l => {
        const zone = zoneByLang.get(l.language);
        let text = `<strong>${l.nativeName}</strong> (${l.language})`;
        if (zone && zone.family) {
          text += ` <span style="color:#42a5f5">[${zone.family}]</span>`;
        }
        if (zone && zone.glottocode) {
          text += ` <span style="color:#8888aa;font-size:12px">${zone.glottocode}</span>`;
        }
        return text;
      })
      .join(' &nbsp;|&nbsp; ');

    // Assign one color per language
    const zoneColors = ['#00e676', '#ffab40', '#42a5f5', '#ab47bc', '#ef5350'];
    const langColorMap = new Map();
    let colorIdx = 0;
    for (const zone of allZones) {
      const key = zone.glottocode || zone.language;
      if (!langColorMap.has(key)) {
        langColorMap.set(key, zoneColors[colorIdx % zoneColors.length]);
        colorIdx++;
      }
    }

    // Draw all zones worldwide for matching languages
    allZones.forEach(zone => {
      const key = zone.glottocode || zone.language;
      const color = langColorMap.get(key);
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
