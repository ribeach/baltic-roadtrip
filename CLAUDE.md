# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static website for an EV roadtrip through the Baltic region, built with Astro 6, React (islands), Tailwind CSS v4, and TypeScript. Deployed to GitHub Pages at `https://ribeach.github.io/baltic-roadtrip/`.

The site uses a **location-first** information architecture: locations are the primary browsable content (independent of any day assignment), while days are an optional planning overlay. This allows flexible trip planning — adding locations as a library, assigning them to days only when needed, and changing the schedule without breaking the site.

The trip is handled spontaneously — only 1–2 days are planned in advance, and the itinerary may change at any time. Day numbers and assignments are merely suggestions, not a fixed schedule. Locations exist independently in the library and can be visited in any order.

## Commands

```bash
npm run dev        # Dev server at http://localhost:4321/baltic-roadtrip/
npm run build      # Build static site to ./dist/
npm run preview    # Preview production build locally
```

No test framework is configured.

## Polylines

Driving polylines (Google-encoded) live inline in each day JSON under
`driving.encodedPolyline`. They are consumed by `RouteMap.tsx` to draw the
route on day pages and the home map. Without a polyline, `RouteMap` falls
back to a straight geodesic line between markers.

**Regenerate after any change to a day's route** — that is, any change to
`previousLocationId`, `transitLocationIds`, or `locationId`:

```bash
node scripts/fetch-polylines.mjs            # fetch and write
node scripts/fetch-polylines.mjs --dry-run  # preview without writing
```

The script skips days that already have `driving.encodedPolyline`. To force
regeneration for a specific day, **delete the `encodedPolyline` field** from
that `day-XX.json` before running the script. Requires
`PUBLIC_GOOGLE_MAPS_API_KEY` in `.env`.

## Architecture

### Content Collections (src/content/)

All trip data lives in JSON files validated by Zod schemas defined in `src/content.config.ts`:

- **days/** — itinerary per day with driving info, EV charging status, activities. Each day has a `status` field (`completed`, `planned`, or `idea`) that defaults to `planned`.
- **locations/** — city/place details with highlights, restaurants, hotels, tips, nightlife. Locations are **independent of days** — they can exist without being assigned to any day. Optional `suggestedDays` and `region` fields support trip planning.
- **countries/** — currency, EV charging infrastructure, driving rules, culinary info

Collections reference each other: days → locations (via `locationId`), locations → countries (via `country`). Not all locations need to be assigned to a day — unassigned locations appear in the location library and on maps as available options.

**Important:** Astro's `reference()` returns `{ id: string, collection: string }` objects at runtime, not plain strings. Use the helpers in `src/lib/content.ts`: `resolveRef()` to extract the ID string, `getBase()` for a trailing-slash-normalized BASE_URL, and `collectLocationPois()`/`deduplicateMapPois()` for building map marker data from location arrays.

### Routing (src/pages/)

All routes are statically generated via `getStaticPaths()`:

- `/` — Homepage with map (shows all locations), dynamic stats, and day timeline
- `/orte` — Location library: browsable index of ALL locations grouped by country, with map
- `/tag/[dayNumber]` — Day detail pages (generated from days collection)
- `/ort/[locationId]` — Location detail pages (generated from locations collection)
- `/uebersicht` — Overview/summary page
- `/kulinarik`, `/praktisches`, `/budget` — Static info pages
- `/llms.txt` — AI-consumable plaintext summary of the trip (generated from collections)
- `/api/trip.json` — Full trip data as structured JSON (for LLM/API consumption)

### React Island

`src/components/RouteMap.tsx` is the only React component, rendered with `client:visible`. Uses `@googlemaps/js-api-loader` and requires `PUBLIC_GOOGLE_MAPS_API_KEY` env var. Falls back gracefully to a Google Maps link when the key is missing.

### Styling

Tailwind CSS v4 with custom theme in `src/styles/global.css`. Key tokens: navy palette (#1a1a2e) for text, amber (#e6a919) for accents, green/yellow/red for EV charging status. Font: Inter via Google Fonts.

### Layout

Single layout wrapper at `src/layouts/BaseLayout.astro`. All text is in German (de-DE locale).

## Base Path

The site runs under `/baltic-roadtrip/` base path. All internal links must account for this — use Astro's BASE_URL handling (normalized with trailing slash in the recent fix).

## Google Maps APIs

The `PUBLIC_GOOGLE_MAPS_API_KEY` in `.env` has access to:

- **Maps JavaScript API** — used by `RouteMap.tsx` for interactive maps
- **Places API (New)** — enabled for place lookups via `places.googleapis.com/v1/places:searchText`. Returns stable Place IDs and `googleMapsUri` (CID-based URLs). All `googleMapsUrl` fields in location JSON files use these stable URLs.
- **Maps Embed API** — free, unlimited; can embed maps via iframe with `place_id` parameter

API endpoint for place lookups:
```
POST https://places.googleapis.com/v1/places:searchText
Headers: X-Goog-Api-Key: <KEY>, X-Goog-FieldMask: places.id,places.displayName,places.googleMapsUri
Body: { "textQuery": "Place Name City Country" }
```

## Environment

- Requires Node.js ≥22.12.0
- `.env` file with `PUBLIC_GOOGLE_MAPS_API_KEY` (see `.env.example`)
- GitHub Actions deploys on push to `main`, injecting the API key from repository secrets

## Out of Scope

- SEO — skip SEO-related suggestions and optimizations.

## Workflow

- Never commit directly to `main` — all changes go through feature branches and pull requests.
- For every fix or feature, create a dedicated branch following the pattern `fix/YYMMDD_description` or `feature/YYMMDD_description` (e.g. `feature/260404_highlights-on-day-pages`).
- After completing the work, commit all changes, push the branch, and create a GitHub pull request.
