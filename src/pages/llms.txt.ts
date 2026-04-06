import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { resolveRef } from '../lib/content';

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
  const findLoc = (ref: { id: string; collection: string } | string) => {
    const id = resolveRef(ref);
    return locMap.get(id) || locations.find(l => l.data.id === id);
  };

  const sortedDays = [...days].sort((a, b) => a.data.dayNumber - b.data.dayNumber);

  const lines: string[] = [];
  const ln = (s = '') => lines.push(s);

  ln('# Baltic Roadtrip 2026');
  ln();
  ln('> 17-Tage-Roadtrip mit E-Auto (VW ID.4, 77 kWh) durch 8 Länder: Deutschland, Polen, Litauen, Lettland, Estland, Finnland, Schweden, Dänemark. ~4.500 km Gesamtstrecke. 30. April – 16. Mai 2026.');
  ln();
  ln('Website: https://ribeach.github.io/baltic-roadtrip/');
  ln('Repo: https://github.com/ribeach/baltic-roadtrip');
  ln('Vollständige Daten (JSON): https://ribeach.github.io/baltic-roadtrip/api/trip.json');
  ln();

  // Trip requirements
  ln('## Reiseanforderungen');
  ln();
  ln('- Reisende: 2 Männer (39 und 42), langjährige Freunde');
  ln('- Fahrzeug: VW ID.4 (2021, 77 kWh), reale Reichweite 350–400 km, max. DC-Ladeleistung 135 kW');
  ln('- Budget: normale bis gehobene Mittelklasse — gute Hotels, Boutique-Unterkünfte oder Ferienwohnungen');
  ln('- Unterkünfte: Zwei separate Einzelzimmer oder Apartment mit getrennten Schlafzimmern (kein geteiltes Zimmer)');
  ln('- Interessen (Priorität): 1. Natur & Nationalparks, 2. Geschichte & Kultur (Sowjet-Erbe, Mittelalter, Hanse), 3. Lokale Küche & Food-Märkte, 4. Besondere Bars & Lokale am Abend');
  ln('- Fahretappen von 5–6 Stunden am Stück sind kein Problem');
  ln('- Kein Stress-Urlaub: Lieber weniger Orte richtig erleben als alles abhaken');
  ln('- Feste Eckpunkte: 1. Mai in Berlin, Baltikum-Rundreise (LT/LV/EE), Finnland-Durchquerung (Helsinki→Turku) mit Nachtfähre nach Stockholm, 2–3 Tage Halmstad (privat, keine Tipps nötig)');
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
    ln(`Aktivitäten: ${d.activities.map((a) => {
      if (typeof a === 'string') return a;
      if ('highlightRef' in a) return a.highlightRef;
      if ('restaurantRef' in a) return a.restaurantRef;
      if ('nightlifeRef' in a) return a.nightlifeRef;
      return '';
    }).filter(Boolean).join(' | ')}`);

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
    const motorway = typeof c.driving.speedLimits.motorway === 'number' ? `${c.driving.speedLimits.motorway} km/h` : String(c.driving.speedLimits.motorway);
    ln(`Tempolimits: Stadt ${c.driving.speedLimits.urban}, Land ${c.driving.speedLimits.rural}, Autobahn ${motorway}. Maut: ${c.driving.tolls}. ${c.driving.specialRules}`);
    ln(`Kulinarik: ${c.culinary.mustTry.join(', ')}. ${c.culinary.description}`);
    ln();
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
