import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const days = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/days' }),
  schema: z.object({
    dayNumber: z.number(),
    date: z.coerce.date(),
    status: z.enum(['completed', 'planned', 'idea']).default('planned'),
    title: z.string(),
    subtitle: z.string(),
    locationId: reference('locations'),
    previousLocationId: reference('locations').nullable(),
    overnightLocationId: reference('locations').nullable(),
    additionalLocationIds: z.array(reference('locations')).default([]),
    transitLocationIds: z.array(reference('locations')).default([]),
    driving: z.object({
      distance: z.string(),
      duration: z.string(),
      mode: z.enum(['drive', 'ferry', 'none']),
      routeDescription: z.string(),
      encodedPolyline: z.string().optional(),
    }).nullable(),
    evCharging: z.object({
      stopsNeeded: z.number(),
      notes: z.string(),
      criticalLevel: z.enum(['green', 'yellow', 'red']),
    }).nullable(),
    activities: z.array(z.union([
      z.string(),
      z.object({
        highlightRef: z.string(),
        note: z.string().optional(),
      }),
      z.object({
        restaurantRef: z.string(),
        note: z.string().optional(),
      }),
      z.object({
        nightlifeRef: z.string(),
        note: z.string().optional(),
      }),
    ])),
  }),
});

const locations = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/locations' }),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    country: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    description: z.string(),
    suggestedDays: z.string().optional(),
    region: z.string().optional(),
    placeId: z.string().optional(),
    highlights: z.array(z.object({
      name: z.string(),
      type: z.string(),
      icon: z.enum(['star', 'gem', 'info']),
      description: z.string(),
      duration: z.string().nullable(),
      price: z.string().nullable(),
      googleMapsUrl: z.string().url(),
      placeId: z.string(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      rating: z.number().min(1).max(5).optional(),
      userRatingCount: z.number().int().nonnegative().optional(),
    })),
    restaurants: z.array(z.object({
      name: z.string(),
      cuisine: z.string(),
      priceRange: z.string(),
      isSplurge: z.boolean().default(false),
      description: z.string(),
      mustTry: z.string().nullable(),
      googleMapsUrl: z.string().url(),
      placeId: z.string(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      rating: z.number().min(1).max(5).optional(),
      userRatingCount: z.number().int().nonnegative().optional(),
    })),
    hotels: z.array(z.object({
      name: z.string(),
      type: z.string(),
      priceRange: z.string(),
      isSplurge: z.boolean().default(false),
      evCharging: z.boolean(),
      description: z.string(),
      googleMapsUrl: z.string().url(),
      placeId: z.string(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      rating: z.number().min(1).max(5).optional(),
      userRatingCount: z.number().int().nonnegative().optional(),
    })),
    apartments: z.array(z.object({
      name: z.string(),
      type: z.string(),
      priceRange: z.string(),
      isSplurge: z.boolean().default(false),
      bedrooms: z.number().int().positive().optional(),
      description: z.string(),
      source: z.string().optional(),
      bookingUrl: z.string().url().optional(),
      googleMapsUrl: z.string().url().optional(),
      placeId: z.string().optional(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
      rating: z.number().min(1).max(5).optional(),
      userRatingCount: z.number().int().nonnegative().optional(),
    })).default([]),
    tips: z.array(z.object({
      type: z.enum(['geheimtipp', 'warnung', 'info']),
      text: z.string(),
    })),
    nightlife: z.array(z.object({
      name: z.string(),
      description: z.string(),
      googleMapsUrl: z.string().url(),
      placeId: z.string(),
      coordinates: z.object({ lat: z.number(), lng: z.number() }),
      rating: z.number().min(1).max(5).optional(),
      userRatingCount: z.number().int().nonnegative().optional(),
    })).optional().default([]),
  }),
});

const countries = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/countries' }),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    flag: z.string(),
    currency: z.object({
      code: z.string(),
      name: z.string(),
      cashNeeded: z.boolean(),
      tip: z.string(),
    }),
    evCharging: z.object({
      quality: z.string(),
      medianDcPrice: z.string(),
      recommendedApps: z.array(z.string()),
      notes: z.string(),
    }),
    driving: z.object({
      speedLimits: z.object({
        urban: z.number(),
        rural: z.number(),
        motorway: z.union([z.number(), z.string()]),
      }),
      tolls: z.string(),
      specialRules: z.string(),
    }),
    culinary: z.object({
      mustTry: z.array(z.string()),
      description: z.string(),
    }),
    phrases: z.array(z.object({
      de: z.string(),
      local: z.string(),
      pronunciation: z.string(),
    })).optional().default([]),
  }),
});

export const collections = { days, locations, countries };
