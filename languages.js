const languageZones = [
  {
    language: 'Polish',
    nativeName: 'Polski',
    type: 'native',
    // Simplified polygon of Poland's borders
    polygon: [
      [54.83, 18.56],  // Gdańsk area (north coast)
      [54.45, 16.87],  // Koszalin area
      [53.93, 14.22],  // Szczecin area (northwest)
      [52.76, 14.14],  // West border
      [52.34, 14.55],  // Frankfurt/Oder area
      [51.29, 14.99],  // Görlitz area
      [50.88, 14.82],  // Southwest
      [50.36, 16.01],  // Near Kłodzko
      [50.17, 16.95],  // South-central
      [49.97, 18.01],  // Ostrava border area
      [49.44, 18.85],  // Near Żywiec
      [49.43, 20.07],  // Tatra mountains
      [49.28, 22.56],  // Bieszczady (southeast)
      [50.41, 24.10],  // East border (Zamość area)
      [51.37, 23.61],  // Bug river area
      [52.10, 23.95],  // Białystok area border
      [53.50, 23.87],  // Augustów area
      [54.35, 22.77],  // Northeast (Suwałki area)
      [54.37, 19.64],  // Vistula Lagoon area
      [54.83, 18.56],  // Close polygon back at Gdańsk
    ]
  }
];

/**
 * Ray-casting algorithm to determine if a point is inside a polygon.
 * @param {number} lat - Latitude of the point
 * @param {number} lng - Longitude of the point
 * @param {number[][]} polygon - Array of [lat, lng] pairs forming the polygon
 * @returns {boolean}
 */
function isPointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Get all languages natively spoken at the given coordinates.
 * @param {number} lat
 * @param {number} lng
 * @returns {Array<{language: string, nativeName: string, type: string}>}
 */
function getLanguagesAtPoint(lat, lng) {
  const results = [];
  for (const zone of languageZones) {
    if (isPointInPolygon(lat, lng, zone.polygon)) {
      results.push({
        language: zone.language,
        nativeName: zone.nativeName,
        type: zone.type
      });
    }
  }
  return results;
}
