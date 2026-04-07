/** Shared constants used across multiple pages. */

/** Display order of countries throughout the site. */
export const COUNTRY_ORDER = [
  'germany', 'czech-republic', 'poland', 'lithuania',
  'latvia', 'estonia', 'finland', 'sweden', 'norway', 'denmark',
] as const;

/** German labels for day status values. */
export const STATUS_LABELS: Record<string, string> = {
  completed: 'Erledigt',
  planned: 'Geplant',
  idea: 'Idee',
};

/** Tailwind classes for day status badges. */
export const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  planned: 'bg-amber-100 text-amber-700',
  idea: 'bg-gray-100 text-gray-500',
};
