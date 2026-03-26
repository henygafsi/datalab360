'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge, Input, Select } from 'rizzui';
import {
  Shield, Zap, Users, Calendar, Server, Settings, Sparkles, Loader2,
  ArrowRight, ChevronDown, ChevronRight, RefreshCw, Clock, History, Layers, Database,
} from 'lucide-react';
import { useDeploymentContext } from './DeploymentContext';
import { INGESTION_EVENT_TYPES } from './deployment-utils';
import { useAiFeatures } from '../../stores/ai-store';
import { aiWarehouseSizing, aiDeploySchedule } from '@/app/services/api/exploreDesignApi';
import type { WarehouseSizingResult, DeployScheduleResult } from '@/app/services/api/types';
import type { IngestionMode } from '../../../mapping/components/TableDetailPanel';
import IngestionConfigPanel from '../IngestionConfigPanel';

const CRON_OPTIONS = [
  { label: 'Every 5 minutes', value: 'EVERY_5_MIN' },
  { label: 'Every 15 minutes', value: 'EVERY_15_MIN' },
  { label: 'Hourly', value: 'HOURLY' },
  { label: 'Daily (midnight UTC)', value: 'DAILY' },
  { label: 'Weekly (Sunday midnight)', value: 'WEEKLY' },
  { label: 'Custom CRON', value: 'CUSTOM' },
];

const APPROVER_OPTIONS = [
  { label: 'Data Modeler', value: 'DATA_MODELER' },
  { label: 'Data Engineer', value: 'DATA_ENGINEER' },
  { label: 'DBA', value: 'DBA' },
  { label: 'Data Steward', value: 'DATA_STEWARD' },
];

const INGESTION_MODES: Array<{ value: IngestionMode; label: string; icon: typeof RefreshCw; desc: string }> = [
  { value: 'full_refresh', label: 'Full Refresh', icon: RefreshCw, desc: 'Complete reload' },
  { value: 'incremental', label: 'Incremental', icon: Clock, desc: 'Delta changes' },
  { value: 'snapshot', label: 'Snapshot', icon: Layers, desc: 'Point-in-time' },
  { value: 'scd_type1', label: 'SCD Type 1', icon: History, desc: 'No history' },
  { value: 'scd_type2', label: 'SCD Type 2', icon: History, desc: 'Full history' },
  { value: 'scd_type3', label: 'SCD Type 3', icon: History, desc: 'Limited history' },
];

