#!/usr/bin/env node
// One-shot import: enriches docs/googlemapsplaces.json via the Google Places API
// (text search with location bias), then patches src/content/locations/*.json —
// flipping visited=true on existing POI matches (by ChIJ placeId) and appending
// new items for the rest into the correct array per a manual assignment table.
//
// Usage:
//   node scripts/match-visited-places.mjs                # fetch + write
//   node scripts/match-visited-places.mjs --dry-run      # don't write JSON
//   node scripts/match-visited-places.mjs --use-cache    # skip API, reuse cache
//
// Requires PUBLIC_GOOGLE_MAPS_API_KEY in .env.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const locationsDir = join(repoRoot, 'src/content/locations');
const placesPath = join(repoRoot, 'docs/googlemapsplaces.json');
const cachePath = join(repoRoot, 'scripts/.places-cache.json');

const DRY = process.argv.includes('--dry-run');
const USE_CACHE = process.argv.includes('--use-cache');

// Load .env for the API key
const envPath = join(repoRoot, '.env');
let apiKey = process.env.PUBLIC_GOOGLE_MAPS_API_KEY;
if (!apiKey && existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf8');
  const m = env.match(/^PUBLIC_GOOGLE_MAPS_API_KEY=(.+)$/m);
  if (m) apiKey = m[1].trim();
}
if (!apiKey) throw new Error('PUBLIC_GOOGLE_MAPS_API_KEY not set');

const places = JSON.parse(readFileSync(placesPath, 'utf8'));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

// ---------- Places API ----------
async function searchText(query, lat, lng) {
  const body = {
    textQuery: query,
    locationBias: {
      circle: { center: { latitude: lat, longitude: lng }, radius: 200 },
    },
    maxResultCount: 1,
  };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.googleMapsUri,places.location,places.rating,places.userRatingCount,places.primaryTypeDisplayName',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Places API ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data.places?.[0];
}

async function enrich(place) {
  const gid = place.google_maps_id;
  if (cache[gid] && cache[gid].id) return cache[gid];
  if (USE_CACHE) return null;
  // Build a tight query — name plus coords as a fallback hint
  let result = null;
  try {
    result = await searchText(place.name, place.location.lat, place.location.lng);
  } catch (e) {
    console.warn(`API error for ${place.name}: ${e.message}`);
  }
  cache[gid] = result || { _miss: true };
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  // Throttle
  await new Promise(r => setTimeout(r, 80));
  return result;
}

// ---------- Locations ----------
const locFiles = readdirSync(locationsDir).filter(f => f.endsWith('.json'));
const locations = {};
for (const f of locFiles) {
  const id = f.replace(/\.json$/, '');
  locations[id] = {
    path: join(locationsDir, f),
    data: JSON.parse(readFileSync(join(locationsDir, f), 'utf8')),
  };
}

// Coordinate proximity fallback (when placeId match misses)
function near(a, b, tol = 0.0006) {
  return Math.abs(a.lat - b.lat) < tol && Math.abs(a.lng - b.lng) < tol;
}

function findExistingPoi(loc, targetArr, placeId, coords) {
  // PlaceId exact-match wins across all arrays — Aparthotel Aurum may live in
  // `hotels` even though the JSON treats it as `apartments`.
  if (placeId) {
    const allArrays = ['highlights', 'restaurants', 'hotels', 'apartments', 'nightlife', 'chargingStations', 'practical'];
    for (const arr of allArrays) {
      const items = loc.data[arr] || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].placeId === placeId) return { arr, idx: i, viaPlaceId: true };
      }
    }
  }
  // Coordinate fallback is scoped to the target array — keeps a Lidl supermarket
  // from colliding with the Lidl charging station at the same physical address.
  if (coords) {
    const items = loc.data[targetArr] || [];
    for (let i = 0; i < items.length; i++) {
      const c = items[i].coordinates;
      if (c && near(c, coords)) return { arr: targetArr, idx: i, viaPlaceId: false };
    }
  }
  return null;
}

