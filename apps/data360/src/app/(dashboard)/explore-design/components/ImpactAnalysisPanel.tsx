'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  AlertTriangle, ChevronDown, ChevronRight, Shield, Eye,
  Table2, Database, Layers, Zap, GitBranch, RefreshCw,
  CheckCircle2, XCircle, ArrowRight, Search, Info, Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, DesignEvent, EventType } from '../stores/event-store';
import { analyzeImpact } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DownstreamDependency {
  id: string;
  objectType: 'view' | 'stream' | 'task' | 'dynamic_table' | 'materialized_view' | 'pipe' | 'function';
  objectName: string;
  schema: string;
  database: string;
  riskLevel: 'high' | 'medium' | 'low';
  reason: string;
  affectedBy: string[]; // event IDs that affect this object
}

interface ImpactAnalysisPanelProps {
  className?: string;
  projectId?: string | null;
  database?: string;
  schemaName?: string;
  downstreamDependencies?: DownstreamDependency[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const objectTypeConfig: Record<DownstreamDependency['objectType'], {
  icon: React.ComponentType<any>;
  label: string;
  color: string;
}> = {
  view: { icon: Eye, label: 'View', color: 'bg-blue-100 text-blue-600' },
  stream: { icon: Zap, label: 'Stream', color: 'bg-cyan-100 text-cyan-600' },
  task: { icon: RefreshCw, label: 'Task', color: 'bg-green-100 text-green-600' },
  dynamic_table: { icon: Table2, label: 'Dynamic Table', color: 'bg-teal-100 text-teal-600' },
  materialized_view: { icon: Layers, label: 'Mat. View', color: 'bg-indigo-100 text-indigo-600' },
  pipe: { icon: GitBranch, label: 'Pipe', color: 'bg-purple-100 text-purple-600' },
  function: { icon: Database, label: 'Function', color: 'bg-amber-100 text-amber-600' },
};

const riskConfig: Record<DownstreamDependency['riskLevel'], {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<any>;
}> = {
  high: {
    label: 'HIGH',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    icon: XCircle,
  },
  medium: {
    label: 'MEDIUM',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    icon: AlertTriangle,
  },
  low: {
    label: 'LOW',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: CheckCircle2,
  },
};

// ── Demo downstream deps (when no API data is available) ───────────────────────

function inferDependencies(events: DesignEvent[]): DownstreamDependency[] {
  const deps: DownstreamDependency[] = [];
  const tables = new Set<string>();
  const renamedTables = new Map<string, string>();
  const droppedColumns = new Set<string>();

  for (const event of events) {
    const tableKey = `${event.target.database}.${event.target.schema}.${event.target.table}`;

    if (event.type === 'TABLE_CREATED' || event.type === 'TABLE_ADDED_TO_MODELING') {
      tables.add(tableKey);
    }

    if (event.type === 'TABLE_RENAMED') {
      renamedTables.set(tableKey, event.payload.newName);
    }

    if (event.type === 'REMOVE_COLUMN') {
      droppedColumns.add(`${tableKey}.${event.payload.columnName || event.target.column}`);
    }
  }

  // For each table, simulate potential downstream objects
  Array.from(tables).forEach((tableKey) => {
    const parts = tableKey.split('.');
    const tableName = parts[2] || 'UNKNOWN';

    // Views that might reference this table
    if (renamedTables.has(tableKey) || droppedColumns.size > 0) {
      deps.push({
        id: `dep_view_${tableName}`,
        objectType: 'view',
        objectName: `V_${tableName}_SUMMARY`,
        schema: parts[1] || 'PUBLIC',
        database: parts[0] || 'DB',
        riskLevel: renamedTables.has(tableKey) ? 'high' : 'medium',
        reason: renamedTables.has(tableKey)
          ? `Table renamed: ${tableName} → ${renamedTables.get(tableKey)}. View references old name.`
          : `Column dropped from ${tableName}. View may reference removed columns.`,
        affectedBy: events
          .filter((e) => e.target.table === tableName && (e.type === 'TABLE_RENAMED' || e.type === 'REMOVE_COLUMN'))
          .map((e) => e.id),
      });
    }

    // Streams
    if (events.some((e) => e.target.table === tableName && e.type === 'COLUMN_TYPE_CHANGED')) {
      deps.push({
        id: `dep_stream_${tableName}`,
        objectType: 'stream',
        objectName: `STR_${tableName}_CDC`,
        schema: parts[1] || 'PUBLIC',
        database: parts[0] || 'DB',
        riskLevel: 'medium',
        reason: `Column type changed in ${tableName}. Stream schema may be outdated.`,
        affectedBy: events
          .filter((e) => e.target.table === tableName && e.type === 'COLUMN_TYPE_CHANGED')
          .map((e) => e.id),
      });
    }

    // Tasks
    if (events.some((e) => e.target.table === tableName && e.type === 'TABLE_RENAMED')) {
      deps.push({
        id: `dep_task_${tableName}`,
        objectType: 'task',
        objectName: `TSK_LOAD_${tableName}`,
        schema: parts[1] || 'PUBLIC',
        database: parts[0] || 'DB',
        riskLevel: 'high',
        reason: `Table renamed. Task SQL references old table name.`,
        affectedBy: events
          .filter((e) => e.target.table === tableName && e.type === 'TABLE_RENAMED')
          .map((e) => e.id),
      });
    }
  });

  return deps;
}

// ── Component ──────────────────────────────────────────────────────────────────

const ImpactAnalysisPanel: React.FC<ImpactAnalysisPanelProps> = ({
  className,
  projectId,
  database,
  schemaName,
  downstreamDependencies,
  onRefresh,
  isLoading: externalLoading,
}) => {
  const { events } = useEventStore(projectId);
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedDepId, setExpandedDepId] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<DownstreamDependency['riskLevel'] | 'all'>('all');
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [apiDeps, setApiDeps] = useState<DownstreamDependency[] | null>(null);
  const [apiLoading, setApiLoading] = useState(false);

  const isLoading = externalLoading || apiLoading;

  const handleApiRefresh = useCallback(async () => {
    if (!projectId) return;
    // Find tables affected by current events to analyze
    const affectedTables = new Set<string>();
    for (const e of events) {
      if (e.target?.table) affectedTables.add(e.target.table);
    }
    if (affectedTables.size === 0) return;

    setApiLoading(true);
    try {
      const firstTable = Array.from(affectedTables)[0];
      const result = await analyzeImpact(projectId, {
        database: database || 'CP_DATA360',
        schema_name: schemaName || 'PUBLIC',
        table: firstTable,
      });
      const mapped: DownstreamDependency[] = result.impacts.map((imp, idx) => ({
        id: `api_dep_${idx}`,
        objectType: imp.object_type as DownstreamDependency['objectType'],
        objectName: imp.object_name,
        schema: imp.schema,
        database: imp.database,
        riskLevel: imp.risk_level,
        reason: imp.reason,
        affectedBy: [],
      }));
      setApiDeps(mapped);
      toast.success(`Impact analysis: ${result.total} downstream dependencies found`);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Impact analysis failed');
    } finally {
      setApiLoading(false);
    }
  }, [projectId, database, schemaName, events]);

  // Use provided deps, API deps, or infer from events
  const dependencies = useMemo(
    () => downstreamDependencies || apiDeps || inferDependencies(events),
    [downstreamDependencies, apiDeps, events],
  );

  const filteredDeps = useMemo(() => {
    if (riskFilter === 'all') return dependencies;
    return dependencies.filter((d) => d.riskLevel === riskFilter);
  }, [dependencies, riskFilter]);

  const stats = useMemo(() => ({
    total: dependencies.length,
    high: dependencies.filter((d) => d.riskLevel === 'high').length,
    medium: dependencies.filter((d) => d.riskLevel === 'medium').length,
    low: dependencies.filter((d) => d.riskLevel === 'low').length,
  }), [dependencies]);

  const unacknowledgedHigh = useMemo(
    () => dependencies.filter((d) => d.riskLevel === 'high' && !acknowledged.has(d.id)).length,
    [dependencies, acknowledged],
  );

  const handleAcknowledge = (depId: string) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.add(depId);
      return next;
    });
  };

  if (dependencies.length === 0) {
    return (
      <div className={cn('border dark:border-slate-700 rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          No downstream impact detected — safe to deploy
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <AlertTriangle className={cn('h-4 w-4', stats.high > 0 ? 'text-red-500' : 'text-amber-500')} />
          Impact Analysis
          <Badge size="sm" className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {stats.total} downstream
          </Badge>
          {stats.high > 0 && (
            <Badge size="sm" className="bg-red-100 text-red-600">
              {stats.high} HIGH
            </Badge>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div>
          {/* Risk Summary Bar */}
          <div className="flex items-center gap-px border-b dark:border-slate-700">
            {(['high', 'medium', 'low'] as const).map((level) => {
              const rc = riskConfig[level];
              const count = stats[level];
              const width = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <Tooltip key={level} content={`${count} ${rc.label} risk`}>
                  <div
                    className={cn('h-1.5 transition-all', rc.bgColor)}
                    style={{ width: `${width}%` }}
                  />
                </Tooltip>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b dark:border-slate-700">
            <div className="flex items-center gap-2">
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as any)}
                className="text-xs px-2 py-1 border rounded dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="all">All Risks</option>
                <option value="high">High Only</option>
                <option value="medium">Medium Only</option>
                <option value="low">Low Only</option>
              </select>
              {unacknowledgedHigh > 0 && (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {unacknowledgedHigh} unacknowledged high-risk
                </span>
              )}
            </div>
            {(onRefresh || projectId) && (
              <button
                onClick={onRefresh || handleApiRefresh}
                disabled={isLoading}
                className={cn('p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700', isLoading && 'animate-spin')}
              >
                <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>

          {/* Dependency List */}
          <div className="max-h-[400px] overflow-auto divide-y dark:divide-slate-700">
            {filteredDeps.map((dep) => {
              const ot = objectTypeConfig[dep.objectType];
              const rc = riskConfig[dep.riskLevel];
              const ObjIcon = ot.icon;
              const RiskIcon = rc.icon;
              const isDepExpanded = expandedDepId === dep.id;
              const isAck = acknowledged.has(dep.id);

              return (
                <div key={dep.id}>
                  <div
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                      isAck
                        ? 'bg-slate-50/50 dark:bg-slate-800/30 opacity-60'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                    onClick={() => setExpandedDepId(isDepExpanded ? null : dep.id)}
                  >
                    <button className="p-0.5">
                      {isDepExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>

                    {/* Risk Badge */}
                    <Badge size="sm" className={cn(rc.bgColor, rc.color, 'text-[10px] font-bold min-w-[4rem] justify-center')}>
                      <RiskIcon className="h-2.5 w-2.5 mr-0.5" />
                      {rc.label}
                    </Badge>

                    {/* Object Type */}
                    <Badge size="sm" className={cn(ot.color, 'text-[10px]')}>
                      <ObjIcon className="h-2.5 w-2.5 mr-0.5" />
                      {ot.label}
                    </Badge>

                    {/* Name */}
                    <span className="flex-1 text-sm font-mono truncate">
                      {dep.objectName}
                    </span>

                    {/* Acknowledge */}
                    {dep.riskLevel === 'high' && !isAck && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 border-amber-300 text-amber-600 hover:bg-amber-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcknowledge(dep.id);
                        }}
                      >
                        Acknowledge
                      </Button>
                    )}
                    {isAck && (
                      <Badge size="sm" className="bg-green-100 text-green-600 text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                        Ack
                      </Badge>
                    )}
                  </div>

                  {/* Details */}
                  {isDepExpanded && (
                    <div className="px-4 pb-3 ml-8">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-xs space-y-2">
                        <p className="text-slate-600 dark:text-slate-400">{dep.reason}</p>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Database className="h-3 w-3" />
                          <span>{dep.database}.{dep.schema}.{dep.objectName}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <span>Affected by {dep.affectedBy.length} event(s)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            {unacknowledgedHigh > 0 ? (
              <div className="flex items-center gap-2 text-xs text-red-500">
                <Shield className="h-3.5 w-3.5" />
                <span>Acknowledge all HIGH-risk items before deploying</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>All high-risk items acknowledged — ready to proceed</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImpactAnalysisPanel;
