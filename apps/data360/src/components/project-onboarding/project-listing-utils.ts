/**
 * Shared project-listing utilities — used by both the Explore & Design
 * `ProjectSelector` and the Workflow `WorkflowProjectGate` so the two
 * pick lists sort, format and filter identically.
 *
 * Three concerns live here:
 *   1. Last-used tracking — the API has no `last_used_at` field yet, so we
 *      track it client-side in localStorage. When a user opens a project we
 *      stamp `Date.now()`; the listing then floats recently-used projects to
 *      the top. LRU-capped at 100 entries.
 *   2. Sorting — last-used (most recent first), then `created_at` desc.
 *   3. Formatting — relative "used 2h ago" / absolute "created Jan 5" labels,
 *      and the build-mode chip derived from a project's `tags[]`.
 *
 * Everything is SSR-safe (guards `typeof window`) and dependency-free.
 */

const LAST_USED_KEY = 'data360.project.lastUsed';
const MINE_ONLY_KEY_PREFIX = 'data360.project.mineOnly.';
const LAST_USED_CAP = 100;

/** Page size for the project listing (first page + each "Load more"). */
export const PROJECT_PAGE_SIZE = 20;

/** Map of projectId -> epoch-ms timestamp of the last time it was opened. */
export type LastUsedMap = Record<string, number>;

// ─────────────────────────────────────────────────────────────────────────
// Last-used tracking
// ─────────────────────────────────────────────────────────────────────────

/** Read the last-used map from localStorage. Returns `{}` on any failure. */
export function getLastUsedMap(): LastUsedMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LAST_USED_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: LastUsedMap = {};
    for (const [id, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts === 'number' && Number.isFinite(ts)) out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Stamp a project as just-used. Writes `Date.now()` under its id in the
 * single `data360.project.lastUsed` map and LRU-trims to {@link LAST_USED_CAP}
 * entries (oldest timestamps evicted first).
 */
export function recordProjectUsed(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    const map = getLastUsedMap();
    map[projectId] = Date.now();
    let entries = Object.entries(map);
    if (entries.length > LAST_USED_CAP) {
      entries = entries
        .sort((a, b) => b[1] - a[1])
        .slice(0, LAST_USED_CAP);
    }
    window.localStorage.setItem(LAST_USED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage unavailable (private mode / quota) — non-fatal.
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Mine-only preference (per module so explore vs workflow don't collide)
// ─────────────────────────────────────────────────────────────────────────

/** Read the persisted "My projects" toggle for a module.
 *
 * Defaults to `true` (granted-only): the project lists must show what the
 * caller owns or was granted (PROJECT_CONTRIBUTORS), not the whole account —
 * user direction 2026-07-10. The old `false` default dated from a claim that
 * the backend "mine" filter returned 0 for accountadmins; disproven live
 * (HAHA · mine_only=true ⇒ 52/52; viewer persona ⇒ exactly its 6 granted).
 * An explicit user choice ('0' = All) is always respected. */
export function getMineOnlyPref(module: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MINE_ONLY_KEY_PREFIX + module) !== '0';
  } catch {
    return true;
  }
}

/** Persist the "My projects" toggle for a module. */
export function setMineOnlyPref(module: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MINE_ONLY_KEY_PREFIX + module, value ? '1' : '0');
  } catch {
    // non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────

/** Minimal row shape the sorter needs. */
export interface SortableProject {
  project_id: string;
  created_at: string | null;
}

/**
 * Sort projects: those with a local last-used timestamp first (most recent
 * first), then everything else by `created_at` descending. Returns a new
 * array — does not mutate the input.
 *
 * NOTE: this only sorts the rows that have been loaded into the client. A
 * frequently-used project sitting on an unloaded page won't surface — true
 * LRU ordering needs a server-side `sort_by=last_used` param (see the
 * Backend Gap note in the listing UI).
 */
export function sortByLastUsedThenCreated<T extends SortableProject>(
  rows: T[],
  lastUsed: LastUsedMap,
): T[] {
  return [...rows].sort((a, b) => {
    const ua = lastUsed[a.project_id];
    const ub = lastUsed[b.project_id];
    if (ua != null && ub != null) return ub - ua;
    if (ua != null) return -1;
    if (ub != null) return 1;
    // Neither used locally — fall back to created_at desc.
    const ca = a.created_at ? Date.parse(a.created_at) : 0;
    const cb = b.created_at ? Date.parse(b.created_at) : 0;
    return cb - ca;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────

/** Compact relative-time formatter — "just now", "2h ago", "3d ago". */
function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(mon / 12)}y ago`;
}

/** Absolute short date — "Jan 5, 2026". Empty string for null/invalid input. */
export function formatShortDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Primary timestamp label for a project row:
 *   - "used 2h ago"  when a local last-used timestamp exists
 *   - "created Jan 5, 2026"  otherwise (falls back to created_at)
 *   - ""  when neither is available
 */
export function formatProjectTimestamp(
  project: SortableProject,
  lastUsed: LastUsedMap,
): string {
  const ts = lastUsed[project.project_id];
  if (ts != null) return `used ${relativeTime(ts)}`;
  const created = formatShortDate(project.created_at);
  return created ? `created ${created}` : '';
}

// ─────────────────────────────────────────────────────────────────────────
// Build-mode chip
// ─────────────────────────────────────────────────────────────────────────

export type BuildModeKind = 'ai' | 'manual' | 'template';

export interface BuildModeChip {
  kind: BuildModeKind;
  label: string;
}

/**
 * Derive the build-mode chip from a project's `tags[]`. The onboarding
 * `UnifiedProjectWizard` writes one of `build:ai` / `build:manual` /
 * `build:template` on every project it creates. Returns `null` when no
 * build-mode tag is present (e.g. legacy projects).
 */
export function getBuildModeChip(tags: string[] | null | undefined): BuildModeChip | null {
  if (!tags || tags.length === 0) return null;
  if (tags.includes('build:ai')) return { kind: 'ai', label: 'AI-built' };
  if (tags.includes('build:manual')) return { kind: 'manual', label: 'Manual' };
  if (tags.includes('build:template')) return { kind: 'template', label: 'Template' };
  return null;
}

/** Tags that carry UI meaning elsewhere — hidden from the generic tag display. */
const RESERVED_TAG_PREFIXES = ['build:', 'compliance:'];
const RESERVED_TAGS = new Set(['ai-draft']);

/** Tags worth showing as plain chips (excludes build-mode / reserved tags). */
export function getDisplayTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  return tags.filter(
    (t) =>
      !RESERVED_TAGS.has(t) &&
      !RESERVED_TAG_PREFIXES.some((p) => t.startsWith(p)),
  );
}
