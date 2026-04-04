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
  singleDay?: boolean;
}

export default function RouteMap({ locations, apiKey, height = '500px', zoom, center, singleDay = false }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || apiKey === 'DEIN_API_KEY_HIER') {
      setError('Google Maps API Key nicht konfiguriert');
      return;
    }

    const initMap = async () => {
      try {
        const { Loader } = await import('@googlemaps/js-api-loader');
        const loader = new Loader({
          apiKey,
          version: 'weekly',
          libraries: ['marker'],
        });

        const { Map, InfoWindow, LatLngBounds, Polyline, SymbolPath } = await loader.importLibrary('maps') as any;
        const { AdvancedMarkerElement, PinElement } = await loader.importLibrary('marker') as any;

        if (!mapRef.current) return;

        const bounds = new LatLngBounds();
        locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));

        // Initialize Map if not already done
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new Map(mapRef.current, {
            center: center || bounds.getCenter().toJSON(),
            zoom: zoom || 4,
            mapId: 'DEMO_MAP_ID', // Required for AdvancedMarkerElement
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });

          infoWindowRef.current = new InfoWindow();
        }

        const map = mapInstanceRef.current!;

        // Clear existing markers and polyline
        markersRef.current.forEach(m => m.map = null);
        markersRef.current = [];
        if (polylineRef.current) polylineRef.current.setMap(null);

        if (!zoom && locations.length > 0) {
          map.fitBounds(bounds, 50);
        } else if (center) {
          map.setCenter(center);
        }

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
            if (infoWindowRef.current) {
              infoWindowRef.current.setContent(`
                <div style="padding: 4px 8px; font-family: Inter, system-ui, sans-serif;">
                  <strong style="color: #1a1a2e;">${loc.name}</strong>
                  ${loc.dayNumber ? `<br><span style="color: #666; font-size: 12px;">Tag ${loc.dayNumber}</span>` : ''}
                </div>
              `);
              infoWindowRef.current.open(map, marker);
            }
          });

          markersRef.current.push(marker);
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

        setMapLoaded(true);
      } catch (err) {
        console.error('Map loading error:', err);
        setError('Karte konnte nicht geladen werden');
      }
    };

    initMap();

    // Cleanup function
    return () => {
      // Note: We keep the mapInstanceRef.current if we want to reuse it, 
      // but we should clear markers if the component unmounts or locations change significantly.
      // For a static Astro island, unmount is the main concern.
    };
  }, [apiKey, locations, zoom, center]);

  if (error) {
    return (
      <div
        style={{ height }}
        className="bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-500 border border-gray-200"
      >
        <span className="text-4xl mb-2">🗺️</span>
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
          style={{ height }}
          className="absolute inset-0 bg-gray-100 flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="animate-pulse text-gray-400">Karte wird geladen...</div>
        </div>
      )}
    </div>
  );
}
