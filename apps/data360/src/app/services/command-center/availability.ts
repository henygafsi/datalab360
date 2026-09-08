'use client';

/**
 * Availability (data readiness) helpers for the Account Overview spine.
 *
 * B1 contract: GET /command-center/overview-kpis carries an `availability`
 * block (one entry per reporting domain, each with an explicit readiness
 * state). This module extracts that block, summarises it for the coverage
 * KPI, and exposes a hook that keeps it live via the singleton SSE
 * invalidation broadcast — WITHOUT opening a second fetch of the same
 * endpoint (it rides the existing `getOverviewKpis` dedup key).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AvailabilityBlock,
  DomainAvailability,
} from '@/app/shared/command-center/lib/meta';
import { useOnCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';
import { getOverviewKpis, type OverviewRange } from './index';

// =============================================================================
// Extraction
// =============================================================================

/**
 * Read the B1 `availability` block off an overview-kpis payload (or any
 * unknown payload). Returns null when the block is absent or malformed —
 * including the synthetic `_provisioned: false` payload, which carries no
 * availability at all. Never throws.
 */
export function extractAvailability(payload: unknown): AvailabilityBlock | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = (payload as { availability?: unknown }).availability;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const domains = (candidate as { domains?: unknown }).domains;
  if (typeof domains !== 'object' || domains === null || Array.isArray(domains)) {
    return null;
  }
  return candidate as AvailabilityBlock;
}

// =============================================================================
// Summary — feeds the coverage KPI tone
// =============================================================================

export interface AvailabilitySummary {
  /** Domains fully ready to serve. */
  ready: number;
  /** All domains reported. */
  total: number;
  /** Domains warming up — `preparing` plus `cold` (both resolve on their own). */
  preparing: number;
  /** Domains that will NOT resolve on their own — `failed` + `unconfigured`. */
  blocked: number;
  /** Overall tone for the coverage KPI: blocked > preparing > unknown > ready. */
  worst: 'ready' | 'preparing' | 'blocked' | 'unknown';
}

/**
 * Collapse a per-domain availability block into counts + a single tone.
 * `cold` counts as preparing (it self-heals); `failed`/`unconfigured` count
 * as blocked (they need intervention). A null block yields an all-zero
 * summary with `worst: 'unknown'`.
 */
export function availabilitySummary(
  block: AvailabilityBlock | null,
): AvailabilitySummary {
  if (!block) {
    return { ready: 0, total: 0, preparing: 0, blocked: 0, worst: 'unknown' };
  }

  const domains: DomainAvailability[] = Object.values(block.domains);
  let ready = 0;
  let preparing = 0;
  let blocked = 0;
  let unknown = 0;

  for (const domain of domains) {
    switch (domain?.state) {
      case 'ready':
        ready += 1;
        break;
      case 'cold':
      case 'preparing':
        preparing += 1;
        break;
      case 'failed':
      case 'unconfigured':
        blocked += 1;
        break;
      default:
        unknown += 1;
        break;
    }
  }

  const total = domains.length;
  let worst: AvailabilitySummary['worst'];
  if (total === 0) worst = 'unknown';
  else if (blocked > 0) worst = 'blocked';
  else if (preparing > 0) worst = 'preparing';
  else if (unknown > 0) worst = 'unknown';
  else worst = 'ready';

  return { ready, total, preparing, blocked, worst };
}

// =============================================================================
// Hook
// =============================================================================

/** SSE cache-key substrings that always mean "the overview payload moved". */
const OVERVIEW_KEY_HINTS = ['overview_kpis', 'route_overview_kpis'] as const;

export interface UseAvailabilityResult {
  availability: AvailabilityBlock | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Live availability block for the Account Overview coverage KPI.
 *
 * Rides the existing `getOverviewKpis(range)` service call (already deduped
 * 30s under `cc:overview-kpis:<range>`) — this hook adds NO second request
 * when a KPI consumer already fetched the same range on the same load.
 *
 * Refetches when a cache-invalidation event (singleton SSE broadcast, no
 * extra stream) carries a key that matches any current `domains[*].cache_key`
 * or references the overview payload itself. The provider also drops the
 * client dedup cache on every server-signalled mutation, so a refetch here
 * reaches the network instead of the stale entry.
 *
 * The synthetic `_provisioned: false` payload has no availability block —
 * that is a valid "nothing to report" state (availability null, error null),
 * not a failure.
 */
export function useAvailability(range: string = '30d'): UseAvailabilityResult {
  const [availability, setAvailability] = useState<AvailabilityBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current block, readable from the (stable-identity) SSE callback and from
  // fetches without re-subscribing per render.
  const availabilityRef = useRef<AvailabilityBlock | null>(null);
  availabilityRef.current = availability;

  // Guards: ignore resolutions after unmount, and out-of-order resolutions
  // when `range` changes mid-flight.
  const mountedRef = useRef(true);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAvailability = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    // Only show the loading state while we have nothing to display — an
    // SSE-triggered refresh must not flash the existing block away.
    if (availabilityRef.current === null) setLoading(true);
    try {
      const payload = await getOverviewKpis(range as OverviewRange);
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      setAvailability(extractAvailability(payload));
      setError(null);
    } catch {
      if (!mountedRef.current || seq !== fetchSeqRef.current) return;
      setError('Could not load data readiness');
    } finally {
      if (mountedRef.current && seq === fetchSeqRef.current) setLoading(false);
    }
  }, [range]);

  // Initial load + reload on range change.
  useEffect(() => {
    void fetchAvailability();
  }, [fetchAvailability]);

  // Live updates: react to invalidation events that touch either the overview
  // payload or any cache key the current block reports per domain. Keys vary
  // with the block's content, so filter inside the callback (via ref) rather
  // than through the hook's static watch-set.
  useOnCacheInvalidation(undefined, (keys) => {
    const block = availabilityRef.current;
    const domainKeys = new Set<string>();
    if (block) {
      for (const domain of Object.values(block.domains)) {
        if (domain?.cache_key) domainKeys.add(domain.cache_key);
      }
    }
    const relevant = keys.some(
      (key) =>
        domainKeys.has(key) ||
        OVERVIEW_KEY_HINTS.some((hint) => key.includes(hint)),
    );
    if (relevant) void fetchAvailability();
  });

  const refetch = useCallback(() => {
    void fetchAvailability();
  }, [fetchAvailability]);

  return { availability, loading, error, refetch };
}
