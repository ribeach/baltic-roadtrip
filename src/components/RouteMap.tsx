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
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || apiKey === 'DEIN_API_KEY_HIER') {
      setError('Google Maps API Key nicht konfiguriert');
      return;
    }

    const loadMap = async () => {
      try {
        const { Loader } = await import('@googlemaps/js-api-loader');
        const loader = new Loader({
          apiKey,
          version: 'weekly',
          libraries: ['marker'],
        });

        const google = await loader.load();
        if (!mapRef.current) return;

        const bounds = new google.maps.LatLngBounds();
        locations.forEach(loc => bounds.extend({ lat: loc.lat, lng: loc.lng }));

        const map = new google.maps.Map(mapRef.current, {
          center: center || bounds.getCenter().toJSON(),
          zoom: zoom || undefined,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d6e5' }] },
            { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0f2f5' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e6a919' }, { weight: 1.5 }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          ],
        });

        if (!zoom) {
          map.fitBounds(bounds, 50);
        }

        // Add markers
        locations.forEach((loc, i) => {
          const marker = new google.maps.Marker({
            position: { lat: loc.lat, lng: loc.lng },
            map,
            title: loc.name,
            label: {
              text: loc.dayNumber ? String(loc.dayNumber) : String(i + 1),
              color: '#1a1a2e',
              fontWeight: 'bold',
              fontSize: '11px',
            },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#e6a919',
              fillOpacity: 1,
              strokeColor: '#1a1a2e',
              strokeWeight: 2,
              scale: 14,
            },
          });

          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="padding: 4px 8px; font-family: Inter, system-ui, sans-serif;">
                <strong style="color: #1a1a2e;">${loc.name}</strong>
                ${loc.dayNumber ? `<br><span style="color: #666; font-size: 12px;">Tag ${loc.dayNumber}</span>` : ''}
              </div>
            `,
          });

          marker.addListener('click', () => {
            infoWindow.open(map, marker);
          });
        });

        // Draw route polyline
        if (locations.length > 1) {
          new google.maps.Polyline({
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

    loadMap();
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
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-md">
      <div ref={mapRef} style={{ height, width: '100%' }} />
      {!mapLoaded && (
        <div
          style={{ height }}
          className="absolute inset-0 bg-gray-100 flex items-center justify-center"
        >
          <div className="animate-pulse text-gray-400">Karte wird geladen...</div>
        </div>
      )}
    </div>
  );
}
