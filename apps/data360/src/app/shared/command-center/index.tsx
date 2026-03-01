'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader, Text, Title, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import {
  RefreshCw, LayoutDashboard, Activity, Server,
  GitBranch, Shield, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, MinusCircle, Users, Database,
  Cpu, Box, Brain, BarChart3, Zap,
} from 'lucide-react';
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, AreaChart, Area, ComposedChart, Line,
} from 'recharts';

import {
  getSummary, getModuleHealth, getActivityFeed,
  getInfrastructure, getPipelines, getCostBreakdown,
} from '@/app/services/command-center';
import type {
  SummaryResponse, ModuleHealthResponse, ActivityFeedResponse,
  InfrastructureResponse, PipelinesResponse, CostBreakdownResponse,
} from '@/app/services/command-center/types';
import { getIntelligentKpis } from '@/app/services/observability';
import type { IntelligentKpis } from '@/app/services/observability/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const STATUS_COLOR: Record<string, string> = {
  healthy: 'text-green-500',
  degraded: 'text-amber-500',
  inactive: 'text-gray-400',
};

const STATUS_BG: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  inactive: 'bg-gray-300 dark:bg-gray-600',
};

interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const tabs: TabItem[] = [
  { id: 'overview',       label: 'Overview',           icon: LayoutDashboard },
  { id: 'activity',       label: 'Activity',           icon: Activity },
  { id: 'infrastructure', label: 'Infrastructure',     icon: Server },
  { id: 'pipelines',      label: 'Pipelines & Quality', icon: GitBranch },
  { id: 'security',       label: 'Security',           icon: Shield },
  { id: 'cost',           label: 'Cost Intelligence',  icon: DollarSign },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, trend, color = 'blue', suffix,
}: {
  label: string; value: string | number; icon: React.ElementType;
  trend?: number; color?: string; suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <div className={`rounded-lg bg-${color}-100 dark:bg-${color}-900/30 p-2`}>
          <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
        </div>
        {trend !== undefined && trend !== 0 && (
          <span className={cn('flex items-center gap-1 text-xs font-medium',
            trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">
        {value}{suffix}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function SectionCard({ title, children, className }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5', className)}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function LoadingSection() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader size="lg" />
    </div>
  );
}

function relativeTime(ts: string | null): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const MODULE_COLORS: Record<string, string> = {
  connect: 'blue', explore_design: 'violet', workflow: 'amber',
  gouvernance: 'rose', bi_reporting: 'cyan', cortex: 'purple',
  data_quality: 'green', observability: 'orange',
};

// ─── Custom tooltip for dark mode ────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg text-xs">
      {label && <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CommandCenterDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states per tab
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [moduleHealth, setModuleHealth] = useState<ModuleHealthResponse | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedResponse | null>(null);
  const [obsKpis, setObsKpis] = useState<IntelligentKpis | null>(null);
  const [infra, setInfra] = useState<InfrastructureResponse | null>(null);
  const [pipelines, setPipelines] = useState<PipelinesResponse | null>(null);
  const [costData, setCostData] = useState<CostBreakdownResponse | null>(null);

  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({
    overview: true, activity: false, infrastructure: false,
    pipelines: false, security: false, cost: false,
  });

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    setTabLoading(p => ({ ...p, overview: true }));
    setError(null);
    try {
      const [s, mh, af] = await Promise.all([
        getSummary(), getModuleHealth(), getActivityFeed(10),
      ]);
      setSummary(s);
      setModuleHealth(mh);
      setActivityFeed(af);
      // Also fetch observability scores (non-blocking)
      getIntelligentKpis().then(setObsKpis).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load summary';
      setError(msg);
      toast.error(msg);
    } finally {
      setTabLoading(p => ({ ...p, overview: false }));
      setIsLoading(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    if (activityFeed && activityFeed.count > 10) return;
    setTabLoading(p => ({ ...p, activity: true }));
    try {
      const af = await getActivityFeed(100);
      setActivityFeed(af);
    } catch (err) {
      toast.error('Failed to load activity feed');
    } finally {
      setTabLoading(p => ({ ...p, activity: false }));
    }
  }, [activityFeed]);

  const fetchInfra = useCallback(async () => {
    if (infra) return;
    setTabLoading(p => ({ ...p, infrastructure: true }));
    try {
      const data = await getInfrastructure();
      setInfra(data);
    } catch (err) {
      toast.error('Failed to load infrastructure data');
    } finally {
      setTabLoading(p => ({ ...p, infrastructure: false }));
    }
  }, [infra]);

  const fetchPipelines = useCallback(async () => {
    if (pipelines) return;
    setTabLoading(p => ({ ...p, pipelines: true }));
    try {
      const data = await getPipelines();
      setPipelines(data);
    } catch (err) {
      toast.error('Failed to load pipeline data');
    } finally {
      setTabLoading(p => ({ ...p, pipelines: false }));
    }
  }, [pipelines]);

  const fetchSecurity = useCallback(async () => {
    if (obsKpis) return;
    setTabLoading(p => ({ ...p, security: true }));
    try {
      const data = await getIntelligentKpis();
      setObsKpis(data);
    } catch (err) {
      toast.error('Failed to load security data');
    } finally {
      setTabLoading(p => ({ ...p, security: false }));
    }
  }, [obsKpis]);

  const fetchCost = useCallback(async () => {
    if (costData) return;
    setTabLoading(p => ({ ...p, cost: true }));
    try {
      const data = await getCostBreakdown(30);
      setCostData(data);
    } catch (err) {
      toast.error('Failed to load cost data');
    } finally {
      setTabLoading(p => ({ ...p, cost: false }));
    }
  }, [costData]);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    switch (activeTab) {
      case 'activity': fetchActivity(); break;
      case 'infrastructure': fetchInfra(); break;
      case 'pipelines': fetchPipelines(); break;
      case 'security': fetchSecurity(); break;
      case 'cost': fetchCost(); break;
    }
  }, [activeTab]);

  const handleRefresh = useCallback(() => {
    setSummary(null); setModuleHealth(null); setActivityFeed(null);
    setObsKpis(null); setInfra(null); setPipelines(null); setCostData(null);
    fetchOverview();
  }, [fetchOverview]);

  // ── Loading state ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="@container">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Title as="h1" className="text-xl font-bold md:text-2xl">
            Command Center
          </Title>
          <Text className="mt-1 text-gray-500 dark:text-gray-400">
            Your Data360 platform at a glance
          </Text>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* ── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="-mb-px flex space-x-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────── */}
      <div className="space-y-6">
        {activeTab === 'overview' && <OverviewTab summary={summary} moduleHealth={moduleHealth} activityFeed={activityFeed} obsKpis={obsKpis} loading={tabLoading.overview} />}
        {activeTab === 'activity' && <ActivityTab feed={activityFeed} summary={summary} loading={tabLoading.activity} />}
        {activeTab === 'infrastructure' && <InfrastructureTab data={infra} loading={tabLoading.infrastructure} />}
        {activeTab === 'pipelines' && <PipelinesTab data={pipelines} summary={summary} loading={tabLoading.pipelines} />}
        {activeTab === 'security' && <SecurityTab summary={summary} obsKpis={obsKpis} loading={tabLoading.security} />}
        {activeTab === 'cost' && <CostTab data={costData} loading={tabLoading.cost} />}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: OVERVIEW
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab({ summary, moduleHealth, activityFeed, obsKpis, loading }: {
  summary: SummaryResponse | null; moduleHealth: ModuleHealthResponse | null;
  activityFeed: ActivityFeedResponse | null; obsKpis: IntelligentKpis | null;
  loading: boolean;
}) {
  if (loading || !summary) return <LoadingSection />;

  const radarData = obsKpis ? [
    { axis: 'Governance', value: obsKpis.governance?.score ?? 0 },
    { axis: 'Cost', value: obsKpis.cost?.score ?? 0 },
    { axis: 'Performance', value: obsKpis.performance?.score ?? 0 },
    { axis: 'Usage', value: obsKpis.usage?.score ?? 0 },
    { axis: 'Compliance', value: obsKpis.compliance?.score ?? 0 },
  ] : [];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Active Users (7d)" value={summary.platform.active_users_7d} icon={Users} color="blue" />
        <KpiCard label="Projects" value={summary.platform.total_projects} icon={Box} color="violet" />
        <KpiCard label="Quality Score" value={`${summary.quality.health_score}%`} icon={CheckCircle} color="green" />
        <KpiCard label="Credits (30d)" value={summary.cost.credits_30d.toLocaleString()} icon={DollarSign} color="amber" trend={summary.cost.credit_trend_pct} />
        <KpiCard label="MFA Coverage" value={`${summary.security.mfa_coverage_pct}%`} icon={Shield} color="rose" />
        <KpiCard label="AI Models" value={summary.ai.semantic_models} icon={Brain} color="purple" />
      </div>

      {/* Module Health Grid */}
      {moduleHealth && (
        <SectionCard title="Module Health">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {moduleHealth.modules.map((m) => (
              <div key={m.module_key}
                className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-800 p-3"
              >
                <div className={cn('h-2.5 w-2.5 rounded-full', STATUS_BG[m.status])} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.module}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.key_metric}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Radar + Activity Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Observability Radar */}
        {radarData.length > 0 && (
          <SectionCard title="Observability Scores">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Radar name="Score" dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        )}

        {/* Recent Activity */}
        <SectionCard title="Recent Activity">
          <div className="max-h-64 overflow-y-auto space-y-2">
            {activityFeed?.events.slice(0, 10).map((evt, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge size="sm" variant="flat" color={evt.status === 'SUCCESS' ? 'success' : 'danger'} className="shrink-0">
                    {evt.module}
                  </Badge>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{evt.username} — {evt.event_type}</span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{relativeTime(evt.timestamp)}</span>
              </div>
            ))}
            {(!activityFeed || activityFeed.events.length === 0) && (
              <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
            )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: ACTIVITY
// ═════════════════════════════════════════════════════════════════════════════

function ActivityTab({ feed, summary, loading }: {
  feed: ActivityFeedResponse | null; summary: SummaryResponse | null; loading: boolean;
}) {
  if (loading) return <LoadingSection />;

  // Aggregate events by module for pie chart
  const moduleAgg: Record<string, number> = {};
  feed?.events.forEach(e => { moduleAgg[e.module] = (moduleAgg[e.module] || 0) + 1; });
  const pieData = Object.entries(moduleAgg).map(([name, value]) => ({ name, value }));

  // Daily aggregation for area chart
  const dailyAgg: Record<string, number> = {};
  feed?.events.forEach(e => {
    if (e.timestamp) {
      const day = e.timestamp.slice(0, 10);
      dailyAgg[day] = (dailyAgg[day] || 0) + 1;
    }
  });
  const dailyData = Object.entries(dailyAgg)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Total Users" value={summary?.platform.total_users ?? 0} icon={Users} color="blue" />
        <KpiCard label="Active (7d)" value={summary?.platform.active_users_7d ?? 0} icon={Activity} color="green" />
        <KpiCard label="Events Today" value={summary?.platform.events_today ?? 0} icon={Zap} color="amber" />
        <KpiCard label="Data Sources" value={summary?.platform.data_sources ?? 0} icon={Database} color="violet" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Events by Module">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Daily Activity">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="count" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} name="Events" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Activity Feed Table */}
      <SectionCard title="Activity Feed">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">User</th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Module</th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Action</th>
                <th className="pb-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {feed?.events.map((evt, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{relativeTime(evt.timestamp)}</td>
                  <td className="py-2 text-gray-900 dark:text-white">{evt.username}</td>
                  <td className="py-2"><Badge size="sm" variant="flat">{evt.module}</Badge></td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{evt.event_type}</td>
                  <td className="py-2">
                    <Badge size="sm" variant="flat" color={evt.status === 'SUCCESS' ? 'success' : 'danger'}>
                      {evt.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!feed || feed.events.length === 0) && (
            <p className="text-sm text-gray-400 text-center py-8">No events found</p>
          )}
        </div>
      </SectionCard>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: INFRASTRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

function InfrastructureTab({ data, loading }: {
  data: InfrastructureResponse | null; loading: boolean;
}) {
  if (loading || !data) return <LoadingSection />;

  const storageTotalTb = data.storage.database_tb + data.storage.stage_tb + data.storage.failsafe_tb;
  const successRate = data.query_performance.total_queries > 0
    ? Math.round((data.query_performance.success / data.query_performance.total_queries) * 100) : 0;

  const whChartData = data.warehouses.slice(0, 10).map(w => ({
    name: w.warehouse_name.length > 15 ? w.warehouse_name.slice(0, 15) + '...' : w.warehouse_name,
    credits: w.total_credits,
  }));

  const taskBarData = data.tasks.by_state.map(t => ({ name: t.state, count: t.count }));

  const clusterData = data.clustering.tables.slice(0, 10).map(t => ({
    name: t.table_name.length > 20 ? t.table_name.slice(0, 20) + '...' : t.table_name,
    credits: t.credits,
  }));

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Warehouses" value={data.warehouses.length} icon={Cpu} color="blue" />
        <KpiCard label="Queries (7d)" value={data.query_performance.total_queries.toLocaleString()} icon={BarChart3} color="violet" />
        <KpiCard label="Success Rate" value={`${successRate}%`} icon={CheckCircle} color="green" />
        <KpiCard label="Storage (TB)" value={storageTotalTb.toFixed(3)} icon={Database} color="amber" />
        <KpiCard label="Tasks (7d)" value={data.tasks.total_7d} icon={Zap} color="cyan" />
      </div>

      {/* Warehouse Credits + Query Perf */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Warehouse Credits (30d)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={whChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="credits" fill="#3B82F6" name="Credits" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Query Performance (7d)">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.query_performance.avg_exec_ms.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg Exec (ms)</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.query_performance.p95_ms.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">P95 (ms)</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{data.query_performance.success.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Succeeded</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data.query_performance.failed.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Failed</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Tasks + Pipes + Clustering */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Task Execution (7d)">
          {taskBarData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="#06B6D4" name="Runs" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No task data</p>}
        </SectionCard>

        <SectionCard title={`Snowpipe (${data.pipes.total_credits} credits)`}>
          {data.pipes.pipes.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.pipes.pipes.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{p.pipe_name}</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{p.credits} cr</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No Snowpipe data</p>}
        </SectionCard>

        <SectionCard title={`Clustering (${data.clustering.total_credits} credits)`}>
          {clusterData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clusterData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="credits" fill="#F59E0B" name="Credits" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No clustering data</p>}
        </SectionCard>
      </div>

      {/* MV + Replication */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={`Materialized Views (${data.materialized_views.total_credits} credits)`}>
          {data.materialized_views.views.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.materialized_views.views.map((v, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{v.table_name}</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{v.credits} cr</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No MV refresh data</p>}
        </SectionCard>

        <SectionCard title={`Replication (${data.replication.total_credits} credits)`}>
          {data.replication.databases.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.replication.databases.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{d.database_name}</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-white">{d.credits} cr</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No replication data</p>}
        </SectionCard>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: PIPELINES & QUALITY
// ═════════════════════════════════════════════════════════════════════════════

function PipelinesTab({ data, summary, loading }: {
  data: PipelinesResponse | null; summary: SummaryResponse | null; loading: boolean;
}) {
  if (loading || !data) return <LoadingSection />;

  const wfBarData = [
    { name: 'Success', value: data.workflows.by_status.success, fill: '#10B981' },
    { name: 'Failed', value: data.workflows.by_status.failed, fill: '#EF4444' },
  ];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Connectors" value={data.connectors.total} icon={Database} color="blue" />
        <KpiCard label="Workflows" value={data.workflows.total} icon={GitBranch} color="violet" />
        <KpiCard label="WF Success Rate" value={`${data.workflows.success_rate}%`} icon={CheckCircle} color="green" />
        <KpiCard label="Quality Score" value={`${summary?.quality.health_score ?? 0}%`} icon={BarChart3} color="amber" />
        <KpiCard label="Ingestion (7d)" value={data.ingestion.copy_loads_7d.toLocaleString()} icon={Zap} color="cyan" />
      </div>

      {/* Workflow + Quality */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Workflow Executions (7d)">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wfBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                  {wfBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Ingestion Summary (7d)">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.ingestion.copy_loads_7d.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">COPY Loads</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{data.ingestion.success_rate}%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Success Rate</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.ingestion.rows_loaded.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Rows Loaded</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.ingestion.pipe_credits_7d}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pipe Credits</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Tasks + Connectors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Task Execution (7d)">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{data.tasks.total_7d}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{data.tasks.succeeded_7d}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Succeeded</p>
            </div>
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-center">
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{data.tasks.failed_7d}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Failed</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Connector Types">
          {data.connectors.by_type.length > 0 ? (
            <div className="space-y-2">
              {data.connectors.by_type.map((ct, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{ct.type}</span>
                  <Badge size="sm" variant="flat">{ct.count}</Badge>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No connector data</p>}
        </SectionCard>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5: SECURITY
// ═════════════════════════════════════════════════════════════════════════════

function SecurityTab({ summary, obsKpis, loading }: {
  summary: SummaryResponse | null; obsKpis: IntelligentKpis | null; loading: boolean;
}) {
  if (loading || !summary) return <LoadingSection />;

  const secRadar = obsKpis ? [
    { axis: 'MFA', value: summary.security.mfa_coverage_pct },
    { axis: 'Masking', value: Math.min(summary.security.masking_policies * 10, 100) },
    { axis: 'RLS', value: Math.min(summary.security.rls_policies * 10, 100) },
    { axis: 'Login Safety', value: Math.max(0, 100 - summary.security.failed_logins_7d * 2) },
    { axis: 'Governance', value: obsKpis.governance?.score ?? 0 },
  ] : [];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="MFA Coverage" value={`${summary.security.mfa_coverage_pct}%`} icon={Shield} color="blue" />
        <KpiCard label="Masking Policies" value={summary.security.masking_policies} icon={Shield} color="violet" />
        <KpiCard label="RLS Policies" value={summary.security.rls_policies} icon={Shield} color="green" />
        <KpiCard label="Failed Logins (7d)" value={summary.security.failed_logins_7d} icon={AlertTriangle} color="red" />
        <KpiCard label="Governance Score" value={`${obsKpis?.governance?.score ?? 0}%`} icon={CheckCircle} color="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Security Radar */}
        {secRadar.length > 0 && (
          <SectionCard title="Security Posture">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={secRadar}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Radar name="Score" dataKey="value" stroke="#10B981" fill="#10B981" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        )}

        {/* Compliance Status */}
        <SectionCard title="Compliance & Observability">
          <div className="space-y-4">
            {obsKpis?.governance && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Governance</span>
                  <Badge size="sm" variant="flat" color={obsKpis.governance.score >= 70 ? 'success' : 'warning'}>
                    {obsKpis.governance.score}%
                  </Badge>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${obsKpis.governance.score}%` }} />
                </div>
              </div>
            )}
            {obsKpis?.compliance && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Compliance</span>
                  <Badge size="sm" variant="flat" color={obsKpis.compliance.score >= 70 ? 'success' : 'warning'}>
                    {obsKpis.compliance.score}%
                  </Badge>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${obsKpis.compliance.score}%` }} />
                </div>
              </div>
            )}
            {obsKpis?.cost && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Cost Efficiency</span>
                  <Badge size="sm" variant="flat" color={obsKpis.cost.score >= 70 ? 'success' : 'warning'}>
                    {obsKpis.cost.score}%
                  </Badge>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${obsKpis.cost.score}%` }} />
                </div>
              </div>
            )}
            {obsKpis?.performance && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Performance</span>
                  <Badge size="sm" variant="flat" color={obsKpis.performance.score >= 70 ? 'success' : 'warning'}>
                    {obsKpis.performance.score}%
                  </Badge>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${obsKpis.performance.score}%` }} />
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 6: COST INTELLIGENCE
// ═════════════════════════════════════════════════════════════════════════════

function CostTab({ data, loading }: {
  data: CostBreakdownResponse | null; loading: boolean;
}) {
  if (loading || !data) return <LoadingSection />;

  const categoryPieData = Object.entries(data.by_category)
    .filter(([_, v]) => v > 0)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: Math.round(value * 100) / 100 }));

  const storagePieData = [
    { name: 'Database', value: data.storage.database_tb },
    { name: 'Stage', value: data.storage.stage_tb },
    { name: 'Failsafe', value: data.storage.failsafe_tb },
  ].filter(d => d.value > 0);

  const dailyAvg = data.daily_trend.length > 0
    ? Math.round(data.daily_trend.reduce((s, d) => s + d.credits, 0) / data.daily_trend.length * 100) / 100
    : 0;

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Credits (30d)" value={data.total_credits.toLocaleString()} icon={DollarSign} color="amber" trend={data.credit_trend_pct} />
        <KpiCard label="Trend" value={`${data.credit_trend_pct > 0 ? '+' : ''}${data.credit_trend_pct}%`} icon={data.credit_trend_pct >= 0 ? TrendingUp : TrendingDown} color={data.credit_trend_pct >= 0 ? 'red' : 'green'} />
        <KpiCard label="Storage (TB)" value={(data.storage.database_tb + data.storage.stage_tb + data.storage.failsafe_tb).toFixed(3)} icon={Database} color="blue" />
        <KpiCard label="Balance" value={data.balance.capacity.toLocaleString()} icon={DollarSign} color="green" />
        <KpiCard label="Daily Average" value={dailyAvg.toLocaleString()} icon={BarChart3} color="violet" />
      </div>

      {/* Daily Credit Trend */}
      <SectionCard title="Daily Credit Trend (30d)">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.daily_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="credits" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} name="Credits" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Category Pie + Top Warehouses */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Cost by Category">
          {categoryPieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {categoryPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">All zero</p>}
        </SectionCard>

        <SectionCard title="Top Warehouses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_warehouses.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="credits" fill="#F59E0B" name="Credits" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Storage + Balance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Storage Breakdown">
          {storagePieData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={storagePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {storagePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No storage data</p>}
        </SectionCard>

        <SectionCard title="Credit Balance">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{data.balance.free_remaining.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Free Remaining</p>
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{data.balance.capacity.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Capacity</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{data.balance.on_demand.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">On-Demand</p>
            </div>
            <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-4 text-center">
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{data.balance.rollover.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Rollover</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
