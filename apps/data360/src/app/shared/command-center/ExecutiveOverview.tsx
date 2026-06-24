'use client';

/**
 * ExecutiveOverview — the real cross-tab Data360 × Snowflake executive summary
 * for the Overview tab. Pulls LIVE endpoints (the old cards were gated on the
 * unprovisioned OVERVIEW_KPIS cache → "—"): /command-center/summary,
 * /cost-breakdown, /recommendations, /module-health. Surfaces the most important
 * KPIs + AI highlights (cost savings · DQ fixes · governance) across all modules
 * and Snowflake — with one-click drill-downs.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, Rocket, Workflow, DollarSign, AlertTriangle, Boxes, Sparkles,
  ArrowUpRight, ShieldCheck, Gauge, TrendingDown, Database, Cloud,
} from 'lucide-react';
import { getSummary, getCostBreakdown, getModuleHealth } from '@/app/services/command-center';
import { getCommandCenterRecommendations, type Recommendation } from '@/app/services/command-center/recommendations';
import { useAuth } from '@/hooks/useAuth';

type Num = number | null | undefined;
const fnum = (n: Num) => (n == null ? '—' : Number(n).toLocaleString());

interface Kpi {
  label: string;
  value: string;
  icon: any;
  tone: string;
  delta?: string;
  deltaTone?: string;
  onClick?: () => void;
}

const DIM_META: Record<string, { label: string; icon: any; tone: string; tab: string }> = {
  cost: { label: 'Économies de coût', icon: TrendingDown, tone: 'amber', tab: 'finops' },
  dq: { label: 'Corrections qualité (DQ)', icon: Gauge, tone: 'blue', tab: 'overview' },
  gov: { label: 'Gouvernance', icon: ShieldCheck, tone: 'violet', tab: 'security' },
};

export default function ExecutiveOverview({ days = 30, onNavigateTab }: { days?: number; onNavigateTab?: (t: string) => void }) {
  const router = useRouter();
  const auth = useAuth() as { account_name?: string; role?: string; username?: string };
  const [summary, setSummary] = useState<any>(null);
  const [cost, setCost] = useState<any>(null);
  const [recs, setRecs] = useState<{ list: Recommendation[]; byDim: Record<string, Recommendation[]>; counts: Record<string, { open: number; critical: number }>; critical: number } | null>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([
      getSummary(),
      getCostBreakdown(days),
      getCommandCenterRecommendations(days),
      getModuleHealth(),
    ]).then(([s, c, r, m]) => {
      if (!active) return;
      if (s.status === 'fulfilled') setSummary(s.value);
      if (c.status === 'fulfilled') setCost(c.value);
      if (r.status === 'fulfilled') {
        const v: any = r.value;
        setRecs({ list: v.recommendations ?? [], byDim: v.by_dimension ?? {}, counts: v.counts ?? {}, critical: v.total_critical ?? 0 });
      }
      if (m.status === 'fulfilled') setModules(((m.value as any)?.modules ?? []) as any[]);
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [days]);

  const p = summary?.platform ?? {};
  const cst = summary?.cost ?? {};
  const healthy = modules.filter((m) => m.status === 'healthy').length;
  const trend = Number(cst.credit_trend_pct);

  const kpis: Kpi[] = [
    { label: 'Utilisateurs actifs (7j)', value: fnum(p.active_users_7d ?? p.total_users), icon: Users, tone: 'blue' },
    { label: 'Projets', value: fnum(p.total_projects), icon: Rocket, tone: 'violet', onClick: () => onNavigateTab?.('projects') },
    { label: 'Workflows', value: fnum(p.total_workflows), icon: Workflow, tone: 'indigo', onClick: () => onNavigateTab?.('modules') },
    {
      label: `Crédits (${days}j)`, value: cost?.total_credits != null ? Number(cost.total_credits).toLocaleString(undefined, { maximumFractionDigits: 1 }) : fnum(cst.credits_30d),
      icon: DollarSign, tone: 'amber',
      delta: Number.isFinite(trend) ? `${trend > 0 ? '+' : ''}${trend}%` : undefined, deltaTone: trend <= 0 ? 'emerald' : 'rose',
      onClick: () => onNavigateTab?.('finops'),
    },
    { label: 'Alertes critiques', value: recs ? String(recs.critical) : '—', icon: AlertTriangle, tone: recs && recs.critical > 0 ? 'rose' : 'emerald', onClick: () => onNavigateTab?.('security') },
    { label: 'Modules sains', value: modules.length ? `${healthy}/${modules.length}` : '—', icon: Boxes, tone: 'emerald', onClick: () => onNavigateTab?.('modules') },
  ];

  const highlights = (['cost', 'dq', 'gov'] as const).map((dim) => {
    const meta = DIM_META[dim];
    const list = recs?.byDim[dim] ?? [];
    const count = recs?.counts[dim]?.open ?? list.length;
    const top = list[0];
    return { dim, meta, count, top };
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-slate-50/60 p-4 dark:border-gray-700 dark:from-gray-900 dark:to-gray-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Cloud className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Vue exécutive — Data360</h3>
        {auth?.account_name && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {auth.account_name}{auth.role ? ` · ${auth.role}` : ''}
          </span>
        )}
        <button onClick={() => onNavigateTab?.('snowflake-accounts')} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
          Comptes connectés <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {/* Real KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={k.onClick}
            disabled={!k.onClick}
            className="rounded-xl border border-gray-200 bg-white p-2.5 text-left transition-colors enabled:hover:border-primary dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <k.icon className={`h-3.5 w-3.5 text-${k.tone}-500`} />
              {k.delta && <span className={`text-[10px] font-semibold text-${k.deltaTone}-600 dark:text-${k.deltaTone}-400`}>{k.delta}</span>}
            </div>
            <div className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{loading ? '…' : k.value}</div>
            <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{k.label}</div>
          </button>
        ))}
      </div>

      {/* AI highlights — cost savings · DQ fixes · governance */}
      <div className="mt-3 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Analyse IA cross-modules</span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-3">
        {highlights.map(({ dim, meta, count, top }) => (
          <div key={dim} className={`rounded-xl border border-${meta.tone}-200 bg-${meta.tone}-50/50 p-3 dark:border-${meta.tone}-900/40 dark:bg-${meta.tone}-900/10`}>
            <div className="mb-1 flex items-center gap-1.5">
              <meta.icon className={`h-3.5 w-3.5 text-${meta.tone}-600 dark:text-${meta.tone}-400`} />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{meta.label}</span>
              <span className={`ml-auto rounded-full bg-${meta.tone}-100 px-1.5 py-0.5 text-[10px] font-bold text-${meta.tone}-700 dark:bg-${meta.tone}-900/40 dark:text-${meta.tone}-300`}>
                {loading ? '…' : count}
              </span>
            </div>
            <p className="min-h-[28px] text-[11px] text-gray-600 dark:text-gray-300">
              {loading ? 'Analyse…' : top ? top.title : 'Aucune action requise — axe sain.'}
            </p>
            <button onClick={() => onNavigateTab?.(meta.tab)} className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-${meta.tone}-700 hover:underline dark:text-${meta.tone}-300`}>
              Examiner <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Cross-feature module health strip (Data360 + Snowflake) */}
      {modules.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Santé des modules & fonctionnalités</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modules.map((m) => {
              const tone = m.status === 'healthy' ? 'emerald' : m.status === 'degraded' || m.status === 'warning' ? 'amber' : 'rose';
              return (
                <span key={m.module_key ?? m.module} title={m.status_reason} className={`inline-flex items-center gap-1 rounded-full bg-${tone}-50 px-2 py-0.5 text-[10px] font-medium text-${tone}-700 dark:bg-${tone}-900/20 dark:text-${tone}-300`}>
                  <span className={`h-1.5 w-1.5 rounded-full bg-${tone}-500`} />
                  {m.module}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
