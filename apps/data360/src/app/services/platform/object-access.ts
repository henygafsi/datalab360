'use client';

/**
 * platform/object-access — the users × object × privilege grid (real Snowflake
 * SHOW GRANTS, aggregated). "Exactly who can access every object." Surfaced
 * read-only in the Administration hub's Access Control tab; the endpoint had no
 * UI before.
 *
 *   GET /api/platform/object-permission-matrix
 *     → { database, object_keys, rows: ObjectAccessRow[], enforcement, truncated }
 *
 * Honesty: `enforcement.status` may be `configured_not_enforced` (grants exist
 * but the API layer's require_action is a no-op) — surfaced as a banner, never
 * hidden.
 */
import apiClient from '@/lib/api-client';

const PATH = '/api/platform/object-permission-matrix';

export interface ObjectAccessRow {
  username: string;
  roles: string[];
  /** object FQN → list of privileges (SELECT, USAGE, …). */
  access: Record<string, string[]>;
}

export interface ObjectAccessMatrix {
  database: string | null;
  object_keys: string[];
  rows: ObjectAccessRow[];
  enforcement: { status: string; detail?: string } | null;
  truncated: boolean;
}

export async function getObjectPermissionMatrix(): Promise<ObjectAccessMatrix> {
  const res = await apiClient.get(PATH);
  const d = (res.data?.data ?? res.data) as Partial<ObjectAccessMatrix>;
  return {
    database: d.database ?? null,
    object_keys: d.object_keys ?? [],
    rows: d.rows ?? [],
    enforcement: d.enforcement ?? null,
    truncated: !!d.truncated,
  };
}
