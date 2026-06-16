'use client';

/**
 * backend-blocks-store.ts
 *
 * Surfaces the backend action-template catalog so the palette is not
 * hardcoded-only. The static `ETL_BLOCKS` list stays the baseline; any backend
 * action_type that is NOT already represented statically is exposed as an
 * extra, draggable "From backend" palette entry.
 *
 * Uses the canonical workflow service (`services/api/workflowApi.listActionTemplates`).
 * The endpoint may not be deployed in every environment — failures degrade to a
 * soft empty state (no extra section, no crash, no fabricated blocks).
 */
import { useCallback, useEffect, useState } from 'react';
import { listActionTemplates } from '@/app/services/api/workflowApi';
import type { ActionTemplate } from '@/app/services/api/types';
import { ETL_BLOCKS } from './etl-blocks';

export interface BackendBlock {
  /** action_type — used as the drag payload / node type. */
  type: string;
  label: string;
  description: string;
  /** SQL template body, surfaced as a tooltip / config seed. */
  query_template: string;
  is_system: boolean;
}

interface UseBackendBlocksResult {
  blocks: BackendBlock[];
  loading: boolean;
  /** Non-null only when the fetch failed (distinct from "no extra blocks"). */
  error: string | null;
  refresh: () => Promise<void>;
}

const STATIC_TYPES = new Set(ETL_BLOCKS.map((b) => b.type));

function toLabel(actionType: string, name?: string): string {
  if (name && name.trim()) return name.trim();
  return actionType
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function templateToBlock(t: ActionTemplate): BackendBlock | null {
  if (!t || typeof t.action_type !== 'string' || !t.action_type) return null;
  return {
    type: t.action_type,
    label: toLabel(t.action_type, t.action_name),
    description: t.description?.trim() || 'Backend action template',
    query_template: t.query_template || '',
    is_system: !!t.is_system,
  };
}

/**
 * Module-level catalog memo.
 *
 * The action-template catalog is account-static (the same ~92-entry palette
 * regardless of which project is open), so there is no reason to re-hit the
 * endpoint every time the workflow editor mounts for a new project. We memoize
 * the in-flight/settled fetch promise at module scope and share it across every
 * `useBackendBlocks` mount for the lifetime of the browser session — a full
 * reload (new JS module instance) naturally starts fresh.
 *
 * A `force` re-fetch (explicit `refresh()`) bypasses the memo, and the stale
 * window guards against an unbounded-stale session. Failures are never cached:
 * a rejected fetch clears the memo so the next caller retries (preserving the
 * original "soft empty state, retry on next mount" behaviour).
 */
type CatalogResult = Awaited<ReturnType<typeof listActionTemplates>>;

// Session-lifetime stale window. Matches the NextAuth 8h session max-age: while
// a session is alive the catalog is treated as fresh and fetched exactly once.
const CATALOG_STALE_MS = 8 * 60 * 60 * 1000;

let catalogPromise: Promise<CatalogResult> | null = null;
let catalogFetchedAt = 0;

function loadActionTemplateCatalog(force = false): Promise<CatalogResult> {
  const now = Date.now();
  const isStale = now - catalogFetchedAt > CATALOG_STALE_MS;
  if (force || !catalogPromise || isStale) {
    catalogFetchedAt = now;
    catalogPromise = listActionTemplates().catch((err) => {
      // Don't cache failures — let the next mount/refresh retry from scratch.
      catalogPromise = null;
      catalogFetchedAt = 0;
      throw err;
    });
  }
  return catalogPromise;
}

/**
 * Returns backend action templates that have no static palette equivalent.
 * When the backend lists only types already covered statically, `blocks` is
 * empty and the palette simply shows nothing extra — never an error.
 */
export function useBackendBlocks(): UseBackendBlocksResult {
  const [blocks, setBlocks] = useState<BackendBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      // Shared module-level memo — the fetch happens once per session and is
      // reused across project opens; `force` re-fetches on explicit refresh.
      const res = await loadActionTemplateCatalog(force);
      const templates = Array.isArray(res?.templates) ? res.templates : [];
      const extra = templates
        .map(templateToBlock)
        .filter((b): b is BackendBlock => !!b && !STATIC_TYPES.has(b.type));
      // Dedupe by type — newest backend entry wins.
      const byType = new Map<string, BackendBlock>();
      for (const b of extra) byType.set(b.type, b);
      setBlocks(Array.from(byType.values()));
    } catch (err) {
      // Endpoint may be undeployed (404) — degrade to a soft empty state.
      setError(err instanceof Error ? err.message : 'Failed to load backend blocks');
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { blocks, loading, error, refresh };
}
