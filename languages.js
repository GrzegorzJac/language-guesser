const languageZones = [
  // =====================================================
  // POLAND
  // =====================================================
  {
    language: 'Polish',
    nativeName: 'Polski',
    polygon: [
      [54.83, 18.56], [54.45, 16.87], [53.93, 14.22], [52.76, 14.14],
      [52.34, 14.55], [51.29, 14.99], [50.88, 14.82], [50.36, 16.01],
      [49.97, 18.01], [49.44, 18.85], [49.43, 20.07], [49.28, 22.56],
      [50.41, 24.1], [51.37, 23.61], [52.1, 23.95], [53.5, 23.87],
      [54.35, 22.77], [54.37, 19.64], [54.83, 18.56]
    ]
  },

  // =====================================================
  // KASHUBIAN
  // =====================================================
  {
    language: 'Kashubian',
    nativeName: 'Kaszëbsczi',
    polygon: [
      [54.7, 17.5], [54.7, 18.6], [54.35, 18.6], [54, 17.8],
      [54.1, 17.5], [54.7, 17.5]
    ]
  },
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
 * Get all languages spoken at the given coordinates.
 * @param {number} lat
 * @param {number} lng
 * @returns {Array<{language: string, nativeName: string}>}
 */
function getLanguagesAtPoint(lat, lng) {
  const results = [];
  for (const zone of languageZones) {
    if (isPointInPolygon(lat, lng, zone.polygon)) {
      results.push({
        language: zone.language,
        nativeName: zone.nativeName
      });
    }
  }
  return results;
}

/**
 * Get all matching zone objects (including polygons) at the given coordinates.
 * @param {number} lat
 * @param {number} lng
 * @returns {Array<{language: string, nativeName: string, polygon: number[][]}>}
 */
function getMatchingZones(lat, lng) {
  const results = [];
  for (const zone of languageZones) {
    if (isPointInPolygon(lat, lng, zone.polygon)) {
      results.push(zone);
    }
  }
  return results;
}

/**
 * Get ALL zones worldwide for the given language identifiers.
 * Matches by glottocode first, falls back to language name.
 * @param {Array<{language: string, glottocode?: string}>} langs
 * @returns {Array} All zone objects matching those languages
 */
function getAllZonesForLanguages(langs) {
  const codes = new Set();
  const names = new Set();
  for (const l of langs) {
    if (l.glottocode) codes.add(l.glottocode);
    names.add(l.language);
  }
  const results = [];
  for (const zone of languageZones) {
    if ((zone.glottocode && codes.has(zone.glottocode)) || names.has(zone.language)) {
      results.push(zone);
    }
  }
  return results;
}
