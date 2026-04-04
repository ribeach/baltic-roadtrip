/**
 * Shared helpers for content collection reference resolution and base URL handling.
 *
 * Astro's `reference()` returns `{ id: string; collection: string }` at runtime,
 * not a plain string. These helpers provide a single, typed way to extract the ID.
 */

interface ContentRef {
  id: string;
  collection: string;
}

/** Extract the plain string ID from an Astro content reference (or pass through if already a string). */
export const resolveRef = (ref: ContentRef | string): string =>
  typeof ref === 'object' && ref !== null ? ref.id : ref;

/** Return BASE_URL with a guaranteed trailing slash. */
export const getBase = () => import.meta.env.BASE_URL.replace(/\/?$/, '/');
