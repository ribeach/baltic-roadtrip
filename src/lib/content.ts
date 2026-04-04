/**
 * Shared helpers for content collection reference resolution and base URL handling.
 *
 * Astro's `reference()` returns `{ id: string; collection: string }` at runtime,
 * not a plain string. These helpers provide a single, typed way to extract the ID.
 */

interface ContentRef {
  id: string;
  collection: string;
}

/** Extract the plain string ID from an Astro content reference (or pass through if already a string). */
export const resolveRef = (ref: ContentRef | string): string =>
  typeof ref === 'object' && ref !== null ? ref.id : ref;

/** Return BASE_URL with a guaranteed trailing slash. */
export const getBase = () => import.meta.env.BASE_URL.replace(/\/?$/, '/');

/* ------------------------------------------------------------------ */
/*  Map POI helpers — collect from all category arrays & deduplicate   */
/* ------------------------------------------------------------------ */

export interface MapPOI {
  name: string;
  lat: number;
  lng: number;
  category: 'highlight' | 'restaurant' | 'hotel' | 'nightlife';
  googleMapsUrl: string;
  placeId: string;
}

type LocWithCoords = {
  name: string;
  coordinates: { lat: number; lng: number };
  googleMapsUrl: string;
  placeId: string;
};

/** Collect POIs from all four category arrays of a location. */
export function collectLocationPois(loc: {
  highlights: LocWithCoords[];
  restaurants: LocWithCoords[];
  hotels: LocWithCoords[];
  nightlife?: LocWithCoords[];
}): MapPOI[] {
  const toMapPoi = (category: MapPOI['category']) =>
    (item: LocWithCoords): MapPOI => ({
      name: item.name, lat: item.coordinates.lat, lng: item.coordinates.lng,
      category, googleMapsUrl: item.googleMapsUrl, placeId: item.placeId,
    });
  return [
    ...loc.highlights.map(toMapPoi('highlight')),
    ...loc.restaurants.map(toMapPoi('restaurant')),
    ...loc.hotels.map(toMapPoi('hotel')),
    ...(loc.nightlife || []).map(toMapPoi('nightlife')),
  ];
}

const CATEGORY_PRIORITY: Record<MapPOI['category'], number> = {
  highlight: 0, restaurant: 1, nightlife: 2, hotel: 3,
};

/** Deduplicate POIs by placeId, keeping the highest-priority category. */
export function deduplicateMapPois(pois: MapPOI[]): MapPOI[] {
  const seen = new Map<string, MapPOI>();
  for (const poi of pois) {
    const existing = seen.get(poi.placeId);
    if (!existing || CATEGORY_PRIORITY[poi.category] < CATEGORY_PRIORITY[existing.category]) {
      seen.set(poi.placeId, poi);
    }
  }
  return Array.from(seen.values());
}
