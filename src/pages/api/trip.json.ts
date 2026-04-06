import type { APIRoute } from 'astro';
import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';
import { resolveRef } from '../../lib/content';

function stripLocation(loc: CollectionEntry<'locations'>) {
  const { coordinates, ...data } = loc.data;
  return {
    name: data.name,
    country: data.country,
    coordinates,
    description: data.description,
    highlights: data.highlights.map(({ placeId, coordinates: _c, icon: _i, ...h }) => h),
    restaurants: data.restaurants.map(({ placeId, coordinates: _c, ...r }) => r),
    hotels: data.hotels.map(({ placeId, coordinates: _c, ...h }) => h),
    tips: data.tips,
    nightlife: (data.nightlife || []).map(({ placeId, coordinates: _c, ...n }) => n),
  };
}

export const GET: APIRoute = async () => {
  const [days, locations, countries] = await Promise.all([
    getCollection('days'),
    getCollection('locations'),
    getCollection('countries'),
  ]);

  const locMap = new Map(locations.map(l => [l.id, l]));
  const findLoc = (ref: { id: string; collection: string } | string) => {
    const id = resolveRef(ref);
    return locMap.get(id) || locations.find(l => l.data.id === id);
  };

  const sortedDays = [...days].sort((a, b) => a.data.dayNumber - b.data.dayNumber);

  const itinerary = sortedDays.map(day => {
    const d = day.data;
    const loc = findLoc(d.locationId);
    const overnightLoc = d.overnightLocationId ? findLoc(d.overnightLocationId) : null;
    const additionalLocs = (d.additionalLocationIds || [])
      .map((ref) => findLoc(ref))
      .filter(Boolean);

    return {
      dayNumber: d.dayNumber,
      date: d.date,
      title: d.title,
      subtitle: d.subtitle,
      driving: d.driving,
      evCharging: d.evCharging,
      activities: d.activities,
      location: loc ? stripLocation(loc) : null,
      additionalLocations: additionalLocs.map(stripLocation),
      overnightLocation: overnightLoc ? overnightLoc.data.name : null,
    };
  });

  const payload = {
    meta: {
      title: 'Baltic Roadtrip 2026',
      dates: '30. April – 17. Mai 2026',
      days: 18,
      countries: 10,
      vehicle: 'VW ID.4 (77 kWh)',
      totalDistance: '~5.500 km',
      url: 'https://ribeach.github.io/baltic-roadtrip/',
      llmsTxt: 'https://ribeach.github.io/baltic-roadtrip/llms.txt',
    },
    countries: countries.map(c => c.data),
    itinerary,
  };

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
};
