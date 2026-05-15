'use client';

import { useState, useEffect, memo, useMemo } from 'react';
import { Badge, Loader } from 'rizzui';
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
} from 'lucide-react';
import Link from 'next/link';
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
import { getModuleHealth, getSummary } from '@/app/services/command-center';

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
  { key: 'cortex', name: 'Cortex', icon: Brain, color: 'purple', hex: '#A855F7' },
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

const RECOMMENDATIONS: string[] = [
  'Activate Snowflake Tasks observability for Workflow runs',
  'Enable lineage capture across Connect → Explore',
  'Set up RBAC review reminders for Governance module',
];

interface ModuleCard {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  href: string;
  kpis: { label: string; value: string | number }[];
  status: 'healthy' | 'degraded' | 'inactive';
}

const STATUS_BADGE: Record<string, string> = {
  healthy:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  degraded:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

function buildModuleCards(moduleHealth: any, _summary: any): ModuleCard[] {
  // Backend returns modules as array — convert to cards directly
  const rawModules = Array.isArray(moduleHealth?.modules)
    ? moduleHealth.modules
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

  return rawModules.map((m: any) => ({
    id: m.module_key,
    name: m.module,
    icon: ICON_MAP[m.module_key] || Activity,
    color: COLOR_MAP[m.module_key] || 'gray',
    href: HREF_MAP[m.module_key] || '/',
    status: m.status || 'inactive',
    kpis: [
      { label: m.kpi1_label || 'KPI 1', value: m.kpi1 ?? 0 },
      { label: m.kpi2_label || 'KPI 2', value: m.kpi2 ?? 0 },
      { label: m.kpi3_label || 'KPI 3', value: m.kpi3 ?? 0 },
    ],
  }));
}

function ModulesTab() {
  const [loading, setLoading] = useState(true);
  const [moduleCards, setModuleCards] = useState<ModuleCard[]>([]);
  const [rawModules, setRawModules] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [health, summary] = await Promise.all([
          getModuleHealth(),
          getSummary(),
        ]);
        setModuleCards(buildModuleCards(health, summary));
        setRawModules(
          Array.isArray((health as any)?.modules)
            ? (health as any).modules
            : []
        );
      } catch (err: any) {
        setError(err?.message || 'Failed to load module health');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error}
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

  // ── Iter 5 — sparkline tiles, usage trend, and issues donut ──────────────
  const moduleByKey: Record<string, any> = {};
  rawModules.forEach((m) => {
    if (m?.module_key) moduleByKey[m.module_key] = m;
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

  // Aggregate usage trend across modules (sum per day)
  const usageTrend = useMemo(() => {
    const days = 7;
    const buckets: number[] = Array(days).fill(0);
    let hasAny = false;
    rawModules.forEach((m) => {
      const series = Array.isArray(m?.last_7_days_events)
        ? m.last_7_days_events
        : [];
      series.forEach((v: any, i: number) => {
        if (i < days) {
          const n = typeof v === 'number' ? v : (v?.count ?? v?.value ?? 0);
          if (n > 0) hasAny = true;
          buckets[i] += n;
        }
      });
    });
    return hasAny
      ? buckets.map((value, idx) => ({ day: `D-${days - idx}`, value }))
      : [];
  }, [rawModules]);

  // Issues donut: degraded + inactive count contribution by module
  const issuesByModule = moduleCards
    .filter((m) => m.status === 'degraded' || m.status === 'inactive')
    .map((m) => ({
      name: m.name,
      value: 1,
      hex:
        KNOWN_MODULES.find((k) => k.key === m.id)?.hex || '#9CA3AF',
    }));
  const totalIssues = degradedCount + inactiveCount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          Module Health Overview
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Real-time KPIs for each Data360 module. Click a module to navigate to
          its dashboard.
        </p>
      </div>

      {/* Top-strip KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Modules enabled
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {totalModules}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Healthy</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {healthyCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Degraded</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {degradedCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Inactive</p>
          <p className="mt-1 text-2xl font-bold text-gray-500 dark:text-gray-400">
            {inactiveCount}
          </p>
        </div>
      </div>

      {/* Iter 5 — Sparkline KPI tiles per module */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {sparkTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.key}
              className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md bg-${tile.color}-100 dark:bg-${tile.color}-900/30`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 text-${tile.color}-600 dark:text-${tile.color}-400`}
                  />
                </div>
                <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  {tile.name}
                </span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {tile.count.toLocaleString()}
              </p>
              {tile.hasData && tile.sparkData.length > 1 ? (
                <div className="mt-1 h-7">
                  <ResponsiveContainer width="100%" height="100%">
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
        {moduleCards.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.id}
              href={mod.href}
              className={`group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-900 hover:border-${mod.color}-300 dark:hover:border-${mod.color}-700`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-lg bg-${mod.color}-100 dark:bg-${mod.color}-900/30 flex items-center justify-center`}
                  >
                    <Icon
                      className={`h-5 w-5 text-${mod.color}-600 dark:text-${mod.color}-400`}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {mod.name}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge
                        className={`${STATUS_BADGE[mod.status]} text-[10px]`}
                      >
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

              <div className="grid grid-cols-3 gap-2">
                {mod.kpis.map((kpi) => (
                  <div key={kpi.label} className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {typeof kpi.value === 'number'
                        ? kpi.value.toLocaleString()
                        : kpi.value}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {kpi.label}
                    </p>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Iter 5 — Usage trend, issues donut, recommendations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Module Usage Trend
          </h3>
          {usageTrend.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
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
              <ResponsiveContainer width="100%" height="100%">
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
                No degraded or inactive modules
              </p>
              <p className="mt-1 text-xs text-gray-400">
                All known modules are reporting healthy.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Cross-module Recommendations
          </h3>
          <ul className="space-y-2">
            {RECOMMENDATIONS.map((rec, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/30"
              >
                <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <p className="text-xs text-gray-700 dark:text-gray-300">{rec}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default memo(ModulesTab);
