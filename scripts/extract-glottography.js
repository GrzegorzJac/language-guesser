#!/usr/bin/env node
/**
 * Step 1: Extract Glottography data → individual GeoJSON files in data/glottography/
 *
 * Reads the Glottography (Asher & Moseley 2007) dataset and creates one .geojson
 * file per language, grouped by macroarea. Multiple polygons for the same language
 * (e.g. Spanish in Spain + Latin America) are merged into a single MultiPolygon.
 *
 * Output files are standard GeoJSON ([lng, lat]) with full precision — no
 * simplification happens here. Simplification is done at build time (step 2).
 *
 * This script is idempotent — running it again overwrites existing files cleanly.
 *
 * Usage:
 *   node scripts/extract-glottography.js
 *   node scripts/extract-glottography.js --dataset=traditional
 *   node scripts/extract-glottography.js --macroarea=Eurasia
 *   node scripts/extract-glottography.js --clean  (remove data/glottography/ first)
 */

const fs = require('fs');
const path = require('path');

// ─── CLI arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let DATASET = 'contemporary';
let MACROAREA = null;
let CLEAN = false;

for (const arg of args) {
  if (arg.startsWith('--dataset='))   DATASET = arg.split('=')[1];
  if (arg.startsWith('--macroarea=')) MACROAREA = arg.split('=')[1];
  if (arg === '--clean')              CLEAN = true;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const GLOTTO_DIR = path.join(ROOT, 'glottography_asher_data', 'cldf', DATASET);
const GEOJSON_PATH = path.join(GLOTTO_DIR, 'languages.geojson');
const CSV_PATH = path.join(GLOTTO_DIR, 'languages.csv');
const OUTPUT_DIR = path.join(ROOT, 'data', 'glottography');

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log(`\n  Glottography → data/glottography/ extraction`);
  console.log(`   Dataset:   ${DATASET}`);
  console.log(`   Macroarea: ${MACROAREA || 'ALL'}`);
  console.log(`   Clean:     ${CLEAN}\n`);

  // Validate source files
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(GEOJSON_PATH)) {
    console.error(`GeoJSON not found: ${GEOJSON_PATH}`);
    process.exit(1);
  }

  // 1. Read CSV metadata
  const csvRows = parseCSV(CSV_PATH);
  const metaById = new Map();
  for (const row of csvRows) {
    metaById.set(row.ID, row);
  }
  console.log(`   CSV loaded: ${metaById.size} language entries`);

  // 2. Read GeoJSON
  console.log(`   Loading GeoJSON (this may take a moment)...`);
  const geojsonRaw = fs.readFileSync(GEOJSON_PATH, 'utf-8');
  const geojson = JSON.parse(geojsonRaw);
  const features = geojson.features || [];
  console.log(`   GeoJSON loaded: ${features.length} features\n`);

  // 3. Group polygons by language (glottocode)
  //    A single language may have multiple features/polygons (e.g. Spanish)
  const languageMap = new Map(); // glottocode → { meta, polygons[] }
  let skippedNoMeta = 0;
  let skippedMacroarea = 0;
  let skippedNoGeometry = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    const langRef = props['cldf:languageReference'] || '';
    const meta = metaById.get(langRef);

    if (!meta) {
      skippedNoMeta++;
      continue;
    }

    if (MACROAREA && meta.Macroarea !== MACROAREA) {
      skippedMacroarea++;
      continue;
    }

    if (!feature.geometry) {
      skippedNoGeometry++;
      continue;
    }

    if (!languageMap.has(langRef)) {
      languageMap.set(langRef, { meta, polygons: [] });
    }

    const entry = languageMap.get(langRef);
    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      entry.polygons.push(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        entry.polygons.push(poly);
      }
    }
  }

  console.log(`   Languages found: ${languageMap.size}`);
  console.log(`   Skipped (no CSV match): ${skippedNoMeta}`);
  if (MACROAREA) console.log(`   Skipped (macroarea filter): ${skippedMacroarea}`);
  if (skippedNoGeometry) console.log(`   Skipped (no geometry): ${skippedNoGeometry}`);

  // 4. Clean output directory if requested
  if (CLEAN) {
    console.log(`\n   Cleaning ${OUTPUT_DIR}...`);
    removeDir(OUTPUT_DIR);
  }

  // 5. Write individual GeoJSON files
  ensureDir(OUTPUT_DIR);

  let written = 0;
  const familyCounts = {};

  for (const [glottocode, { meta, polygons }] of languageMap) {
    if (polygons.length === 0) continue;

    const family = meta.Family || 'Unclassified';
    const subDir = path.join(OUTPUT_DIR, family);
    ensureDir(subDir);

    // Build geometry: Polygon if single, MultiPolygon if multiple
    let geometry;
    if (polygons.length === 1) {
      geometry = {
        type: 'Polygon',
        coordinates: polygons[0]
      };
    } else {
      geometry = {
        type: 'MultiPolygon',
        coordinates: polygons
      };
    }

    const geojsonFeature = {
      type: 'Feature',
      properties: {
        language: meta.Name || glottocode,
        nativeName: meta.Name || glottocode,
        family: meta.Family || '',
        macroarea: meta.Macroarea || '',
        glottocode: meta.Glottocode || glottocode,
        iso639: meta.ISO639P3code || ''
      },
      geometry
    };

    const filePath = path.join(subDir, `${glottocode}.geojson`);
    fs.writeFileSync(filePath, JSON.stringify(geojsonFeature, null, 2));

    written++;
    familyCounts[family] = (familyCounts[family] || 0) + 1;
  }

  // 6. Summary
  console.log(`\n   Written: ${written} files to ${OUTPUT_DIR}`);
  console.log(`   By family (top 20):`);
  const sortedFamilies = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);
  for (const [fam, count] of sortedFamilies.slice(0, 20)) {
    console.log(`     ${fam}: ${count}`);
  }
  if (sortedFamilies.length > 20) {
    console.log(`     ... and ${sortedFamilies.length - 20} more families`);
  }
  console.log(`\n   Done.\n`);
}

main();
