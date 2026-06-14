// Editable source-type / product-type TAG for catalog DB & schema nodes (G12).
//
// BACKEND GAP: there is NO write endpoint to classify a database/schema by a
// source-type / product-type tag. The catalog module exposes only READ-side tag
// surfaces (ACCOUNT_USAGE.TAG_REFERENCES via /tables/.../governance and the
// /tags/flow aggregation); applying a Snowflake object tag is a governance DDL
// concern, not a lightweight product classification. So this tag is persisted
// OPTIMISTIC-LOCAL in versioned localStorage and the UI labels it "local".
//
// When a backend write endpoint lands (e.g. PUT /catalog/nodes/{fqn}/tag), swap
// `readTag`/`writeTag` to call it — the component contract stays identical.

const STORAGE_KEY = 'data360.catalog.sourceTags.v1';

/** Curated classification options; first match wins, "Custom…" allows free text. */
export const SOURCE_TAG_OPTIONS = [
  'Raw / Landing',
  'Staging',
  'Curated / Core',
  'Mart / Serving',
  'Reference / Master',
  'Analytics / BI',
  'ML / Feature',
  'Sandbox',
  'External',
] as const;

interface TagSchemaV1 {
  v: 1;
  // key = node fqn ("DB" or "DB.SCHEMA"); value = tag label.
  tags: Record<string, string>;
}

function emptySchema(): TagSchemaV1 {
  return { v: 1, tags: {} };
}

function read(): TagSchemaV1 {
  if (typeof window === 'undefined') return emptySchema();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySchema();
    const parsed = JSON.parse(raw) as Partial<TagSchemaV1>;
    if (parsed?.v === 1 && parsed.tags && typeof parsed.tags === 'object') {
      return parsed as TagSchemaV1;
    }
    return emptySchema();
  } catch {
    return emptySchema();
  }
}

function persist(schema: TagSchemaV1): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
  } catch {
    // Storage full / blocked — fail silently; the in-memory map still holds.
  }
}

/** Returns the whole tag map (used for a single lazy-init read on mount). */
export function readAllTags(): Record<string, string> {
  return read().tags;
}

/** Reads the tag for one node fqn (null if unset). */
export function readTag(fqn: string): string | null {
  return read().tags[fqn] ?? null;
}

/** Optimistic-local write; returns the updated full map for state sync. */
export function writeTag(fqn: string, tag: string | null): Record<string, string> {
  const schema = read();
  if (tag == null || tag.trim() === '') {
    delete schema.tags[fqn];
  } else {
    schema.tags[fqn] = tag.trim();
  }
  persist(schema);
  return { ...schema.tags };
}

/** Stable node key for the tag map (DB → "DB", schema → "DB.SCHEMA"). */
export function tagKey(database: string, schema?: string): string {
  return schema ? `${database}.${schema}` : database;
}
