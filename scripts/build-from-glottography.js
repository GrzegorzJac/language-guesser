#!/usr/bin/env node
/**
 * Build script for language zones from Glottography (Asher & Moseley 2007) data.
 *
 * Reads cldf/contemporary/ dataset (languages.geojson + languages.csv),
 * simplifies polygons with Douglas-Peucker, and outputs languages.generated.js
 * compatible with the existing app.js frontend.
 *
 * Usage:
 *   node scripts/build-from-glottography.js
 *   node scripts/build-from-glottography.js --tolerance=0.05
 *   node scripts/build-from-glottography.js --dataset=traditional
 *   node scripts/build-from-glottography.js --macroarea=Eurasia
 *   node scripts/build-from-glottography.js --min-points=4
 *
 * Source: glottography_asher_data/cldf/{dataset}/
 *   - languages.geojson  (FeatureCollection, ~4000+ languages with polygons)
 *   - languages.csv       (metadata: name, family, macroarea, glottocode, iso639)
 */

const fs = require('fs');
const path = require('path');

// ─── CLI arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let TOLERANCE = 0.03;    // degrees (~3km at equator); global data needs more smoothing
let DATASET = 'contemporary';
let MACROAREA = null;     // null = all
let MIN_POINTS = 4;

for (const arg of args) {
  if (arg.startsWith('--tolerance='))  TOLERANCE = parseFloat(arg.split('=')[1]);
  if (arg.startsWith('--dataset='))    DATASET = arg.split('=')[1];
  if (arg.startsWith('--macroarea='))  MACROAREA = arg.split('=')[1];
  if (arg.startsWith('--min-points=')) MIN_POINTS = parseInt(arg.split('=')[1], 10);
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const GLOTTO_DIR = path.join(ROOT, 'glottography_asher_data', 'cldf', DATASET);
const GEOJSON_PATH = path.join(GLOTTO_DIR, 'languages.geojson');
const CSV_PATH = path.join(GLOTTO_DIR, 'languages.csv');
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

// ─── CSV parser (no dependencies) ───────────────────────────────────────────

function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const obj = {};
    for (let h = 0; h < headers.length; h++) {
      obj[headers[h].trim()] = (values[h] || '').trim();
    }
    rows.push(obj);
  }
  return rows;
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

// ─── Main build ─────────────────────────────────────────────────────────────

function main() {
  console.log(`\n🌍 Glottography → Language Guesser build`);
  console.log(`   Dataset:    ${DATASET}`);
  console.log(`   Tolerance:  ${TOLERANCE}°`);
  console.log(`   Macroarea:  ${MACROAREA || 'ALL'}`);
  console.log(`   Min points: ${MIN_POINTS}\n`);

  // 1. Read CSV metadata → map by ID (= Glottocode)
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const csvRows = parseCSV(CSV_PATH);
  const metaById = new Map();
  for (const row of csvRows) {
    metaById.set(row.ID, row);
  }
  console.log(`   CSV loaded: ${metaById.size} language entries`);

  // 2. Read GeoJSON (big file, but Node handles 60MB in memory fine)
  if (!fs.existsSync(GEOJSON_PATH)) {
    console.error(`GeoJSON not found: ${GEOJSON_PATH}`);
    process.exit(1);
  }

  console.log(`   Loading GeoJSON (this may take a moment)...`);
  const geojsonRaw = fs.readFileSync(GEOJSON_PATH, 'utf-8');
  const geojson = JSON.parse(geojsonRaw);
  const features = geojson.features || [];
  console.log(`   GeoJSON loaded: ${features.length} features\n`);

  // 3. Process each feature
  const allZones = [];
  let skippedNoMeta = 0;
  let skippedMacroarea = 0;
  let skippedTiny = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    const langRef = props['cldf:languageReference'] || '';
    const meta = metaById.get(langRef);

    if (!meta) {
      skippedNoMeta++;
      continue;
    }

    // Optional macroarea filter
    if (MACROAREA && meta.Macroarea !== MACROAREA) {
      skippedMacroarea++;
      continue;
    }

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
        allZones.push({
          language: meta.Name || props.title || langRef,
          nativeName: meta.Name || props.title || langRef,
          family: meta.Family || '',
          macroarea: meta.Macroarea || '',
          glottocode: meta.Glottocode || langRef,
          iso639: meta.ISO639P3code || '',
          polygon: simplified
        });
      } else {
        skippedTiny++;
      }
    }
  }

  console.log(`   Processed zones: ${allZones.length}`);
  console.log(`   Skipped (no CSV match): ${skippedNoMeta}`);
  if (MACROAREA) console.log(`   Skipped (macroarea filter): ${skippedMacroarea}`);
  console.log(`   Skipped (too few points): ${skippedTiny}`);

  if (allZones.length === 0) {
    console.error('\nNo zones generated. Check paths and filters.');
    process.exit(1);
  }

  // 4. Sort by family then language for organized output
  allZones.sort((a, b) => {
    if (a.family !== b.family) return a.family.localeCompare(b.family);
    return a.language.localeCompare(b.language);
  });

  // 5. Generate output JS
  console.log(`\n   Generating output...`);
  const output = generateOutput(allZones);
  fs.writeFileSync(OUTPUT_PATH, output);

  const sizeMB = (Buffer.byteLength(output, 'utf-8') / 1024 / 1024).toFixed(2);
  console.log(`\n   Output: ${OUTPUT_PATH}`);
  console.log(`   Size:   ${sizeMB} MB`);
  console.log(`   Zones:  ${allZones.length}`);

  // Count unique languages
  const uniqueLangs = new Set(allZones.map(z => z.glottocode));
  console.log(`   Unique languages: ${uniqueLangs.size}`);
  console.log(`\n   Done.\n`);
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
    if (zone.family !== currentFamily) {
      if (currentFamily !== null) lines.push('');
      lines.push(`  // === ${zone.family || 'Unclassified'} ===`);
      currentFamily = zone.family;
    }

    const polyStr = zone.polygon.map(([lat, lng]) => `[${lat},${lng}]`).join(',');

    lines.push(`  {language:'${escapeString(zone.language)}',nativeName:'${escapeString(zone.nativeName)}',family:'${escapeString(zone.family)}',macroarea:'${escapeString(zone.macroarea)}',glottocode:'${escapeString(zone.glottocode)}',iso639:'${escapeString(zone.iso639)}',polygon:[${polyStr}]},`);
  }

  lines.push('];');
  lines.push('');

  // Append the same helper functions the existing build produces
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

main();
