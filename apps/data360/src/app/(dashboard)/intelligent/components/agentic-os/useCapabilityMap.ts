/**
 * Agentic OS — per-stage capability map.
 *
 * "Know at each step what we can and can't do": every lifecycle stage maps to
 * one existing module action-catalog (registry-in-tables). Rows are folded into
 * three honest buckets:
 *   ready      — GET + contract verified → the agent may run it inline
 *   gated      — mutating → possible only through human validation (right rail)
 *   unverified — probeable but not verified → shown with the reason, not run
 * RBAC stays server-enforced; the rbac gate string is displayed as a chip.
 */
import { useCallback } from 'react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { getConnectActions } from '@/app/services/connect/actions';
import { getCortexActions, isActionVerified } from '@/app/services/cortex/actions';
import { getWorkflowActions } from '@/app/services/workflow/actions';
import { getBiActions } from '@/app/services/bi-dashboard/actions';
import { getObsActions } from '@/app/services/observability/actions';
import type { CatalogRow, LifecycleStage, StageCapability } from './types';

/** Stage → the module catalog that owns its capability space (v1 mapping). */
const STAGE_FETCHER: Record<LifecycleStage, () => Promise<{ actions: CatalogRow[] }>> = {
  sources: getConnectActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
  models: getCortexActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
  ingestion: getConnectActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
  workflow: getWorkflowActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
  dashboards: getBiActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
  questions: getCortexActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
  dependencies: getObsActions as unknown as () => Promise<{ actions: CatalogRow[] }>,
};

/** Areas that narrow a shared catalog to the stage's slice ('' = keep all). */
const STAGE_AREA_FILTER: Partial<Record<LifecycleStage, string[]>> = {
  models: ['model', 'search'],
  ingestion: ['pipeline', 'stage', 'database'],
  questions: ['ask', 'agentic', 'ml', 'analyze'],
  dependencies: ['lineage', 'pulse', 'comply'],
};

export function verdictOf(row: CatalogRow): StageCapability['verdict'] {
  const mutating = row.method !== 'GET';
  if (mutating) return 'gated';
  return isActionVerified(row.verified_status) ? 'ready' : 'unverified';
}

export interface CapabilityMap {
  loading: boolean;
  unavailable: boolean;
  all: StageCapability[];
  ready: StageCapability[];
  gated: StageCapability[];
  unverified: StageCapability[];
}

export function useCapabilityMap(stage: LifecycleStage): CapabilityMap {
  const fetcher = useCallback(async () => {
    const catalog = await STAGE_FETCHER[stage]();
    const areas = STAGE_AREA_FILTER[stage];
    const rows = (catalog.actions ?? []).filter((r) => !areas || areas.includes(r.area));
    return rows.map((r): StageCapability => ({ ...r, verdict: verdictOf(r) }));
  }, [stage]);

  const q = useCacheAwareQuery<StageCapability[]>(fetcher, { cacheKeys: [], initialData: [] });

  const all = q.data ?? [];
  return {
    loading: q.loading,
    unavailable: Boolean(q.unavailable),
    all,
    ready: all.filter((c) => c.verdict === 'ready'),
    gated: all.filter((c) => c.verdict === 'gated'),
    unverified: all.filter((c) => c.verdict === 'unverified'),
  };
}