// ---------- Assignment table (manual) ----------
// Where each JSON entry goes if no existing POI matches. Keyed by google_maps_id.
// htype = highlight type, ptype = practical type.
const A = {
  // Halmstad
  '0x4651a254b6c70a7b:0x23202ff26da4595a': { loc: 'halmstad', array: 'restaurants', cuisine: 'Pizza' },
  '0x4651a33ad73efbfd:0x3e4ca033406bdae6': { loc: 'halmstad', array: 'chargingStations' },
  '0x4651a3a8c6c3c385:0x3a5d677f9c741c06': { loc: 'halmstad', array: 'practical', ptype: 'supermarket' },
  '0x4651a3158270d825:0x1753436fc45821c8': { loc: 'halmstad', array: 'highlights', htype: 'nature' },
  '0x4651bce6923a9e91:0x7e82d64f7c8e961e': { loc: 'halmstad', array: 'hotels', htype: 'Campground' },
  '0x465a3490080682f1:0xed4730652913d1e2': { loc: 'halmstad', array: 'chargingStations' },
  '0x465a351b09eca05f:0x309d45d0a3397b7e': { loc: 'halmstad', array: 'restaurants', cuisine: 'Burger' },
  '0x46593753d2562e69:0xcab31cf95ec0b0fa': { loc: 'halmstad', array: 'chargingStations' },

  // Stockholm
  '0x465f79f49cb4fdf1:0x2bd2b37fe891c126': { loc: 'stockholm', array: 'practical', ptype: 'ferry-terminal' },

  // Turku
  '0x468c77a6859736d3:0xca7f6d54d76cd056': { loc: 'turku', array: 'practical', ptype: 'ferry-terminal' },
  '0x468c6b0067f755c3:0xa0076590f62a42b6': { loc: 'turku', array: 'restaurants', cuisine: 'Fast Food' },
  '0x468c5babcc726227:0xeaa4ec079265ccb6': { loc: 'turku', array: 'highlights', htype: 'nature' },
  '0x468c6beed54efb97:0x19f7545f72a6268b': { loc: 'turku', array: 'chargingStations' },

  // Lohja
  '0x468dbf4bfb6c8919:0x657b70da525a80f': { loc: 'lohja', array: 'highlights', htype: 'nature' },
  '0x468dc0c67a6f614f:0xf2d6ad69b2eb002c': { loc: 'lohja', array: 'hotels', htype: 'Hotel' },
  '0x468dbf7a7dc4ee3d:0xdb35e4508ee54f81': { loc: 'lohja', array: 'restaurants', cuisine: 'Fast Food' },

  // Fiskars
  '0x468dae69dfa915f5:0x1a59d93eeaca7925': { loc: 'fiskars', array: 'practical', ptype: 'shop' },
  '0x468dae69dfa915f5:0xd9be1ea92d414b59': { loc: 'fiskars', array: 'restaurants', cuisine: 'Café' },
  '0x468daf0050fcf6c3:0x8fa3ca79c690b552': { loc: 'fiskars', array: 'restaurants', cuisine: 'Café / Schokolade' },
  '0x468daf2577ff6277:0x2fa3db27cd73c3bf': { loc: 'fiskars', array: 'restaurants', cuisine: 'Finnisch' },

  // Helsinki
  '0x46920bce46c319b7:0x28a7d7b40911eba2': { loc: 'helsinki', array: 'highlights', htype: 'architecture' },
  '0x46920bd2278b8df1:0xa03dca3ae6b14ca9': { loc: 'helsinki', array: 'highlights', htype: 'architecture' },
  '0x46920b3bb357b531:0x44530d7e5680cbbb': { loc: 'helsinki', array: 'restaurants', cuisine: 'Suppe' },
  '0x46920bc4409832e3:0xd65b1bcdc1c69c97': { loc: 'helsinki', array: 'restaurants', cuisine: 'Bäckerei' },

  // Tallinn
  '0x469294832d936c0b:0xf97f297140aa2b60': { loc: 'tallinn', array: 'hotels', htype: 'Hotel' },

  // Narva
  '0x46944940fdec868b:0x665b3e82b579a8b5': { loc: 'narva', array: 'practical', ptype: 'supermarket' },
  '0x4694481e4e10832b:0x541c3ecb847840b7': { loc: 'narva', array: 'practical', ptype: 'gas' },
  '0x469437db2571a847:0x166d588ea4864d52': { loc: 'narva', array: 'highlights', htype: 'monument' },
  '0x46944827f63acd13:0x346d57a4ca8e330c': { loc: 'narva', array: 'highlights', htype: 'monument' },
  '0x46944820c250d76d:0x93dc12219f4bef2c': { loc: 'narva', array: 'chargingStations' },
  '0x469445243df5621d:0x4e9f256708981abe': { loc: 'narva', array: 'highlights', htype: 'soviet' },
  // Skip Peetri WC

  // Tartu
  '0x469497167f6d2adf:0x266c39e109ae69db': { loc: 'tartu', array: 'restaurants', cuisine: 'Pfannkuchen' },
  '0x46eb36dd74e51e5d:0xf67f9283bedeaadd': { loc: 'tartu', array: 'apartments' },
  '0x46eb36e11be36351:0xcae1ed5b474d5f27': { loc: 'tartu', array: 'restaurants', cuisine: 'Estnisch' },
  '0x46eb36de40daaae5:0x2e0eb021b2f2b9a6': { loc: 'tartu', array: 'chargingStations' },

  // South Estonia
  '0x46eaf6f382bac8ff:0xd8d7b59d217a93de': { loc: 'taevaskoja-otepaa', array: 'highlights', htype: 'viewpoint' },

  // Cesis
  '0x46e95f755ed5cce3:0x3089d36b87d40d6b': { loc: 'cesis', array: 'highlights', htype: 'museum' },

  // Sigulda
  '0x46e959c75c9fc947:0x19aa376c7b88ab20': { loc: 'sigulda-gauja', array: 'highlights', htype: 'soviet' },
  '0x46e951d7dad0a04b:0x988ecc36ca35527': { loc: 'sigulda-gauja', array: 'highlights', htype: 'nature' },

  // Riga
  '0x46eecfd1742cc3a1:0x25408000f2434681': { loc: 'riga', array: 'highlights', htype: 'monument' },
  '0x46eece2cb098446f:0x4ec855f9f6f64474': { loc: 'riga', array: 'hotels', htype: 'Hotel' },
  '0x46eecfd6962df1b3:0xd2275fc056cc9eec': { loc: 'riga', array: 'highlights', htype: 'church' },
  '0x46eecfd6f84d5afb:0x41c9100219c687aa': { loc: 'riga', array: 'practical', ptype: 'tourist-info' },
  '0x46eecfd27375c9ab:0xf321951ed21f35e2': { loc: 'riga', array: 'restaurants', cuisine: 'Lettisch / Bistro' },
  '0x46eecfd9d1bad6cf:0x3ae45688769e1a8': { loc: 'riga', array: 'practical', ptype: 'ferry-terminal' },
  '0x46eecfccac2b29af:0xaa3fa885f639e2c6': { loc: 'riga', array: 'restaurants', cuisine: 'Bagels' },
  '0x46eecfd6e7806d6d:0x26bfe15d84a6252a': { loc: 'riga', array: 'restaurants', cuisine: 'Lettisch' },
  '0x46eecf00709f5bef:0xc7e6e3b43b1f8710': { loc: 'riga', array: 'apartments' },

  // Jurmala / Kemeri
  '0x46eee51e9cea13ab:0xc99b7b0d72b25fe5': { loc: 'jurmala', array: 'chargingStations' },
  '0x46eee5d0d5b5d2b9:0x709a52172acc430d': { loc: 'jurmala', array: 'restaurants', cuisine: 'Bäckerei / Pizza' },
  '0x46eee32664009fed:0x41fbe3923d44630': { loc: 'jurmala', array: 'highlights', htype: 'nature' },
  '0x46eee240a5b0acef:0x55e20586df6c06dc': { loc: 'jurmala', array: 'highlights', htype: 'nature' },

  // Kolka
  '0x46ee012edc11dc93:0xc00f04dfe75376a5': { loc: 'kolka', array: 'highlights', htype: 'nature' },
  '0x46ee01000df6d125:0x899c42cf85e41089': { loc: 'kolka', array: 'practical', ptype: 'parking' },

  // Ventspils + Jūrkalne + Irbene
  '0x46f1c30073639883:0x90848232d5b36434': { loc: 'ventspils', array: 'highlights', htype: 'soviet' },
  '0x46f1c1b794ad8609:0x3d53bfcd39620fe8': { loc: 'ventspils', array: 'highlights', htype: 'architecture' },
  '0x46f1c3003af71877:0xa93c18ae99e6f34b': { loc: 'ventspils', array: 'highlights', htype: 'soviet' },
  '0x46f1c99a09ac29d7:0x8c9f713b994cae8c': { loc: 'ventspils', array: 'restaurants', cuisine: 'International' },
  '0x46f1c9523f1ff057:0xd63ed64806ed4a40': { loc: 'ventspils', array: 'hotels', htype: 'Hotel' },
  '0x46f03b00458bb9ab:0x1628c05c87aaf4dc': { loc: 'ventspils', array: 'restaurants', cuisine: 'Fischladen' },
  '0x46f03b76d88362c7:0x44be35991ad2579b': { loc: 'ventspils', array: 'highlights', htype: 'nature' },
  '0x46f03b7110fbb425:0x6668d535cb2e9a13': { loc: 'ventspils', array: 'practical', ptype: 'supermarket' },
  '0x46f03bdc5f01d4e3:0x47b50db9eb5c7726': { loc: 'ventspils', array: 'practical', ptype: 'parking' },

  // Kuldīga
  '0x46efdb0077876285:0x266d67c2bfa112a': { loc: 'kuldiga', array: 'highlights', htype: 'viewpoint' },
  '0x46efdbb8118921c7:0xcb6069272ae860aa': { loc: 'kuldiga', array: 'highlights', htype: 'nature' },
  '0x46efd13fffffffff:0xe82f2ac1def48a69': { loc: 'kuldiga', array: 'highlights', htype: 'nature' },
  // Skip WC Krasta

  // Liepāja / Pāvilosta coast (no dedicated location, route to klaipeda)
  '0x46e52934ed058209:0xe25cfe8a2f74d04a': { loc: 'klaipeda', array: 'hotels', htype: 'Hotel' },
  '0x46faa5f7c485beeb:0x80cc91f1cede4225': { loc: 'klaipeda', array: 'highlights', htype: 'soviet' },
  '0x46fab1006ca34fe5:0xe21d6252839ba63e': { loc: 'klaipeda', array: 'highlights', htype: 'nature' },
  '0x46fab142d0c53a21:0xda85bb8066e0ae78': { loc: 'klaipeda', array: 'practical', ptype: 'parking' },
  '0x46fab13c6c162c2f:0x75fd727814bfc684': { loc: 'klaipeda', array: 'highlights', htype: 'nature' },

  // Curonian Spit
  '0x46e497edf2f99211:0x245816f4ed77cbe6': { loc: 'curonian-spit', array: 'highlights', htype: 'monument' },
  '0x46e4c22179763f55:0x617be25922bc5ad3': { loc: 'curonian-spit', array: 'highlights', htype: 'viewpoint' },
  '0x46e49700251ae41b:0xaa0db7716b2523ba': { loc: 'curonian-spit', array: 'practical', ptype: 'parking' },
  '0x46e4c3002e6a3571:0x2bf7538d67383918': { loc: 'curonian-spit', array: 'practical', ptype: 'supermarket' },
  '0x46e4c1ea52ec6fbb:0xfb545bbf816d96d3': { loc: 'curonian-spit', array: 'highlights', htype: 'nature' },
  '0x46e4c3fc6eddaf27:0x34db5380a4981c3c': { loc: 'curonian-spit', array: 'chargingStations' },

  // Klaipeda
  '0x46e4dc781351d4a1:0x9dc6f78bded59c7e': { loc: 'klaipeda', array: 'practical', ptype: 'ferry-terminal' },

  // Palanga
  '0x46e433b2809e845f:0x22aa784b2c221d95': { loc: 'palanga', array: 'chargingStations' },
  '0x46e4336dfc8435a7:0xa3329fceebb3ee58': { loc: 'palanga', array: 'practical', ptype: 'gas' },

  // Trakai + Vilnius outskirts
  '0x46ddf36c24788be3:0xc42354dd68ba6032': { loc: 'trakai', array: 'highlights', htype: 'castle' },
  '0x46ddf372890549bb:0xb6e977fbb3de605b': { loc: 'trakai', array: 'restaurants', cuisine: 'Karaim / Kibinai' },
  '0x46ddf3b3b4c3f45f:0xa3359163093d27c0': { loc: 'trakai', array: 'hotels', htype: 'Hotel' },
  '0x46e7676fc2aecb2d:0xad49fd17054f617d': { loc: 'trakai', array: 'practical', ptype: 'supermarket' },
  '0x46e766e1b33d50fd:0x1b11bc7955293cdb': { loc: 'trakai', array: 'chargingStations' },
  '0x46e767f0aa9d6f9f:0x92077fa085900d6b': { loc: 'trakai', array: 'restaurants', cuisine: 'Coffee Drive-Thru' },

  // Kaunas (Prienai)
  '0x46e736b159076a01:0x9a1cd84dc902e4ec': { loc: 'kaunas', array: 'restaurants', cuisine: 'Čeburekai' },
  '0x46e736b135dad77f:0x48fc496365b0ba15': { loc: 'kaunas', array: 'chargingStations' },

  // Masuria
  '0x46e2255c2397e193:0x4f63b7e977811c25': { loc: 'masuria', array: 'highlights', htype: 'soviet' },
  '0x471dbe79757ecad5:0xaafaed154f9a549f': { loc: 'masuria', array: 'chargingStations' },
  '0x471dbf3af783edef:0xa8f1d04d0135d09d': { loc: 'masuria', array: 'restaurants', cuisine: 'Fast Food' },
  '0x46e22145d42f745b:0x9036d713931ee14b': { loc: 'masuria', array: 'restaurants', cuisine: 'Polnisch' },
  '0x46e22158f34cd65f:0x85fb4d22eb849ec7': { loc: 'masuria', array: 'practical', ptype: 'post' },
  '0x46e221a798d11ad3:0xd9c467916364dd39': { loc: 'masuria', array: 'hotels', htype: 'Schlosshotel' },
  '0x46e11f0021355793:0x6945559e7a50c1eb': { loc: 'masuria', array: 'practical', ptype: 'parking' },

  // Łódź
  '0x471a31f962d97983:0x6089bb8a1e2ef4c8': { loc: 'lodz', array: 'restaurants', cuisine: 'Autobahn-Café' },
  '0x471a30d41f9a61db:0x9def74c805e94718': { loc: 'lodz', array: 'chargingStations' },
  '0x471bcb56c4119b59:0xfca7f17fec34f65b': { loc: 'lodz', array: 'highlights', htype: 'architecture' },
  '0x471bcad5b26a678f:0x872e37733216e9df': { loc: 'lodz', array: 'restaurants', cuisine: 'Jüdisch' },
  '0x471bcad56f590385:0x8b631f52908857ff': { loc: 'lodz', array: 'practical', ptype: 'tourist-info' },
  '0x471bcadac1c4c523:0xc635151c4997dfd5': { loc: 'lodz', array: 'hotels', htype: 'Hotel' },
  '0x471bcb0022ea8119:0x67e6b7b3e179bf44': { loc: 'lodz', array: 'highlights', htype: 'architecture' },

  // Wrocław
  '0x470e543defaebfb5:0x106d0792aab0dc9d': { loc: 'wroclaw', array: 'practical', ptype: 'supermarket' },
  '0x470e543d96fa7ca3:0x6f865c208e116515': { loc: 'wroclaw', array: 'chargingStations' },
  '0x470e55006a2411a1:0xcdbea642c596cf47': { loc: 'wroclaw', array: 'restaurants', cuisine: 'Bäckerei' },

  // Prague
  '0x470b95e11f1d7653:0x223394f579a1c77': { loc: 'prague', array: 'practical', ptype: 'parking' },
  '0x470bbe0c7bcfd3fd:0xefd64cf79607bed3': { loc: 'prague', array: 'restaurants', cuisine: 'Coffee' },
  '0x470bbe74aa577ffd:0x1e243ab922a67e6d': { loc: 'prague', array: 'chargingStations' },
  '0x470bbe72259139cb:0x5ee854692f4c6053': { loc: 'prague', array: 'practical', ptype: 'sports' },
  '0x470b945eeb28e5b7:0xc4931549b1742272': { loc: 'prague', array: 'highlights', htype: 'architecture' },
  '0x470b9493318bf7bd:0x81bf0ac8583c1c13': { loc: 'prague', array: 'restaurants', cuisine: 'Fleisch' },
  '0x470b94e939c02f49:0xf17b44b25aa20696': { loc: 'prague', array: 'highlights', htype: 'monument' },
  '0x470b94e93451fa21:0x97ef2407c21e72c4': { loc: 'prague', array: 'highlights', htype: 'architecture' },
  '0x470b94e5e58eb59f:0x75209738d1d3b126': { loc: 'prague', array: 'highlights', htype: 'architecture' },
  '0x470b951e6c24b7c3:0x2acf3c88af12259f': { loc: 'prague', array: 'highlights', htype: 'castle' },
  '0x470b9456e897e4fd:0xd7398ea3f476378e': { loc: 'prague', array: 'restaurants', cuisine: 'Tschechisch' },
  '0x470b945e1381f9c7:0x93b833a931e61df2': { loc: 'prague', array: 'restaurants', cuisine: 'Tschechisch' },
  '0x470b946754067c19:0x6b6cf5efd74be431': { loc: 'prague', array: 'highlights', htype: 'soviet' },
  '0x470b946754adc7b3:0x6a051c51ba1cccd6': { loc: 'prague', array: 'highlights', htype: 'architecture' },
  '0x470b94673d77dd09:0x4c9f4f645f532866': { loc: 'prague', array: 'highlights', htype: 'castle' },
  '0x470b94565e30ae67:0x5dd15545b0bf2070': { loc: 'prague', array: 'hotels', htype: 'Hotel' },

  // Aalen (Waidhaus transit)
  '0x47a024a7bbca5a67:0xd40e4e25ec8edc8f': { loc: 'aalen', array: 'practical', ptype: 'pharmacy' },
  '0x47a024a799139ac7:0x6da2263f32fb198c': { loc: 'aalen', array: 'restaurants', cuisine: 'Bäckerei' },
  '0x47a0253856fe6421:0x2f5a9dd40fc84527': { loc: 'aalen', array: 'chargingStations' },
};

