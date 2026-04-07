import { useEffect, useMemo, useRef, useState } from 'react';

interface MapLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dayNumber?: number;
  link?: string;
  label?: string;
  assigned?: boolean;
  placeId?: string;
}

interface POI {
  name: string;
  lat: number;
  lng: number;
  category: 'highlight' | 'restaurant' | 'hotel' | 'nightlife';
  googleMapsUrl: string;
  placeId?: string;
}

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const target of ['lat', 'lng'] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (target === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const POI_STYLES: Record<POI['category'], { background: string; border: string; glyph: string }> = {
  highlight: { background: '#e6a919', border: '#b8860b', glyph: '\u2605' },   // ★
  restaurant: { background: '#22c55e', border: '#16a34a', glyph: '\uD83C\uDF74' }, // 🍴
  hotel: { background: '#3b82f6', border: '#2563eb', glyph: '\uD83C\uDFE8' },     // 🏨
  nightlife: { background: '#a855f7', border: '#7c3aed', glyph: '\uD83C\uDF78' }, // 🍸
};

interface Props {
  locations: MapLocation[];
  apiKey: string;
  height?: string;
  zoom?: number;
  center?: { lat: number; lng: number };
  pois?: POI[];
  polylines?: string[];
}

export default function RouteMap({ locations, apiKey, height = '500px', zoom, center, pois = [], polylines = [] }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stabilize array/object props so useEffect doesn't re-fire on every render
  const locationsKey = useMemo(() => JSON.stringify(locations), [locations]);
  const poisKey = useMemo(() => JSON.stringify(pois), [pois]);
  const centerKey = useMemo(() => JSON.stringify(center), [center]);
  const polylinesKey = useMemo(() => JSON.stringify(polylines), [polylines]);

  useEffect(() => {
    if (!apiKey || apiKey === 'DEIN_API_KEY_HIER') {
      setError('Google Maps API Key nicht konfiguriert');
      return;
    }

    if (locations.length === 0) {
      setError('Keine Orte zum Anzeigen');
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      try {
        setError(null);
        setMapLoaded(false);

        const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');
        // v2 loader converts camelCase to snake_case for URL params:
        // "apiKey" becomes "api_key" but Google expects "key"
        setOptions({ key: apiKey, version: 'weekly' } as { key: string; version: string });

        const mapsLib = await importLibrary('maps') as google.maps.MapsLibrary;
        const markerLib = await importLibrary('marker') as google.maps.MarkerLibrary;
        // Load places library when POIs or locations need rich info cards
        if (pois.length > 0 || locations.some(loc => loc.placeId)) {
          await importLibrary('places');
        }

        if (cancelled || !mapRef.current) return;

        const { Map, InfoWindow, Polyline } = mapsLib;
        const { AdvancedMarkerElement, PinElement } = markerLib;

        // Clean up previous markers and polylines
        markersRef.current.forEach(m => { m.map = null; });
        markersRef.current = [];
        polylinesRef.current.forEach(p => p.setMap(null));
        polylinesRef.current = [];

        const bounds = new google.maps.LatLngBounds();
        locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));
        pois.forEach(poi => bounds.extend({ lat: poi.lat, lng: poi.lng }));

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            center: center || bounds.getCenter().toJSON(),
            zoom: zoom || 4,
            mapId: 'DEMO_MAP_ID',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });
        }

        const map = mapInstanceRef.current;

        if (!zoom && locations.length > 0) {
          map.fitBounds(bounds, 50);
        } else if (zoom) {
          map.setCenter(center || bounds.getCenter().toJSON());
          map.setZoom(zoom);
        }

        // Shared info window (reused across markers), header disabled to avoid white space
        const infoWindow = new InfoWindow({ headerDisabled: true });

        // Helper: wrap content in a container with a close button
        function wrapWithClose(content: HTMLElement): HTMLElement {
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position: relative;';
          const closeBtn = document.createElement('button');
          closeBtn.textContent = '\u00d7';
          closeBtn.style.cssText = 'position: absolute; bottom: 4px; right: 4px; z-index: 1; background: rgba(0,0,0,0.5); color: #fff; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 16px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;';
          closeBtn.addEventListener('click', () => infoWindow.close());
          wrapper.appendChild(closeBtn);
          wrapper.appendChild(content);
          return wrapper;
        }

        // AdvancedMarkerElement with custom HTML for circular markers
        // Assigned (default) locations get amber markers; unassigned get muted gray
        locations.forEach((loc, i) => {
          const isAssigned = loc.assigned !== false;
          const labelText = loc.label ?? (loc.dayNumber ? String(loc.dayNumber) : isAssigned ? String(i + 1) : '');

          const markerDiv = document.createElement('div');
          markerDiv.style.cssText = isAssigned
            ? `width: 28px; height: 28px; border-radius: 50%;
               background: #e6a919; border: 2px solid #1a1a2e;
               display: flex; align-items: center; justify-content: center;
               font-family: Inter, system-ui, sans-serif;
               font-size: 11px; font-weight: bold; color: #1a1a2e;
               cursor: pointer;`
            : `width: 22px; height: 22px; border-radius: 50%;
               background: #9ca3af; border: 2px solid #6b7280;
               display: flex; align-items: center; justify-content: center;
               font-family: Inter, system-ui, sans-serif;
               font-size: 9px; font-weight: bold; color: #fff;
               cursor: pointer; opacity: 0.8;`;
          markerDiv.textContent = labelText;

          const marker = new AdvancedMarkerElement({
            position: { lat: loc.lat, lng: loc.lng },
            map,
            title: loc.name,
            content: markerDiv,
            gmpClickable: true,
          });

          marker.addListener('gmp-click', () => {
            if (loc.placeId) {
              // Rich city info card via Places UI Kit
              const placeDetails = document.createElement('gmp-place-details-compact') as HTMLElement;
              placeDetails.setAttribute('orientation', 'horizontal');
              placeDetails.setAttribute('truncation-preferred', '');
              placeDetails.style.cssText = 'width: 350px; border: none; padding: 0; margin: 0;';

              const placeRequest = document.createElement('gmp-place-details-place-request');
              placeRequest.setAttribute('place', loc.placeId);
              placeDetails.appendChild(placeRequest);

              placeDetails.appendChild(document.createElement('gmp-place-all-content'));

              const wrapper = document.createElement('div');
              wrapper.appendChild(placeDetails);
              if (loc.link) {
                const navLink = document.createElement('a');
                navLink.href = loc.link;
                navLink.style.cssText = 'display: block; text-align: center; padding: 6px 0 2px; color: #e6a919; font-size: 12px; text-decoration: none; font-weight: 500; font-family: Inter, system-ui, sans-serif;';
                navLink.textContent = loc.dayNumber ? `Tag ${loc.dayNumber} →` : `${loc.name} entdecken →`;
                wrapper.appendChild(navLink);
              }
              infoWindow.setContent(wrapWithClose(wrapper));
            } else {
              const content = document.createElement('div');
              content.style.cssText = 'padding: 4px 8px; font-family: Inter, system-ui, sans-serif;';
              if (loc.link) {
                const link = document.createElement('a');
                link.href = loc.link;
                link.style.cssText = 'color: #1a1a2e; text-decoration: none; font-weight: bold;';
                link.textContent = loc.name;
                content.appendChild(link);
                if (loc.dayNumber) {
                  content.appendChild(document.createElement('br'));
                  const dayLink = document.createElement('a');
                  dayLink.href = loc.link;
                  dayLink.style.cssText = 'color: #e6a919; font-size: 12px; text-decoration: none; font-weight: 500;';
                  dayLink.textContent = `Tag ${loc.dayNumber} →`;
                  content.appendChild(dayLink);
                }
              } else {
                const strong = document.createElement('strong');
                strong.style.color = '#1a1a2e';
                strong.textContent = loc.name;
                content.appendChild(strong);
                if (loc.dayNumber) {
                  content.appendChild(document.createElement('br'));
                  const span = document.createElement('span');
                  span.style.cssText = 'color: #666; font-size: 12px;';
                  span.textContent = `Tag ${loc.dayNumber}`;
                  content.appendChild(span);
                }
              }
              infoWindow.setContent(wrapWithClose(content));
            }
            infoWindow.open({ map, anchor: marker });
          });

          markersRef.current.push(marker);
        });

        // Route polylines
        if (polylines.length > 0) {
          for (const encoded of polylines) {
            const path = decodePolyline(encoded);
            polylinesRef.current.push(new Polyline({
              path,
              strokeColor: '#1a1a2e',
              strokeOpacity: 0.7,
              strokeWeight: 3,
              map,
            }));
          }
        } else if (locations.length > 1 && locations.every(loc => loc.assigned !== false)) {
          // Only draw a fallback straight-line route when all locations are assigned
          // (avoids chaotic lines on library pages with unassigned locations)
          polylinesRef.current.push(new Polyline({
            path: locations.map(loc => ({ lat: loc.lat, lng: loc.lng })),
            geodesic: true,
            strokeColor: '#1a1a2e',
            strokeOpacity: 0.7,
            strokeWeight: 3,
            map,
          }));
        }

        // POI markers with PinElement pins and Places UI Kit info cards
        pois.forEach(poi => {
          const style = POI_STYLES[poi.category];

          const pin = new PinElement({
            background: style.background,
            borderColor: style.border,
            glyphColor: '#ffffff',
            glyphText: style.glyph,
            scale: 1.0,
          });

          const marker = new AdvancedMarkerElement({
            position: { lat: poi.lat, lng: poi.lng },
            map,
            title: poi.name,
            content: pin,
            gmpClickable: true,
          });

          marker.addListener('gmp-click', () => {
            if (poi.placeId) {
              // Rich place info card via Places UI Kit
              const placeDetails = document.createElement('gmp-place-details-compact') as HTMLElement;
              placeDetails.setAttribute('orientation', 'horizontal');
              placeDetails.setAttribute('truncation-preferred', '');
              placeDetails.style.cssText = 'width: 400px; border: none; padding: 0; margin: 0;';

              const placeRequest = document.createElement('gmp-place-details-place-request');
              placeRequest.setAttribute('place', poi.placeId);
              placeDetails.appendChild(placeRequest);

              placeDetails.appendChild(document.createElement('gmp-place-all-content'));

              infoWindow.setContent(wrapWithClose(placeDetails));
            } else {
              // Fallback: simple name + link
              const content = document.createElement('div');
              content.style.cssText = 'padding: 6px 10px; font-family: Inter, system-ui, sans-serif; max-width: 200px;';
              const name = document.createElement('strong');
              name.style.cssText = 'color: #1a1a2e; display: block; margin-bottom: 4px;';
              name.textContent = poi.name;
              content.appendChild(name);
              const link = document.createElement('a');
              link.href = poi.googleMapsUrl;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.style.cssText = 'color: #e6a919; font-size: 12px; text-decoration: none; font-weight: 500;';
              link.textContent = 'In Google Maps öffnen →';
              content.appendChild(link);
              infoWindow.setContent(wrapWithClose(content));
            }
            infoWindow.open({ map, anchor: marker });
          });

          markersRef.current.push(marker);
        });

        if (!cancelled) setMapLoaded(true);
      } catch (err) {
        console.error('Map loading error:', err);
        if (!cancelled) setError('Karte konnte nicht geladen werden');
      }
    };

    initMap();

    return () => {
      cancelled = true;
      markersRef.current.forEach(m => { m.map = null; });
      markersRef.current = [];
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [apiKey, locationsKey, zoom, centerKey, poisKey, polylinesKey]);

  if (error) {
    return (
      <div
        role="alert"
        style={{ height }}
        className="bg-paper rounded-xl flex flex-col items-center justify-center text-gray-500 border border-sand-200"
      >
        <span className="text-4xl mb-2" aria-hidden="true">🗺️</span>
        <p className="text-sm font-medium">{error}</p>
        <p className="text-xs mt-1">Setze PUBLIC_GOOGLE_MAPS_API_KEY in der .env Datei</p>
        <a
          href={`https://www.google.com/maps/dir/${locations.map(l => `${l.lat},${l.lng}`).join('/')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium"
        >
          Route in Google Maps öffnen →
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-sand-200 shadow-sm"
      aria-label="Interaktive Karte der Reiseroute"
    >
      <div ref={mapRef} style={{ height, width: '100%' }} />
      {!mapLoaded && (
        <div
          role="status"
          aria-live="polite"
          style={{ height }}
          className="absolute inset-0 bg-sand-100 flex items-center justify-center"
        >
          <div className="animate-pulse text-gray-400">Karte wird geladen...</div>
        </div>
      )}
    </div>
  );
}
