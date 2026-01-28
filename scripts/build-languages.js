#!/usr/bin/env node
/**
 * Step 2: Build languages.generated.js from data/**\/*.geojson
 *
 * Recursively reads all .geojson files from data/ (countries, regional,
 * glottography, and any custom subdirectories), simplifies polygons with
 * Douglas-Peucker, and outputs languages.generated.js for the frontend.
 *
 * This script is idempotent — running it again overwrites the output cleanly.
 *
 * Usage:
 *   node scripts/build-languages.js
 *   node scripts/build-languages.js --tolerance=0.05    # coarser simplification
 *   node scripts/build-languages.js --tolerance=0.01    # finer simplification
 *   node scripts/build-languages.js --min-points=4      # min polygon size
 *
 * Input: data/**\/*.geojson (any depth, standard GeoJSON with [lng, lat])
 * Output: languages.generated.js (languageZones array with [lat, lng])
 */

const fs = require('fs');
const path = require('path');

// ─── CLI arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let TOLERANCE = 0.03;   // degrees (~3km at equator)
let MIN_POINTS = 4;

for (const arg of args) {
  if (arg.startsWith('--tolerance='))  TOLERANCE = parseFloat(arg.split('=')[1]);
  if (arg.startsWith('--min-points=')) MIN_POINTS = parseInt(arg.split('=')[1], 10);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_PATH = path.join(ROOT, 'languages.generated.js');

// ─── Douglas-Peucker simplification ─────────────────────────────────────────

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
  return Math.sqrt((x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2);
}

function simplifyPolygon(points, tolerance) {
  if (points.length <= 2) return points;

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

  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

// ─── Coordinate helpers ─────────────────────────────────────────────────────

function convertCoordinates(coords) {
  return coords.map(([lng, lat]) => [
    Math.round(lat * 100) / 100,
    Math.round(lng * 100) / 100
  ]);
}

function extractPolygons(geometry) {
  const polygons = [];
  if (geometry.type === 'Polygon') {
    polygons.push(geometry.coordinates[0]); // outer ring only
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      polygons.push(poly[0]); // outer ring of each polygon
    }
  }
  return polygons;
}

// ─── File discovery ──────────────────────────────────────────────────────────

function findGeoJSONFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findGeoJSONFiles(fullPath));
    } else if (entry.name.endsWith('.geojson')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── GeoJSON processing ─────────────────────────────────────────────────────

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
    const family = props.family || '';
    const macroarea = props.macroarea || '';
    const glottocode = props.glottocode || '';
    const iso639 = props.iso639 || '';

    if (!feature.geometry) continue;

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

      if (simplified.length >= MIN_POINTS) {
        zones.push({
          language,
          nativeName,
          family,
          macroarea,
          glottocode,
          iso639,
          polygon: simplified
        });
      }
    }
  }

  return zones;
}

// ─── Output generation ──────────────────────────────────────────────────────

function escapeString(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function generateOutput(zones) {
  const lines = [];

  lines.push('const languageZones = [');

  let currentFamily = null;

  for (const zone of zones) {
    const familyLabel = zone.family || 'Unclassified';
    if (familyLabel !== currentFamily) {
      if (currentFamily !== null) lines.push('');
      lines.push(`  // === ${familyLabel} ===`);
      currentFamily = familyLabel;
    }

    const polyStr = zone.polygon.map(([lat, lng]) => `[${lat},${lng}]`).join(',');

    lines.push(`  {language:'${escapeString(zone.language)}',nativeName:'${escapeString(zone.nativeName)}',family:'${escapeString(zone.family)}',macroarea:'${escapeString(zone.macroarea)}',glottocode:'${escapeString(zone.glottocode)}',iso639:'${escapeString(zone.iso639)}',polygon:[${polyStr}]},`);
  }

  lines.push('];');
  lines.push('');

  // Helper functions for the frontend
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
 * @returns {Array}
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

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log(`\n  data/**/*.geojson → languages.generated.js`);
  console.log(`   Tolerance:  ${TOLERANCE}°`);
  console.log(`   Min points: ${MIN_POINTS}\n`);

  // Find all GeoJSON files
  const files = findGeoJSONFiles(DATA_DIR);

  if (files.length === 0) {
    console.error(`   No .geojson files found in ${DATA_DIR}`);
    console.error(`   Run extract-glottography.js first or add files manually.`);
    process.exit(1);
  }

  console.log(`   Found ${files.length} .geojson file(s)\n`);

  // Process all files
  const allZones = [];
  let skippedTiny = 0;
  const sourceCounts = {};

  for (const filePath of files) {
    const relPath = path.relative(DATA_DIR, filePath);
    const sourceDir = path.dirname(relPath).split(path.sep)[0] || 'root';

    const zones = processGeoJSON(filePath);
    allZones.push(...zones);

    sourceCounts[sourceDir] = (sourceCounts[sourceDir] || 0) + zones.length;
  }

  if (allZones.length === 0) {
    console.error('   No valid zones generated. Check your .geojson files.');
    process.exit(1);
  }

  // Sort by family then language
  allZones.sort((a, b) => {
    const fa = a.family || 'zzz';
    const fb = b.family || 'zzz';
    if (fa !== fb) return fa.localeCompare(fb);
    return a.language.localeCompare(b.language);
  });

  // Generate output
  console.log(`   Generating output...`);
  const output = generateOutput(allZones);
  fs.writeFileSync(OUTPUT_PATH, output);

  const sizeMB = (Buffer.byteLength(output, 'utf-8') / 1024 / 1024).toFixed(2);
  const uniqueLangs = new Set(allZones.map(z => z.glottocode || z.language));

  console.log(`\n   Output: ${OUTPUT_PATH}`);
  console.log(`   Size:   ${sizeMB} MB`);
  console.log(`   Zones:  ${allZones.length}`);
  console.log(`   Unique languages: ${uniqueLangs.size}`);
  console.log(`   By source:`);
  for (const [source, count] of Object.entries(sourceCounts).sort()) {
    console.log(`     ${source}: ${count} zone(s)`);
  }
  console.log(`\n   Done.\n`);
}

main();
