# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static website for a 17-day EV roadtrip through the Baltic region, built with Astro 6, React (islands), Tailwind CSS v4, and TypeScript. Deployed to GitHub Pages at `https://ribeach.github.io/baltic-roadtrip/`.

## Commands

```bash
npm run dev        # Dev server at http://localhost:4321/baltic-roadtrip/
npm run build      # Build static site to ./dist/
npm run preview    # Preview production build locally
```

No test framework is configured.

## Architecture

### Content Collections (src/content/)

All trip data lives in JSON files validated by Zod schemas defined in `src/content/content.config.ts`:

- **days/** — 17 files (day-01.json to day-17.json): itinerary per day with driving info, EV charging status, activities
- **locations/** — 17 files: city details with highlights, restaurants, hotels, tips, nightlife
- **countries/** — 7 files: currency, EV charging infrastructure, driving rules, culinary info

Collections reference each other: days → locations (via `locationId`), locations → countries (via `country`).

### Routing (src/pages/)

All routes are statically generated via `getStaticPaths()`:

- `/` — Homepage with map + timeline
- `/tag/[1-17]` — Day detail pages (generated from days collection)
- `/ort/[locationId]` — Location detail pages (generated from locations collection)
- `/kulinarik`, `/praktisches`, `/budget` — Static info pages

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
