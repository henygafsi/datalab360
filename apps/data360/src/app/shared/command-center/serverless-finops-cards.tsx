'use client';

/**
 * ServerlessFinOpsCards — FinOps cost-driver audit for Account Overview › FinOps.
 *
 * Two sections, all live (no phantom endpoints):
 *  - RÉSUMÉ: aggregates from the single fast `/cost-breakdown` (~25ms) that have
 *    no per-row detail endpoint (by-category, serverless, resource monitors, storage).
 *  - AUDIT DÉTAILLÉ: per-driver tables from dedicated ACCOUNT_USAGE endpoints
 *    (cost-by-warehouse, cost-by-service, clustering-costs, pipe-usage,
 *    mv-refresh-costs, task-history). Each returns {data, columns} so every
 *    driver is auditable in-app without opening Snowflake.
 */

import { useEffect, useState } from 'react';
import {
  getCostBreakdown,
  getCostByWarehouse,
  getCostByService,
  getClusteringCosts,
  getPipeUsage,
  getMvRefreshCosts,
  getTaskHistory,
} from '@/app/services/command-center';
import type { CostBreakdownResponse } from '@/app/services/command-center/types';
import AuditTable from './AuditTable';

type Row = Record<string, unknown>;

// ── Summary panels derived from cost-breakdown ────────────────────────────────
interface SummaryPanel {
  key: string;
  title: string;
  subtitle: string;
  rows: (cb: CostBreakdownResponse) => Row[];
}

const SUMMARY_PANELS: SummaryPanel[] = [
  {
    key: 'category',
    title: 'Coût par catégorie',
    subtitle: 'METERING_HISTORY',
    rows: (cb) => {
      const c = cb.by_category ?? ({} as Record<string, number>);
      const labels: Record<string, string> = {
        warehouses: 'Compute (warehouses)',
        cloud_services: 'Cloud services',
        clustering: 'Auto-clustering',
        materialized_views: 'Materialized views',
        pipes: 'Snowpipe',
        replication: 'Réplication',
      };
      return Object.entries(c)
        .map(([k, v]) => ({ 'Catégorie': labels[k] ?? k, 'Crédits': v as number }))
        .filter((r) => (r['Crédits'] as number) > 0)
        .sort((a, b) => (b['Crédits'] as number) - (a['Crédits'] as number));
    },
  },
  {
    key: 'serverless',
    title: 'Serverless',
    subtitle: 'SERVERLESS_USAGE',
    rows: (cb) =>
      (cb.serverless_usage ?? []).map((s) => ({ 'Fonctionnalité': s.feature, 'Crédits': s.credits })),
  },
  {
    key: 'monitors',
    title: 'Resource monitors',
    subtitle: 'RESOURCE_MONITORS',
    rows: (cb) =>
      (cb.resource_monitors ?? []).map((m) => ({
        Monitor: m.name,
        Quota: m.quota,
        'Utilisé': m.used,
        Restant: m.remaining,
      })),
  },
  {
    key: 'storage',
    title: 'Stockage',
    subtitle: 'STORAGE_USAGE',
    rows: (cb) => {
      const s = cb.storage ?? ({} as Record<string, number>);
      return [
        { Type: 'Base de données', TB: s.database_tb },
        { Type: 'Stage', TB: s.stage_tb },
        { Type: 'Fail-safe', TB: s.failsafe_tb },
      ].filter((r) => r.TB != null);
    },
  },
];

// ── Detail tables from dedicated per-driver ACCOUNT_USAGE endpoints ────────────
interface DetailPanel {
  key: string;
  title: string;
  subtitle: string;
  loader: (days: number) => Promise<{ data?: Row[] } | null>;
}

