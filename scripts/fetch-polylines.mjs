#!/usr/bin/env node

/**
 * Fetch encoded route polylines from the Google Directions API
 * and store them in the day JSON files.
 *
 * Usage:
 *   node scripts/fetch-polylines.mjs            # Fetch and write
 *   node scripts/fetch-polylines.mjs --dry-run   # Preview without writing
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const envFile = readFileSync(join(import.meta.dirname, '..', '.env'), 'utf-8');
const API_KEY = envFile.match(/PUBLIC_GOOGLE_MAPS_API_KEY=(.+)/)?.[1]?.trim();
if (!API_KEY) {
  console.error('❌ PUBLIC_GOOGLE_MAPS_API_KEY not found in .env');
  process.exit(1);
}

const DAYS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'days');
const LOCATIONS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'locations');
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 200;

// ── Load locations ──────────────────────────────────────────────────────────

const locationCoords = new Map();
for (const file of readdirSync(LOCATIONS_DIR).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(join(LOCATIONS_DIR, file), 'utf-8'));
  locationCoords.set(data.id, data.coordinates);
}

console.log(`📍 Loaded ${locationCoords.size} locations`);

// ── Load and process days ───────────────────────────────────────────────────

const dayFiles = readdirSync(DAYS_DIR).filter(f => f.endsWith('.json')).sort();
let fetched = 0;
let skipped = 0;
let failed = 0;

for (const file of dayFiles) {
  const filePath = join(DAYS_DIR, file);
  const day = JSON.parse(readFileSync(filePath, 'utf-8'));

  if (!day.driving || day.driving.mode === 'none') {
    console.log(`⏭️  Day ${day.dayNumber}: no driving — skipped`);
    skipped++;
    continue;
  }

  if (day.driving.encodedPolyline) {
    console.log(`✅ Day ${day.dayNumber}: already has polyline — skipped`);
    skipped++;
    continue;
  }

  // Resolve origin
  const originId = day.previousLocationId || 'aalen';
  const origin = locationCoords.get(originId);
  if (!origin) {
    console.error(`❌ Day ${day.dayNumber}: origin "${originId}" not found`);
    failed++;
    continue;
  }

  // Resolve destination
  const destId = day.locationId;
  const dest = locationCoords.get(destId);
  if (!dest) {
    console.error(`❌ Day ${day.dayNumber}: destination "${destId}" not found`);
    failed++;
    continue;
  }

  // Resolve waypoints
  const waypointIds = day.transitLocationIds || [];
  const waypoints = waypointIds.map(id => locationCoords.get(id)).filter(Boolean);

  const routeDesc = `${originId} → ${waypointIds.length ? waypointIds.join(' → ') + ' → ' : ''}${destId}`;
  console.log(`🗺️  Day ${day.dayNumber}: ${routeDesc}`);

  if (DRY_RUN) {
    console.log(`   (dry run — would fetch Directions API)`);
    fetched++;
    continue;
  }

  // Build Directions API URL
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    key: API_KEY,
  });
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map(w => `${w.lat},${w.lng}`).join('|'));
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.error(`   ⚠️  API returned ${data.status}: ${data.error_message || 'no routes'}`);
      failed++;
      continue;
    }

    const encodedPolyline = data.routes[0].overview_polyline.points;
    day.driving.encodedPolyline = encodedPolyline;

    writeFileSync(filePath, JSON.stringify(day, null, 2) + '\n');
    console.log(`   ✅ Saved (${encodedPolyline.length} chars)`);
    fetched++;
  } catch (err) {
    console.error(`   ❌ Fetch error: ${err.message}`);
    failed++;
  }

  // Rate limit
  await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\n📊 Done: ${fetched} fetched, ${skipped} skipped, ${failed} failed`);
if (DRY_RUN) console.log('   (dry run — no files were modified)');
