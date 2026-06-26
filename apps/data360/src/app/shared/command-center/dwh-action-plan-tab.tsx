'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Copy,
  Gauge,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  ArrowUpRight,
  Workflow,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  getDwhProposal,
  type DwhProposalResponse,
  type DwhProposalPillar,
  type DwhProposalCta,
  type DwhProposalItem,
} from '@/app/services/command-center';
import { getApiErrorMessage } from '@/lib/api-client';

// Pillar keys returned by the backend → presentation metadata. Iterating this
// map (not the task's informal names) keeps us aligned with the real payload
// keys: governance | duplicates | performance | cost | data_quality.
const PILLAR_META: Record<string, { label: string; icon: typeof ShieldCheck; accent: string }> = {
  governance: { label: 'Governance', icon: ShieldCheck, accent: 'text-blue-500' },
  duplicates: { label: 'Deduplication', icon: Copy, accent: 'text-violet-500' },
  performance: { label: 'Performance', icon: Gauge, accent: 'text-amber-500' },
  cost: { label: 'Cost', icon: DollarSign, accent: 'text-emerald-500' },
  data_quality: { label: 'Data Quality', icon: CheckCircle2, accent: 'text-cyan-500' },
};

const PILLAR_ORDER = ['governance', 'duplicates', 'performance', 'cost', 'data_quality'];

function severityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'high':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    case 'medium':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  }
}

function ctaIcon(action: string) {
  if (action === 'workflow') return Workflow;
  if (action === 'audit') return Search;
  return ArrowUpRight;
}

/** Parse the JSON-string `locations` field into an array; fall back to raw. */
function parseLocations(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [String(raw)];
  } catch {
    return [raw];
  }
}

function CtaButton({ cta }: { cta: DwhProposalCta }) {
  const Icon = ctaIcon(cta.action);
  return (
    <a
      href={cta.target ?? '#'}
      className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
    >
      <Icon className="h-3.5 w-3.5" />
      {cta.label}
    </a>
  );
}

function FindingCard({ item }: { item: DwhProposalItem }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${severityClasses(item.severity)}`}>
          {item.severity}
        </span>
      </div>
      {item.detail ? (
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{item.detail}</p>
      ) : null}
      {item.remediation ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300">
          <Wrench className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <span>{item.remediation}</span>
        </p>
      ) : null}
      {item.ctas && item.ctas.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {item.ctas.map((cta, i) => (
            <CtaButton key={`${cta.action}-${i}`} cta={cta} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PillarSection({ pillarKey, pillar }: { pillarKey: string; pillar: DwhProposalPillar }) {
  const meta = PILLAR_META[pillarKey] ?? { label: pillarKey, icon: AlertTriangle, accent: 'text-gray-500' };
  const Icon = meta.icon;
  const items = pillar.items ?? [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
        <Icon className={`h-5 w-5 ${meta.accent}`} />
        <h3 className="font-semibold text-gray-900 dark:text-white">{meta.label}</h3>
        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {pillar.count} {pillar.count === 1 ? 'finding' : 'findings'}
        </span>
      </div>
      <div className="space-y-3 p-4">
        {items.length === 0 ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No issues found in this pillar</p>
          </div>
        ) : (
          items.map((item) => <FindingCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

export default function DwhActionPlanTab() {
  const [data, setData] = useState<DwhProposalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getDwhProposal()
      .then((resp) => setData(resp))
      .catch((e) => setError(getApiErrorMessage(e) ?? 'Failed to load the DWH action plan'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pillarEntries = useMemo(() => {
    if (!data?.pillars) return [] as Array<[string, DwhProposalPillar]>;
    const keys = Object.keys(data.pillars);
    const ordered = [
      ...PILLAR_ORDER.filter((k) => keys.includes(k)),
      ...keys.filter((k) => !PILLAR_ORDER.includes(k)),
    ];
    return ordered.map((k) => [k, data.pillars[k]] as [string, DwhProposalPillar]);
  }, [data]);

  const duplicates = data?.duplicates_detail ?? [];
  // Real dedup CTAs are carried by the duplicates *pillar* item (the per-row
  // duplicates_detail entries don't carry their own). Reuse the real targets
  // (e.g. /workflow?template=dwh-dedup-merge) rather than inventing a link.
  const dedupCtas = data?.pillars?.duplicates?.items?.[0]?.ctas ?? [];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/40 dark:bg-red-950/30">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-700 dark:text-red-300">Could not load the DWH action plan</p>
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={load}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Headline banner: confidence + pain points ── */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 dark:border-gray-700 dark:from-blue-950/40 dark:to-indigo-950/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Wrench className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">DWH Action Plan</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {data?.headline ?? 'No findings available'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data?.pain_points_total ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Pain points</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data?.pain_points_critical ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Critical</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data?.dwh_confidence ?? 0}<span className="text-sm text-gray-400">/100</span></p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Confidence</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pillars ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pillarEntries.map(([key, pillar]) => (
          <PillarSection key={key} pillarKey={key} pillar={pillar} />
        ))}
      </div>

      {/* ── Duplicate tables (actionable list) ── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
          <Copy className="h-5 w-5 text-violet-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Duplicate tables</h3>
          {duplicates.length > 0 ? (
            <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {duplicates.length}
            </span>
          ) : null}
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {duplicates.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No duplicate tables detected</p>
            </div>
          ) : (
            duplicates.map((dup, i) => {
              const locations = parseLocations(dup.locations);
              return (
                <div key={`${dup.table_name}-${i}`} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{dup.table_name}</span>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {dup.copies} copies
                    </span>
                    {dup.total_rows != null ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {dup.total_rows.toLocaleString()} rows
                      </span>
                    ) : null}
                    {dup.total_gb != null && dup.total_gb > 0 ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {dup.total_gb.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB
                      </span>
                    ) : null}
                  </div>
                  {locations.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {locations.map((loc, j) => (
                        <li
                          key={`${loc}-${j}`}
                          className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {loc}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {dedupCtas.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {dedupCtas.map((cta, k) => (
                        <CtaButton key={`${dup.table_name}-cta-${k}`} cta={cta} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {data?.meta?.as_of ? (
        <p className="text-right text-xs text-gray-400 dark:text-gray-500">
          As of {new Date(data.meta.as_of).toLocaleString()}
          {data.meta.stale ? ' · cache may be stale' : ''}
        </p>
      ) : null}
    </div>
  );
}
