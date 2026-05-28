'use client';

/**
 * ServerlessFinOpsCards — surfaces FinOps/governance KPIs that the command_center
 * backend already computes but the Account-overview UI never displayed:
 *   cost-by-warehouse, cost-by-service, clustering-costs, pipe-usage,
 *   mv-refresh-costs, task-history, role-hierarchy.
 *
 * Self-contained (no dependency on the 6k-line dashboard internals): fetches on
 * mount and renders compact tables. Each backend endpoint returns
 * { data: Array<Record<string, any>>, count, days } with UPPERCASE column keys,
 * so rendering is generic and resilient to schema differences.
 */

import { useEffect, useState } from 'react';
import {
  getCostByWarehouse,
  getCostByService,
  getClusteringCosts,
  getPipeUsage,
  getMvRefreshCosts,
  getTaskHistory,
  getRoleHierarchy,
  type KpiTableResponse,
} from '@/app/services/command-center';

interface PanelDef {
  key: string;
  title: string;
  subtitle: string;
  loader: (days: number) => Promise<KpiTableResponse>;
}

const PANELS: PanelDef[] = [
  { key: 'warehouse', title: 'Coût par warehouse', subtitle: 'WAREHOUSE_METERING', loader: (d) => getCostByWarehouse(d) },
  { key: 'service', title: 'Coût par service', subtitle: 'METERING_HISTORY', loader: (d) => getCostByService(d) },
  { key: 'clustering', title: 'Auto-clustering', subtitle: 'CLUSTERING_HISTORY', loader: (d) => getClusteringCosts(d) },
  { key: 'pipe', title: 'Snowpipe', subtitle: 'PIPE_USAGE_HISTORY', loader: (d) => getPipeUsage(d) },
  { key: 'mv', title: 'Refresh MV', subtitle: 'MV_REFRESH_HISTORY', loader: (d) => getMvRefreshCosts(d) },
  { key: 'tasks', title: 'Tasks', subtitle: 'TASK_HISTORY', loader: (d) => getTaskHistory(d) },
  { key: 'roles', title: 'Hiérarchie de rôles', subtitle: 'GRANTS_TO_ROLES', loader: () => getRoleHierarchy() },
];

function prettify(key: string): string {
  return key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

function MiniTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows || rows.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-400">Aucune donnée</p>;
  }
  const cols = Object.keys(rows[0]).slice(0, 5);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 font-medium text-gray-500 dark:text-gray-400">
                {prettify(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((r, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
              {cols.map((c) => (
                <td key={c} className="px-2 py-1 text-gray-700 dark:text-gray-300">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ServerlessFinOpsCards({ days = 30 }: { days?: number }) {
  const [state, setState] = useState<Record<string, KpiTableResponse | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all(
      PANELS.map((p) =>
        p
          .loader(days)
          .then((r) => [p.key, r] as const)
          .catch(() => [p.key, null] as const)
      )
    )
      .then((entries) => {
        if (!active) return;
        const next: Record<string, KpiTableResponse | null> = {};
        for (const [k, v] of entries) next[k] = v;
        setState(next);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          FinOps détaillé · serverless &amp; compute ({days}j)
        </h3>
        <span className="text-[11px] uppercase tracking-wide text-gray-400">ACCOUNT_USAGE</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PANELS.map((p) => (
          <div
            key={p.key}
            className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{p.title}</p>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">{p.subtitle}</span>
            </div>
            {loading ? (
              <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : (
              <MiniTable rows={(state[p.key]?.data ?? []) as Array<Record<string, unknown>>} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
