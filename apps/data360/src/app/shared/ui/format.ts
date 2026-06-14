/**
 * Shared display-fallback helpers (UX rubric R3 — "real data or —").
 *
 * Render-ONLY: convert a *missing* value (null / undefined / NaN) to an em dash
 * at the render boundary. A genuine `0` is a real value and is ALWAYS preserved.
 *
 * Do NOT use these in math, default params, array lengths, reducers, loop
 * counters, or any non-render computation — only where a value is shown to the
 * user. `?? 0` in a calculation stays `?? 0`.
 *
 * Dependency-free and React-free, so it is safe in both client and server
 * components and in plain `.ts` utilities.
 */

/** The single em-dash glyph rendered for any missing value. */
export const EM_DASH = '—';

/**
 * True when a value should render as the em dash: `null`, `undefined`, or a
 * `NaN` number. Everything else (including `0`, `''`, `false`) is real data.
 */
export function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'number' && Number.isNaN(value))
  );
}

/**
 * Display guard: returns `'—'` for a missing value (null/undefined/NaN),
 * otherwise the value **untouched** (a number stays a number — React renders it
 * identically, so this is strictly backward-compatible for raw `{value}`).
 *
 *   dash(0)          // 0
 *   dash(null)       // "—"
 *   dash(undefined)  // "—"
 *   dash(NaN)        // "—"
 *   dash("ready")    // "ready"
 *   dash("$1.2K")    // "$1.2K"
 */
export function dash<T>(value: T): T | string {
  return isBlank(value) ? EM_DASH : value;
}

/**
 * Numeric KPI formatter: `'—'` for a missing value, otherwise a locale-formatted
 * number string. Use this only where the card already localized its number
 * (e.g. it previously called `toLocaleString()`); for cards that render a raw
 * number, prefer {@link dash} so you don't introduce thousands separators.
 *
 * A numeric string is localized; a non-numeric (pre-formatted) string passes
 * through unchanged so a `"$1.2K"` / `"12 GB"` is never mangled.
 *
 *   fmtNum(0)        // "0"
 *   fmtNum(1234)     // "1,234"
 *   fmtNum(null)     // "—"
 *   fmtNum(NaN)      // "—"
 *   fmtNum("1500")   // "1,500"
 *   fmtNum("12 GB")  // "12 GB"
 */
export function fmtNum(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : EM_DASH;
  }
  const trimmed = value.trim();
  if (trimmed === '') return EM_DASH;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n.toLocaleString() : value;
}