const SKIP = new Set([
  '0x469449001b13bae7:0xa91c0cd0373f1f03', // Peetri WC
  '0x46efdbdd522238ef:0xfd85ae71f5ae02fc', // WC Krasta
]);

function networkFromName(name) {
  const n = name.toLowerCase();
  if (n.includes('tesla')) return 'Tesla';
  if (n.includes('ionity')) return 'IONITY';
  if (n.includes('ignitis')) return 'Ignitis ON';
  if (n.includes('eleport')) return 'Eleport';
  if (n.includes('enefit')) return 'Enefit';
  if (n.includes('bp pulse')) return 'bp pulse';
  if (n.includes('powerdot')) return 'Powerdot';
  if (n.includes('lidl')) return 'Lidl';
  if (n.includes('e.on')) return 'E.ON Drive';
  return undefined;
}

function describe(place) {
  return `Während der Reise besucht.`;
}

function buildNewItem(place, target, enriched) {
  // Always keep the original JSON name and hex gid as placeId so two JSON entries
  // sharing a physical address (e.g. Lidl + its charging station, sub-shops inside
  // a market hall) remain distinct rows. API enrichment is only used for googleMapsUri,
  // rating, and authoritative coordinates.
  const name = place.name;
  const placeId = place.google_maps_id;
  // Prefer API googleMapsUri only when the displayName clearly matches the original name
  const apiName = enriched?.displayName?.text || '';
  const namesMatch = apiName && (
    apiName.toLowerCase().includes(place.name.toLowerCase().split(' ')[0]) ||
    place.name.toLowerCase().includes(apiName.toLowerCase().split(' ')[0])
  );
  const cidFromHex = (() => {
    try {
      const hex = place.google_maps_id.split(':')[1];
      return BigInt(hex).toString();
    } catch { return null; }
  })();
  const url = namesMatch && enriched?.googleMapsUri
    ? enriched.googleMapsUri
    : (cidFromHex ? `https://maps.google.com/?cid=${cidFromHex}` : `https://maps.google.com/?q=${encodeURIComponent(name)}`);
  const coords = namesMatch && enriched?.location
    ? { lat: enriched.location.latitude, lng: enriched.location.longitude }
    : place.location;
  const rating = namesMatch ? enriched?.rating : undefined;
  const userRatingCount = namesMatch ? enriched?.userRatingCount : undefined;

  const ratingFields = (rating != null && userRatingCount != null)
    ? { rating, userRatingCount }
    : {};

  const base = { name, googleMapsUrl: url, placeId, coordinates: coords };

  if (target.array === 'chargingStations') {
    const n = networkFromName(name);
    return { ...base, ...(n ? { network: n } : {}), visited: true };
  }
  if (target.array === 'practical') {
    return { ...base, type: target.ptype || 'other', visited: true };
  }
  if (target.array === 'highlights') {
    return {
      name, type: target.htype || 'monument', icon: 'info',
      description: describe(place), duration: null, price: null,
      googleMapsUrl: url, placeId, coordinates: coords,
      ...ratingFields, visited: true,
    };
  }
  if (target.array === 'restaurants') {
    return {
      name, cuisine: target.cuisine || place.type || 'Restaurant',
      priceRange: '€€', isSplurge: false, description: describe(place),
      mustTry: null, googleMapsUrl: url, placeId, coordinates: coords,
      ...ratingFields, visited: true,
    };
  }
  if (target.array === 'hotels') {
    return {
      name, type: target.htype || place.type || 'Unterkunft',
      priceRange: '€€', isSplurge: false, evCharging: false,
      description: describe(place), googleMapsUrl: url, placeId, coordinates: coords,
      ...ratingFields, visited: true,
    };
  }
  if (target.array === 'apartments') {
    return {
      name, type: place.type || 'Apartment', priceRange: '€€', isSplurge: false,
      description: describe(place), googleMapsUrl: url, placeId, coordinates: coords,
      ...ratingFields, visited: true,
    };
  }
  throw new Error(`Unknown array: ${target.array}`);
}

