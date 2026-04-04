#!/usr/bin/env node

/**
 * Migration script: Replace Google Maps search URLs with stable Place ID URLs.
 * Also adds placeId and coordinates fields to each POI entry.
 *
 * Usage:
 *   node scripts/fix-maps-urls.mjs            # Run migration
 *   node scripts/fix-maps-urls.mjs --dry-run   # Preview without writing files
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const envFile = readFileSync(join(import.meta.dirname, '..', '.env'), 'utf-8');
const API_KEY = envFile.match(/PUBLIC_GOOGLE_MAPS_API_KEY=(.+)/)?.[1]?.trim();
if (!API_KEY) {
  console.error('❌ PUBLIC_GOOGLE_MAPS_API_KEY not found in .env');
  process.exit(1);
}
const LOCATIONS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'locations');
const KULINARIK_PATH = join(import.meta.dirname, '..', 'src', 'pages', 'kulinarik.astro');
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 200;

// ── Phase A: Extract all unique googleMapsUrl values ────────────────────────

function extractUrlsFromJson(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const urls = [];
  for (const section of ['highlights', 'restaurants', 'hotels', 'nightlife']) {
    if (!data[section]) continue;
    for (const entry of data[section]) {
      if (entry.googleMapsUrl) urls.push(entry.googleMapsUrl);
    }
  }
  return urls;
}

function extractUrlsFromAstro(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const pattern = /https:\/\/maps\.google\.com\/?\?q=[^'"}\s]+/g;
  return [...text.matchAll(pattern)].map(m => m[0]);
}

// ── Phase B: Query Places API ───────────────────────────────────────────────

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

function extractQuery(url) {
  const match = url.match(/\?q=(.+)/);
  if (!match) return null;
  return decodeURIComponent(match[1].replace(/\+/g, ' '));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no files will be written\n' : '🚀 Running migration\n');

  // Collect all unique URLs
  const jsonFiles = readdirSync(LOCATIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(LOCATIONS_DIR, f));

  const allUrls = new Set();
  for (const file of jsonFiles) {
    for (const url of extractUrlsFromJson(file)) allUrls.add(url);
  }
  for (const url of extractUrlsFromAstro(KULINARIK_PATH)) allUrls.add(url);

  console.log(`Found ${allUrls.size} unique URLs to process\n`);

  // Look up each URL
  const mapping = new Map(); // oldUrl -> { placeId, displayName, lat, lng, newUrl }
  const failures = [];
  let count = 0;

  for (const url of allUrls) {
    count++;
    const query = extractQuery(url);
    if (!query) {
      console.log(`  ⚠️  [${count}/${allUrls.size}] Could not extract query from: ${url}`);
      failures.push({ url, reason: 'no query' });
      continue;
    }

    try {
      const result = await lookupPlace(query);
      if (!result) {
        console.log(`  ⚠️  [${count}/${allUrls.size}] No result for: ${query}`);
        failures.push({ url, query, reason: 'no results' });
        continue;
      }

      const newUrl = buildSmartUrl(result.displayName, result.placeId);
      mapping.set(url, {
        placeId: result.placeId,
        displayName: result.displayName,
        lat: result.lat,
        lng: result.lng,
        newUrl,
      });

      console.log(`  ✅ [${count}/${allUrls.size}] "${query}" → ${result.displayName} (${result.placeId})`);
    } catch (err) {
      console.log(`  ❌ [${count}/${allUrls.size}] Error for "${query}": ${err.message}`);
      failures.push({ url, query, reason: err.message });
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n📊 Lookup complete: ${mapping.size} found, ${failures.length} failed\n`);

  if (DRY_RUN) {
    if (failures.length > 0) {
      console.log('Failures:');
      for (const f of failures) console.log(`  - ${f.query || f.url}: ${f.reason}`);
    }
    return;
  }

  // Phase C: Write JSON files
  let filesModified = 0;
  let entriesUpdated = 0;

  for (const filePath of jsonFiles) {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    let modified = false;

    for (const section of ['highlights', 'restaurants', 'hotels', 'nightlife']) {
      if (!data[section]) continue;
      for (const entry of data[section]) {
        const result = mapping.get(entry.googleMapsUrl);
        if (!result) continue;

        entry.googleMapsUrl = result.newUrl;
        entry.placeId = result.placeId;
        if (result.lat != null && result.lng != null) {
          entry.coordinates = { lat: result.lat, lng: result.lng };
        }
        modified = true;
        entriesUpdated++;
      }
    }

    if (modified) {
      writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      filesModified++;
      console.log(`  📝 Updated: ${filePath.split('/').pop()}`);
    }
  }

  // Phase D: Write kulinarik.astro
  let kulinarikText = readFileSync(KULINARIK_PATH, 'utf-8');
  let kulinarikUpdated = 0;
  for (const [oldUrl, result] of mapping) {
    if (kulinarikText.includes(oldUrl)) {
      kulinarikText = kulinarikText.replaceAll(oldUrl, result.newUrl);
      kulinarikUpdated++;
    }
  }
  if (kulinarikUpdated > 0) {
    writeFileSync(KULINARIK_PATH, kulinarikText);
    console.log(`  📝 Updated: kulinarik.astro (${kulinarikUpdated} URLs)`);
  }

  // Phase E: Summary
  console.log(`\n✅ Migration complete!`);
  console.log(`   ${entriesUpdated} entries updated across ${filesModified} JSON files`);
  console.log(`   ${kulinarikUpdated} URLs updated in kulinarik.astro`);
  console.log(`   ${failures.length} failures (kept original URLs)`);

  if (failures.length > 0) {
    console.log('\n⚠️  Failed lookups (original URLs preserved):');
    for (const f of failures) console.log(`   - ${f.query || f.url}: ${f.reason}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
