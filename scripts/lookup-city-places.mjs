#!/usr/bin/env node

/**
 * Batch lookup Google Place IDs for location-level (city/town) entries.
 * Outputs results for review, then applies with --apply flag.
 *
 * Usage:
 *   node scripts/lookup-city-places.mjs              # Lookup and save results
 *   node scripts/lookup-city-places.mjs --apply      # Apply results to location JSON files
 *   node scripts/lookup-city-places.mjs --dry-run    # Preview queries without API calls
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LOCATIONS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'locations');
const RESULTS_PATH = join(import.meta.dirname, 'city-places-results.json');
const DELAY_MS = 200;

const envFile = readFileSync(join(import.meta.dirname, '..', '.env'), 'utf-8');
const API_KEY = envFile.match(/PUBLIC_GOOGLE_MAPS_API_KEY=(.+)/)?.[1]?.trim();
if (!API_KEY) {
  console.error('PUBLIC_GOOGLE_MAPS_API_KEY not found in .env');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

// Country ID → English name for search queries
const COUNTRY_EN = {
  'czech-republic': 'Czech Republic',
  'denmark': 'Denmark',
  'estonia': 'Estonia',
  'finland': 'Finland',
  'germany': 'Germany',
  'latvia': 'Latvia',
  'lithuania': 'Lithuania',
  'norway': 'Norway',
  'poland': 'Poland',
  'sweden': 'Sweden',
};

// Custom queries for locations where the German name or location type
// needs special handling for the Places API
const CUSTOM_QUERIES = {
  'curonian-spit': 'Curonian Spit Lithuania',
  'gdansk': 'Gdańsk Poland',
  'gothenburg': 'Gothenburg Sweden',
  'hill-of-crosses': 'Hill of Crosses Šiauliai Lithuania',
  'klaipeda': 'Klaipėda Lithuania',
  'kutna-hora': 'Kutná Hora Czech Republic',
  'lahemaa': 'Lahemaa National Park Estonia',
  'lodz': 'Łódź Poland',
  'luebeck': 'Lübeck Germany',
  'masuria': 'Masuria Poland',
  'mons-klint': 'Møns Klint Denmark',
  'orebro': 'Örebro Sweden',
  'paldiski': 'Paldiski Estonia',
  'parnu': 'Pärnu Estonia',
  'prague': 'Prague Czech Republic',
  'rundale': 'Rundāle Palace Latvia',
  'sigulda-gauja': 'Sigulda Latvia',
  'trakai': 'Trakai Castle Lithuania',
  'warsaw': 'Warsaw Poland',
  'wroclaw': 'Wrocław Poland',
  'copenhagen': 'Copenhagen Denmark',
  'jurmala': 'Jūrmala Latvia',
  'kuldiga': 'Kuldīga Latvia',
  'halmstad': 'Halmstad Sweden',
  'haapsalu': 'Haapsalu Estonia',
  'rjukan': 'Rjukan Norway',
  'fredrikstad': 'Fredrikstad Norway',
  'fiskars': 'Fiskars Village Finland',
};

// ── Places API lookup ───────────────────────────────────────────────────────

async function lookupPlace(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: query }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data.places || data.places.length === 0) return null;

  const place = data.places[0];
  return {
    placeId: place.id,
    displayName: place.displayName?.text || query,
  };
}

// ── Apply mode ──────────────────────────────────────────────────────────────

function applyResults() {
  let results;
  try {
    results = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
  } catch {
    console.error('No results file found. Run without --apply first.');
    process.exit(1);
  }

  let applied = 0;
  for (const [id, data] of Object.entries(results)) {
    const filePath = join(LOCATIONS_DIR, `${id}.json`);
    let content;
    try {
      content = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      console.log(`  Skipping ${id}: file not found`);
      continue;
    }

    if (content.placeId) {
      console.log(`  Skipping ${id}: already has placeId`);
      continue;
    }

    content.placeId = data.placeId;

    // Write with consistent formatting: insert placeId after description
    const raw = readFileSync(filePath, 'utf-8');
    const updated = raw.replace(
      /("description":\s*"[^"]*")/,
      `$1,\n  "placeId": "${data.placeId}"`
    );

    if (updated === raw) {
      // Fallback: just set the field and rewrite
      writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
    } else {
      writeFileSync(filePath, updated);
    }

    console.log(`  Applied ${id}: ${data.placeId}`);
    applied++;
  }

  console.log(`\nApplied placeId to ${applied} files`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (APPLY) {
    applyResults();
    return;
  }

  const files = readdirSync(LOCATIONS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Looking up ${files.length} locations${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  const results = {};
  let found = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const loc = JSON.parse(readFileSync(join(LOCATIONS_DIR, file), 'utf-8'));
    const id = loc.id;

    // Build query
    const query = CUSTOM_QUERIES[id] || `${loc.name}, ${COUNTRY_EN[loc.country] || loc.country}`;

    if (DRY_RUN) {
      console.log(`  [${i + 1}/${files.length}] ${id} → "${query}"`);
      continue;
    }

    try {
      const result = await lookupPlace(query);
      if (!result) {
        console.log(`  [${i + 1}/${files.length}] No result: ${id} → "${query}"`);
        failed++;
        continue;
      }

      results[id] = {
        placeId: result.placeId,
        displayName: result.displayName,
        query,
      };

      console.log(`  [${i + 1}/${files.length}] ${id} → ${result.displayName} (${result.placeId})`);
      found++;
    } catch (err) {
      console.log(`  [${i + 1}/${files.length}] Error: ${id} → ${err.message}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  if (DRY_RUN) {
    console.log(`\nDry run: ${files.length} queries would be looked up`);
    return;
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nDone: ${found} found, ${failed} failed`);
  console.log(`Results written to: ${RESULTS_PATH}`);
  console.log(`Review results, then run with --apply to patch location files.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