export default function StepConfigure() {
  const { config, updateConfig, projectId, events, pendingEvents } = useDeploymentContext();
  const { isEnabled } = useAiFeatures();
  const [sizingLoading, setSizingLoading] = useState(false);
  const [sizingResult, setSizingResult] = useState<WarehouseSizingResult | null>(null);
  const [sizingError, setSizingError] = useState<string | null>(null);

  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<DeployScheduleResult | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [expandedMapping, setExpandedMapping] = useState<string | null>(null);

  // Build mapped tables from COLUMN_MAPPING_CREATED and INGESTION_MODE_SET events
  const mappedTables = useMemo(() => {
    const tableMap = new Map<string, {
      sourceDb: string; sourceSchema: string; sourceTable: string;
      targetDb: string; targetSchema: string; targetTable: string;
      mappings: Array<{ sourceColumns: string[]; targetColumn: string; transformation?: string }>;
      ingestionMode: IngestionMode;
    }>();

    // Extract mappings
    events.filter(e => e.type === 'COLUMN_MAPPING_CREATED').forEach(e => {
      const src = e.payload?.source;
      const tgt = e.payload?.target;
      if (!src?.table || !tgt?.table) return;
      const key = `${src.schema}.${src.table}→${tgt.schema}.${tgt.table}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, {
          sourceDb: src.database || '', sourceSchema: src.schema || '', sourceTable: src.table,
          targetDb: tgt.database || '', targetSchema: tgt.schema || '', targetTable: tgt.table || tgt.column?.split('.')[0] || '',
          mappings: [],
          ingestionMode: 'full_refresh',
        });
      }
      tableMap.get(key)!.mappings.push({
        sourceColumns: src.columns || [src.column || ''],
        targetColumn: tgt.column || '',
        transformation: e.payload?.transformation,
      });
    });

    // Apply ingestion mode overrides from events
    events.filter(e => e.type === 'INGESTION_MODE_SET').forEach(e => {
      const tbl = e.target?.table;
      for (const [, entry] of tableMap) {
        if (entry.targetTable === tbl || entry.sourceTable === tbl) {
          entry.ingestionMode = (e.payload?.mode || e.payload?.ingestionMode || 'full_refresh') as IngestionMode;
        }
      }
    });

    // Apply config overrides
    for (const [key, entry] of tableMap) {
      if (config.ingestionModeOverrides[key]) {
        entry.ingestionMode = config.ingestionModeOverrides[key];
      }
    }

    return Array.from(tableMap.entries());
  }, [events, config.ingestionModeOverrides]);

  const warehouseSizingEnabled = isEnabled('warehouse_sizing');
  const scheduleOptimizerEnabled = isEnabled('schedule_optimizer');

  const handleSuggestWarehouse = async () => {
    const warehouse = config.scheduleWarehouse?.trim();
    if (!warehouse) return;
    setSizingLoading(true);
    setSizingError(null);
    setSizingResult(null);
    try {
      const result = await aiWarehouseSizing(projectId, { warehouse });
      setSizingResult(result);
      if (result.recommendation?.suggested_size) {
        updateConfig('scheduleWarehouse', result.recommendation.suggested_size);
      }
    } catch (err: any) {
      setSizingError(err?.response?.data?.detail || err?.message || 'Failed to get sizing recommendation');
    } finally {
      setSizingLoading(false);
    }
  };

  const handleSuggestSchedule = async () => {
    const warehouse = config.scheduleWarehouse?.trim();
    if (!warehouse) return;
    setScheduleLoading(true);
    setScheduleError(null);
    setScheduleResult(null);
    try {
      const result = await aiDeploySchedule(projectId, { warehouse });
      setScheduleResult(result);
      // Map optimal window to a CRON_OPTIONS value
      if (result.optimal_window) {
        const w = result.optimal_window;
        const hour = w.start_hour_utc;
        // Map to closest predefined CRON option, or set custom
        if (hour === 0 && w.day_of_week === 'DAILY') {
          updateConfig('cronChoice', 'DAILY');
        } else if (w.day_of_week === 'SUNDAY' && hour === 0) {
          updateConfig('cronChoice', 'WEEKLY');
        } else {
          updateConfig('cronChoice', 'CUSTOM');
          const dayMap: Record<string, string> = {
            MONDAY: '1', TUESDAY: '2', WEDNESDAY: '3', THURSDAY: '4',
            FRIDAY: '5', SATURDAY: '6', SUNDAY: '0', DAILY: '*',
          };
          const dayNum = dayMap[w.day_of_week] ?? '*';
          updateConfig('customCron', `0 ${hour} * * ${dayNum}`);
        }
      }
    } catch (err: any) {
      setScheduleError(err?.response?.data?.detail || err?.message || 'Failed to get schedule recommendation');
    } finally {
      setScheduleLoading(false);
    }
  };

  return (
      <div className="p-6 space-y-6">
      {/* Deployment Type */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-500" />
          Deployment Type
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            className={cn(
              'p-4 rounded-lg border-2 text-left transition-all',
              config.deploymentType === 'immediate'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
            )}
            onClick={() => updateConfig('deploymentType', 'immediate')}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-sm">Immediate</span>
            </div>
            <p className="text-xs text-slate-500">Deploy directly to Snowflake</p>
          </button>
          <button
            className={cn(
              'p-4 rounded-lg border-2 text-left transition-all',
              config.deploymentType === 'with_approval'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
            )}
            onClick={() => updateConfig('deploymentType', 'with_approval')}
          >
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="font-medium text-sm">With Approval</span>
            </div>
            <p className="text-xs text-slate-500">Submit for review before deploying</p>
          </button>
        </div>
      </div>

      {/* Atomic Deployment (B2) */}
      <div className="p-4 border dark:border-slate-700 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-500" />
            <div>
              <span className="text-sm font-medium">Atomic Deployment</span>
              <p className="text-xs text-slate-500">Clone → Execute → Verify → Apply or Auto-Rollback</p>
            </div>
          </div>
          <button
            onClick={() => updateConfig('atomicDeployment', !config.atomicDeployment)}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              config.atomicDeployment ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
            )}
          >
            <div className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm',
              config.atomicDeployment && 'translate-x-5',
            )} />
          </button>
        </div>
        {config.atomicDeployment && (
          <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded text-xs text-emerald-700 dark:text-emerald-300">
            All DDL actions will execute atomically. If any fails, the entire deployment rolls back automatically.
          </div>
        )}
      </div>

      {/* Version Type */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Version Bump</h3>
        <div className="flex gap-2">
          {(['patch', 'minor', 'major'] as const).map(v => (
            <button
              key={v}
              className={cn(
                'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                config.versionType === v
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300',
              )}
              onClick={() => updateConfig('versionType', v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Changelog */}
      <div>
        <label className="text-sm font-semibold block mb-2">Changelog Summary</label>
        <Input
          size="sm"
          placeholder="Describe the changes being deployed..."
          value={config.changelogSummary}
          onChange={(e) => updateConfig('changelogSummary', e.target.value)}
        />
      </div>

      {/* Approvers (if with_approval) */}
      {config.deploymentType === 'with_approval' && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Approvers
          </h3>
          <div className="flex flex-wrap gap-2">
            {APPROVER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs border transition-all',
                  config.selectedApprovers.includes(opt.value)
                    ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300',
                )}
                onClick={() => {
                  const next = config.selectedApprovers.includes(opt.value)
                    ? config.selectedApprovers.filter(a => a !== opt.value)
                    : [...config.selectedApprovers, opt.value];
                  updateConfig('selectedApprovers', next);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ingestion Configuration per Mapped Table */}
      {mappedTables.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-teal-500" />
            Ingestion Configuration
            <Badge size="sm" className="bg-teal-100 text-teal-600 text-[10px]">{mappedTables.length} table(s)</Badge>
          </h3>
          <div className="space-y-2">
            {mappedTables.map(([key, entry]) => {
              const isExpanded = expandedMapping === key;
              const currentMode = entry.ingestionMode;
              const tableRef = {
                database: entry.targetDb || entry.sourceDb,
                schema: entry.targetSchema,
                table: entry.targetTable,
              };
              const columns = entry.mappings.map(m => ({
                name: m.targetColumn,
                dataType: 'VARCHAR',
              }));
              return (
                <div key={key} className="border dark:border-slate-700 rounded-lg overflow-hidden">
                  {/* Table header */}
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-left"
                    onClick={() => setExpandedMapping(isExpanded ? null : key)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
                        {entry.sourceSchema}.{entry.sourceTable}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                        {entry.targetSchema}.{entry.targetTable}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge size="sm" className="bg-blue-100 text-blue-600 text-[10px]">
                        {entry.mappings.length} col(s)
                      </Badge>
                      <Badge size="sm" className="bg-slate-100 text-slate-600 text-[10px]">
                        {INGESTION_MODES.find(m => m.value === currentMode)?.label || currentMode}
                      </Badge>
                    </div>
                  </button>

                  {/* Expanded: full IngestionConfigPanel */}
                  {isExpanded && (
                    <div className="border-t dark:border-slate-700">
                      <IngestionConfigPanel
                        table={tableRef}
                        sourceTable={{
                          database: entry.sourceDb,
                          schema: entry.sourceSchema,
                          table: entry.sourceTable,
                        }}
                        ingestionMode={currentMode}
                        onModeChange={(mode) => {
                          updateConfig('ingestionModeOverrides', {
                            ...config.ingestionModeOverrides,
                            [key]: mode,
                          });
                        }}
                        columns={columns}
                        columnMappings={entry.mappings.map(m => ({
                          sourceColumn: m.sourceColumns[0] || '',
                          targetColumn: m.targetColumn,
                          transformation: m.transformation,
                        }))}
                        projectId={projectId}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ingestion Timing */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-500" />
          Ingestion Timing
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            className={cn(
              'p-3 rounded-lg border-2 text-left transition-all',
              config.ingestionType === 'immediate'
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
            )}
            onClick={() => updateConfig('ingestionType', 'immediate')}
          >
            <span className="text-sm font-medium">Immediate</span>
            <p className="text-xs text-slate-500">Run ingestion after schema deploy</p>
          </button>
          <button
            className={cn(
              'p-3 rounded-lg border-2 text-left transition-all',
              config.ingestionType === 'scheduled'
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
            )}
            onClick={() => updateConfig('ingestionType', 'scheduled')}
          >
            <span className="text-sm font-medium">Scheduled</span>
            <p className="text-xs text-slate-500">Create Snowflake TASK</p>
          </button>
        </div>
      </div>

      {config.ingestionType === 'scheduled' && (
        <div className="space-y-3 pl-4 border-l-2 border-orange-200 dark:border-orange-800">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Schedule</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  size="sm"
                  options={CRON_OPTIONS}
                  value={config.cronChoice}
                  onChange={(opt: any) => updateConfig('cronChoice', opt?.value ?? 'DAILY')}
                />
              </div>
              {scheduleOptimizerEnabled && (
                <button
                  type="button"
                  disabled={scheduleLoading || !config.scheduleWarehouse?.trim()}
                  onClick={handleSuggestSchedule}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                    'border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300',
                    'hover:bg-violet-50 dark:hover:bg-violet-900/30',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {scheduleLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Suggest Schedule
                </button>
              )}
            </div>
            {scheduleResult?.optimal_window && (
              <p className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
                <Sparkles className="inline h-3 w-3 mr-1" />
                Optimal: {scheduleResult.optimal_window.day_of_week} at {scheduleResult.optimal_window.start_hour_utc}:00–{scheduleResult.optimal_window.end_hour_utc}:00 UTC
                <span className="ml-1 text-slate-500">
                  ({scheduleResult.optimal_window.avg_utilization_pct}% avg utilization)
                </span>
              </p>
            )}
            {scheduleError && (
              <p className="mt-1.5 text-xs text-red-500">{scheduleError}</p>
            )}
          </div>
          {config.cronChoice === 'CUSTOM' && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Custom CRON Expression</label>
              <Input
                size="sm"
                placeholder="*/15 * * * *"
                value={config.customCron}
                onChange={(e) => updateConfig('customCron', e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Warehouse</label>
            <div className="flex items-center gap-2">
              <Input
                size="sm"
                placeholder="COMPUTE_WH"
                value={config.scheduleWarehouse}
                onChange={(e) => updateConfig('scheduleWarehouse', e.target.value)}
                prefix={<Server className="h-3.5 w-3.5" />}
                className="flex-1"
              />
              {warehouseSizingEnabled && (
                <button
                  type="button"
                  disabled={sizingLoading || !config.scheduleWarehouse?.trim()}
                  onClick={handleSuggestWarehouse}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                    'border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300',
                    'hover:bg-violet-50 dark:hover:bg-violet-900/30',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {sizingLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Suggest
                </button>
              )}
            </div>
            {sizingResult?.recommendation && (
              <p className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
                <Sparkles className="inline h-3 w-3 mr-1" />
                {sizingResult.recommendation.reason}
                {sizingResult.recommendation.estimated_savings_pct > 0 && (
                  <span className="ml-1 font-medium">
                    (~{sizingResult.recommendation.estimated_savings_pct}% savings)
                  </span>
                )}
              </p>
            )}
            {sizingError && (
              <p className="mt-1.5 text-xs text-red-500">{sizingError}</p>
            )}
          </div>
        </div>
      )}

      </div>
  );
}
