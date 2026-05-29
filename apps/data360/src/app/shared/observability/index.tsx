'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Loader, Text, Title, Badge, Input, Button } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import {
  PiShieldCheckDuotone,
  PiTreeStructureDuotone,
  PiFlowArrowDuotone,
  PiWarningCircleBold,
  PiMagnifyingGlass,
  PiArrowUp,
  PiArrowDown,
  PiTable,
  PiUser,
  PiDatabase,
  PiColumns,
  PiClockCounterClockwise,
  PiEye,
  PiLockKey,
  PiUsersThree,
  PiShieldCheck,
  PiCaretRight,
  PiCaretDown,
  PiGitBranch,
} from 'react-icons/pi';

// Services
import {
  getGdprComplianceReport,
  getSoc2ComplianceReport,
  getDataLineage,
  getAccessPatterns,
  getObjectDependencies,
  getDependencyGraph,
  getCrossModuleLineage,
  getLineageWithTasks,
} from '@/app/services/observability';
import apiClient from '@/lib/api-client';

// Types
import type {
  GdprReport,
  Soc2Report,
} from '@/app/services/observability/types';

// Existing Components
import ComplianceCard from './compliance-card';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';

// React Flow views
import { DependencyFlowView, LineageFlowView } from './cross-module-flow';

interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
}

const tabs: TabItem[] = [
  { id: 'compliance', label: 'Compliance', icon: PiShieldCheckDuotone, description: 'GDPR & SOC 2 reports' },
  { id: 'tasks-lineage', label: 'Tasks & Lineage', icon: PiClockCounterClockwise, description: 'Snowflake tasks, dependencies & lineage graph' },
  { id: 'cross-module', label: 'Cross-Modules & Objects', icon: PiGitBranch, description: 'Lineage, dependencies & module explorer' },
  { id: 'impact-analysis', label: 'Impact Analysis', icon: PiWarningCircleBold, description: 'Assess change impact before modifying tables, columns, or policies' },
];

// ── Domain icon mapping ──
function DomainIcon({ domain }: { domain: string }) {
  const d = String(domain || '').toUpperCase();
  if (d === 'TABLE' || d === 'VIEW') return <PiTable className="w-3.5 h-3.5" />;
  if (d === 'USER' || d === 'ROLE') return <PiUser className="w-3.5 h-3.5" />;
  if (d === 'DATABASE' || d === 'SCHEMA') return <PiDatabase className="w-3.5 h-3.5" />;
  if (d === 'COLUMN') return <PiColumns className="w-3.5 h-3.5" />;
  return <PiTreeStructureDuotone className="w-3.5 h-3.5" />;
}

function DomainBadge({ domain }: { domain: string }) {
  const d = String(domain || '').toUpperCase();
  const colors: Record<string, string> = {
    TABLE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    VIEW: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    DATABASE: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    SCHEMA: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    FUNCTION: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    PROCEDURE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    STAGE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    COLUMN: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
    USER: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    ROLE: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full', colors[d] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')}>
      <DomainIcon domain={d} /> {d || '—'}
    </span>
  );
}

// ── Cross-Module & Objects Tab (merged: Lineage + Relations + Cross-Module) ──
type LineageView = 'dependency-flow' | 'lineage-flow' | 'projects' | 'graph' | 'modules' | 'databases' | 'nodes' | 'tasks' | 'sources' | 'policies';

const LINEAGE_VIEWS: { id: LineageView; label: string; icon: React.ElementType }[] = [
  { id: 'dependency-flow', label: 'Dependencies Canvas', icon: PiGitBranch },
  { id: 'lineage-flow', label: 'Lineage Canvas', icon: PiFlowArrowDuotone },
  { id: 'projects', label: 'Projects', icon: PiTreeStructureDuotone },
  { id: 'graph', label: 'Tree View', icon: PiTreeStructureDuotone },
  { id: 'modules', label: 'Module Events', icon: PiFlowArrowDuotone },
  { id: 'databases', label: 'Databases', icon: PiDatabase },
  { id: 'nodes', label: 'All Objects', icon: PiTable },
  { id: 'tasks', label: 'Tasks', icon: PiClockCounterClockwise },
  { id: 'sources', label: 'Sources', icon: PiColumns },
  { id: 'policies', label: 'Policies', icon: PiLockKey },
];

function CrossModuleLineageTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(30);
  const [dbFilter, setDbFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<LineageView>('dependency-flow');
  const [search, setSearch] = useState('');

  // Lineage/access data (merged from old LineageTab)
  const [lineageData, setLineageData] = useState<any[]>([]);
  const [accessPatterns, setAccessPatterns] = useState<any[]>([]);
  const [lineageLoading, setLineageLoading] = useState(false);

  const handleLoadLineage = useCallback(async (params: { database?: string; table?: string; days: number }) => {
    setLineageLoading(true);
    try {
      const result = await getDataLineage(params);
      const r = result as any;
      const raw = r.data || r.lineage || r || [];
      setLineageData(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load lineage');
    } finally {
      setLineageLoading(false);
    }
  }, []);

  const handleLoadAccess = useCallback(async (d: number) => {
    setLineageLoading(true);
    try {
      const result = await getAccessPatterns(d);
      const r2 = result as any;
      const rawAccess = r2.data || r2.patterns || r2 || [];
      setAccessPatterns(Array.isArray(rawAccess) ? rawAccess : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load access patterns');
    } finally {
      setLineageLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCrossModuleLineage({ days, database: dbFilter || undefined });
      setData(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load cross-module lineage');
    } finally {
      setLoading(false);
    }
  }, [days, dbFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Task-enriched lineage data
  const [taskLineageData, setTaskLineageData] = useState<any>(null);
  const [taskLineageLoading, setTaskLineageLoading] = useState(false);

  // Fetch task-enriched lineage when switching to tasks view
  useEffect(() => {
    if (activeView === 'tasks' && !taskLineageData && !taskLineageLoading) {
      setTaskLineageLoading(true);
      getLineageWithTasks({ days, database: dbFilter || undefined })
        .then((result) => setTaskLineageData(result))
        .catch((err: any) => toast.error(err?.message || 'Failed to load task lineage'))
        .finally(() => setTaskLineageLoading(false));
    }
  }, [activeView, days, dbFilter, taskLineageData, taskLineageLoading]);

  const taskStats = taskLineageData?.task_stats || {};
  const enrichedTasks: any[] = taskLineageData?.tasks || [];

  const suspendTask = async (task: any) => {
    try {
      await apiClient.post(`/connect/tasks/${task.fqn || task.task_name}/suspend`);
      toast.success(`Task ${task.task_name} suspended`);
      setTaskLineageData(null); // trigger reload
    } catch { toast.error('Suspend failed'); }
  };

  const resumeTask = async (task: any) => {
    try {
      await apiClient.post(`/connect/tasks/${task.fqn || task.task_name}/resume`);
      toast.success(`Task ${task.task_name} resumed`);
      setTaskLineageData(null); // trigger reload
    } catch { toast.error('Resume failed'); }
  };

  const importToWorkflow = (task: any) => {
    window.location.href = `/workflow?import_sql=${encodeURIComponent(task.definition || '')}`;
  };

  const s = data?.summary || {};
  const account = data?.account || {};
  const nodes: any[] = data?.nodes || [];
  const edges: any[] = data?.edges || [];

  // Group nodes by database for graph view
  const nodesByDb: Record<string, Record<string, any[]>> = {};
  nodes.forEach((n: any) => {
    const db = n.database || 'UNKNOWN';
    const sch = n.schema || 'UNKNOWN';
    if (!nodesByDb[db]) nodesByDb[db] = {};
    if (!nodesByDb[db][sch]) nodesByDb[db][sch] = [];
    nodesByDb[db][sch].push(n);
  });

  // Filter nodes by search
  const filteredNodes = search
    ? nodes.filter((n: any) => n.name?.toLowerCase().includes(search.toLowerCase()) || n.domain?.toLowerCase().includes(search.toLowerCase()))
    : nodes;

  return (
    <div className="space-y-5">
      {/* Account + Filter Bar */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {account.name && (
            <div className="flex items-center gap-2 mr-4">
              <PiDatabase className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{account.name}</span>
              {account.region && <Badge size="sm" className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{account.region}</Badge>}
            </div>
          )}
          <Input label="Database" placeholder="e.g. CP_DATA360" value={dbFilter} onChange={(e) => setDbFilter(e.target.value)} className="w-44" />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Period</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 text-sm">
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <Button onClick={fetchData} disabled={loading} size="sm" className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 h-10">
            {loading ? <Loader variant="spinner" size="sm" /> : <PiMagnifyingGlass className="w-4 h-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      {data && (
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
          {[
            { label: 'Projects', value: s.total_projects || 0, icon: PiTreeStructureDuotone, color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Modules', value: s.total_modules || 0, icon: PiFlowArrowDuotone, color: 'text-fuchsia-600 dark:text-fuchsia-400' },
            { label: 'Objects', value: s.total_nodes || 0, icon: PiTable, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Deps', value: s.total_edges || 0, icon: PiGitBranch, color: 'text-violet-600 dark:text-violet-400' },
            { label: 'Databases', value: s.total_databases || 0, icon: PiDatabase, color: 'text-purple-600 dark:text-purple-400' },
            { label: 'Roles', value: s.total_roles || 0, icon: PiUsersThree, color: 'text-teal-600 dark:text-teal-400' },
            { label: 'Policies', value: s.total_policies || 0, icon: PiLockKey, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Sources', value: s.total_sources || 0, icon: PiColumns, color: 'text-cyan-600 dark:text-cyan-400' },
            { label: 'Accesses', value: (s.total_access_events || 0).toLocaleString(), icon: PiEye, color: 'text-green-600 dark:text-green-400' },
            { label: 'Events', value: (s.total_module_events || 0).toLocaleString(), icon: PiFlowArrowDuotone, color: 'text-pink-600 dark:text-pink-400' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <kpi.icon className={cn('w-4 h-4 mx-auto mb-0.5', kpi.color)} />
              <div className="text-lg font-bold text-gray-900 dark:text-white">{kpi.value}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* View Navigation */}
      <div className="flex gap-1.5 flex-wrap">
        {LINEAGE_VIEWS.map((v) => (
          <Button key={v.id} variant={activeView === v.id ? 'solid' : 'outline'} onClick={() => setActiveView(v.id)}
            className={cn('gap-1.5', activeView === v.id ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-400')} size="sm">
            <v.icon className="w-3.5 h-3.5" /> {v.label}
          </Button>
        ))}
      </div>

      {loading && activeView !== 'dependency-flow' && activeView !== 'lineage-flow' && (
        <TableSkeleton rows={6} columns={4} />
      )}

      {/* ── DEPENDENCY FLOW (React Flow Canvas) ── */}
      {activeView === 'dependency-flow' && (
        <DependencyFlowView data={data} loading={loading} />
      )}

      {/* ── LINEAGE FLOW (React Flow Canvas) ── */}
      {activeView === 'lineage-flow' && (
        <LineageFlowView
          lineageData={lineageData}
          accessPatterns={accessPatterns}
          loading={lineageLoading}
          onLoadLineage={handleLoadLineage}
          onLoadAccess={handleLoadAccess}
        />
      )}

      {/* ── PROJECTS VIEW (Hierarchy: Project → Modules → Users → Events) ── */}
      {!loading && activeView === 'projects' && data && (
        <div className="space-y-3">
          {(data.projects || []).length === 0 ? (
            <EmptyState
              icon={PiTreeStructureDuotone}
              title="No projects found"
              description="Project lineage will appear here once modules emit events for a project."
            />
          ) : (
            (data.projects || []).map((proj: any) => {
              const projKey = `proj-${proj.project_id}`;
              const isProjExp = expanded.has(projKey);
              const statusColor = proj.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : proj.status === 'DEPLOYED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
              return (
                <div key={proj.project_id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button onClick={() => toggle(projKey)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    {isProjExp ? <PiCaretDown className="w-4 h-4 text-gray-400" /> : <PiCaretRight className="w-4 h-4 text-gray-400" />}
                    <PiTreeStructureDuotone className="w-5 h-5 text-indigo-500" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">{proj.project_name}</div>
                      {proj.description && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{proj.description}</div>}
                    </div>
                    <Badge size="sm" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">{proj.project_type}</Badge>
                    <Badge size="sm" className={statusColor}>{proj.status}</Badge>
                    {proj.deployment_version > 0 && <Badge size="sm" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">v{proj.deployment_version}</Badge>}
                    <Badge size="sm" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{proj.unique_users} users</Badge>
                    <Badge size="sm" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{proj.total_events} events</Badge>
                  </button>
                  {isProjExp && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-3">
                      {/* Project metadata */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="text-xs"><span className="text-gray-500 dark:text-gray-400">Created by:</span> <span className="text-gray-800 dark:text-gray-200">{proj.created_by}</span></div>
                        <div className="text-xs"><span className="text-gray-500 dark:text-gray-400">Created:</span> <span className="text-gray-800 dark:text-gray-200">{proj.created_at?.split('T')[0] || '—'}</span></div>
                        <div className="text-xs"><span className="text-gray-500 dark:text-gray-400">Updated:</span> <span className="text-gray-800 dark:text-gray-200">{proj.updated_at?.split('T')[0] || '—'}</span></div>
                        {proj.step_name && <div className="text-xs"><span className="text-gray-500 dark:text-gray-400">Step:</span> <span className="text-gray-800 dark:text-gray-200">{proj.step_name}</span></div>}
                      </div>
                      {/* Module breakdown per project */}
                      {proj.modules?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            <PiFlowArrowDuotone className="w-3.5 h-3.5 inline mr-1" /> Modules Used ({proj.modules.length})
                          </h5>
                          <div className="space-y-1.5">
                            {proj.modules.map((mod: any) => {
                              const modKey = `proj-mod-${proj.project_id}-${mod.module}`;
                              const isModExp = expanded.has(modKey);
                              return (
                                <div key={mod.module}>
                                  <button onClick={() => toggle(modKey)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left">
                                    {isModExp ? <PiCaretDown className="w-3 h-3 text-gray-400" /> : <PiCaretRight className="w-3 h-3 text-gray-400" />}
                                    <PiFlowArrowDuotone className="w-4 h-4 text-fuchsia-500" />
                                    <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{mod.module}</span>
                                    <Badge size="sm" className="bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">{mod.event_count} events</Badge>
                                    <Badge size="sm" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{mod.users?.length || 0} users</Badge>
                                  </button>
                                  {isModExp && (
                                    <div className="ml-8 border-l border-fuchsia-200 dark:border-fuchsia-800 pl-3 py-1 space-y-0.5">
                                      {(mod.users || []).map((u: string) => (
                                        <div key={u} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-gray-50 dark:bg-gray-700/20">
                                          <PiUser className="w-3 h-3 text-blue-500" />
                                          <span className="text-gray-700 dark:text-gray-300">{u}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── MODULE EVENTS VIEW ── */}
      {!loading && activeView === 'modules' && data && (
        <div className="space-y-3">
          {(data.modules || []).length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">No module events found.</div>
          ) : (
            (data.modules || []).map((mod: any) => {
              const modKey = `mod-${mod.module}`;
              const isModExp = expanded.has(modKey);
              const errorRate = mod.total_events > 0 ? ((mod.error_count / mod.total_events) * 100).toFixed(1) : '0';
              return (
                <div key={mod.module} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button onClick={() => toggle(modKey)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    {isModExp ? <PiCaretDown className="w-4 h-4 text-gray-400" /> : <PiCaretRight className="w-4 h-4 text-gray-400" />}
                    <PiFlowArrowDuotone className="w-5 h-5 text-fuchsia-500" />
                    <span className="font-semibold text-sm text-gray-900 dark:text-white flex-1">{mod.module}</span>
                    <Badge size="sm" className="bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">{mod.total_events} events</Badge>
                    <Badge size="sm" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{mod.unique_users} users</Badge>
                    <Badge size="sm" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{mod.success_count} ok</Badge>
                    {mod.error_count > 0 && (
                      <Badge size="sm" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{mod.error_count} errors ({errorRate}%)</Badge>
                    )}
                  </button>
                  {isModExp && (
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-gray-500 dark:text-gray-400">Event Types:</span> <span className="text-gray-800 dark:text-gray-200 font-medium">{mod.event_types}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">Actions:</span> <span className="text-gray-800 dark:text-gray-200 font-medium">{mod.actions}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">Last Activity:</span> <span className="text-gray-800 dark:text-gray-200">{mod.last_activity?.split('T')[0] || '—'}</span></div>
                        <div><span className="text-gray-500 dark:text-gray-400">Success Rate:</span> <span className="text-emerald-600 dark:text-emerald-400 font-medium">{mod.total_events > 0 ? ((mod.success_count / mod.total_events) * 100).toFixed(0) : 0}%</span></div>
                      </div>
                      {/* Users */}
                      {mod.users?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                            <PiUser className="w-3.5 h-3.5 inline mr-1" /> Users ({mod.users.length})
                          </h5>
                          <div className="flex flex-wrap gap-1.5">
                            {mod.users.slice(0, 20).map((u: any) => (
                              <span key={u.username} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                {u.username} <span className="text-blue-400 dark:text-blue-500">({u.event_count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Event details */}
                      {mod.events?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Events (top {Math.min(mod.events.length, 20)})</h5>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Action</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Type</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">User</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Resource</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Status</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mod.events.slice(0, 20).map((ev: any, i: number) => (
                                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="py-1 px-2 font-medium text-gray-900 dark:text-white">{ev.action || '—'}</td>
                                    <td className="py-1 px-2 text-gray-600 dark:text-gray-400">{ev.event_type || '—'}</td>
                                    <td className="py-1 px-2 text-gray-600 dark:text-gray-400">{ev.username}</td>
                                    <td className="py-1 px-2 text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{ev.resource_type ? `${ev.resource_type}${ev.resource_id ? `:${ev.resource_id}` : ''}` : '—'}</td>
                                    <td className="py-1 px-2">
                                      <Badge size="sm" className={ev.status === 'SUCCESS' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ev.status === 'ERROR' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}>
                                        {ev.status}
                                      </Badge>
                                    </td>
                                    <td className="py-1 px-2 text-gray-700 dark:text-gray-300 font-medium">{ev.count}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── LINEAGE GRAPH (Mindmap) ── */}
      {!loading && activeView === 'graph' && data && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <PiGitBranch className="w-4 h-4 text-indigo-500" /> Dependency Lineage Graph
              <span className="text-xs text-gray-400 font-normal ml-2">{nodes.length} objects, {edges.length} dependencies</span>
            </h4>
            {Object.keys(nodesByDb).length === 0 ? (
              <EmptyState
              icon={PiGitBranch}
              title="No dependency data found"
              description="Ensure ACCOUNT_USAGE.OBJECT_DEPENDENCIES is accessible for this role."
            />
            ) : (
              <div className="space-y-1">
                {Object.entries(nodesByDb).sort(([a], [b]) => a.localeCompare(b)).map(([dbName, schemas]) => {
                  const dbKey = `graph-db-${dbName}`;
                  const isDbExp = expanded.has(dbKey);
                  const totalObjects = Object.values(schemas).reduce((sum, arr) => sum + arr.length, 0);
                  return (
                    <div key={dbName}>
                      <button onClick={() => toggle(dbKey)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 text-left transition-colors">
                        {isDbExp ? <PiCaretDown className="w-3.5 h-3.5 text-gray-400" /> : <PiCaretRight className="w-3.5 h-3.5 text-gray-400" />}
                        <PiDatabase className="w-4 h-4 text-indigo-500" />
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{dbName}</span>
                        <Badge size="sm" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{totalObjects} objects</Badge>
                        <Badge size="sm" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400">{Object.keys(schemas).length} schemas</Badge>
                      </button>
                      {isDbExp && (
                        <div className="ml-8 border-l-2 border-indigo-200 dark:border-indigo-800 pl-3 space-y-0.5 pb-2">
                          {Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b)).map(([schName, schNodes]) => {
                            const schKey = `graph-sch-${dbName}.${schName}`;
                            const isSchExp = expanded.has(schKey);
                            return (
                              <div key={schName}>
                                <button onClick={() => toggle(schKey)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/20 text-left text-sm">
                                  {isSchExp ? <PiCaretDown className="w-3 h-3 text-gray-400" /> : <PiCaretRight className="w-3 h-3 text-gray-400" />}
                                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{schName}</span>
                                  <span className="text-[10px] text-gray-400">{schNodes.length} objects</span>
                                </button>
                                {isSchExp && (
                                  <div className="ml-6 border-l border-blue-200 dark:border-blue-800 pl-2 space-y-0.5 pb-1">
                                    {schNodes.slice(0, 50).map((node: any) => {
                                      const nodeKey = `graph-node-${node.id}`;
                                      const isNodeExp = expanded.has(nodeKey);
                                      return (
                                        <div key={node.id}>
                                          <button onClick={() => toggle(nodeKey)}
                                            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/20 text-left">
                                            {isNodeExp ? <PiCaretDown className="w-3 h-3 text-gray-400" /> : <PiCaretRight className="w-3 h-3 text-gray-400" />}
                                            <DomainBadge domain={node.domain || ''} />
                                            <span className="font-mono text-xs text-gray-800 dark:text-gray-200 truncate flex-1">{node.name}</span>
                                            {(node.upstream?.length || 0) > 0 && (
                                              <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                                                <PiArrowUp className="w-2.5 h-2.5" />{node.upstream.length}
                                              </span>
                                            )}
                                            {(node.downstream?.length || 0) > 0 && (
                                              <span className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                                                <PiArrowDown className="w-2.5 h-2.5" />{node.downstream.length}
                                              </span>
                                            )}
                                            {(node.policies?.length || 0) === 0 && <span className="text-[10px] text-red-500 font-medium">no policy</span>}
                                          </button>
                                          {isNodeExp && (
                                            <div className="ml-7 border-l border-gray-200 dark:border-gray-700 pl-2 py-1 space-y-1">
                                              {/* Upstream dependencies */}
                                              {node.upstream?.length > 0 && (
                                                <div>
                                                  <div className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase mb-0.5">Depends on ({node.upstream.length})</div>
                                                  {node.upstream.map((dep: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/10">
                                                      <PiArrowUp className="w-3 h-3 text-green-500" />
                                                      <DomainBadge domain={dep.domain || ''} />
                                                      <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{dep.database}.{dep.schema}.{dep.name}</span>
                                                      {dep.dependency_type && <span className="text-gray-400 text-[10px]">{dep.dependency_type}</span>}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {/* Downstream dependents */}
                                              {node.downstream?.length > 0 && (
                                                <div>
                                                  <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase mb-0.5">Used by ({node.downstream.length})</div>
                                                  {node.downstream.map((dep: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/10">
                                                      <PiArrowDown className="w-3 h-3 text-blue-500" />
                                                      <DomainBadge domain={dep.domain || ''} />
                                                      <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{dep.database}.{dep.schema}.{dep.name}</span>
                                                      {dep.dependency_type && <span className="text-gray-400 text-[10px]">{dep.dependency_type}</span>}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {/* Roles & grants */}
                                              {node.roles?.length > 0 && (
                                                <div>
                                                  <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase mb-0.5">Roles ({node.roles.length})</div>
                                                  {node.roles.map((r: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/10">
                                                      <PiUsersThree className="w-3 h-3 text-purple-500" />
                                                      <span className="text-gray-700 dark:text-gray-300">{r.role}</span>
                                                      {r.privileges?.length > 0 && <span className="text-indigo-500 text-[10px]">[{r.privileges.slice(0, 3).join(', ')}]</span>}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {/* Policies */}
                                              {node.policies?.length > 0 && (
                                                <div>
                                                  <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase mb-0.5">Policies ({node.policies.length})</div>
                                                  {node.policies.map((p: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/10">
                                                      <PiShieldCheck className="w-3 h-3 text-amber-500" />
                                                      <span className="text-gray-700 dark:text-gray-300">{p.policy_name}</span>
                                                      <span className="text-amber-600 dark:text-amber-400 text-[10px]">{p.policy_kind}</span>
                                                      {p.column_name && <span className="text-gray-400 text-[10px]">({p.column_name})</span>}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {/* Users */}
                                              {node.users?.length > 0 && (
                                                <div>
                                                  <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Users ({node.users.length})</div>
                                                  <div className="flex flex-wrap gap-1">
                                                    {node.users.slice(0, 8).map((u: string, i: number) => (
                                                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{u}</span>
                                                    ))}
                                                    {node.users.length > 8 && <span className="text-[10px] text-gray-400">+{node.users.length - 8}</span>}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                    {schNodes.length > 50 && <div className="text-xs text-gray-400 pl-2">+{schNodes.length - 50} more objects</div>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ALL OBJECTS (Nodes) ── */}
      {!loading && activeView === 'nodes' && data && (
        <div className="space-y-3">
          <Input placeholder="Search objects..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          {filteredNodes.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">No objects found.</div>
          ) : (
            <div className="space-y-2">
              {filteredNodes.slice(0, 100).map((node: any) => {
                const isExp = expanded.has(`node-${node.id}`);
                return (
                  <div key={node.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button onClick={() => toggle(`node-${node.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      {isExp ? <PiCaretDown className="w-4 h-4 text-gray-400" /> : <PiCaretRight className="w-4 h-4 text-gray-400" />}
                      <DomainBadge domain={node.domain || ''} />
                      <span className="font-mono text-sm text-gray-900 dark:text-white truncate flex-1">{node.name}</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 hidden md:inline">{node.database}.{node.schema}</span>
                      <Badge size="sm" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <PiArrowUp className="w-3 h-3 inline mr-0.5" />{node.upstream?.length || 0}
                      </Badge>
                      <Badge size="sm" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        <PiArrowDown className="w-3 h-3 inline mr-0.5" />{node.downstream?.length || 0}
                      </Badge>
                      {(node.policies?.length || 0) > 0 ? (
                        <Badge size="sm" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{node.policies.length} policies</Badge>
                      ) : (
                        <Badge size="sm" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">unprotected</Badge>
                      )}
                    </button>
                    {isExp && (
                      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2">
                        {node.upstream?.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Depends on</h5>
                            <div className="space-y-1">
                              {node.upstream.map((dep: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-900/10 rounded px-3 py-1.5">
                                  <DomainBadge domain={dep.domain || ''} />
                                  <span className="font-mono text-gray-800 dark:text-gray-200">{dep.database}.{dep.schema}.{dep.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {node.downstream?.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Used by</h5>
                            <div className="space-y-1">
                              {node.downstream.map((dep: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-900/10 rounded px-3 py-1.5">
                                  <DomainBadge domain={dep.domain || ''} />
                                  <span className="font-mono text-gray-800 dark:text-gray-200">{dep.database}.{dep.schema}.{dep.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {node.roles?.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Roles & Grants</h5>
                            <div className="flex flex-wrap gap-1.5">
                              {node.roles.map((r: any, i: number) => (
                                <span key={i} className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                                  {r.role} {r.privileges?.length > 0 && `[${r.privileges.slice(0, 2).join(', ')}]`}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {node.policies?.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Policies</h5>
                            <div className="space-y-1">
                              {node.policies.map((p: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-900/10 rounded px-3 py-1.5">
                                  <PiShieldCheck className="w-3 h-3 text-amber-500" />
                                  <span className="text-gray-800 dark:text-gray-200">{p.policy_name}</span>
                                  <Badge size="sm" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{p.policy_kind}</Badge>
                                  {p.column_name && <span className="text-gray-400">col: {p.column_name}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredNodes.length > 100 && <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">Showing 100 of {filteredNodes.length} objects</div>}
            </div>
          )}
        </div>
      )}

      {/* ── DATABASES VIEW ── */}
      {!loading && activeView === 'databases' && data?.databases && (
        <div className="space-y-2">
          {data.databases.length === 0 && <div className="text-center py-12 text-gray-500 dark:text-gray-400">No databases found.</div>}
          {data.databases.filter((db: any) => !db.database_name?.startsWith('SNOWFLAKE')).map((db: any) => {
            const dbKey = `db-${db.database_name}`;
            const isExp = expanded.has(dbKey);
            return (
              <div key={db.database_name} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <button onClick={() => toggle(dbKey)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  {isExp ? <PiCaretDown className="w-4 h-4 text-gray-400" /> : <PiCaretRight className="w-4 h-4 text-gray-400" />}
                  <PiDatabase className="w-5 h-5 text-indigo-500" />
                  <span className="font-semibold text-sm text-gray-900 dark:text-white flex-1">{db.database_name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">owner: {db.owner || '—'}</span>
                  <Badge size="sm" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">{db.schema_count || 0} schemas</Badge>
                </button>
                {isExp && (
                  <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <div className="text-xs"><span className="text-gray-500 dark:text-gray-400">Created:</span> <span className="text-gray-800 dark:text-gray-200">{db.created?.split('T')[0] || '—'}</span></div>
                      <div className="text-xs"><span className="text-gray-500 dark:text-gray-400">Last altered:</span> <span className="text-gray-800 dark:text-gray-200">{db.last_altered?.split('T')[0] || '—'}</span></div>
                      {db.comment && <div className="text-xs col-span-2"><span className="text-gray-500 dark:text-gray-400">Comment:</span> <span className="text-gray-800 dark:text-gray-200">{db.comment}</span></div>}
                    </div>
                    {/* Show nodes in this database */}
                    {nodesByDb[db.database_name] && (
                      <div>
                        <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Objects</h5>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(nodesByDb[db.database_name]).map(([sch, schNodes]) => (
                            <span key={sch} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              {sch} <span className="text-gray-400">({schNodes.length})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TASKS VIEW (Enhanced with task-enriched lineage) ── */}
      {!loading && activeView === 'tasks' && (
        <div className="space-y-4">
          {taskLineageLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader size="lg" />
            </div>
          )}

          {/* Task Stats Cards */}
          {!taskLineageLoading && (
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
                <p className="text-xl font-bold text-green-600">{taskLineageData?.summary?.active_tasks || 0}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Suspended</p>
                <p className="text-xl font-bold text-amber-600">{taskLineageData?.summary?.suspended_tasks || 0}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Succeeded (24h)</p>
                <p className="text-xl font-bold text-blue-600">{taskStats?.succeeded || 0}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Failed (24h)</p>
                <p className="text-xl font-bold text-red-600">{taskStats?.failed || 0}</p>
              </div>
            </div>
          )}

          {/* Task Table with Actions */}
          {!taskLineageLoading && enrichedTasks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Snowflake Tasks ({enrichedTasks.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="pb-2 px-2">Task</th>
                      <th className="pb-2 px-2">State</th>
                      <th className="pb-2 px-2">Schedule</th>
                      <th className="pb-2 px-2">Warehouse</th>
                      <th className="pb-2 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedTasks.map((t: any) => (
                      <tr key={t.task_name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{t.task_name}</td>
                        <td className="py-2 px-2">
                          <Badge size="sm" className={cn(
                            t.state === 'started' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                            t.state === 'suspended' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          )}>{t.state}</Badge>
                        </td>
                        <td className="py-2 px-2 text-gray-500 dark:text-gray-400 text-xs">{t.schedule || '\u2014'}</td>
                        <td className="py-2 px-2 text-gray-500 dark:text-gray-400 text-xs">{t.warehouse || '\u2014'}</td>
                        <td className="py-2 px-2">
                          <div className="flex gap-1">
                            {t.state === 'started' && (
                              <Button size="sm" variant="outline" onClick={() => suspendTask(t)}>Suspend</Button>
                            )}
                            {t.state === 'suspended' && (
                              <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => resumeTask(t)}>Resume</Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => importToWorkflow(t)}>
                              {'\u2192'} Workflow
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fallback: show cross-module task history if no enriched tasks */}
          {!taskLineageLoading && enrichedTasks.length === 0 && data?.tasks && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Task Run History ({data.tasks.history?.length || 0})</h4>
              {(data.tasks.history?.length || 0) === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">No task runs found in this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-xs">
                        <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Task</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Database</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">State</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Scheduled</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Duration</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-600 dark:text-gray-400">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.history.slice(0, 50).map((t: any, i: number) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="py-1.5 px-2 font-mono text-xs text-gray-900 dark:text-white">{t.NAME || t.task_name}</td>
                          <td className="py-1.5 px-2 text-xs text-gray-500 dark:text-gray-400">{t.DATABASE_NAME || ''}.{t.SCHEMA_NAME || ''}</td>
                          <td className="py-1.5 px-2">
                            <Badge size="sm" className={cn(
                              t.STATE === 'SUCCEEDED' || t.state === 'SUCCEEDED' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              t.STATE === 'FAILED' || t.state === 'FAILED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            )}>{t.STATE || t.state}</Badge>
                          </td>
                          <td className="py-1.5 px-2 text-xs text-gray-500 dark:text-gray-400">{(t.SCHEDULED_TIME || t.scheduled_time || '')?.toString().replace('T', ' ').split('.')[0]}</td>
                          <td className="py-1.5 px-2 text-xs text-gray-500 dark:text-gray-400">{t.DURATION_SECONDS || t.duration_seconds || '\u2014'}s</td>
                          <td className="py-1.5 px-2 text-xs text-red-500 truncate max-w-[200px]">{t.ERROR_MESSAGE || t.error_message || '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!taskLineageLoading && enrichedTasks.length === 0 && !data?.tasks && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No tasks found. Tasks will appear here when Snowflake tasks are configured.</div>
          )}
        </div>
      )}

      {/* ── SOURCES VIEW ── */}
      {!loading && activeView === 'sources' && data?.sources && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Data Sources / Stages ({data.sources.length})</h4>
          {data.sources.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No stages found.</div>
          ) : (
            <div className="space-y-2">
              {data.sources.map((src: any, i: number) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-4 py-3">
                  <PiColumns className="w-5 h-5 text-cyan-500" />
                  <div className="flex-1">
                    <div className="font-mono text-sm text-gray-900 dark:text-white">{src.STAGE_NAME || src.stage_name}</div>
                    {(src.STAGE_URL || src.stage_url) && <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-md">{src.STAGE_URL || src.stage_url}</div>}
                  </div>
                  <Badge size="sm" className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">{src.STAGE_TYPE || src.stage_type}</Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{src.STAGE_OWNER || src.owner}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── POLICIES VIEW ── */}
      {!loading && activeView === 'policies' && data?.policies && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Policies ({data.policies.length})</h4>
          {data.policies.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No policies found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Policy</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Applied To</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Object</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Column</th>
                  </tr>
                </thead>
                <tbody>
                  {data.policies.map((pol: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-2 px-3 font-medium text-gray-900 dark:text-white">{pol.POLICY_NAME || pol.policy_name || '—'}</td>
                      <td className="py-2 px-3">
                        <Badge size="sm" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{pol.POLICY_KIND || pol.policy_kind || '—'}</Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-400">{pol.REF_DATABASE_NAME || ''}.{pol.REF_SCHEMA_NAME || ''}</td>
                      <td className="py-2 px-3 font-mono text-xs text-gray-600 dark:text-gray-400">{pol.REF_ENTITY_NAME || pol.OBJECT_NAME || ''}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs">{pol.REF_COLUMN_NAME || pol.COLUMN_NAME || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tasks & Lineage Tab (top-level) ──

function TasksLineageTab() {
  const [taskLineageData, setTaskLineageData] = useState<any>(null);
  const [taskLineageLoading, setTaskLineageLoading] = useState(true);
  const [days] = useState(30);
  const [showGraph, setShowGraph] = useState(false);

  const fetchTasks = useCallback(async () => {
    setTaskLineageLoading(true);
    try {
      const result = await getLineageWithTasks({ days });
      setTaskLineageData(result);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load tasks');
    } finally {
      setTaskLineageLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const taskStats = taskLineageData?.task_stats || {};
  const enrichedTasks: any[] = taskLineageData?.tasks || [];

  const suspendTask = async (task: any) => {
    try {
      await apiClient.post(`/connect/tasks/${task.fqn || task.task_name}/suspend`);
      toast.success(`Task ${task.task_name} suspended`);
      fetchTasks();
    } catch { toast.error('Suspend failed'); }
  };

  const resumeTask = async (task: any) => {
    try {
      await apiClient.post(`/connect/tasks/${task.fqn || task.task_name}/resume`);
      toast.success(`Task ${task.task_name} resumed`);
      fetchTasks();
    } catch { toast.error('Resume failed'); }
  };

  const importToWorkflow = (task: any) => {
    window.location.href = `/workflow?import_sql=${encodeURIComponent(task.definition || '')}`;
  };

  if (taskLineageLoading) {
    return <TableSkeleton rows={6} columns={4} />;
  }

  if (showGraph) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => setShowGraph(false)}>
            Back to Tasks
          </Button>
          <Text className="text-sm text-gray-500 dark:text-gray-400">Dependency Graph</Text>
        </div>
        <div className="h-[600px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <DependencyFlowView data={taskLineageData} loading={taskLineageLoading} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Task Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
          <p className="text-2xl font-bold text-green-600">{taskLineageData?.summary?.active_tasks || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Suspended</p>
          <p className="text-2xl font-bold text-amber-600">{taskLineageData?.summary?.suspended_tasks || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Succeeded (24h)</p>
          <p className="text-2xl font-bold text-blue-600">{taskStats?.succeeded || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Failed (24h)</p>
          <p className="text-2xl font-bold text-red-600">{taskStats?.failed || 0}</p>
        </div>
      </div>

      {/* View Dependency Graph button */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setShowGraph(true)} className="flex items-center gap-2">
          <PiGitBranch className="w-4 h-4" /> View Dependency Graph
        </Button>
      </div>

      {/* Task Table */}
      {enrichedTasks.length > 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Snowflake Tasks ({enrichedTasks.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="pb-2 px-2">Task</th>
                  <th className="pb-2 px-2">State</th>
                  <th className="pb-2 px-2">Schedule</th>
                  <th className="pb-2 px-2">Warehouse</th>
                  <th className="pb-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrichedTasks.map((t: any) => (
                  <tr key={t.task_name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2 px-2 font-medium text-gray-900 dark:text-white">{t.task_name}</td>
                    <td className="py-2 px-2">
                      <Badge size="sm" className={cn(
                        t.state === 'started' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        t.state === 'suspended' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      )}>{t.state}</Badge>
                    </td>
                    <td className="py-2 px-2 text-gray-500 dark:text-gray-400 text-xs">{t.schedule || '\u2014'}</td>
                    <td className="py-2 px-2 text-gray-500 dark:text-gray-400 text-xs">{t.warehouse || '\u2014'}</td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        {t.state === 'started' && (
                          <Button size="sm" variant="outline" onClick={() => suspendTask(t)}>Suspend</Button>
                        )}
                        {t.state === 'suspended' && (
                          <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => resumeTask(t)}>Resume</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => importToWorkflow(t)}>
                          {'\u2192'} Workflow
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          No tasks found. Tasks will appear here when Snowflake tasks are configured.
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──

// ── Impact Analysis Tab (wired to lineage + dependency APIs) ──
function ImpactAnalysisTab() {
  const [impactType, setImpactType] = useState<'table' | 'column' | 'policy' | 'role'>('table');
  const [impactDb, setImpactDb] = useState('CP_DATA360');
  const [impactSchema, setImpactSchema] = useState('PUBLIC');
  const [impactObject, setImpactObject] = useState('');
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactResult, setImpactResult] = useState<any>(null);

  const runImpactAnalysis = useCallback(async () => {
    if (!impactObject.trim()) {
      toast.error('Enter an object name to analyze');
      return;
    }
    setImpactLoading(true);
    setImpactResult(null);
    try {
      // Fetch downstream lineage for the specified object
      const lineageRes = await apiClient.get('/observability/lineage', {
        params: { database: impactDb, schema: impactSchema, table: impactObject, days: 30 },
      });
      const lineageData = lineageRes.data?.data || lineageRes.data?.lineage || lineageRes.data || [];
      const rows = Array.isArray(lineageData) ? lineageData : [];

      // Fetch object dependencies
      const depsRes = await apiClient.get('/observability/dependencies', {
        params: { database: impactDb },
      }).catch(() => ({ data: { dependencies: [] } }));
      const deps = depsRes.data?.dependencies || depsRes.data?.data || [];
      const depsArr = Array.isArray(deps) ? deps : [];

      // Compute impact metrics from lineage
      const downstreamTables = new Set<string>();
      const affectedUsers = new Set<string>();
      rows.forEach((r: any) => {
        if (r.DIRECT_OBJECTS_ACCESSED) downstreamTables.add(String(r.DIRECT_OBJECTS_ACCESSED));
        if (r.TARGET_TABLE || r.DOWNSTREAM_TABLE) downstreamTables.add(String(r.TARGET_TABLE || r.DOWNSTREAM_TABLE));
        if (r.USER_NAME) affectedUsers.add(String(r.USER_NAME));
      });
      depsArr.forEach((d: any) => {
        const ref = d.REFERENCED_OBJECT_NAME || d.referenced_object;
        if (ref && String(ref).toUpperCase().includes(impactObject.toUpperCase())) {
          downstreamTables.add(d.REFERENCING_OBJECT_NAME || d.referencing_object || '');
        }
      });

      const queryCount = rows.length;
      const risk = downstreamTables.size > 10 ? 'Critical' : downstreamTables.size > 3 ? 'High' : downstreamTables.size > 0 ? 'Medium' : 'Low';

      setImpactResult({
        downstreamTables: downstreamTables.size,
        affectedQueries: queryCount,
        impactedUsers: affectedUsers.size,
        riskLevel: risk,
        details: rows.slice(0, 20),
        downstream: Array.from(downstreamTables).slice(0, 20),
        users: Array.from(affectedUsers),
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || 'Impact analysis failed');
    } finally {
      setImpactLoading(false);
    }
  }, [impactDb, impactSchema, impactObject]);

  const typeCards = [
    { id: 'table' as const, label: 'Table Drop', icon: PiTable, color: 'text-blue-500', q: 'What breaks if I drop this table?' },
    { id: 'column' as const, label: 'Column Change', icon: PiColumns, color: 'text-amber-500', q: 'Impact of renaming, retyping, or removing a column.' },
    { id: 'policy' as const, label: 'Policy Change', icon: PiShieldCheck, color: 'text-green-500', q: 'Which users/roles lose access if I change this policy?' },
    { id: 'role' as const, label: 'Role Revoke', icon: PiUsersThree, color: 'text-purple-500', q: 'Which users and objects are affected by revoking a role?' },
  ];

  const riskColor = (r: string) =>
    r === 'Critical' ? 'text-red-600 dark:text-red-400' :
    r === 'High' ? 'text-amber-600 dark:text-amber-400' :
    r === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' :
    'text-green-600 dark:text-green-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Change Impact Analysis</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Assess the blast radius of schema changes, column drops, or policy modifications before applying them.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={impactLoading}
            onClick={runImpactAnalysis}
            className="px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            {impactLoading ? <Loader variant="spinner" size="sm" /> : <PiMagnifyingGlass className="w-3.5 h-3.5" />}
            {impactLoading ? 'Analyzing...' : 'Analyze Change'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {typeCards.map((tc) => {
          const Icon = tc.icon;
          const selected = impactType === tc.id;
          return (
            <div
              key={tc.id}
              onClick={() => setImpactType(tc.id)}
              className={cn(
                'border rounded-lg p-4 bg-white dark:bg-gray-800 cursor-pointer transition-colors',
                selected ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/30' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600',
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('w-5 h-5', tc.color)} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{tc.label}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tc.q}</p>
            </div>
          );
        })}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Select Object to Analyze</h4>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Database</label>
              <input type="text" value={impactDb} onChange={(e) => setImpactDb(e.target.value)} placeholder="Select database..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Schema</label>
              <input type="text" value={impactSchema} onChange={(e) => setImpactSchema(e.target.value)} placeholder="Select schema..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Object</label>
              <input type="text" value={impactObject} onChange={(e) => setImpactObject(e.target.value)} placeholder="Table, view, or column..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Impact Results</h4>
        </div>
        {impactLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader variant="spinner" size="lg" />
          </div>
        ) : !impactResult ? (
          <EmptyState
            icon={PiTreeStructureDuotone}
            title="No analysis run yet"
            description='Select an object and click "Analyze Change" to see downstream dependencies, affected queries, and impacted users.'
          />
        ) : (
          <div className="space-y-0">
            {/* Downstream objects list */}
            {impactResult.downstream?.length > 0 && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Downstream Objects</p>
                <div className="flex flex-wrap gap-1.5">
                  {impactResult.downstream.map((obj: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">{obj}</span>
                  ))}
                </div>
              </div>
            )}
            {impactResult.users?.length > 0 && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Impacted Users</p>
                <div className="flex flex-wrap gap-1.5">
                  {impactResult.users.map((u: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 text-xs rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800">{u}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Downstream Tables</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{impactResult?.downstreamTables ?? '—'}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Affected Queries</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{impactResult?.affectedQueries ?? '—'}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Impacted Users</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{impactResult?.impactedUsers ?? '—'}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Risk Level</p>
            <p className={cn('text-lg font-bold mt-1', impactResult ? riskColor(impactResult.riskLevel) : 'text-gray-900 dark:text-white')}>{impactResult?.riskLevel ?? '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ObservabilityDashboard() {
  const [activeTab, setActiveTab] = useState('compliance');
  const [, startTabTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [gdprReport, setGdprReport] = useState<GdprReport | null>(null);
  const [soc2Report, setSoc2Report] = useState<Soc2Report | null>(null);

  const [loadingStates, setLoadingStates] = useState({
    compliance: true,
  });

  // Fetch compliance data on mount
  useEffect(() => {
    fetchComplianceData();
  }, []);

  const fetchComplianceData = useCallback(async () => {
    setLoadingStates((prev) => ({ ...prev, compliance: true }));
    try {
      setError(null);
      const [gdpr, soc2] = await Promise.all([
        getGdprComplianceReport(),
        getSoc2ComplianceReport(),
      ]);
      setGdprReport(gdpr);
      setSoc2Report(soc2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load compliance data';
      console.error('Failed to fetch compliance data:', err);
      setError(msg);
      toast.error('Failed to load compliance data');
    } finally {
      setLoadingStates((prev) => ({ ...prev, compliance: false }));
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <TableSkeleton rows={6} columns={4} />
      </div>
    );
  }

  return (
    <div className="@container">
      {/* Header */}
      <div className="mb-6">
        <Title as="h1" className="text-xl font-bold md:text-2xl">
          Observability
        </Title>
        <Text className="mt-1 text-gray-500 dark:text-gray-400">
          Compliance, data lineage, and object relationship tracking
        </Text>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
          <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="-mb-px flex space-x-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => startTabTransition(() => setActiveTab(tab.id))}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                )}
              >
                <Icon className="h-5 w-5" />
                <div className="text-left">
                  <div>{tab.label}</div>
                  <div className="text-[10px] opacity-60 font-normal">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Compliance Tab */}
        {activeTab === 'compliance' && (
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
            <ComplianceCard
              type="gdpr"
              report={gdprReport}
              isLoading={loadingStates.compliance}
            />
            <ComplianceCard
              type="soc2"
              report={soc2Report}
              isLoading={loadingStates.compliance}
            />
          </div>
        )}

        {/* Tasks & Lineage Tab */}
        {activeTab === 'tasks-lineage' && <TasksLineageTab />}

        {/* Cross-Modules & Objects Tab (merged: lineage + relations + cross-module) */}
        {activeTab === 'cross-module' && <CrossModuleLineageTab />}

        {/* Impact Analysis Tab */}
        {activeTab === 'impact-analysis' && <ImpactAnalysisTab />}
      </div>
    </div>
  );
}
