'use client';

/**
 * SnowflakeInsightsAdvisor — a polished 2026-UX panel that turns the guarded
 * Snowflake-features AI analysis (GET /command-center/snowflake-insights) into
 * grouped, actionable cards.
 *
 * Each insight already carries a COHERENT action route computed server-side:
 *   security / users / network / governance  → /governance/*  (NEVER FinOps)
 *   cost                                      → /account-overview?tab=finops
 *   storage / modeling                        → /explore-design
 *   reliability (DQ)                          → /data-quality
 * The panel only renders + router.push(action.route) (with the action `intent`
 * appended so the target page can prefill on arrival).
 *
 * Honest states: distinct loading / empty / degraded rendering — a failed
 * analysis class is surfaced as "unavailable", never as a fake zero.
 *
 * Optional `categories` prop lets the orchestrator distribute the same panel
 * per-tab (e.g. only `security`/`users`/`network` on the Security tab).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert, ShieldCheck, Users, Globe, Gauge, Database, DollarSign,
  Share2, Activity, Sparkles, ArrowUpRight, RefreshCw, AlertTriangle, Info,
  type LucideIcon,
} from 'lucide-react';
import {
  getSnowflakeInsights,
  type SnowflakeInsight,
  type InsightCategory,
  type InsightSeverity,
} from '@/app/services/command-center';

// ── Category presentation ──────────────────────────────────────────────────
const CATEGORY_META: Record<
  InsightCategory,
  { label: string; icon: LucideIcon; accent: string }
> = {
  security:    { label: 'Security & Auth',   icon: ShieldAlert, accent: 'text-rose-600 dark:text-rose-400' },
  users:       { label: 'Users & Access',    icon: Users,       accent: 'text-amber-600 dark:text-amber-400' },
  network:     { label: 'Network',           icon: Globe,       accent: 'text-sky-600 dark:text-sky-400' },
  governance:  { label: 'Governance',        icon: ShieldCheck, accent: 'text-violet-600 dark:text-violet-400' },
  cost:        { label: 'Cost & FinOps',     icon: DollarSign,  accent: 'text-emerald-600 dark:text-emerald-400' },
  storage:     { label: 'Storage & Objects', icon: Database,    accent: 'text-indigo-600 dark:text-indigo-400' },
  performance: { label: 'Performance',       icon: Gauge,       accent: 'text-cyan-600 dark:text-cyan-400' },
  reliability: { label: 'Data Quality',      icon: Activity,    accent: 'text-blue-600 dark:text-blue-400' },
  sharing:     { label: 'Sharing',           icon: Share2,      accent: 'text-fuchsia-600 dark:text-fuchsia-400' },
};

// Maps a backend `degraded` feature key → the category its insight belongs to,
// so a per-tab panel only reports the skipped analyses that are relevant to it.
const DEGRADED_CATEGORY: Record<string, InsightCategory> = {
  USERS: 'users',
  NETWORK_POLICIES: 'network',
  MFA: 'security',
  GRANTS_TO_ROLES: 'governance',
  WAREHOUSES: 'cost',
  STALE_OBJECTS: 'storage',
  DQ: 'reliability',
  COST: 'cost',
};

// ── Severity presentation ──────────────────────────────────────────────────
const SEVERITY_META: Record<
  InsightSeverity,
  { label: string; badge: string; dot: string; rank: number; Icon: LucideIcon }
> = {
  critical: { label: 'Critical', rank: 0, Icon: AlertTriangle,
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900',
    dot: 'bg-rose-500' },
  high:     { label: 'High', rank: 1, Icon: AlertTriangle,
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 ring-1 ring-orange-200 dark:ring-orange-900',
    dot: 'bg-orange-500' },
  warning:  { label: 'Warning', rank: 2, Icon: AlertTriangle,
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900',
    dot: 'bg-amber-500' },
  info:     { label: 'OK', rank: 3, Icon: Info,
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700',
    dot: 'bg-slate-400' },
};

function severityRank(s: InsightSeverity): number {
  return SEVERITY_META[s]?.rank ?? 9;
}

/** Append the insight `intent` to its route, respecting any existing query. */
function routeWithIntent(route: string, intent: string): string {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}intent=${encodeURIComponent(intent)}&from=insights`;
}

function formatMetric(i: SnowflakeInsight): string | null {
  if (i.metric === null || i.metric === undefined || i.metric === '') return null;
  const unit = i.unit ? ` ${i.unit}` : '';
  return `${i.metric}${unit}`;
}

interface SnowflakeInsightsAdvisorProps {
  /** Restrict to these categories (per-tab distribution). Omit = show all. */
  categories?: InsightCategory[];
  /** Hide insights at `info` severity (clean findings). Default: show them. */
  hideOk?: boolean;
  /** Panel heading. */
  title?: string;
  /** Extra classes for the panel shell. */
  className?: string;
}

export default function SnowflakeInsightsAdvisor({
  categories,
  hideOk = false,
  title = 'AI Insights',
  className = '',
}: SnowflakeInsightsAdvisorProps) {
  const router = useRouter();
  const [insights, setInsights] = useState<SnowflakeInsight[]>([]);
  const [degraded, setDegraded] = useState<string[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    getSnowflakeInsights()
      .then((p) => {
        if (!active) return;
        setInsights(p.insights);
        setDegraded(p.degraded ?? []);
        setGeneratedAt(p.generated_at);
        // A wholly-empty payload that is also degraded === the fetch itself failed.
        setFailed(p.insights.length === 0 && (p.degraded?.includes('request_failed') ?? false));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  // Filter + group by category, ordering categories by their worst severity.
  const groups = useMemo(() => {
    const wanted = categories ? new Set(categories) : null;
    const filtered = insights.filter((i) => {
      if (wanted && !wanted.has(i.category)) return false;
      if (hideOk && i.severity === 'info') return false;
      return true;
    });
    const byCat = new Map<InsightCategory, SnowflakeInsight[]>();
    for (const i of filtered) {
      const arr = byCat.get(i.category) ?? [];
      arr.push(i);
      byCat.set(i.category, arr);
    }
    return Array.from(byCat.entries())
      .map(([cat, items]) => {
        items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
        const worst = items.reduce((m, x) => Math.min(m, severityRank(x.severity)), 9);
        return { cat, items, worst };
      })
      .sort((a, b) => a.worst - b.worst);
  }, [insights, categories, hideOk]);

  // Degraded keys that matter for THIS panel (filtered to its categories, and
  // never the synthetic 'request_failed' which is handled by the failed state).
  const relevantDegraded = useMemo(() => {
    const wanted = categories ? new Set(categories) : null;
    return degraded.filter((d) => {
      if (d === 'request_failed') return false;
      if (!wanted) return true;
      const cat = DEGRADED_CATEGORY[d];
      return cat ? wanted.has(cat) : true;
    });
  }, [degraded, categories]);

  const actionableCount = useMemo(
    () => groups.reduce((n, g) => n + g.items.filter((i) => i.severity !== 'info').length, 0),
    [groups],
  );

  const fresh = useMemo(() => {
    if (!generatedAt) return null;
    const d = new Date(generatedAt);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
  }, [generatedAt]);

  // ── Shell ────────────────────────────────────────────────────────────────
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm overflow-hidden ${className}`}
      aria-label="AI insights advisor"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-900/40">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300 ring-1 ring-violet-200/60 dark:ring-violet-900">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {loading
                ? 'Analyzing platform features…'
                : failed
                  ? 'Automated platform analysis'
                  : actionableCount > 0
                    ? `${actionableCount} action${actionableCount === 1 ? '' : 's'} recommended`
                    : 'No issues detected'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
          aria-label="Re-run analysis"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      {/* Degraded banner — honest "some classes unavailable" (not request failure).
          Only shown when there are ALSO insights to render; an all-degraded empty
          panel uses the dedicated DegradedEmptyState below instead. */}
      {!loading && !failed && relevantDegraded.length > 0 && groups.length > 0 && (
        <div className="flex items-start gap-2 px-5 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/40">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Some analyses are unavailable on this edition or for this role and were skipped:{' '}
            <span className="font-medium">{relevantDegraded.join(', ')}</span>.
          </p>
        </div>
      )}

      {/* Body */}
      <div className="p-4 sm:p-5">
        {loading ? (
          <LoadingState />
        ) : failed ? (
          <FailedState onRetry={load} />
        ) : groups.length === 0 ? (
          relevantDegraded.length > 0 ? (
            <DegradedEmptyState features={relevantDegraded} />
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="space-y-5">
            {groups.map((g) => {
              const meta = CATEGORY_META[g.cat];
              const Icon = meta.icon;
              return (
                <div key={g.cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${meta.accent}`} />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {meta.label}
                    </h3>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{g.items.length}</span>
                  </div>
                  <ul className="space-y-2.5">
                    {g.items.map((i) => (
                      <InsightCard
                        key={i.id}
                        insight={i}
                        onAct={() => router.push(routeWithIntent(i.action.route, i.action.intent))}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            {fresh && (
              <p className="pt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Analyzed {fresh} · {insights.length} feature{insights.length === 1 ? '' : 's'} scanned
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Insight card ───────────────────────────────────────────────────────────
function InsightCard({ insight, onAct }: { insight: SnowflakeInsight; onAct: () => void }) {
  const sev = SEVERITY_META[insight.severity] ?? SEVERITY_META.info;
  const metric = formatMetric(insight);
  const isOk = insight.severity === 'info';

  return (
    <li
      className={`group rounded-xl border p-3.5 transition hover:shadow-sm ${
        isOk
          ? 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${sev.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {insight.feature}
            </span>
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">{insight.title}</h4>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{insight.detail}</p>
        </div>
        {metric && (
          <div className="flex-shrink-0 text-right">
            <span className={`text-lg font-bold tabular-nums ${isOk ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
              {metric}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={onAct}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            isOk
              ? 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
          }`}
        >
          {insight.action.label}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

// ── States ─────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      {[0, 1, 2].map((n) => (
        <div key={n} className="rounded-xl border border-slate-100 dark:border-slate-800 p-3.5">
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
          <div className="mt-2 h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-1.5 h-3 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
          <div className="mt-2.5 ml-auto h-7 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No issues detected</h3>
      <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
        The AI analysis found nothing to act on in this area right now.
      </p>
    </div>
  );
}

/** Shown when a panel has no insights BUT some of its analyses were skipped —
 *  honest "couldn't analyze" rather than a misleading green "no issues". */
function DegradedEmptyState({ features }: { features: string[] }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analysis couldn’t run</h3>
      <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
        These checks are unavailable on this edition or for your role, so no finding could be
        produced: <span className="font-medium">{features.join(', ')}</span>.
      </p>
    </div>
  );
}

function FailedState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analysis unavailable</h3>
        <p className="mt-0.5 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          The platform feature analysis could not be reached. This is usually temporary.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:opacity-90"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}
