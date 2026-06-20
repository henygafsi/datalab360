'use client';

import React, { useState, useMemo } from 'react';
import { Badge, Button, Input, Select as RizzSelect, Text } from 'rizzui';
import {
  Key, Database, Table2, Columns3, Shield, Clock, RefreshCw,
  History, AlertTriangle, Check, Info, ChevronDown, ChevronRight,
  Lock, Eye, EyeOff, Layers, Copy, Settings
} from 'lucide-react';
import { Tooltip } from '@/app/shared/ui/Tooltip';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';
import type { TableItem, ColumnInfo } from './VirtualizedTableList';

// Ingestion Mode Types
export type IngestionMode = 'full_refresh' | 'incremental' | 'snapshot' | 'scd_type1' | 'scd_type2' | 'scd_type3';

export interface IngestionConfig {
  mode: IngestionMode;
  incrementalColumn?: string;
  snapshotColumn?: string;
  scdConfig?: SCDConfig;
}

export interface SCDConfig {
  type: 1 | 2 | 3;
  trackingColumns: string[];
  effectiveDateColumn?: string;
  expirationDateColumn?: string;
  currentFlagColumn?: string;
  historyTableSuffix?: string;
}

export interface MaskingConfig {
  columnName: string;
  policyName: string;
  maskingType: 'full' | 'partial' | 'hash' | 'tokenize' | 'nullify';
  preserveFormat?: boolean;
}

export interface TableConfig {
  tableId: string;
  ingestion: IngestionConfig;
  masking: MaskingConfig[];
  primaryKeys: string[];
  nullable: string[];
  sensitive: string[];
}

interface TableDetailPanelProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  config: TableConfig | null;
  onConfigChange: (config: Partial<TableConfig>) => void;
  availableMaskingPolicies: Array<{ name: string; type: string }>;
  isLoading?: boolean;
  className?: string;
}

const INGESTION_MODES: Array<{ value: IngestionMode; label: string; description: string; icon: React.ReactNode }> = [
  {
    value: 'full_refresh',
    label: 'Full Refresh',
    description: 'Replace entire table on each load',
    icon: <RefreshCw className="h-4 w-4" />,
  },
  {
    value: 'incremental',
    label: 'Incremental',
    description: 'Load only new/changed records',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    value: 'snapshot',
    label: 'Snapshot',
    description: 'Capture point-in-time snapshots',
    icon: <Copy className="h-4 w-4" />,
  },
  {
    value: 'scd_type1',
    label: 'SCD Type 1',
    description: 'Overwrite - No history',
    icon: <Layers className="h-4 w-4" />,
  },
  {
    value: 'scd_type2',
    label: 'SCD Type 2',
    description: 'Track history with effective dates',
    icon: <History className="h-4 w-4" />,
  },
  {
    value: 'scd_type3',
    label: 'SCD Type 3',
    description: 'Track previous value in column',
    icon: <Columns3 className="h-4 w-4" />,
  },
];

const MASKING_TYPES = [
  { value: 'full', label: 'Full Mask', description: 'Replace with ***' },
  { value: 'partial', label: 'Partial Mask', description: 'Show first/last chars' },
  { value: 'hash', label: 'Hash', description: 'SHA-256 hash value' },
  { value: 'tokenize', label: 'Tokenize', description: 'Replace with token' },
  { value: 'nullify', label: 'Nullify', description: 'Replace with NULL' },
];

