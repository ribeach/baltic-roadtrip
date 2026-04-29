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
/*  Location finder — O(1) lookup by entry ID or data.id              */
/* ------------------------------------------------------------------ */

/** Build a location finder that handles both Astro entry IDs and JSON data.id. */
export function createLocationFinder(locations: { id: string; data: { id: string } }[]) {
  const byId = new Map<string, (typeof locations)[number]>();
  for (const l of locations) {
    byId.set(l.id, l);
    if (l.data.id !== l.id) byId.set(l.data.id, l);
  }
  return (ref: ContentRef | string) => byId.get(resolveRef(ref));
}

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

/* ------------------------------------------------------------------ */
/*  Current location — match today (Europe/Berlin) against day.date    */
/* ------------------------------------------------------------------ */

export interface CurrentLocation {
  id: string;
  name: string;
  dayNumber: number | null;
  isHome: boolean;
}

const BERLIN_TZ = 'Europe/Berlin';
const isoDateInBerlin = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN_TZ }).format(d);

interface DayLike {
  data: {
    dayNumber: number;
    date: Date;
    status?: 'planned' | 'completed' | 'idea';
    locationId: ContentRef | string;
  };
}
interface LocationLike { id: string; data: { id: string; name: string } }

/**
 * Resolve "where are the travelers today" against the planned itinerary.
 * Falls back to Aalen (home) before the first day, after the last day, or on
 * any day that's not in the collection.
 *
 * Uses Europe/Berlin so the indicator flips at local midnight, not UTC.
 */
export function getCurrentLocation(days: DayLike[], locations: LocationLike[]): CurrentLocation {
  const today = isoDateInBerlin(new Date());
  const find = createLocationFinder(locations);

  const match = days.find(d => {
    const status = d.data.status ?? 'planned';
    return status !== 'idea' && isoDateInBerlin(d.data.date) === today;
  });

  if (match) {
    const loc = find(match.data.locationId);
    if (loc) {
      return {
        id: loc.data.id,
        name: loc.data.name,
        dayNumber: match.data.dayNumber,
        isHome: loc.data.id === 'aalen',
      };
    }
  }

  const aalen = find('aalen');
  return {
    id: 'aalen',
    name: aalen?.data.name ?? 'Aalen',
    dayNumber: null,
    isHome: true,
  };
}
