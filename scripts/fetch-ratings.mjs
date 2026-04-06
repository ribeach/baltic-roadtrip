#!/usr/bin/env node

/**
 * Fetch Google Maps ratings for all places in location JSON files
 * using the Places API (New) and store them in the JSON data.
 *
 * Usage:
 *   node scripts/fetch-ratings.mjs            # Fetch and write
 *   node scripts/fetch-ratings.mjs --dry-run   # Preview without writing
 *   node scripts/fetch-ratings.mjs --force      # Re-fetch even if ratings exist
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
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const DELAY_MS = 200;
const CATEGORY_KEYS = ['highlights', 'restaurants', 'hotels', 'nightlife'];

// ── Load all location files ─────────────────────────────────────────────────

const locationFiles = readdirSync(LOCATIONS_DIR).filter(f => f.endsWith('.json')).sort();
const locations = locationFiles.map(file => ({
  file,
  path: join(LOCATIONS_DIR, file),
  data: JSON.parse(readFileSync(join(LOCATIONS_DIR, file), 'utf-8')),
}));

// ── Collect unique placeIds ─────────────────────────────────────────────────

const placeIdSet = new Set();
let totalEntries = 0;

for (const loc of locations) {
  for (const key of CATEGORY_KEYS) {
    for (const item of loc.data[key] || []) {
      if (item.placeId) {
        placeIdSet.add(item.placeId);
        totalEntries++;
      }
    }
  }
}

console.log(`📍 Found ${totalEntries} entries with ${placeIdSet.size} unique placeIds across ${locations.length} locations`);

// ── Determine which placeIds to fetch ───────────────────────────────────────

const existingRatings = new Map();
if (!FORCE) {
  for (const loc of locations) {
    for (const key of CATEGORY_KEYS) {
      for (const item of loc.data[key] || []) {
        if (item.placeId && item.rating !== undefined) {
          existingRatings.set(item.placeId, { rating: item.rating, userRatingCount: item.userRatingCount });
        }
      }
    }
  }
}

const placeIdsToFetch = [...placeIdSet].filter(id => !existingRatings.has(id));
console.log(`🔍 Need to fetch: ${placeIdsToFetch.length} (${existingRatings.size} already have ratings${FORCE ? ', --force ignores existing' : ''})`);

// ── Fetch ratings from Places API ───────────────────────────────────────────

const ratings = new Map(existingRatings);
let fetched = 0;
let failed = 0;

for (const placeId of placeIdsToFetch) {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;

  if (DRY_RUN) {
    console.log(`   🔍 Would fetch: ${placeId}`);
    fetched++;
    continue;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'rating,userRatingCount',
      },
    });

    if (!res.ok) {
      // Retry once on 429
      if (res.status === 429) {
        console.log(`   ⏳ Rate limited, waiting 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        const retry = await fetch(url, {
          headers: {
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'rating,userRatingCount',
          },
        });
        if (retry.ok) {
          const data = await retry.json();
          if (data.rating) {
            ratings.set(placeId, { rating: data.rating, userRatingCount: data.userRatingCount });
          }
          console.log(`   ✅ ${placeId}: ${data.rating ?? 'no rating'} (${data.userRatingCount ?? 0} reviews) [retry]`);
          fetched++;
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }
      }
      console.error(`   ⚠️  ${placeId}: HTTP ${res.status}`);
      failed++;
      await new Promise(r => setTimeout(r, DELAY_MS));
      continue;
    }

    const data = await res.json();
    if (data.rating) {
      ratings.set(placeId, { rating: data.rating, userRatingCount: data.userRatingCount });
    }
    console.log(`   ✅ ${placeId}: ${data.rating ?? 'no rating'} (${data.userRatingCount ?? 0} reviews)`);
    fetched++;
  } catch (err) {
    console.error(`   ❌ ${placeId}: ${err.message}`);
    failed++;
  }

  await new Promise(r => setTimeout(r, DELAY_MS));
}

if (DRY_RUN) {
  console.log(`\n📊 Dry run complete: ${fetched} would be fetched, ${failed} failed`);
  process.exit(0);
}

// ── Write ratings back to JSON files ────────────────────────────────────────

let updated = 0;

for (const loc of locations) {
  let modified = false;

  for (const key of CATEGORY_KEYS) {
    for (const item of loc.data[key] || []) {
      const ratingData = ratings.get(item.placeId);
      if (ratingData) {
        if (item.rating !== ratingData.rating || item.userRatingCount !== ratingData.userRatingCount) {
          item.rating = ratingData.rating;
          item.userRatingCount = ratingData.userRatingCount;
          modified = true;
          updated++;
        }
      }
    }
  }

  if (modified) {
    writeFileSync(loc.path, JSON.stringify(loc.data, null, 2) + '\n');
    console.log(`💾 Updated ${loc.file}`);
  }
}

console.log(`\n📊 Done: ${fetched} fetched, ${failed} failed, ${updated} entries updated`);