const DETAIL_PANELS: DetailPanel[] = [
  { key: 'warehouse', title: 'Coût par warehouse', subtitle: 'WAREHOUSE_METERING_HISTORY', loader: (d) => getCostByWarehouse(d) },
  { key: 'service', title: 'Coût par service', subtitle: 'METERING_DAILY_HISTORY', loader: (d) => getCostByService(d) },
  { key: 'clustering', title: 'Auto-clustering par table', subtitle: 'AUTOMATIC_CLUSTERING_HISTORY', loader: (d) => getClusteringCosts(d) },
  { key: 'pipe', title: 'Snowpipe par pipe', subtitle: 'PIPE_USAGE_HISTORY', loader: (d) => getPipeUsage(d) },
  { key: 'mv', title: 'Refresh MV', subtitle: 'MATERIALIZED_VIEW_REFRESH_HISTORY', loader: (d) => getMvRefreshCosts(d) },
  { key: 'tasks', title: 'Tasks', subtitle: 'TASK_HISTORY', loader: (d) => getTaskHistory(d) },
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

function MiniTable({ rows, maxCols = 6 }: { rows: Row[]; maxCols?: number }) {
  if (!rows || rows.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-400">Aucune donnée</p>;
  }
  const cols = Object.keys(rows[0]).slice(0, maxCols);
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

function PanelCard({ title, subtitle, loading, rows }: { title: string; subtitle: string; loading: boolean; rows: Row[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1 min-w-0">
        <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>
        <span className="block truncate text-[10px] uppercase tracking-wide text-gray-400">{subtitle}</span>
      </div>
      {loading ? <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" /> : <MiniTable rows={rows} />}
    </div>
  );
}

export default function ServerlessFinOpsCards({ days = 30 }: { days?: number }) {
  const [cb, setCb] = useState<CostBreakdownResponse | null>(null);
  const [cbLoading, setCbLoading] = useState(true);
  const [detail, setDetail] = useState<Record<string, Row[]>>({});
  const [detailLoading, setDetailLoading] = useState(true);

  // Summary (one fast call).
  useEffect(() => {
    let active = true;
    setCbLoading(true);
    getCostBreakdown(days)
      .then((r) => active && setCb(r))
      .catch(() => active && setCb(null))
      .finally(() => active && setCbLoading(false));
    return () => {
      active = false;
    };
  }, [days]);

  // Detail tables (6 independent endpoints; one failure never blocks the others).
  useEffect(() => {
    let active = true;
    // #70: NO barrier — each panel lands as its (slow, per-object
    // ACCOUNT_USAGE) call resolves instead of six skeletons waiting on the
    // slowest. detailLoading now only gates panels with no data yet.
    setDetail({});
    setDetailLoading(true);
    let pending = DETAIL_PANELS.length;
    DETAIL_PANELS.forEach((p) => {
      p.loader(days)
        .then((r) => {
          if (active) setDetail((prev) => ({ ...prev, [p.key]: (r?.data ?? []) as Row[] }));
        })
        .catch(() => {
          if (active) setDetail((prev) => ({ ...prev, [p.key]: [] as Row[] }));
        })
        .finally(() => {
          pending -= 1;
          if (active && pending === 0) setDetailLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="mt-6 space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            FinOps · résumé des drivers ({days}j)
          </h3>
          <span className="text-[11px] uppercase tracking-wide text-gray-400">ACCOUNT_USAGE</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SUMMARY_PANELS.map((p) => (
            <PanelCard
              key={p.key}
              title={p.title}
              subtitle={p.subtitle}
              loading={cbLoading}
              rows={cb ? p.rows(cb) : []}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Audit détaillé par driver de coût
          </h3>
          <span className="text-[11px] uppercase tracking-wide text-gray-400">per-object ACCOUNT_USAGE</span>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {DETAIL_PANELS.map((p) =>
            detail[p.key] === undefined ? (
              <div
                key={p.key}
                className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="mb-2 h-3 w-32 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            ) : (
              <AuditTable
                key={p.key}
                title={p.title}
                subtitle={p.subtitle}
                rows={detail[p.key] ?? []}
                pageSize={25}
              />
            )
          )}
        </div>
      </section>
    </div>
  );
}
