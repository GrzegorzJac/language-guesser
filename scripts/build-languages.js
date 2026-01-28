#!/usr/bin/env node
/**
 * Build script for languages.js
 *
 * Converts GeoJSON files from data/ directory into the languageZones format.
 *
 * Usage:
 *   node scripts/build-languages.js
 *   node scripts/build-languages.js --tolerance=0.01  # adjust simplification
 *
 * Input structure:
 *   data/countries/*.geojson   - Country-level native languages
 *   data/regional/*.geojson    - Regional/minority languages
 *
 * Each GeoJSON file should have properties:
 *   - language: "Polish"
 *   - nativeName: "Polski"
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let TOLERANCE = 0.02; // Default simplification tolerance in degrees (~2km)

for (const arg of args) {
  if (arg.startsWith('--tolerance=')) {
    TOLERANCE = parseFloat(arg.split('=')[1]);
  }
}

/**
 * Douglas-Peucker algorithm for polygon simplification
 * Reduces number of points while preserving shape
 */
function simplifyPolygon(points, tolerance) {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line between first and last
  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  }

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
}

/**
 * Convert GeoJSON coordinates to [lat, lng] format
 * GeoJSON uses [lng, lat], we need [lat, lng]
 */
function convertCoordinates(coords) {
  return coords.map(([lng, lat]) => [
    Math.round(lat * 100) / 100,
    Math.round(lng * 100) / 100
  ]);
}

/**
 * Extract polygon(s) from GeoJSON geometry
 */
function extractPolygons(geometry) {
  const polygons = [];

  if (geometry.type === 'Polygon') {
    // Take only the outer ring (index 0), ignore holes
    polygons.push(geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    // For MultiPolygon, extract all outer rings
    for (const poly of geometry.coordinates) {
      polygons.push(poly[0]);
    }
  }

  return polygons;
}

/**
 * Process a single GeoJSON file
 */
function processGeoJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const geojson = JSON.parse(content);
  const zones = [];

  const features = geojson.type === 'FeatureCollection'
    ? geojson.features
    : [geojson];

  for (const feature of features) {
    const props = feature.properties || {};
    const language = props.language || props.name || path.basename(filePath, '.geojson');
    const nativeName = props.nativeName || props.native_name || language;

    const polygons = extractPolygons(feature.geometry);

    for (const coords of polygons) {
      const converted = convertCoordinates(coords);
      const simplified = simplifyPolygon(converted, TOLERANCE);

      // Ensure polygon is closed
      if (simplified.length > 0) {
        const first = simplified[0];
        const last = simplified[simplified.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          simplified.push([...first]);
        }
      }

      // Skip tiny polygons (islands, exclaves)
      if (simplified.length >= 4) {
        zones.push({
          language,
          nativeName,
          polygon: simplified
        });
      }
    }
  }

  return zones;
}

/**
 * Format polygon array for output
 */
function formatPolygon(polygon, indent = '    ') {
  const lines = [];
  const pointsPerLine = 4;

  for (let i = 0; i < polygon.length; i += pointsPerLine) {
    const chunk = polygon.slice(i, i + pointsPerLine);
    const formatted = chunk.map(([lat, lng]) => `[${lat}, ${lng}]`).join(', ');
    lines.push(indent + '  ' + formatted + (i + pointsPerLine < polygon.length ? ',' : ''));
  }

  return lines.join('\n');
}

/**
 * Generate the languages.js content
 */
function generateOutput(zones) {
  const lines = ['const languageZones = ['];

  // Group by country/region for better organization
  let currentCountry = '';

  for (const zone of zones) {
    const country = zone._source || 'MISC';

    if (country !== currentCountry) {
      if (currentCountry) lines.push('');
      lines.push(`  // =====================================================`);
      lines.push(`  // ${country.toUpperCase()}`);
      lines.push(`  // =====================================================`);
      currentCountry = country;
    }

    lines.push('  {');
    lines.push(`    language: '${zone.language}',`);
    lines.push(`    nativeName: '${zone.nativeName}',`);
    lines.push('    polygon: [');
    lines.push(formatPolygon(zone.polygon));
    lines.push('    ]');
    lines.push('  },');
  }

  lines.push('];');
  lines.push('');

  // Add the helper functions
  lines.push(`/**
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
`);

  return lines.join('\n');
}

// Main execution
function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  const countriesDir = path.join(dataDir, 'countries');
  const regionalDir = path.join(dataDir, 'regional');

  const allZones = [];

  // Process country files
  if (fs.existsSync(countriesDir)) {
    const files = fs.readdirSync(countriesDir).filter(f => f.endsWith('.geojson'));
    console.log(`Found ${files.length} country file(s)`);

    for (const file of files) {
      const filePath = path.join(countriesDir, file);
      const zones = processGeoJSON(filePath);
      const countryName = path.basename(file, '.geojson');
      zones.forEach(z => z._source = countryName);
      allZones.push(...zones);
      console.log(`  ${file}: ${zones.length} zone(s)`);
    }
  }

  // Process regional files
  if (fs.existsSync(regionalDir)) {
    const files = fs.readdirSync(regionalDir).filter(f => f.endsWith('.geojson'));
    console.log(`Found ${files.length} regional file(s)`);

    for (const file of files) {
      const filePath = path.join(regionalDir, file);
      const zones = processGeoJSON(filePath);
      const regionName = path.basename(file, '.geojson');
      zones.forEach(z => z._source = `${regionName}`);
      allZones.push(...zones);
      console.log(`  ${file}: ${zones.length} zone(s)`);
    }
  }

  if (allZones.length === 0) {
    console.log('\nNo GeoJSON files found in data/countries/ or data/regional/');
    console.log('Add .geojson files with properties: language, nativeName');
    console.log('\nExample structure for data/countries/poland.geojson:');
    console.log(JSON.stringify({
      type: "Feature",
      properties: {
        language: "Polish",
        nativeName: "Polski"
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[18.56, 54.83], [16.87, 54.45], "..."]]
      }
    }, null, 2));
    return;
  }

  const output = generateOutput(allZones);
  const outputPath = path.join(__dirname, '..', 'languages.generated.js');
  fs.writeFileSync(outputPath, output);

  console.log(`\nGenerated ${outputPath}`);
  console.log(`Total zones: ${allZones.length}`);
  console.log(`Simplification tolerance: ${TOLERANCE}°`);
}

main();
