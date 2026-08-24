'use client';

import { useState, useEffect, memo, useMemo } from 'react';
import { Badge } from 'rizzui';
import {
  Database,
  GitBranch,
  BarChart3,
  Shield,
  Brain,
  CheckCircle,
  Eye,
  Upload,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InsightActionButton } from '@/app/shared/insights';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  getModuleHealth,
  getSummary,
  getActivityFeed,
} from '@/app/services/command-center';
import type {
  ModuleHealthItem,
  ModuleHealthResponse,
  SummaryResponse,
} from '@/app/services/command-center/types';
import AuditTable, { type Row } from './AuditTable';
import { dash, fmtNum } from '@/app/shared/ui/format';

const KNOWN_MODULES: Array<{
  key: string;
  name: string;
  icon: React.ElementType;
  color: string;
  hex: string;
}> = [
  { key: 'connect', name: 'Connect', icon: Upload, color: 'blue', hex: '#3B82F6' },
  { key: 'workflow', name: 'Workflow', icon: GitBranch, color: 'amber', hex: '#F59E0B' },
  {
    key: 'explore_design',
    name: 'Explore & Design',
    icon: Database,
    color: 'violet',
    hex: '#8B5CF6',
  },
  {
    key: 'bi_reporting',
    name: 'BI Reporting',
    icon: BarChart3,
    color: 'cyan',
    hex: '#06B6D4',
  },
  {
    key: 'data_quality',
    name: 'Data Quality',
    icon: CheckCircle,
    color: 'green',
    hex: '#10B981',
  },
  { key: 'cortex', name: 'AI Intelligence', icon: Brain, color: 'purple', hex: '#A855F7' },
  {
    key: 'governance',
    name: 'Governance',
    icon: Shield,
    color: 'rose',
    hex: '#F43F5E',
  },
  {
    key: 'observability',
    name: 'Observability',
    icon: Eye,
    color: 'orange',
    hex: '#F97316',
  },
];

interface ModuleIssue {
  severity: string;
  message: string;
}

interface ModuleKpi {
  label: string;
  // Missing → "—" at the render boundary (R3); a genuine 0 still renders as 0.
  value: string | number | null | undefined;
  status?: string;
}

interface ModuleCard {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  href: string;
  kpis: ModuleKpi[];
  // Backend emits a wider set than the legacy trio; keep it open-typed.
  status: string;
  statusReason?: string;
  healthScore?: number;
  issues: ModuleIssue[];
}

const STATUS_BADGE: Record<string, string> = {
  healthy:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  degraded:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  warning:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  needs_setup:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

/**
 * Static per-color class strings. Tailwind JIT only emits classes it can see as
 * complete literal tokens in source; dynamic `bg-${color}-100` interpolation gets
 * purged → colorless tiles. This lookup keeps every token whole so the brand
 * colors always render. Unknown keys fall back to `gray`.
 */
interface ColorClasses {
  hoverBorder: string;
  iconBg: string;
  iconText: string;
}
const COLOR_CLASSES: Record<string, ColorClasses> = {
  blue: {
    hoverBorder: 'hover:border-blue-300 dark:hover:border-blue-700',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconText: 'text-blue-600 dark:text-blue-400',
  },
  amber: {
    hoverBorder: 'hover:border-amber-300 dark:hover:border-amber-700',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconText: 'text-amber-600 dark:text-amber-400',
  },
  violet: {
    hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-700',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconText: 'text-violet-600 dark:text-violet-400',
  },
  cyan: {
    hoverBorder: 'hover:border-cyan-300 dark:hover:border-cyan-700',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
    iconText: 'text-cyan-600 dark:text-cyan-400',
  },
  green: {
    hoverBorder: 'hover:border-green-300 dark:hover:border-green-700',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconText: 'text-green-600 dark:text-green-400',
  },
  purple: {
    hoverBorder: 'hover:border-purple-300 dark:hover:border-purple-700',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconText: 'text-purple-600 dark:text-purple-400',
  },
  rose: {
    hoverBorder: 'hover:border-rose-300 dark:hover:border-rose-700',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconText: 'text-rose-600 dark:text-rose-400',
  },
  orange: {
    hoverBorder: 'hover:border-orange-300 dark:hover:border-orange-700',
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconText: 'text-orange-600 dark:text-orange-400',
  },
  gray: {
    hoverBorder: 'hover:border-gray-300 dark:hover:border-gray-700',
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconText: 'text-gray-600 dark:text-gray-400',
  },
};
function colorClasses(color: string): ColorClasses {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.gray;
}

/** Color a KPI value by its backend kpi*_status. */
function kpiValueClass(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'good':
    case 'healthy':
    case 'ok':
    case 'success':
      return 'text-green-600 dark:text-green-400';
    case 'warning':
    case 'warn':
    case 'degraded':
    case 'needs_setup':
      return 'text-amber-600 dark:text-amber-400';
    case 'critical':
    case 'error':
    case 'bad':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-900 dark:text-white';
  }
}

