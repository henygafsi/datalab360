/**
 * Crash-safe numeric formatting helpers.
 *
 * The backend frequently sends numeric fields as strings ("1234.5") or as
 * null/undefined, even though our TypeScript types declare them `number`.
 * Calling `.toFixed`/`.toLocaleString`/arithmetic on those values crashes the
 * render at runtime ("value.toFixed is not a function", NaN, "x is not
 * iterable"). These helpers coerce + guard so a missing/non-numeric value
 * renders a fallback ("—" by default — NEVER a fake 0) instead of crashing.
 */

export type Numeric = number | string | null | undefined;

/** Coerce a possibly-string/null/undefined value to a finite number, or null. */
export function safeNum(value: Numeric): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Coerce to a finite number, falling back to `fallback` (default 0) for arithmetic. */
export function numOr(value: Numeric, fallback = 0): number {
  const n = safeNum(value);
  return n == null ? fallback : n;
}

/** Crash-safe `.toFixed`. Returns `fallback` ("—") for non-numeric input. */
export function safeToFixed(value: Numeric, digits = 1, fallback = '—'): string {
  const n = safeNum(value);
  return n == null ? fallback : n.toFixed(digits);
}

/** Crash-safe `.toLocaleString`. Returns `fallback` ("—") for non-numeric input. */
export function safeLocale(
  value: Numeric,
  options?: Intl.NumberFormatOptions,
  fallback = '—',
): string {
  const n = safeNum(value);
  return n == null ? fallback : n.toLocaleString('en-US', options);
}

/** Guarantee an array (backend may send null/object where we expect a list). */
export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