const report = { matched: 0, added: 0, skipped: 0, apiMisses: 0, unassigned: [], byLocation: {} };

for (const place of places) {
  const gid = place.google_maps_id;
  if (SKIP.has(gid)) { report.skipped++; continue; }
  const target = A[gid];
  if (!target) {
    report.unassigned.push(`${place.name} [${gid}]`);
    continue;
  }
  const loc = locations[target.loc];
  if (!loc) throw new Error(`Unknown location: ${target.loc}`);

  const enriched = await enrich(place);
  if (!enriched || enriched._miss || !enriched.id) report.apiMisses++;

  const lookupId = enriched?.id || null;
  const lookupCoords = enriched?.location
    ? { lat: enriched.location.latitude, lng: enriched.location.longitude }
    : place.location;

  const existing = findExistingPoi(loc, target.array, lookupId, lookupCoords);
  if (existing) {
    const item = loc.data[existing.arr][existing.idx];
    // PlaceId match is trustworthy (Google says they're the same entity, regardless
    // of language differences — e.g. "Prague Castle" vs "Prager Burg (Pražský hrad)").
    // For coordinate fallback matches, do a name-similarity sanity check to guard
    // against sub-shops collapsing into a parent venue.
    let sameThing = existing.viaPlaceId;
    if (!sameThing) {
      const itemFirst = (item.name || '').toLowerCase().split(/[\s—–\-,(]+/)[0];
      const placeFirst = place.name.toLowerCase().split(/[\s—–\-,(]+/)[0];
      sameThing = !!itemFirst && (
        itemFirst === placeFirst ||
        (item.name || '').toLowerCase().includes(placeFirst) ||
        place.name.toLowerCase().includes(itemFirst)
      );
    }
    if (sameThing) {
      if (!item.visited) {
        item.visited = true;
        report.matched++;
        (report.byLocation[target.loc] ||= []).push(`✓ flip ${existing.arr}: ${item.name}`);
      } else {
        (report.byLocation[target.loc] ||= []).push(`= already visited: ${item.name}`);
      }
      continue;
    }
    // Name doesn't actually match the existing POI — fall through and add as new
  }

  if (!loc.data[target.array]) loc.data[target.array] = [];
  loc.data[target.array].push(buildNewItem(place, target, enriched));
  report.added++;
  (report.byLocation[target.loc] ||= []).push(`+ add ${target.array}: ${place.name}`);
}

if (!DRY) {
  for (const id of Object.keys(locations)) {
    const loc = locations[id];
    writeFileSync(loc.path, JSON.stringify(loc.data, null, 2) + '\n');
  }
}

console.log(JSON.stringify(report, null, 2));
