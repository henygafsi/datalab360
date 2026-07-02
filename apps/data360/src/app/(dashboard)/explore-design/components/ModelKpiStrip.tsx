'use client';

/**
 * ModelKpiStrip — the horizontal top KPI strip for Explore & Design (redesign
 * Wave A, spec §1 / mockup `01-overview.png`). Eight cards summarising the model
 * at a glance: Model Health · Tables · Relations · Columns · Data Quality · PII
 * Risk · Est. Cost Impact · Release Readiness.
 *
 * PURE + props-driven — it holds no state and fetches nothing. The page computes
 * `kpis` from data already in hand and passes it down; every field is optional.
 *
 * Honesty rules (match the module's no-fake-zero contract):
 *   · A missing value (`null`/`undefined`) renders "—". A *real* zero (an empty
 *     model has 0 tables) renders "0" — so we gate on `v == null`, never `v ||`.
 *   · Deltas render only when supplied; no arrow otherwise.
 *
 * Tailwind purge note: every data-driven colour comes from a LITERAL-string
 * lookup map (interpolated classes like `bg-${x}-500` get purged by the content
 * scanner — see ContextRightBar lines 30-50 for the same wound).
 */

import React from 'react';
import { cn } from '@/lib/utils';

// ── Public types ─────────────────────────────────────────────────────────────

export type HealthRating = 'Good' | 'Fair' | 'Poor';
export type PiiLevel = 'Low' | 'Medium' | 'High';
export type ReadinessStatus = 'On track' | 'Blocked';

export interface ModelKpis {
  modelHealth?: { score?: number | null; rating?: HealthRating | null };
  tables?: { count?: number | null; delta?: number | null };
  relations?: { count?: number | null; delta?: number | null };
  columns?: { count?: number | null; delta?: number | null };
  dataQuality?: { percent?: number | null; issues?: number | null };
  piiRisk?: { level?: PiiLevel | null };
  costImpact?: { monthly?: number | null; deltaPct?: number | null };
  releaseReadiness?: { percent?: number | null; status?: ReadinessStatus | null };
}

export interface ModelKpiStripProps {
  kpis?: ModelKpis;
  className?: string;
}

// ── Literal-string colour maps (purge-safe) ──────────────────────────────────

const HEALTH_DOT: Record<HealthRating, string> = {
  Good: 'bg-emerald-500',
  Fair: 'bg-amber-500',
  Poor: 'bg-red-500',
};

const PII_DOT: Record<PiiLevel, string> = {
  Low: 'bg-emerald-500',
  Medium: 'bg-amber-500',
  High: 'bg-red-500',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Missing → "—"; a real 0 stays "0". Never collapse a legitimate zero. */
function show(v: number | null | undefined): string {
  return v == null ? '—' : String(v);
}

function DeltaArrow({ delta }: { delta?: number | null }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        'ml-1.5 text-xs font-semibold',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      {up ? '↑' : '↓'}
      {Math.abs(delta)}
    </span>
  );
}

// ── Card shell ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[8.5rem] flex-1 border-r border-slate-200 px-4 py-2.5 last:border-r-0 dark:border-slate-800">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline">{children}</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ModelKpiStrip({ kpis, className }: ModelKpiStripProps) {
  const k = kpis ?? {};

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-stretch overflow-x-auto border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      role="group"
      aria-label="Model KPIs"
    >
      {/* 1 · Model Health */}
      <KpiCard label="Model Health">
        {k.modelHealth?.rating ? (
          <span className={cn('mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full', HEALTH_DOT[k.modelHealth.rating])} />
        ) : (
          <span className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
        )}
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {k.modelHealth?.rating ?? '—'}
        </span>
        {k.modelHealth?.score != null && (
          <span className="ml-1.5 text-xs font-medium text-slate-400">
            {k.modelHealth.score}/100
          </span>
        )}
      </KpiCard>

      {/* 2 · Tables */}
      <KpiCard label="Tables">
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {show(k.tables?.count)}
        </span>
        <DeltaArrow delta={k.tables?.delta} />
      </KpiCard>

      {/* 3 · Relations */}
      <KpiCard label="Relations">
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {show(k.relations?.count)}
        </span>
        <DeltaArrow delta={k.relations?.delta} />
      </KpiCard>

      {/* 4 · Columns */}
      <KpiCard label="Columns">
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {show(k.columns?.count)}
        </span>
        <DeltaArrow delta={k.columns?.delta} />
      </KpiCard>

      {/* 5 · Data Quality */}
      <KpiCard label="Data Quality">
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {k.dataQuality?.percent == null ? '—' : `${k.dataQuality.percent}%`}
        </span>
        {k.dataQuality?.issues != null && k.dataQuality.issues > 0 && (
          <span className="ml-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {k.dataQuality.issues} {k.dataQuality.issues === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </KpiCard>

      {/* 6 · PII Risk */}
      <KpiCard label="PII Risk">
        {k.piiRisk?.level ? (
          <span className={cn('mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full', PII_DOT[k.piiRisk.level])} />
        ) : (
          <span className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
        )}
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {k.piiRisk?.level ?? '—'}
        </span>
      </KpiCard>

      {/* 7 · Est. Cost Impact */}
      <KpiCard label="Est. Cost Impact">
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {k.costImpact?.monthly == null
            ? '—'
            : `$${k.costImpact.monthly.toLocaleString()}/mo`}
        </span>
        {k.costImpact?.deltaPct != null && k.costImpact.deltaPct !== 0 && (
          <span
            className={cn(
              'ml-1.5 text-xs font-semibold',
              k.costImpact.deltaPct > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {k.costImpact.deltaPct > 0 ? '+' : ''}
            {k.costImpact.deltaPct}%
          </span>
        )}
      </KpiCard>

      {/* 8 · Release Readiness */}
      <KpiCard label="Release Readiness">
        <span className="text-base font-bold text-slate-900 dark:text-white">
          {k.releaseReadiness?.percent == null ? '—' : `${k.releaseReadiness.percent}%`}
        </span>
        {k.releaseReadiness?.status && (
          <span
            className={cn(
              'ml-1.5 text-xs font-medium',
              k.releaseReadiness.status === 'Blocked'
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {k.releaseReadiness.status}
          </span>
        )}
      </KpiCard>
    </div>
  );
}
