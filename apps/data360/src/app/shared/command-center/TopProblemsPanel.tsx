'use client';

/**
 * TopProblemsPanel — the intelligent cross-tab problem highlighter for Account
 * Overview. Pulls /command-center/recommendations (all dimensions: DQ · GOV ·
 * PERF · STORAGE · COST), ranks them critical→info, and surfaces the TOP issues
 * found in the account with a one-click CTA each (navigate / provision / refresh).
 *
 * This is the "what's wrong right now, across every tab" view — so a user lands
 * on Overview and immediately sees the account's real problems, not just KPIs.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, RefreshCw, ShieldAlert } from 'lucide-react';
import apiClient from '@/lib/api-client';
import {
  getCommandCenterRecommendations,
  type Recommendation,
} from '@/app/services/command-center/recommendations';

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, warning: 2, info: 3 };

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

const DIM_LABEL: Record<string, string> = {
  dq: 'Qualité',
  gov: 'Gouvernance',
  perf: 'Performance',
  cost: 'Coût',
  storage: 'Stockage',
  security: 'Sécurité',
};

export default function TopProblemsPanel({
  days = 30,
  limit = 8,
  onNavigateTab,
}: {
  days?: number;
  limit?: number;
  onNavigateTab?: (tab: string) => void;
}) {
  const router = useRouter();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [counts, setCounts] = useState<{ open: number; critical: number }>({ open: 0, critical: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getCommandCenterRecommendations(days)
      .then((r) => {
        const sorted = [...(r.recommendations ?? [])].sort(
          (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9),
        );
        setRecs(sorted);
        setCounts({ open: r.total_open ?? sorted.length, critical: r.total_critical ?? 0 });
      })
      .catch(() => setRecs([]))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const dispatchCta = useCallback(
    async (rec: Recommendation) => {
      const { action, target } = rec.cta;
      if (action === 'refresh') {
        load();
        return;
      }
      if (action === 'install') {
        setBusy(rec.id);
        try {
          await apiClient.post(target);
          load();
        } catch {
          /* honest no-op — the backend route may not be provisioned on this deploy */
        } finally {
          setBusy(null);
        }
        return;
      }
      // navigate: targets that name an account-overview tab switch in-place; full
      // routes navigate away.
      const tabMatch = /[?&]tab=([a-z-]+)/.exec(target);
      if (tabMatch && onNavigateTab) {
        onNavigateTab(tabMatch[1]);
      } else if (target.startsWith('/')) {
        router.push(target);
      }
    },
    [load, onNavigateTab, router],
  );

  if (loading && !recs) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  const list = (recs ?? []).slice(0, limit);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Top problèmes détectés
          </h3>
          {counts.critical > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {counts.critical} critique{counts.critical > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[11px] text-gray-400">{counts.open} ouverts</span>
        </div>
        <button
          onClick={load}
          title="Rafraîchir"
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-xs text-emerald-600 dark:text-emerald-400">
          <AlertTriangle className="h-4 w-4" />
          Aucun problème détecté sur la période — le compte est sain.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {list.map((rec) => (
            <li key={rec.id} className="flex items-center gap-3 py-2">
              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[rec.severity] ?? 'bg-gray-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">{rec.title}</p>
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {DIM_LABEL[rec.dimension] ?? rec.dimension}
                  </span>
                  {rec.value != null && rec.value !== '' && (
                    <span className="shrink-0 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                      {typeof rec.value === 'number' ? rec.value.toLocaleString() : rec.value}
                    </span>
                  )}
                </div>
                {rec.detail && (
                  <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{rec.detail}</p>
                )}
              </div>
              {rec.cta && (
                <button
                  onClick={() => dispatchCta(rec)}
                  disabled={busy === rec.id}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
                >
                  {rec.cta.label}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
