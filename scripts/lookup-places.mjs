#!/usr/bin/env node

/**
 * Batch lookup Google Places data for new POIs.
 * Reads queries from a JSON file and outputs placeId, googleMapsUrl, and coordinates.
 *
 * Usage:
 *   node scripts/lookup-places.mjs                    # Run lookups from embedded list
 *   node scripts/lookup-places.mjs --input queries.json  # Read queries from file
 *   node scripts/lookup-places.mjs --dry-run           # Preview without API calls
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const envFile = readFileSync(join(import.meta.dirname, '..', '.env'), 'utf-8');
const API_KEY = envFile.match(/PUBLIC_GOOGLE_MAPS_API_KEY=(.+)/)?.[1]?.trim();
if (!API_KEY) {
  console.error('❌ PUBLIC_GOOGLE_MAPS_API_KEY not found in .env');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 200;

// ── Default queries for the POI enrichment batch ────────────────────────────

const DEFAULT_QUERIES = [
  // Stockholm
  { key: 'stockholm/vasa-museum', query: 'Vasa Museum Stockholm Sweden' },
  { key: 'stockholm/gamla-stan', query: 'Gamla Stan Stockholm Sweden' },
  { key: 'stockholm/fotografiska', query: 'Fotografiska Stockholm Sweden' },
  { key: 'stockholm/rosendals', query: 'Rosendals Trädgård Stockholm Sweden' },
  { key: 'stockholm/nobelmuseum', query: 'Nobel Prize Museum Stortorget Stockholm Sweden' },
  { key: 'stockholm/pelikan', query: 'Pelikan restaurant Blekingegatan Stockholm Sweden' },
  // Berlin
  { key: 'berlin/ddr-museum', query: 'DDR Museum Berlin Germany' },
  { key: 'berlin/topographie', query: 'Topography of Terror Berlin Germany' },
  // Gdansk
  { key: 'gdansk/oliwa-cathedral', query: 'Oliwa Cathedral Gdansk Poland' },
  { key: 'gdansk/amber-museum', query: 'Amber Museum Gdansk Great Mill Poland' },
  // Masuria
  { key: 'masuria/boat-trips', query: 'Żegluga Mazurska Giżycko Poland' },
  { key: 'masuria/swieta-lipka', query: 'Basilica Święta Lipka Poland' },
  { key: 'masuria/canal-locks', query: 'Kanał Mazurski Leśniewo Górne Poland' },
  // Vilnius
  { key: 'vilnius/bernardine-garden', query: 'Bernardine Garden Vilnius Lithuania' },
  { key: 'vilnius/paupys-market', query: 'Paupys Market Vilnius Lithuania' },
  // Klaipeda
  { key: 'klaipeda/sculpture-park', query: 'Klaipėda Sculpture Park Lithuania' },
  // Curonian Spit
  { key: 'spit/dead-dune-trail', query: 'Nagliai Nature Reserve Curonian Spit Lithuania' },
  // Riga
  { key: 'riga/national-art-museum', query: 'Latvian National Museum of Art Riga Latvia' },
  { key: 'riga/ethnographic-museum', query: 'Latvian Ethnographic Open-Air Museum Riga Latvia' },
  { key: 'riga/agenskalns-market', query: 'Āgenskalns Market Riga Latvia' },
  // Sigulda/Gauja
  { key: 'sigulda/cesis-castle', query: 'Cēsis Medieval Castle Latvia' },
  // Tallinn
  { key: 'tallinn/kadriorg-palace', query: 'Kadriorg Palace Tallinn Estonia' },
  { key: 'tallinn/kumu', query: 'KUMU Art Museum Tallinn Estonia' },
  { key: 'tallinn/fotografiska', query: 'Fotografiska Tallinn Estonia' },
  { key: 'tallinn/rotermanni', query: 'Rotermanni Quarter Tallinn Estonia' },
  { key: 'tallinn/rost-bakery', query: 'RØST Bakery Rotermanni Tallinn Estonia' },
  // Lahemaa
  { key: 'lahemaa/palmse-manor', query: 'Palmse Manor Lahemaa Estonia' },
  // Helsinki
  { key: 'helsinki/design-district', query: 'Helsinki Design District Finland' },
];

// ── Places API lookup ───────────────────────────────────────────────────────

async function lookupPlace(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.googleMapsUri,places.location',
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
    lat: place.location?.latitude,
    lng: place.location?.longitude,
  };
}

function buildSmartUrl(displayName, placeId) {
  const encodedName = encodeURIComponent(displayName);
  return `https://www.google.com/maps/search/?api=1&query=${encodedName}&query_place_id=${placeId}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Load queries from file or use defaults
  const inputIdx = process.argv.indexOf('--input');
  const queries = inputIdx !== -1
    ? JSON.parse(readFileSync(process.argv[inputIdx + 1], 'utf-8'))
    : DEFAULT_QUERIES;

  console.log(`📍 Looking up ${queries.length} places${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  const results = {};
  let found = 0;
  let failed = 0;

  for (let i = 0; i < queries.length; i++) {
    const { key, query } = queries[i];

    if (DRY_RUN) {
      console.log(`  🔍 [${i + 1}/${queries.length}] Would look up: "${query}"`);
      continue;
    }

    try {
      const result = await lookupPlace(query);
      if (!result) {
        console.log(`  ⚠️  [${i + 1}/${queries.length}] No result: "${query}"`);
        failed++;
        continue;
      }

      const googleMapsUrl = buildSmartUrl(result.displayName, result.placeId);
      results[key] = {
        placeId: result.placeId,
        displayName: result.displayName,
        googleMapsUrl,
        coordinates: { lat: result.lat, lng: result.lng },
      };

      console.log(`  ✅ [${i + 1}/${queries.length}] "${query}" → ${result.displayName} (${result.placeId})`);
      found++;
    } catch (err) {
      console.log(`  ❌ [${i + 1}/${queries.length}] Error: "${query}" — ${err.message}`);
      failed++;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  if (DRY_RUN) {
    console.log(`\n📊 Dry run: ${queries.length} queries would be looked up`);
    return;
  }

  // Write results
  const outputPath = join(import.meta.dirname, '..', 'scripts', 'places-lookup-results.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2) + '\n');

  console.log(`\n📊 Done: ${found} found, ${failed} failed`);
  console.log(`💾 Results written to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
