#!/usr/bin/env node

/**
 * Replace constructed Google Maps search URLs (?api=1&query=…&query_place_id=…)
 * with the stable CID-based URL returned by the Places API in `googleMapsUri`.
 *
 * The constructed search URLs frequently fall back to a generic results page
 * when the human-readable query no longer matches Google's index, while the
 * CID URL resolves directly to the place card.
 *
 * Usage:
 *   node scripts/refresh-maps-urls.mjs            # Refresh and write
 *   node scripts/refresh-maps-urls.mjs --dry-run   # Preview without writing
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadApiKey() {
  const envPath = join(import.meta.dirname, '..', '.env');
  if (existsSync(envPath)) {
    const envFile = readFileSync(envPath, 'utf-8');
    const match = envFile.match(/PUBLIC_GOOGLE_MAPS_API_KEY=(.+)/)?.[1]?.trim();
    if (match) return match;
  }
  return process.env.PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? null;
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error('❌ PUBLIC_GOOGLE_MAPS_API_KEY not found in .env or environment');
  process.exit(1);
}

const LOCATIONS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'locations');
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 200;
const CATEGORY_KEYS = ['highlights', 'restaurants', 'hotels', 'apartments', 'nightlife'];

const locationFiles = readdirSync(LOCATIONS_DIR).filter(f => f.endsWith('.json')).sort();
const locations = locationFiles.map(file => ({
  file,
  path: join(LOCATIONS_DIR, file),
  data: JSON.parse(readFileSync(join(LOCATIONS_DIR, file), 'utf-8')),
}));

function needsRefresh(url) {
  return typeof url === 'string' && url.includes('query_place_id=');
}

function placeIdFromUrl(url) {
  return url.match(/query_place_id=([^&]+)/)?.[1] ?? null;
}

const targets = [];
for (const loc of locations) {
  for (const key of CATEGORY_KEYS) {
    for (const entry of loc.data[key] || []) {
      if (!needsRefresh(entry.googleMapsUrl)) continue;
      const placeId = entry.placeId || placeIdFromUrl(entry.googleMapsUrl);
      if (!placeId) {
        console.warn(`   ⚠️  ${loc.file} → ${key} → ${entry.name}: no placeId, skipping`);
        continue;
      }
      targets.push({ loc, key, entry, placeId });
    }
  }
}

console.log(`📍 Found ${targets.length} entries needing URL refresh across ${locations.length} files`);

function stripTrackingParams(uri) {
  if (!uri) return uri;
  // Strip Google's source-attribution tracking suffix (e.g. &g_mp=…) so the
  // stored URLs match the bare ?cid=… form already in some files.
  return uri.replace(/&g_mp=[^&]*/, '').replace(/\?g_mp=[^&]*&/, '?');
}

async function getPlaceById(placeId) {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const headers = {
    'X-Goog-Api-Key': API_KEY,
    'X-Goog-FieldMask': 'id,googleMapsUri,location',
  };

  let res = await fetch(url, { headers });
  if (res.status === 429) {
    console.log(`   ⏳ Rate limited, waiting 2s...`);
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, { headers });
  }
  if (res.status === 404) return { notFound: true };
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return {
    placeId: data.id,
    googleMapsUri: stripTrackingParams(data.googleMapsUri) ?? null,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  };
}

async function searchPlace(textQuery) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.googleMapsUri,places.location',
    },
    body: JSON.stringify({ textQuery }),
  });
  if (!res.ok) {
    throw new Error(`searchText HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;
  return {
    placeId: place.id,
    googleMapsUri: stripTrackingParams(place.googleMapsUri) ?? null,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
  };
}

let refreshed = 0;
let unchanged = 0;
let failed = 0;
let relookedUp = 0;

for (let i = 0; i < targets.length; i++) {
  const { loc, key, entry, placeId } = targets[i];
  const label = `[${i + 1}/${targets.length}] ${loc.file} → ${key} → ${entry.name}`;

  try {
    let result = await getPlaceById(placeId);
    let newPlaceId = null;
    let newCoords = null;

    if (result.notFound) {
      const textQuery = `${entry.name} ${loc.data.name}`.trim();
      console.log(`   🔁 ${label}: placeId 404, searching "${textQuery}"`);
      await new Promise(r => setTimeout(r, DELAY_MS));
      const found = await searchPlace(textQuery);
      if (!found || !found.googleMapsUri) {
        console.warn(`   ⚠️  ${label}: text search failed, keeping original`);
        failed++;
        await new Promise(r => setTimeout(r, DELAY_MS));
        continue;
      }
      result = found;
      newPlaceId = found.placeId;
      if (found.lat != null && found.lng != null) {
        newCoords = { lat: found.lat, lng: found.lng };
      }
      relookedUp++;
    }

    const newUrl = result.googleMapsUri;
    if (!newUrl) {
      console.warn(`   ⚠️  ${label}: API returned no googleMapsUri, keeping original`);
      failed++;
    } else if (newUrl === entry.googleMapsUrl && !newPlaceId) {
      console.log(`   ➖ ${label}: already correct`);
      unchanged++;
    } else {
      if (DRY_RUN) {
        console.log(`   🔄 ${label}`);
        console.log(`      old: ${entry.googleMapsUrl}`);
        console.log(`      new: ${newUrl}`);
        if (newPlaceId) console.log(`      placeId: ${placeId} → ${newPlaceId}`);
      } else {
        entry.googleMapsUrl = newUrl;
        if (newPlaceId) entry.placeId = newPlaceId;
        if (newCoords) entry.coordinates = newCoords;
        console.log(`   ✅ ${label} → ${newUrl}`);
      }
      refreshed++;
    }
  } catch (err) {
    console.error(`   ❌ ${label}: ${err.message}`);
    failed++;
  }

  await new Promise(r => setTimeout(r, DELAY_MS));
}

if (!DRY_RUN && refreshed > 0) {
  const filesTouched = new Set(targets.map(t => t.loc));
  for (const loc of filesTouched) {
    writeFileSync(loc.path, JSON.stringify(loc.data, null, 2) + '\n');
    console.log(`💾 Wrote ${loc.file}`);
  }
}

console.log(
  `\n📊 Done: ${refreshed} refreshed (${relookedUp} via text search), ${unchanged} unchanged, ${failed} failed${DRY_RUN ? ' (dry run, no files written)' : ''}`,
);
