'use client';

/**
 * RecommendationsPanel — catalog recommendations for a data product.
 *
 * Lists the product's recommendations (`getCatalogRecommendations` by
 * product_id) and lets the user apply one (`applyRecommendation`).
 *
 * IMPORTANT: apply does NOT execute the change. The backend returns a
 * `suggested_call` (method + path + body) describing the next action the user
 * would run in the owning module. We surface that verbatim and mark the reco as
 * applied — we never render a fake "executed/done" for work that didn't happen.
 * Idle→Running→Completed/Empty/Error throughout.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { AlertCircle, CheckCircle2, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';
import { getApiErrorMessage } from '@/lib/api-client';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import EmptyState from '@/components/ui/EmptyState';
import { InsightActionButton } from '@/app/shared/insights';
import {
  applyRecommendation,
  getCatalogRecommendations,
  type ApplyRecoResponse,
  type Recommendation,
} from '@/app/services/catalog';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

const SEVERITY_TINT: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

export interface RecommendationsPanelProps {
  productId: string;
}

export default function RecommendationsPanel({ productId }: RecommendationsPanelProps) {
  // System 2 Action-RBAC: applying a recommendation mutates the product →
  // gated on data_products:edit. Fail-open while the allow-set loads.
  const editPerm = useCanPerform('data_products', 'edit');
  const canEdit = editPerm.allowed || editPerm.loading;

  const [recos, setRecos] = useState<Recommendation[]>([]);
  const [loadState, setLoadState] = useState<AsyncState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, ApplyRecoResponse>>({});

  const load = useCallback(async () => {
    setLoadState('running');
    setLoadError(null);
    try {
      const res = await getCatalogRecommendations({ product_id: productId });
      setRecos(res.items ?? []);
      setLoadState('done');
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setLoadState('error');
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  // SSE cache invalidation: refresh the recommendation list when the backend
  // busts the catalog-recommendations cache (e.g. a "recommend model" run or a
  // recompute). Settled-state-only guard avoids the mount double-fetch
  // (`lastInvalidationAtom` is a persistent global that stays non-null).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    if (loadState === 'idle' || loadState === 'running') return;
    const relevant = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.CATALOG_RECOMMENDATIONS || k === CACHE_KEYS.CATALOG_PRODUCTS,
    );
    if (relevant) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <Lightbulb className="h-3.5 w-3.5" />
        Recommendations
      </h4>

      {loadState === 'running' || loadState === 'idle' ? (
        <div className="space-y-1.5" aria-hidden="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : loadState === 'error' ? (
        <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="flex-1">
            <span className="break-words">{loadError}</span>{' '}
            <button type="button" className="underline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      ) : recos.length === 0 ? (
        <EmptyState icon={Lightbulb} compact title="No recommendations" />
      ) : (
        <ul className="space-y-2">
          {recos.map((r) => {
            const result = applied[r.reco_id];
            return (
              <li
                key={r.reco_id}
                className="space-y-1.5 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-800 dark:text-slate-200">
                      {r.title}
                    </p>
                    {r.explanation && (
                      <p className="mt-0.5 text-[10px] text-slate-500">{r.explanation}</p>
                    )}
                    {r.expected_gain && (
                      <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                        Expected gain: {r.expected_gain}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase',
                      SEVERITY_TINT[r.severity?.toLowerCase()] ?? SEVERITY_TINT.low,
                    )}
                  >
                    {r.severity}
                  </span>
                </div>

                {result ? (
                  <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    <p className="flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="h-3 w-3" />
                      Marked {result.status}
                    </p>
                    {result.suggested_call ? (
                      <p className="mt-0.5 font-mono text-[9px] text-emerald-700 dark:text-emerald-400">
                        Next: {result.suggested_call.method} {result.suggested_call.path}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[9px] text-emerald-700 dark:text-emerald-400">
                        No follow-up call required.
                      </p>
                    )}
                  </div>
                ) : (
                  <InsightActionButton
                    label="Apply"
                    size="sm"
                    successToast="Recommendation applied"
                    pingBell
                    capable={canEdit}
                    unavailableHint={
                      !canEdit
                        ? 'You lack the "edit" permission on data products. Ask an administrator to grant it.'
                        : 'Not available on this backend yet'
                    }
                    onAction={() => applyRecommendation(r.reco_id)}
                    onDone={(res) =>
                      setApplied((prev) => ({
                        ...prev,
                        [r.reco_id]: res as ApplyRecoResponse,
                      }))
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
