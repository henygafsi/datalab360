'use client';

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import MetricHelp from '@/components/ui/MetricHelp';
import { useTrackEvent } from '@/hooks/useTrackEvent';

/**
 * CostPreview — per-object 30d cost projection (baseline + low/expected/high bands).
 *
 * Wraps `API.orgAccounts.costSimulation`. The backend route is contracted but may
 * not be deployed yet — a 404/501 degrades quietly to an inline "not available"
 * note rather than erroring. Per FinOps rules: null credits render as "—" (never
 * 0) and the projection always exposes its method + basis.
 */
type CostSimulation = {
  object_type: string;
  object_id: string;
  days: number;
  baseline?: {
    credits_total?: number | null;
    credits_per_day?: number | null;
    source?: string | null;
  } | null;
  projection?: {
    expected?: number | null;
    low?: number | null;
    high?: number | null;
    method?: string | null;
    basis?: string | null;
  } | null;
  warning?: string | null;
};

/** null/undefined → "—"; numbers are locale-formatted (never invent a 0). */
function fmt(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString();
}

export default function CostPreview({
  objectType,
  objectId,
  days = 30,
}: {
  objectType: string;
  objectId: string;
  days?: number;
}) {
  const [data, setData] = useState<CostSimulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const { trackFeatureClick } = useTrackEvent();

  useEffect(() => {
    // Fire-and-forget view event on mount.
    trackFeatureClick('cost_preview_viewed', { objectType, objectId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectType, objectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);
    apiClient
      .get(API.orgAccounts.costSimulation(objectType, objectId, days))
      .then((res) => {
        if (!cancelled) setData(res.data as CostSimulation);
      })
      .catch((err: any) => {
        if (cancelled) return;
        // Contracted-but-not-deployed (404/501) and transient failures both
        // degrade to the same quiet 'unavailable' chip — one branch, honestly.
        setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objectType, objectId, days]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/40">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (unavailable || !data) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
        Cost projection not available yet.
      </div>
    );
  }

  const baseline = data.baseline || {};
  const projection = data.projection || {};
  const method = projection.method || null;
  const basis = projection.basis || null;
  const periodDays = data.days ?? days;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-500" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {periodDays}d Cost Projection
          </h4>
          {method && (
            <MetricHelp
              title={`Method: ${method}`}
              definition={
                basis
                  ? `Projection basis: ${basis}.`
                  : 'Forward credit projection from recent consumption.'
              }
              source={baseline.source || undefined}
            />
          )}
        </div>
        {method && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {method}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Baseline / day
          </p>
          <p className="text-base font-semibold text-gray-900 dark:text-white">
            {fmt(baseline.credits_per_day)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Low ({periodDays}d)
          </p>
          <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
            {fmt(projection.low)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Expected ({periodDays}d)
          </p>
          <p className="text-base font-semibold text-gray-900 dark:text-white">
            {fmt(projection.expected)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            High ({periodDays}d)
          </p>
          <p className="text-base font-semibold text-amber-600 dark:text-amber-400">
            {fmt(projection.high)}
          </p>
        </div>
      </div>

      {data.warning && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {data.warning}
        </p>
      )}
    </div>
  );
}
