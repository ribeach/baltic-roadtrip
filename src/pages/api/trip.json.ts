import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const resolveRef = (ref: any): string =>
  typeof ref === 'object' && ref !== null ? ref.id : ref;

function stripLocation(loc: any) {
  const { coordinates, ...data } = loc.data;
  return {
    name: data.name,
    country: data.country,
    coordinates,
    description: data.description,
    highlights: data.highlights.map(({ placeId, coordinates, icon, ...h }: any) => h),
    restaurants: data.restaurants.map(({ placeId, coordinates, ...r }: any) => r),
    hotels: data.hotels.map(({ placeId, coordinates, ...h }: any) => h),
    tips: data.tips,
    nightlife: (data.nightlife || []).map(({ placeId, coordinates, ...n }: any) => n),
  };
}

export const GET: APIRoute = async () => {
  const [days, locations, countries] = await Promise.all([
    getCollection('days'),
    getCollection('locations'),
    getCollection('countries'),
  ]);

  const locMap = new Map(locations.map(l => [l.id, l]));
  const findLoc = (ref: any) => {
    const id = resolveRef(ref);
    return locMap.get(id) || locations.find(l => l.data.id === id);
  };

  const sortedDays = [...days].sort((a, b) => a.data.dayNumber - b.data.dayNumber);

  const itinerary = sortedDays.map(day => {
    const d = day.data;
    const loc = findLoc(d.locationId);
    const overnightLoc = d.overnightLocationId ? findLoc(d.overnightLocationId) : null;
    const additionalLocs = (d.additionalLocationIds || [])
      .map((ref: any) => findLoc(ref))
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
      dates: '30. April – 16. Mai 2026',
      days: 17,
      countries: 8,
      vehicle: 'VW ID.4 (77 kWh)',
      totalDistance: '~4.500 km',
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