/** Health-score bar color by band. */
function healthBarClass(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Issue-severity icon color. */
function issueSeverityClass(severity: string): string {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
    case 'error':
    case 'high':
      return 'text-red-500';
    case 'warning':
    case 'warn':
    case 'medium':
      return 'text-amber-500';
    default:
      return 'text-gray-400';
  }
}

function buildModuleCards(
  moduleHealth: ModuleHealthResponse | null
): ModuleCard[] {
  // Backend returns modules as array — convert to cards directly
  const rawModules: ModuleHealthItem[] = Array.isArray(moduleHealth?.modules)
    ? moduleHealth!.modules
    : [];

  const ICON_MAP: Record<string, React.ElementType> = {
    connect: Upload,
    workflow: GitBranch,
    explore_design: Database,
    bi_reporting: BarChart3,
    data_quality: CheckCircle,
    cortex: Brain,
    governance: Shield,
    observability: Eye,
  };
  const COLOR_MAP: Record<string, string> = {
    connect: 'blue',
    workflow: 'amber',
    explore_design: 'violet',
    bi_reporting: 'cyan',
    data_quality: 'green',
    cortex: 'purple',
    governance: 'rose',
    observability: 'orange',
  };
  const HREF_MAP: Record<string, string> = {
    connect: '/data-source-connection',
    workflow: '/workflow',
    explore_design: '/explore-design',
    bi_reporting: '/bi-dashboard',
    data_quality: '/data-quality',
    cortex: '/intelligent',
    governance: '/governance',
    observability: '/observability',
  };

  return rawModules.map((m) => ({
    id: m.module_key,
    name: m.module,
    icon: ICON_MAP[m.module_key] || Activity,
    color: COLOR_MAP[m.module_key] || 'gray',
    href: HREF_MAP[m.module_key] || '/',
    status: m.status || 'inactive',
    statusReason: m.status_reason,
    healthScore:
      typeof m.health_score === 'number' ? m.health_score : undefined,
    issues: Array.isArray(m.issues) ? m.issues : [],
    kpis: [
      { label: m.kpi1_label || 'KPI 1', value: m.kpi1 ?? null, status: m.kpi1_status },
      { label: m.kpi2_label || 'KPI 2', value: m.kpi2 ?? null, status: m.kpi2_status },
      { label: m.kpi3_label || 'KPI 3', value: m.kpi3 ?? null, status: m.kpi3_status },
    ],
  }));
}

const DAYS_PRESETS = [7, 30, 90] as const;

