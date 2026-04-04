import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const resolveRef = (ref: any): string =>
  typeof ref === 'object' && ref !== null ? ref.id : ref;

function formatDate(date: Date): string {
  const d = new Date(date);
  d.setHours(12);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
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

  const lines: string[] = [];
  const ln = (s = '') => lines.push(s);

  ln('# Baltic Roadtrip 2026');
  ln();
  ln('> 17-Tage-Roadtrip mit E-Auto (VW ID.4, 77 kWh) durch 7 Länder: Deutschland, Polen, Litauen, Lettland, Estland, Finnland, Schweden. ~4.000 km Gesamtstrecke. 30. April – 16. Mai 2026.');
  ln();
  ln('Website: https://ribeach.github.io/baltic-roadtrip/');
  ln('Vollständige Daten (JSON): https://ribeach.github.io/baltic-roadtrip/api/trip.json');
  ln();

  // Route overview table
  ln('## Route im Überblick');
  ln();
  ln('| Tag | Datum | Ort | Fahrt | EV-Laden |');
  ln('|-----|-------|-----|-------|----------|');
  for (const day of sortedDays) {
    const d = day.data;
    const loc = findLoc(d.locationId);
    const locName = loc?.data.name || '?';
    const driving = d.driving
      ? `${d.driving.distance}, ${d.driving.duration}h`
      : '—';
    const ev = d.evCharging
      ? `${d.evCharging.criticalLevel === 'green' ? '🟢' : d.evCharging.criticalLevel === 'yellow' ? '🟡' : '🔴'} ${d.evCharging.stopsNeeded} Stopps`
      : '—';
    ln(`| ${d.dayNumber} | ${formatDate(d.date)} | ${locName} | ${driving} | ${ev} |`);
  }
  ln();

  // Day-by-day details (show location info only on first occurrence)
  ln('## Tagesplan');
  ln();
  const shownLocations = new Set<string>();
  for (const day of sortedDays) {
    const d = day.data;
    const loc = findLoc(d.locationId);
    const locData = loc?.data;
    const locId = loc?.id;
    const isFirstVisit = locId && !shownLocations.has(locId);
    if (locId) shownLocations.add(locId);

    ln(`### Tag ${d.dayNumber}: ${d.title} (${formatDate(d.date)})`);
    ln(`*${d.subtitle}*`);
    if (d.driving) {
      ln(`Fahrt: ${d.driving.distance}, ${d.driving.duration}h (${d.driving.mode}) — ${d.driving.routeDescription}`);
    }
    if (d.evCharging) {
      ln(`EV-Laden: ${d.evCharging.notes}`);
    }
    ln(`Aktivitäten: ${d.activities.map((a: any) => typeof a === 'string' ? a : a.highlightRef).join(' | ')}`);

    if (locData && isFirstVisit) {
      if (locData.highlights.length > 0) {
        ln(`Highlights: ${locData.highlights.map(h => h.name).join(', ')}`);
      }
      if (locData.restaurants.length > 0) {
        ln(`Restaurants: ${locData.restaurants.map(r => `${r.name} (${r.cuisine}, ${r.priceRange})`).join(', ')}`);
      }
      if (locData.hotels.length > 0) {
        ln(`Hotels: ${locData.hotels.map(h => `${h.name} (${h.priceRange}${h.evCharging ? ', EV-Laden' : ''})`).join(', ')}`);
      }
      if (locData.tips.length > 0) {
        ln(`Tipps: ${locData.tips.map(t => `[${t.type}] ${t.text}`).join(' | ')}`);
      }
    } else if (locData && !isFirstVisit) {
      ln(`Ort: ${locData.name} (siehe oben)`);
    }
    ln();
  }

  // Country info
  ln('## Länderinfos');
  ln();
  for (const country of countries) {
    const c = country.data;
    ln(`### ${c.flag} ${c.name}`);
    ln(`Währung: ${c.currency.code} (${c.currency.name})${c.currency.cashNeeded ? ' — Bargeld empfohlen' : ''}. ${c.currency.tip}`);
    ln(`EV-Laden: ${c.evCharging.quality}. DC-Preis: ${c.evCharging.medianDcPrice}. Apps: ${c.evCharging.recommendedApps.join(', ')}. ${c.evCharging.notes}`);
    ln(`Tempolimits: Stadt ${c.driving.speedLimits.urban}, Land ${c.driving.speedLimits.rural}, Autobahn ${c.driving.speedLimits.motorway} km/h. Maut: ${c.driving.tolls}. ${c.driving.specialRules}`);
    ln(`Kulinarik: ${c.culinary.mustTry.join(', ')}. ${c.culinary.description}`);
    ln();
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
