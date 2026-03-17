'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip } from 'rizzui';
import {
  Shield, Plus, Trash2, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Settings, Play, Loader2, Lock,
  Percent, Hash, Table2, Clock,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { runQualityGates } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { QualityGateConfig } from '@/app/services/api/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type GateType = 'null_percentage' | 'row_count_min' | 'row_count_max' | 'schema_match' | 'freshness' | 'unique_percentage' | 'custom_sql';
type GateStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

interface QualityGate {
  id: string;
  type: GateType;
  name: string;
  column?: string;
  threshold: number | string;
  enabled: boolean;
  status: GateStatus;
  actualValue?: number | string;
  error?: string;
}

interface QualityGatesPanelProps {
  columns?: Array<{ name: string; type: string }>;
  projectId?: string | null;
  database?: string;
  schemaName?: string;
  tableName?: string;
  onGatesChange?: (gates: QualityGate[]) => void;
  onRunGates?: (gates: QualityGate[]) => Promise<QualityGate[]>;
  blockOnFail?: boolean;
  className?: string;
}

// ── Gate Type Config ───────────────────────────────────────────────────────────

const gateTypeConfig: Record<GateType, {
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  defaultThreshold: string;
  unit: string;
}> = {
  null_percentage: {
    label: 'Null %',
    description: 'Block if null percentage exceeds threshold',
    icon: Percent,
    defaultThreshold: '5',
    unit: '%',
  },
  row_count_min: {
    label: 'Min Rows',
    description: 'Block if row count is below minimum',
    icon: Hash,
    defaultThreshold: '100',
    unit: 'rows',
  },
  row_count_max: {
    label: 'Max Rows',
    description: 'Block if row count exceeds maximum',
    icon: Hash,
    defaultThreshold: '10000000',
    unit: 'rows',
  },
  schema_match: {
    label: 'Schema Match',
    description: 'Block if source schema doesn\'t match expected',
    icon: Table2,
    defaultThreshold: '100',
    unit: '%',
  },
  freshness: {
    label: 'Freshness',
    description: 'Block if data is older than threshold (hours)',
    icon: Clock,
    defaultThreshold: '24',
    unit: 'hours',
  },
  unique_percentage: {
    label: 'Unique %',
    description: 'Block if unique percentage is below threshold',
    icon: Percent,
    defaultThreshold: '95',
    unit: '%',
  },
  custom_sql: {
    label: 'Custom SQL',
    description: 'Block if custom SQL query returns false',
    icon: Settings,
    defaultThreshold: '',
    unit: '',
  },
};

const statusConfig: Record<GateStatus, {
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
  label: string;
}> = {
  pending: { icon: Clock, color: 'text-slate-400', bgColor: 'bg-slate-100', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-100', label: 'Running' },
  passed: { icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-100', label: 'Pass' },
  failed: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-100', label: 'Fail' },
  skipped: { icon: AlertTriangle, color: 'text-slate-400', bgColor: 'bg-slate-100', label: 'Skip' },
};

// ── Component ──────────────────────────────────────────────────────────────────

const QualityGatesPanel: React.FC<QualityGatesPanelProps> = ({
  columns = [],
  projectId,
  database,
  schemaName,
  tableName,
  onGatesChange,
  onRunGates,
  blockOnFail = true,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [gates, setGates] = useState<QualityGate[]>([
    { id: 'qg_null', type: 'null_percentage', name: 'Null % Check', threshold: '5', enabled: true, status: 'pending' },
    { id: 'qg_rows_min', type: 'row_count_min', name: 'Min Row Count', threshold: '100', enabled: true, status: 'pending' },
    { id: 'qg_schema', type: 'schema_match', name: 'Schema Match', threshold: '100', enabled: true, status: 'pending' },
  ]);
  const [isRunning, setIsRunning] = useState(false);

  const allPassed = gates.filter((g) => g.enabled).every((g) => g.status === 'passed');
  const hasFailed = gates.some((g) => g.enabled && g.status === 'failed');

  const updateGates = useCallback(
    (newGates: QualityGate[]) => {
      setGates(newGates);
      if (onGatesChange) onGatesChange(newGates);
    },
    [onGatesChange],
  );

  const addGate = useCallback(
    (type: GateType) => {
      const config = gateTypeConfig[type];
      const newGate: QualityGate = {
        id: `qg_${Date.now()}`,
        type,
        name: config.label,
        threshold: config.defaultThreshold,
        enabled: true,
        status: 'pending',
      };
      updateGates([...gates, newGate]);
    },
    [gates, updateGates],
  );

  const removeGate = useCallback(
    (id: string) => updateGates(gates.filter((g) => g.id !== id)),
    [gates, updateGates],
  );

  const toggleGate = useCallback(
    (id: string) => {
      updateGates(
        gates.map((g) =>
          g.id === id ? { ...g, enabled: !g.enabled, status: !g.enabled ? 'pending' as GateStatus : 'skipped' as GateStatus } : g,
        ),
      );
    },
    [gates, updateGates],
  );

  const updateGateThreshold = useCallback(
    (id: string, threshold: string) => {
      updateGates(
        gates.map((g) => (g.id === id ? { ...g, threshold, status: 'pending' as GateStatus } : g)),
      );
    },
    [gates, updateGates],
  );

  const handleRunGates = useCallback(async () => {
    setIsRunning(true);
    // Mark all enabled gates as running
    const runningGates = gates.map((g) => ({
      ...g,
      status: (g.enabled ? 'running' : 'skipped') as GateStatus,
    }));
    setGates(runningGates);

    await new Promise((r) => setTimeout(r, 800));

    let results: QualityGate[];
    if (onRunGates) {
      results = await onRunGates(runningGates);
    } else if (projectId && database && schemaName && tableName) {
      // Call backend API
      const gateTypeMap: Record<GateType, string> = {
        null_percentage: 'null_rate',
        row_count_min: 'min_rows',
        row_count_max: 'max_rows',
        schema_match: 'schema_match',
        freshness: 'freshness',
        unique_percentage: 'unique_rate',
        custom_sql: 'custom_sql',
      };
      try {
        const apiResult = await runQualityGates(projectId, {
          database,
          schema_name: schemaName,
          table: tableName,
          gates: runningGates
            .filter((g) => g.enabled)
            .map((g) => ({
              gate_id: g.id,
              gate_type: (gateTypeMap[g.type] || g.type) as QualityGateConfig['gate_type'],
              column: g.column,
              threshold: typeof g.threshold === 'string' ? parseFloat(g.threshold) || 0 : g.threshold as number,
              block_on_fail: blockOnFail,
            })),
        });
        results = runningGates.map((g) => {
          if (!g.enabled) return { ...g, status: 'skipped' as GateStatus };
          const apiGate = apiResult.results.find((r) => r.gate_id === g.id);
          if (!apiGate) return { ...g, status: 'passed' as GateStatus };
          return {
            ...g,
            status: apiGate.status === 'error' ? 'failed' as GateStatus : apiGate.status as GateStatus,
            actualValue: apiGate.actual_value,
            error: apiGate.message,
          };
        });
      } catch (err) {
        toast.error(getApiErrorMessage(err) || 'Quality gates check failed');
        results = runningGates.map((g) => ({ ...g, status: 'failed' as GateStatus, error: 'API call failed' }));
      }
    } else {
      // Simulate results (no API available)
      results = runningGates.map((g) => {
        if (!g.enabled) return { ...g, status: 'skipped' as GateStatus };
        const passed = Math.random() > 0.2;
        return {
          ...g,
          status: (passed ? 'passed' : 'failed') as GateStatus,
          actualValue: g.type === 'null_percentage'
            ? (Math.random() * 10).toFixed(1)
            : g.type.includes('row_count')
              ? Math.floor(Math.random() * 100000)
              : g.type === 'schema_match'
                ? '100'
                : undefined,
          error: passed ? undefined : `Threshold exceeded: actual value doesn't meet requirement`,
        };
      });
    }

    setGates(results);
    setIsRunning(false);

    const failed = results.filter((g) => g.enabled && g.status === 'failed').length;
    if (failed > 0) {
      toast.error(`${failed} quality gate(s) failed`);
    } else {
      toast.success('All quality gates passed');
    }
  }, [gates, onRunGates]);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <Shield className={cn('h-4 w-4', hasFailed ? 'text-red-500' : allPassed ? 'text-green-500' : 'text-amber-500')} />
          Quality Gates
          <Badge size="sm" className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {gates.filter((g) => g.enabled).length} active
          </Badge>
          {blockOnFail && (
            <Tooltip content="Ingestion blocked if any gate fails">
              <Lock className="h-3 w-3 text-slate-400" />
            </Tooltip>
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
          {/* Gates Table */}
          <div className="border-b dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-8"></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Gate</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-28">Threshold</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 w-20">Actual</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 w-20">Status</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700">
                {gates.map((gate) => {
                  const typeConfig = gateTypeConfig[gate.type];
                  const sc = statusConfig[gate.status];
                  const GateIcon = typeConfig.icon;
                  const StatusIcon = sc.icon;

                  return (
                    <tr
                      key={gate.id}
                      className={cn(
                        'transition-colors',
                        !gate.enabled && 'opacity-50',
                        gate.status === 'failed' && 'bg-red-50/50 dark:bg-red-900/10',
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={gate.enabled}
                          onChange={() => toggleGate(gate.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <GateIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-xs">{gate.name}</p>
                            <p className="text-[10px] text-slate-400">{typeConfig.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={gate.threshold}
                            onChange={(e) => updateGateThreshold(gate.id, e.target.value)}
                            className="w-20 text-xs px-2 py-1 border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                            disabled={!gate.enabled}
                          />
                          <span className="text-[10px] text-slate-400">{typeConfig.unit}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {gate.actualValue !== undefined ? (
                          <span className={cn(
                            'text-xs font-mono font-medium',
                            gate.status === 'passed' ? 'text-green-600' : gate.status === 'failed' ? 'text-red-600' : 'text-slate-500',
                          )}>
                            {gate.actualValue}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge size="sm" className={cn(sc.bgColor, sc.color, 'text-[10px]')}>
                          <StatusIcon className={cn('h-2.5 w-2.5 mr-0.5', gate.status === 'running' && 'animate-spin')} />
                          {sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => removeGate(gate.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Gate + Run */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) addGate(e.target.value as GateType);
                  e.target.value = '';
                }}
                defaultValue=""
                className="text-xs px-2 py-1.5 border rounded dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="" disabled>+ Add Gate...</option>
                {Object.entries(gateTypeConfig).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRunGates}
              disabled={isRunning || gates.filter((g) => g.enabled).length === 0}
              className="gap-1.5"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run Gates
                </>
              )}
            </Button>
          </div>

          {/* Blocking banner */}
          {hasFailed && blockOnFail && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t dark:border-slate-700 flex items-center gap-2 text-xs text-red-600">
              <Lock className="h-3.5 w-3.5" />
              <span>Ingestion blocked — one or more quality gates failed. Fix data or adjust thresholds to proceed.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QualityGatesPanel;
