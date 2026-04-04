import { useEffect, useRef, useState } from 'react';

interface MapLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dayNumber?: number;
}

interface Props {
  locations: MapLocation[];
  apiKey: string;
  height?: string;
  zoom?: number;
  center?: { lat: number; lng: number };
}

export default function RouteMap({ locations, apiKey, height = '500px', zoom, center }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        // v2 API: use setOptions + importLibrary
        const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');

        setOptions({ apiKey, version: 'weekly' });

        const mapsLib = await importLibrary('maps') as google.maps.MapsLibrary;
        const markerLib = await importLibrary('marker') as google.maps.MarkerLibrary;

        if (cancelled || !mapRef.current) return;

        const { Map, InfoWindow, Polyline } = mapsLib;
        const { AdvancedMarkerElement, PinElement } = markerLib;

        // Clean up previous markers and polyline
        markersRef.current.forEach(m => (m as any).map = null);
        markersRef.current = [];
        polylineRef.current?.setMap(null);
        polylineRef.current = null;

        const bounds = new google.maps.LatLngBounds();
        locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));

        // Create or reuse map
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            center: center || bounds.getCenter().toJSON(),
            zoom: zoom || 4,
            mapId: 'baltic-roadtrip-map',
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

        // Shared info window
        const infoWindow = new InfoWindow();

        // Add markers
        locations.forEach((loc, i) => {
          const pin = new PinElement({
            background: '#e6a919',
            borderColor: '#1a1a2e',
            glyphColor: '#1a1a2e',
            glyph: loc.dayNumber ? String(loc.dayNumber) : String(i + 1),
            scale: 1.2,
          });

          const marker = new AdvancedMarkerElement({
            position: { lat: loc.lat, lng: loc.lng },
            map,
            title: loc.name,
            content: pin.element,
          });

          marker.addListener('click', () => {
            const content = document.createElement('div');
            content.style.cssText = 'padding: 4px 8px; font-family: Inter, system-ui, sans-serif;';
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
            infoWindow.setContent(content);
            infoWindow.open({ map, anchor: marker });
          });

          markersRef.current.push(marker as any);
        });

        // Draw route polyline
        if (locations.length > 1) {
          polylineRef.current = new Polyline({
            path: locations.map(loc => ({ lat: loc.lat, lng: loc.lng })),
            geodesic: true,
            strokeColor: '#1a1a2e',
            strokeOpacity: 0.7,
            strokeWeight: 3,
            map,
          });
        }

        if (!cancelled) setMapLoaded(true);
      } catch (err) {
        console.error('Map loading error:', err);
        if (!cancelled) setError('Karte konnte nicht geladen werden');
      }
    };

    initMap();

    return () => {
      cancelled = true;
      markersRef.current.forEach(m => (m as any).map = null);
      markersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
  }, [apiKey, locations, zoom, center]);

  if (error) {
    return (
      <div
        role="alert"
        style={{ height }}
        className="bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-500 border border-gray-200"
      >
        <span className="text-4xl mb-2" aria-hidden="true">🗺️</span>
        <p className="text-sm font-medium">{error}</p>
        <p className="text-xs mt-1">Setze PUBLIC_GOOGLE_MAPS_API_KEY in der .env Datei</p>
        <a
          href={`https://www.google.com/maps/dir/${locations.map(l => `${l.lat},${l.lng}`).join('/')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-sm text-amber-500 hover:text-amber-600 font-medium"
        >
          Route in Google Maps öffnen →
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-gray-200 shadow-md"
      aria-label="Interaktive Karte der Reiseroute"
    >
      <div ref={mapRef} style={{ height, width: '100%' }} />
      {!mapLoaded && (
        <div
          role="status"
          aria-live="polite"
          style={{ height }}
          className="absolute inset-0 bg-gray-100 flex items-center justify-center"
        >
          <div className="animate-pulse text-gray-400">Karte wird geladen...</div>
        </div>
      )}
    </div>
  );
}