/** One module card: navigable area (Link) + an issues panel kept outside it. */
function ModuleCardView({ mod }: { mod: ModuleCard }) {
  const [issuesOpen, setIssuesOpen] = useState(false);
  const Icon = mod.icon;
  const badgeClass = STATUS_BADGE[mod.status] || STATUS_BADGE.inactive;
  const cls = colorClasses(mod.color);

  return (
    <div
      className={`group overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-900 ${cls.hoverBorder}`}
    >
      <Link href={mod.href} className="block p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-lg ${cls.iconBg} flex items-center justify-center`}
            >
              <Icon
                className={`h-5 w-5 ${cls.iconText}`}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {mod.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge className={`${badgeClass} text-[10px]`}>
                  {mod.status}
                </Badge>
                {mod.status === 'healthy' && (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                )}
                {mod.status === 'degraded' && (
                  <TrendingDown className="h-3 w-3 text-amber-500" />
                )}
                {mod.status === 'inactive' && (
                  <Minus className="h-3 w-3 text-gray-400" />
                )}
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400" />
        </div>

        {/* status_reason subtitle */}
        {mod.statusReason && (
          <p className="mb-3 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
            {mod.statusReason}
          </p>
        )}

        {/* health_score progress bar */}
        {typeof mod.healthScore === 'number' && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <span>Health score</span>
              <span className="tabular-nums text-gray-700 dark:text-gray-300">
                {Math.round(mod.healthScore)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-full rounded-full ${healthBarClass(mod.healthScore)}`}
                style={{
                  width: `${Math.max(0, Math.min(100, mod.healthScore))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* KPIs colored by kpi*_status */}
        <div className="grid grid-cols-3 gap-2">
          {mod.kpis.map((kpi) => (
            <div key={kpi.label} className="text-center">
              <p className={`text-lg font-bold ${kpiValueClass(kpi.status)}`}>
                {typeof kpi.value === 'number' ? fmtNum(kpi.value) : dash(kpi.value)}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {kpi.label}
              </p>
            </div>
          ))}
        </div>
      </Link>

      {/* issues[] expandable panel — outside the Link so toggling never navigates */}
      {mod.issues.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setIssuesOpen((o) => !o)}
            aria-expanded={issuesOpen}
            className="flex w-full items-center justify-between px-5 py-2.5 text-left text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              {mod.issues.length} issue{mod.issues.length === 1 ? '' : 's'}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                issuesOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {issuesOpen && (
            <ul className="space-y-1.5 px-5 pb-3">
              {mod.issues.map((issue, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300"
                >
                  <AlertTriangle
                    className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${issueSeverityClass(
                      issue.severity
                    )}`}
                  />
                  <span>
                    {issue.severity && (
                      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {issue.severity}
                      </span>
                    )}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ModulesTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [moduleCards, setModuleCards] = useState<ModuleCard[]>([]);
  // rawModules stays loosely-typed: it carries last_7_days_events (not on the
  // ModuleHealthItem contract) consumed by the sparklines / usage trend below.
  const [rawModules, setRawModules] = useState<any[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  // "Module activity" audit rows (ACTIVITY_FEED) — own .catch so a 404
  // on the feed never errors the whole tab.
  const [activityRows, setActivityRows] = useState<Row[]>([]);
  // Default 30d to match the other command-center endpoints / sibling tabs.
  const [days, setDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the inline Retry button to re-run the loader without changing the
  // selected window (so a failed fetch retries instead of toggling days).
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [health, summaryRes, feed] = await Promise.all([
          getModuleHealth({ days }),
          getSummary(),
          getActivityFeed(200, { days }).catch(() => ({ events: [] })),
        ]);
        if (cancelled) return;
        setModuleCards(buildModuleCards(health));
        setSummary(summaryRes);
        setRawModules(Array.isArray(health?.modules) ? health.modules : []);
        setActivityRows((feed?.events ?? []) as unknown as Row[]);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load module health');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [days, reloadNonce]);

  // Aggregate usage trend across modules (sum per day) — declared BEFORE any
  // early return so the hook order stays stable across renders.
  const usageTrend = useMemo(() => {
    // Sparkline window is fixed at 7d (last_7_days_events), independent of the
    // `days` health-window selector above.
    const span = 7;
    const buckets: number[] = Array(span).fill(0);
    let hasAny = false;
    rawModules.forEach((m) => {
      const series = Array.isArray(m?.last_7_days_events)
        ? m.last_7_days_events
        : [];
      series.forEach((v: any, i: number) => {
        if (i < span) {
          const n = typeof v === 'number' ? v : (v?.count ?? v?.value ?? 0);
          if (n > 0) hasAny = true;
          buckets[i] += n;
        }
      });
    });
    return hasAny
      ? buckets.map((value, idx) => ({ day: `D-${span - idx}`, value }))
      : [];
  }, [rawModules]);

  // Adoption rate = active users (7d) / total users, from the platform summary.
  const adoptionRate = useMemo(() => {
    const total = summary?.platform?.total_users ?? 0;
    const active = summary?.platform?.active_users_7d ?? 0;
    return total > 0 ? Math.round((active / total) * 100) : null;
  }, [summary]);

  if (loading) {
    // Skeleton mirrors the tab's own layout (KPI strip + sparkline tiles + card
    // grid + chart row) instead of a single centered spinner.
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    // Inline error + Retry — re-runs the loader for the current window rather
    // than forcing the user to toggle the days selector.
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
        <button
          type="button"
          onClick={() => setReloadNonce((n) => n + 1)}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  // Top-strip KPIs derived from cards array (see Screens/Account-overview/04-modules/_features.md).
  const totalModules = moduleCards.length;
  const healthyCount = moduleCards.filter((m) => m.status === 'healthy').length;
  const degradedCount = moduleCards.filter(
    (m) => m.status === 'degraded'
  ).length;
  const inactiveCount = moduleCards.filter(
    (m) => m.status === 'inactive'
  ).length;

  // Recommendations derived from module-health data → actionable CTAs (never
  // hardcoded text). Degraded → open the module page; inactive → set up
  // monitoring; open issues → view them in observability.
  type ModuleCta = {
    text: string;
    label: string;
    icon: LucideIcon;
    href: string;
  };
  const moduleCtas: ModuleCta[] = [];
  moduleCards
    .filter((m) => m.status === 'degraded')
    .slice(0, 3)
    .forEach((m) => {
      moduleCtas.push({
        text: `Investigate ${m.name} — status is ${m.status}.`,
        label: `Open ${m.name}`,
        icon: ArrowRight,
        href: m.href,
      });
    });
  moduleCards
    .filter((m) => m.status === 'inactive')
    .slice(0, 3)
    .forEach((m) => {
      moduleCtas.push({
        text: `${m.name} has no recent activity — set up monitoring or onboard a project.`,
        label: 'Set up monitoring',
        icon: Eye,
        href: '/observability',
      });
    });

  // ── Iter 5 — sparkline tiles, usage trend, and issues donut ──────────────
  const moduleByKey: Record<string, any> = {};
  rawModules.forEach((m) => {
    if (m?.module_key) moduleByKey[m.module_key] = m;
  });

  // Sum a module's last_7_days_events into a single 7d-events count (null when
  // the spine is empty so the table renders an em-dash, never a fake 0).
  const sum7d = (raw: any): number | null => {
    const series = Array.isArray(raw?.last_7_days_events)
      ? raw.last_7_days_events
      : [];
    if (series.length === 0) return null;
    return series.reduce(
      (s: number, v: any) =>
        s + (typeof v === 'number' ? v : (v?.count ?? v?.value ?? 0)),
      0
    );
  };

  // Module Health Matrix — flatten the already-loaded module-health into one
  // row per module (no new fetch). Fed to a paginated AuditTable at the bottom.
  const healthMatrixRows: Row[] = moduleCards.map((m) => {
    const raw = moduleByKey[m.id];
    const events7d = sum7d(raw);
    const kpiVal = (k?: ModuleKpi) =>
      k == null
        ? '—'
        : `${k.label}: ${
            typeof k.value === 'number' ? fmtNum(k.value) : dash(k.value)
          }`;
    return {
      Module: m.name,
      Status: m.status,
      'Health Score':
        typeof m.healthScore === 'number' ? Math.round(m.healthScore) : '—',
      'KPI 1': kpiVal(m.kpis[0]),
      'KPI 2': kpiVal(m.kpis[1]),
      'KPI 3': kpiVal(m.kpis[2]),
      Issues: m.issues.length,
      '7d Events': events7d ?? '—',
      'Status Reason': m.statusReason || '—',
    };
  });

  const sparkTiles = KNOWN_MODULES.map((spec) => {
    const m = moduleByKey[spec.key];
    const series: number[] = Array.isArray(m?.last_7_days_events)
      ? m.last_7_days_events.map((v: any) =>
          typeof v === 'number' ? v : (v?.count ?? v?.value ?? 0)
        )
      : [];
    const sparkData = series.map((v, i) => ({ i, v }));
    const count = series.reduce((s, v) => s + v, 0);
    return {
      ...spec,
      hasData: series.length > 0,
      count,
      sparkData,
      moduleStatus: m?.status as 'healthy' | 'degraded' | 'inactive' | undefined,
    };
  });

  // Issues donut: weighted by each module's reported issues.length.
  const issuesByModule = moduleCards
    .filter((m) => m.issues.length > 0)
    .map((m) => ({
      name: m.name,
      value: m.issues.length,
      hex: KNOWN_MODULES.find((k) => k.key === m.id)?.hex || '#9CA3AF',
    }));
  const totalIssues = issuesByModule.reduce((s, d) => s + d.value, 0);
  if (totalIssues > 0) {
    moduleCtas.push({
      text: `${totalIssues} open issue${
        totalIssues === 1 ? '' : 's'
      } across modules.`,
      label: 'View issues',
      icon: AlertTriangle,
      href: '/observability/alerts',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
            Module Health Overview
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time KPIs for each Data360 module. Click a module to navigate
            to its dashboard.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          {DAYS_PRESETS.map((d) => {
            const active = days === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={active}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {d}d
              </button>
            );
          })}
        </div>
      </div>

      {/* Top-strip KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Modules enabled
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {totalModules === 0 ? '—' : totalModules}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Healthy</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {totalModules === 0 ? '—' : healthyCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Degraded</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {totalModules === 0 ? '—' : degradedCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Inactive</p>
          <p className="mt-1 text-2xl font-bold text-gray-500 dark:text-gray-400">
            {totalModules === 0 ? '—' : inactiveCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Adoption (7d)
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {adoptionRate === null ? '—' : `${adoptionRate}%`}
          </p>
        </div>
      </div>

      {moduleCards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/40">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            No module health data for this account / window
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            No module reported health for the selected {days}-day window. Widen
            the window or check that modules are emitting activity.
          </p>
        </div>
      ) : (
        <>
      {/* Iter 5 — Sparkline KPI tiles per module */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {sparkTiles.map((tile) => {
          const Icon = tile.icon;
          const tileCls = colorClasses(tile.color);
          return (
            <div
              key={tile.key}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${tileCls.iconBg}`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${tileCls.iconText}`}
                  />
                </div>
                <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  {tile.name}
                </span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {tile.hasData ? tile.count.toLocaleString() : '—'}
              </p>
              {tile.hasData && tile.sparkData.length > 1 ? (
                <div className="mt-1 h-7">
                  <ResponsiveContainer width="100%" height={256}>
                    <LineChart data={tile.sparkData}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke={tile.hex}
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-gray-400">no events 7d</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {moduleCards.map((mod) => (
          <ModuleCardView key={mod.id} mod={mod} />
        ))}
      </div>

      {/* Iter 5 — Usage trend, issues donut, recommendations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Module Usage Trend
          </h3>
          {usageTrend.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height={192}>
                <AreaChart data={usageTrend}>
                  <defs>
                    <linearGradient id="modUsageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    fill="url(#modUsageGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No 7-day events available yet
              </p>
              <p className="mt-1 text-xs text-gray-400">
                The trend will appear once modules emit usage events.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Issues by Module
          </h3>
          {issuesByModule.length > 0 ? (
            <div className="relative h-48">
              <ResponsiveContainer width="100%" height={256}>
                <PieChart>
                  <Pie
                    data={issuesByModule}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {issuesByModule.map((d, i) => (
                      <Cell key={i} fill={d.hex} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalIssues}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  issues
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No open issues
              </p>
              <p className="mt-1 text-xs text-gray-400">
                No module is reporting issues right now.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Cross-module Recommendations
          </h3>
          {moduleCtas.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              All modules look healthy — no recommendations right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {moduleCtas.map((c, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/30"
                >
                  <Lightbulb className="h-4 w-4 flex-shrink-0 text-amber-500" />
                  <p className="flex-1 text-xs text-gray-700 dark:text-gray-300">
                    {c.text}
                  </p>
                  <InsightActionButton
                    label={c.label}
                    icon={c.icon}
                    variant="subtle"
                    size="sm"
                    onAction={async () => {
                      router.push(c.href);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
        </>
      )}

      {/* ── Audit tables (full width, paginated) — bottom of the tab ───────── */}
      <AuditTable
        rows={healthMatrixRows}
        title="Module health matrix"
        subtitle="MODULE-HEALTH"
        pageSize={10}
      />
      <AuditTable
        rows={activityRows}
        title="Module activity"
        subtitle="ACTIVITY-FEED"
        pageSize={10}
      />
    </div>
  );
}

export default memo(ModulesTab);
