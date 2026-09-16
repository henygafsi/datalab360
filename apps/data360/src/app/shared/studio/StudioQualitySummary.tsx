'use client';

/**
 * StudioQualitySummary — the business-comprehension layer of the Quality view
 * (#137): the 8 named quality DIMENSIONS as first-class scored cards, and the
 * 3 LAYERS (source systems → ingestion & model build → target/business model)
 * each with its own score. Fed by the served `summary.quality` roll-up.
 *
 * Honesty first: a dimension or layer not yet evaluated shows "—" (never 0,
 * never 100), carries its `method` on hover, and the target/business layer
 * stays "—" until a full quality run has scored it. Nothing here is invented.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { routes } from '@/config/routes';
import {
  CheckSquare,
  Copy,
  GitBranch,
  type LucideIcon,
  Ruler,
  Scale,
  ShieldCheck,
  Timer,
  Waypoints,
} from 'lucide-react';
import { getStudioSummary, type QualitySummary, type ScoredMetric } from '@/app/services/studio/summary';

const DIMENSIONS: Array<{ key: string; label: string; Icon: LucideIcon }> = [
  { key: 'completeness', label: 'Completeness', Icon: CheckSquare },
  { key: 'validity', label: 'Validity', Icon: ShieldCheck },
  { key: 'uniqueness', label: 'Uniqueness', Icon: Copy },
  { key: 'freshness', label: 'Freshness', Icon: Timer },
  { key: 'consistency', label: 'Consistency', Icon: Scale },
  { key: 'schema_drift', label: 'Schema drift', Icon: Ruler },
  { key: 'lineage_trust', label: 'Lineage trust', Icon: Waypoints },
  { key: 'business_rules', label: 'Business rules', Icon: GitBranch },
];

const LAYERS: Array<{ key: keyof NonNullable<QualitySummary['layers']>; n: number; label: string; sub: string }> = [
  { key: 'source', n: 1, label: 'Source systems', sub: 'Ingestion & raw data quality' },
  { key: 'ingestion_build', n: 2, label: 'Ingestion & model build', sub: 'Transformations & data model' },
  { key: 'target', n: 3, label: 'Target model', sub: 'Curated data for the business' },
];

function tone(score?: number | null): string {
  // a legible muted, not the near-invisible slate-300/600 the em-dash used to
  // render at text-xl (an unscored value must still be readable)
  if (score == null) return 'text-slate-400 dark:text-slate-500';
  return score >= 85
    ? 'text-emerald-600 dark:text-emerald-400'
    : score >= 60
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';
}
function fmt(score?: number | null): string {
  return score == null ? '—' : Number.isInteger(score) ? String(score) : score.toFixed(0);
}

function ScoreCard({
  label,
  sub,
  metric,
  badge,
  Icon,
}: {
  label: string;
  sub?: string;
  metric?: ScoredMetric;
  badge?: number;
  Icon?: LucideIcon;
}) {
  const score = metric?.score;
  // a weak score is a DOOR, not a dead end — it jumps to the act section
  // (checks, anomalies, fix-in-job) that explains and repairs it
  const actionable = score != null && score < 85;
  return (
    <div
      title={metric?.method ? `${label} — ${metric.method}` : label}
      role={actionable ? 'button' : undefined}
      tabIndex={actionable ? 0 : undefined}
      onClick={
        actionable
          ? () => document.getElementById('dq-act')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          : undefined
      }
      onKeyDown={
        actionable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ')
                document.getElementById('dq-act')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          : undefined
      }
      className={`min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 ${
        actionable
          ? 'cursor-pointer hover:border-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:border-accent-700'
          : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        {badge != null && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {badge}
          </span>
        )}
        {Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />}
        <span className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className={`mt-0.5 flex items-baseline gap-2 text-xl font-semibold tabular-nums ${tone(score)}`}>
        {fmt(score)}
        {/* the score as a GLANCEABLE bar, not only a number — served value,
            no bar when unevaluated */}
        {score != null && (
          <span className="mb-1 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            <span
              className={`block h-full rounded-full ${score >= 85 ? 'bg-emerald-400 dark:bg-emerald-500' : score >= 60 ? 'bg-amber-400 dark:bg-amber-500' : 'bg-rose-400 dark:bg-rose-500'}`}
              style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
            />
          </span>
        )}
      </div>
      {sub && <div className="truncate text-xs text-slate-400 dark:text-slate-500">{sub}</div>}
      {/* the measured evidence behind the score — served checks/counts,
          nothing when the backend said nothing */}
      {metric?.checks != null && (
        <div className="truncate text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {metric.checks} check{metric.checks === 1 ? '' : 's'}
          {metric.counts &&
            Object.entries(metric.counts)
              .filter(([, v]) => (v ?? 0) > 0)
              .slice(0, 2)
              .map(([k, v]) => ` · ${v} ${k.replace(/_/g, ' ')}`)
              .join('')}
        </div>
      )}
      {score == null && (
        <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">not evaluated yet</div>
      )}
      {actionable && (
        <div className="truncate text-[11px] text-accent-600 dark:text-accent-400">
          see what holds it back ↓
        </div>
      )}
    </div>
  );
}

export default function StudioQualitySummary({ draftId }: { draftId: string }) {
  const [q, setQ] = useState<QualitySummary | null | 'loading'>('loading');

  useEffect(() => {
    let alive = true;
    setQ('loading');
    void getStudioSummary(draftId, ['quality'])
      .then((r) => alive && setQ(r.quality ?? {}))
      .catch(() => alive && setQ({}));
    return () => {
      alive = false;
    };
  }, [draftId]);

  if (q === 'loading') {
    return <div role="status" className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  }
  const dims = q?.dimensions ?? {};
  const layers = q?.layers ?? {};
  const impact = q?.business_impact;
  const hasAny = Object.keys(dims).length > 0 || Object.keys(layers).length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      <section>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Quality dimensions
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {DIMENSIONS.map((d) => (
            <ScoreCard key={d.key} label={d.label} Icon={d.Icon} metric={dims[d.key]} />
          ))}
        </div>
      </section>

      <section>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Quality by layer — from the source systems to your business model
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LAYERS.map((l) => (
            <ScoreCard key={l.key} badge={l.n} label={l.label} sub={l.sub} metric={layers[l.key]} />
          ))}
        </div>
      </section>

      {impact && (impact.count ?? 0) > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-medium text-amber-700 dark:text-amber-300">
            {impact.count} KPI{impact.count === 1 ? '' : 's'} at risk
          </span>{' '}
          from these quality gaps
          {(impact.kpis_at_risk ?? []).length > 0 && (
            <>
              {' '}
              —{' '}
              {(impact.kpis_at_risk ?? []).slice(0, 3).map((k, i) => (
                <span key={k.chart_id ?? i}>
                  {i > 0 && ', '}
                  {/* DQ→ask door: the at-risk KPI opens in Reporting */}
                  <Link
                    href={`${routes.studioApp(draftId)}?view=reporting`}
                    className="rounded text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                  >
                    {k.title ?? k.chart_id}
                  </Link>
                </span>
              ))}
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}