const IngestionModeSelector: React.FC<{
  value: IngestionMode;
  onChange: (mode: IngestionMode) => void;
  columns: ColumnInfo[];
  config: IngestionConfig;
  onConfigChange: (config: Partial<IngestionConfig>) => void;
}> = ({ value, onChange, columns, config, onConfigChange }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-slate-500" />
          <span className="font-semibold">Ingestion Mode</span>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            {INGESTION_MODES.find((m) => m.value === value)?.label || 'Full Refresh'}
          </Badge>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Mode Selection Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {INGESTION_MODES.map((mode) => (
              <button
                key={mode.value}
                className={cn(
                  'flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left',
                  value === mode.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                )}
                onClick={() => onChange(mode.value)}
              >
                <div className="flex items-center gap-2 mb-1">
                  {mode.icon}
                  <span className="font-medium text-sm">{mode.label}</span>
                </div>
                <span className="text-xs text-slate-500">{mode.description}</span>
              </button>
            ))}
          </div>

          {/* Mode-specific Configuration */}
          {value === 'incremental' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">Incremental Configuration</h4>
              <div>
                <label className="text-sm text-slate-600 dark:text-slate-400">Tracking Column (timestamp or ID)</label>
                <select
                  className="w-full mt-1 p-2 border rounded-md dark:bg-slate-900 dark:border-slate-700"
                  value={config.incrementalColumn || ''}
                  onChange={(e) => onConfigChange({ incrementalColumn: e.target.value })}
                >
                  <option value="">Select column...</option>
                  {columns
                    .filter((c) => c.dataType.toLowerCase().includes('date') || c.dataType.toLowerCase().includes('int'))
                    .map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.dataType})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {value === 'snapshot' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">Snapshot Configuration</h4>
              <div>
                <label className="text-sm text-slate-600 dark:text-slate-400">Snapshot Date Column</label>
                <select
                  className="w-full mt-1 p-2 border rounded-md dark:bg-slate-900 dark:border-slate-700"
                  value={config.snapshotColumn || ''}
                  onChange={(e) => onConfigChange({ snapshotColumn: e.target.value })}
                >
                  <option value="">Select column...</option>
                  {columns
                    .filter((c) => c.dataType.toLowerCase().includes('date'))
                    .map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.dataType})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {(value === 'scd_type2' || value === 'scd_type3') && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">SCD Configuration</h4>

              <div>
                <label className="text-sm text-slate-600 dark:text-slate-400">Columns to Track for Changes</label>
                <div className="mt-2 max-h-32 overflow-y-auto border rounded-md p-2 dark:border-slate-700">
                  {columns.map((col) => (
                    <label key={col.name} className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={config.scdConfig?.trackingColumns.includes(col.name) || false}
                        onChange={(e) => {
                          const current = config.scdConfig?.trackingColumns || [];
                          const updated = e.target.checked
                            ? [...current, col.name]
                            : current.filter((c) => c !== col.name);
                          onConfigChange({
                            scdConfig: { ...config.scdConfig, type: value === 'scd_type2' ? 2 : 3, trackingColumns: updated },
                          });
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{col.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {value === 'scd_type2' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-slate-600 dark:text-slate-400">Effective Date Column</label>
                      <input
                        type="text"
                        className="w-full mt-1 p-2 border rounded-md text-sm dark:bg-slate-900 dark:border-slate-700"
                        placeholder="EFFECTIVE_DATE"
                        value={config.scdConfig?.effectiveDateColumn || ''}
                        onChange={(e) =>
                          onConfigChange({
                            scdConfig: { ...config.scdConfig, type: 2, trackingColumns: config.scdConfig?.trackingColumns || [], effectiveDateColumn: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 dark:text-slate-400">Expiration Date Column</label>
                      <input
                        type="text"
                        className="w-full mt-1 p-2 border rounded-md text-sm dark:bg-slate-900 dark:border-slate-700"
                        placeholder="EXPIRATION_DATE"
                        value={config.scdConfig?.expirationDateColumn || ''}
                        onChange={(e) =>
                          onConfigChange({
                            scdConfig: { ...config.scdConfig, type: 2, trackingColumns: config.scdConfig?.trackingColumns || [], expirationDateColumn: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 dark:text-slate-400">Current Flag Column</label>
                    <input
                      type="text"
                      className="w-full mt-1 p-2 border rounded-md text-sm dark:bg-slate-900 dark:border-slate-700"
                      placeholder="IS_CURRENT"
                      value={config.scdConfig?.currentFlagColumn || ''}
                      onChange={(e) =>
                        onConfigChange({
                          scdConfig: { ...config.scdConfig, type: 2, trackingColumns: config.scdConfig?.trackingColumns || [], currentFlagColumn: e.target.value },
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ColumnMaskingRow: React.FC<{
  column: ColumnInfo;
  masking?: MaskingConfig;
  availablePolicies: Array<{ name: string; type: string }>;
  onMaskingChange: (config: MaskingConfig | null) => void;
  canEdit: boolean;
  deniedReason: string;
}> = ({ column, masking, availablePolicies, onMaskingChange, canEdit, deniedReason }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className={cn(
      'flex items-center gap-3 py-2 px-3 rounded-md transition-colors',
      masking ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{column.name}</span>
          <span className="text-xs text-slate-500">({column.dataType})</span>
          {column.isPrimaryKey && <Key className="h-3 w-3 text-amber-500" />}
          {column.isSensitive && <AlertTriangle className="h-3 w-3 text-red-500" />}
        </div>
      </div>

      {masking ? (
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Lock className="h-3 w-3 mr-1" />
            {masking.policyName}
          </Badge>
          {confirmRemove ? (
            // Inline (non-blocking) confirm — removing a governance masking policy
            // exposes the column, so never fire it on a single click.
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-0.5 dark:bg-red-900/20">
              <span className="text-[11px] font-medium text-red-700 dark:text-red-400">
                Remove masking?
              </span>
              <button
                type="button"
                className="text-[11px] font-semibold text-red-700 hover:underline dark:text-red-400"
                onClick={() => { setConfirmRemove(false); onMaskingChange(null); }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="text-[11px] font-semibold text-slate-600 hover:underline dark:text-slate-400"
                onClick={() => setConfirmRemove(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <Tooltip label={canEdit ? 'Remove the masking policy from this column' : deniedReason}>
              <button
                type="button"
                aria-label="Remove masking"
                disabled={!canEdit}
                className="p-1 rounded hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-700"
                onClick={() => setConfirmRemove(true)}
              >
                <EyeOff className="h-4 w-4 text-slate-500" />
              </button>
            </Tooltip>
          )}
        </div>
      ) : (
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          onClick={() => setShowConfig(true)}
        >
          <Shield className="h-3 w-3" />
          Add Masking
        </button>
      )}

      {/* Masking Config Popover */}
      {showConfig && (
        <div className="absolute right-0 mt-32 w-64 bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg shadow-lg p-4 z-50">
          <h4 className="font-medium text-sm mb-3">Configure Masking</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-600 dark:text-slate-400">Policy</label>
              <select
                className="w-full mt-1 p-2 text-sm border rounded-md dark:bg-slate-800 dark:border-slate-700"
                onChange={(e) => {
                  if (e.target.value) {
                    onMaskingChange({
                      columnName: column.name,
                      policyName: e.target.value,
                      maskingType: 'full',
                    });
                    setShowConfig(false);
                  }
                }}
              >
                <option value="">Select policy...</option>
                {availablePolicies.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                onClick={() => setShowConfig(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TableDetailPanel: React.FC<TableDetailPanelProps> = ({
  table,
  columns,
  config,
  onConfigChange,
  availableMaskingPolicies,
  isLoading,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<'columns' | 'ingestion' | 'masking'>('columns');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  // Inline (non-blocking) confirm for the destructive bulk column mutations.
  const [pendingBulk, setPendingBulk] = useState<null | 'pk' | 'nullable' | 'sensitive'>(null);

  // System-2 Action-RBAC gate. These bulk flag changes + masking removal mutate
  // governance-relevant column metadata; `data_products`/`edit` is the registry
  // key used across the adjacent Sources/catalog surfaces. Fail-open while the
  // allow-set loads; honest-disable only on a resolved denial.
  const editPerm = useCanPerform('data_products', 'edit');
  const canEdit = editPerm.allowed || editPerm.loading;
  const editDeniedReason =
    'You lack the "edit" permission on data products. Ask an administrator to grant it.';

  const sensitiveColumns = useMemo(() => columns.filter((c) => c.isSensitive), [columns]);
  const primaryKeyColumns = useMemo(() => columns.filter((c) => c.isPrimaryKey), [columns]);

  if (!table) {
    return (
      <div className={cn('flex items-center justify-center h-full text-slate-500', className)}>
        <div className="text-center">
          <Table2 className="h-12 w-12 mx-auto mb-3 text-slate-300" />
          <p>Select a table to view details</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const currentConfig: TableConfig = config || {
    tableId: table.id,
    ingestion: { mode: 'full_refresh' },
    masking: [],
    primaryKeys: [],
    nullable: [],
    sensitive: [],
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-4 border-b dark:border-slate-800">
        <div className="flex items-center gap-3 mb-2">
          <Table2 className="h-5 w-5 text-slate-500" />
          <h3 className="text-lg font-bold truncate">{table.table}</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Database className="h-4 w-4" />
          <span>{table.database}.{table.schema}</span>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-3">
          <div className="flex items-center gap-1 text-sm">
            <Columns3 className="h-4 w-4 text-slate-400" />
            <span>{columns.length} columns</span>
          </div>
          {primaryKeyColumns.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-amber-600">
              <Key className="h-4 w-4" />
              <span>{primaryKeyColumns.length} PKs</span>
            </div>
          )}
          {sensitiveColumns.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>{sensitiveColumns.length} sensitive</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-slate-800">
        {[
          { id: 'columns', label: 'Columns', icon: Columns3, description: 'Review columns and flag primary keys, nullable and sensitive fields' },
          { id: 'ingestion', label: 'Ingestion', icon: RefreshCw, description: 'Choose how this table is loaded — full refresh, incremental, snapshot or SCD' },
          { id: 'masking', label: 'Masking', icon: Shield, description: 'Apply masking policies to protect sensitive columns' },
        ].map((tab) => (
          <Tooltip key={tab.id} label={tab.description} side="bottom">
            <button
              type="button"
              aria-label={tab.label}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              onClick={() => setActiveTab(tab.id as any)}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'columns' && (
          <div className="space-y-2">
            {/* Bulk actions — each destructive flag change is gated (RBAC) and
                routed through an inline, non-blocking confirm. */}
            {selectedColumns.size > 0 && (
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <span className="text-sm font-medium">{selectedColumns.size} selected</span>
                  <button
                    disabled={!canEdit}
                    title={!canEdit ? editDeniedReason : undefined}
                    className="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setPendingBulk('pk')}
                  >
                    Set as PK
                  </button>
                  <button
                    disabled={!canEdit}
                    title={!canEdit ? editDeniedReason : undefined}
                    className="px-2 py-1 text-xs bg-slate-100 text-slate-800 rounded hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setPendingBulk('nullable')}
                  >
                    Mark Nullable
                  </button>
                  <button
                    disabled={!canEdit}
                    title={!canEdit ? editDeniedReason : undefined}
                    className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setPendingBulk('sensitive')}
                  >
                    Mark Sensitive
                  </button>
                </div>

                {pendingBulk && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                      {pendingBulk === 'pk'
                        ? `Mark ${selectedColumns.size} column(s) as primary key?`
                        : pendingBulk === 'nullable'
                          ? `Mark ${selectedColumns.size} column(s) as nullable?`
                          : `Mark ${selectedColumns.size} column(s) as sensitive?`}
                    </span>
                    <button
                      className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
                      onClick={() => {
                        const sel = Array.from(selectedColumns);
                        if (pendingBulk === 'pk') {
                          onConfigChange({ primaryKeys: Array.from(new Set([...currentConfig.primaryKeys, ...sel])) });
                        } else if (pendingBulk === 'nullable') {
                          onConfigChange({ nullable: Array.from(new Set([...currentConfig.nullable, ...sel])) });
                        } else {
                          onConfigChange({ sensitive: Array.from(new Set([...currentConfig.sensitive, ...sel])) });
                        }
                        setPendingBulk(null);
                        setSelectedColumns(new Set());
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-400"
                      onClick={() => setPendingBulk(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {columns.map((col) => (
              <div
                key={col.name}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                  selectedColumns.has(col.name)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                )}
                onClick={() => {
                  const newSelected = new Set(selectedColumns);
                  if (newSelected.has(col.name)) {
                    newSelected.delete(col.name);
                  } else {
                    newSelected.add(col.name);
                  }
                  setSelectedColumns(newSelected);
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.has(col.name)}
                  onChange={() => {}}
                  className="rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{col.name}</span>
                    {currentConfig.primaryKeys.includes(col.name) && (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">PK</Badge>
                    )}
                    {currentConfig.sensitive.includes(col.name) && (
                      <Badge className="bg-red-100 text-red-800 text-xs">Sensitive</Badge>
                    )}
                    {currentConfig.nullable.includes(col.name) && (
                      <Badge className="bg-slate-100 text-slate-800 text-xs">Nullable</Badge>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">{col.dataType}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ingestion' && (
          <IngestionModeSelector
            value={currentConfig.ingestion.mode}
            onChange={(mode) => onConfigChange({ ingestion: { ...currentConfig.ingestion, mode } })}
            columns={columns}
            config={currentConfig.ingestion}
            onConfigChange={(ingestion) => onConfigChange({ ingestion: { ...currentConfig.ingestion, ...ingestion } })}
          />
        )}

        {activeTab === 'masking' && (
          <div className="space-y-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Apply masking policies to protect sensitive data. Columns marked as sensitive are highlighted.
              </p>
            </div>

            {columns.map((col) => (
              <ColumnMaskingRow
                key={col.name}
                column={{
                  ...col,
                  isSensitive: currentConfig.sensitive.includes(col.name) || col.isSensitive,
                }}
                masking={currentConfig.masking.find((m) => m.columnName === col.name)}
                availablePolicies={availableMaskingPolicies}
                canEdit={canEdit}
                deniedReason={editDeniedReason}
                onMaskingChange={(maskingConfig) => {
                  const otherMasking = currentConfig.masking.filter((m) => m.columnName !== col.name);
                  onConfigChange({
                    masking: maskingConfig ? [...otherMasking, maskingConfig] : otherMasking,
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TableDetailPanel;
