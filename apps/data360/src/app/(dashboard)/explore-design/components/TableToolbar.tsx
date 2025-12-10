'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Modal, Tooltip } from 'rizzui';
import {
  Edit2, Shield, Database, Key, Link2, RefreshCw, Clock, History,
  Layers, Trash2, Copy, Eye, EyeOff, Lock, Unlock, Settings,
  ChevronDown, Check, X, Plus, Search, Filter, Workflow
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  useEventStore,
  createTableRenameEvent,
  createColumnRenameEvent,
  createIngestionModeEvent,
  createMaskingPolicyEvent,
  createPrimaryKeyEvent,
} from '../stores/event-store';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import { IngestionMode } from '../../mapping/components/TableDetailPanel';

// Ingestion modes
const ingestionModes: { value: IngestionMode; label: string; icon: React.ComponentType<any>; description: string }[] = [
  { value: 'full_refresh', label: 'Full Refresh', icon: RefreshCw, description: 'Truncate and reload entire table' },
  { value: 'incremental', label: 'Incremental', icon: Clock, description: 'Load only new/changed records' },
  { value: 'snapshot', label: 'Snapshot', icon: Layers, description: 'Point-in-time snapshot capture' },
  { value: 'scd_type1', label: 'SCD Type 1', icon: History, description: 'Overwrite existing records (no history)' },
  { value: 'scd_type2', label: 'SCD Type 2', icon: History, description: 'Track full history with effective dates' },
  { value: 'scd_type3', label: 'SCD Type 3', icon: History, description: 'Track previous value in additional column' },
];

// Mock masking policies
const maskingPolicies = [
  { name: 'email_mask', type: 'Partial', description: 'Mask email addresses (j***@example.com)' },
  { name: 'ssn_mask', type: 'Full', description: 'Fully mask SSN (XXX-XX-XXXX)' },
  { name: 'phone_mask', type: 'Partial', description: 'Partial phone masking (***-***-1234)' },
  { name: 'credit_card_mask', type: 'Tokenize', description: 'Tokenize credit card numbers' },
  { name: 'pii_hash', type: 'Hash', description: 'Hash PII data' },
  { name: 'address_mask', type: 'Partial', description: 'Mask street address' },
];

// Mock aggregation policies
const aggregationPolicies = [
  { name: 'sum_policy', type: 'SUM', description: 'Sum aggregation for numeric columns' },
  { name: 'avg_policy', type: 'AVG', description: 'Average aggregation' },
  { name: 'count_policy', type: 'COUNT', description: 'Count aggregation' },
  { name: 'min_policy', type: 'MIN', description: 'Minimum value aggregation' },
  { name: 'max_policy', type: 'MAX', description: 'Maximum value aggregation' },
];

interface TableToolbarProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  selectedColumns: Set<string>;
  onColumnSelect: (column: string, selected: boolean) => void;
  className?: string;
}

const TableToolbar: React.FC<TableToolbarProps> = ({
  table,
  columns,
  selectedColumns,
  onColumnSelect,
  className,
}) => {
  const { addEvent } = useEventStore();

  // Modal states
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showIngestionModal, setShowIngestionModal] = useState(false);
  const [showMaskingModal, setShowMaskingModal] = useState(false);
  const [showAggregationModal, setShowAggregationModal] = useState(false);
  const [showPrimaryKeyModal, setShowPrimaryKeyModal] = useState(false);
  const [showColumnRenameModal, setShowColumnRenameModal] = useState(false);

  // Form states
  const [newTableName, setNewTableName] = useState('');
  const [selectedIngestionMode, setSelectedIngestionMode] = useState<IngestionMode>('full_refresh');
  const [selectedMaskingPolicy, setSelectedMaskingPolicy] = useState('');
  const [selectedAggregationPolicy, setSelectedAggregationPolicy] = useState('');
  const [selectedPrimaryKeys, setSelectedPrimaryKeys] = useState<Set<string>>(new Set());
  const [columnRenames, setColumnRenames] = useState<Record<string, string>>({});

  // SCD config state
  const [scdConfig, setScdConfig] = useState({
    trackingColumns: [] as string[],
    effectiveDateColumn: '',
    expirationDateColumn: '',
    currentFlagColumn: '',
    incrementalColumn: '',
  });

  if (!table) {
    return (
      <div className={cn('bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-4', className)}>
        <p className="text-slate-500 text-sm text-center">
          Select a table to see available actions
        </p>
      </div>
    );
  }

  const target = {
    database: table.database,
    schema: table.schema,
    table: table.table,
  };

  // Handlers
  const handleRename = () => {
    if (newTableName.trim() && newTableName !== table.table) {
      addEvent(createTableRenameEvent(target, table.table, newTableName.trim()));
      toast.success(`Table will be renamed to "${newTableName}"`);
      setShowRenameModal(false);
      setNewTableName('');
    }
  };

  const handleIngestionMode = () => {
    const config = ['scd_type2', 'scd_type3'].includes(selectedIngestionMode)
      ? scdConfig
      : selectedIngestionMode === 'incremental'
      ? { incrementalColumn: scdConfig.incrementalColumn }
      : undefined;

    addEvent(createIngestionModeEvent(target, selectedIngestionMode, config));
    toast.success(`Ingestion mode set to ${selectedIngestionMode.replace('_', ' ')}`);
    setShowIngestionModal(false);
  };

  const handleMasking = () => {
    if (selectedMaskingPolicy && selectedColumns.size > 0) {
      addEvent(createMaskingPolicyEvent(target, selectedMaskingPolicy, Array.from(selectedColumns), true));
      toast.success(`Masking policy "${selectedMaskingPolicy}" applied to ${selectedColumns.size} columns`);
      setShowMaskingModal(false);
      setSelectedMaskingPolicy('');
    }
  };

  const handlePrimaryKey = () => {
    if (selectedPrimaryKeys.size > 0) {
      addEvent(createPrimaryKeyEvent(target, Array.from(selectedPrimaryKeys), true));
      toast.success(`Set ${selectedPrimaryKeys.size} column(s) as primary key`);
      setShowPrimaryKeyModal(false);
    }
  };

  const handleColumnRename = () => {
    const renames = Object.entries(columnRenames).filter(([old, newName]) => newName && old !== newName);
    renames.forEach(([oldName, newName]) => {
      addEvent(createColumnRenameEvent({ ...target, column: oldName }, oldName, newName));
    });
    toast.success(`Renamed ${renames.length} column(s)`);
    setShowColumnRenameModal(false);
    setColumnRenames({});
  };

  return (
    <>
      <div className={cn('bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg', className)}>
        {/* Header */}
        <div className="px-4 py-3 border-b dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{table.table}</h3>
              <p className="text-xs text-slate-500">{table.database}.{table.schema}</p>
            </div>
            <Badge className={table.status === 'configured' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}>
              {table.status}
            </Badge>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-3 grid grid-cols-2 gap-2">
          <Tooltip content="Rename table or columns">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() => {
                setNewTableName(table.table);
                setShowRenameModal(true);
              }}
            >
              <Edit2 className="h-4 w-4" />
              Rename
            </Button>
          </Tooltip>

          <Tooltip content="Set ingestion mode (Full/Incremental/SCD)">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() => setShowIngestionModal(true)}
            >
              <RefreshCw className="h-4 w-4" />
              Ingestion
            </Button>
          </Tooltip>

          <Tooltip content="Apply masking policy to columns">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() => setShowMaskingModal(true)}
              disabled={selectedColumns.size === 0}
            >
              <Shield className="h-4 w-4" />
              Masking
              {selectedColumns.size > 0 && (
                <Badge size="sm" className="ml-auto">{selectedColumns.size}</Badge>
              )}
            </Button>
          </Tooltip>

          <Tooltip content="Apply aggregation policy">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() => setShowAggregationModal(true)}
              disabled={selectedColumns.size === 0}
            >
              <Database className="h-4 w-4" />
              Aggregation
            </Button>
          </Tooltip>

          <Tooltip content="Set primary key columns">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() => {
                setSelectedPrimaryKeys(new Set(columns.filter(c => c.isPrimaryKey).map(c => c.name)));
                setShowPrimaryKeyModal(true);
              }}
            >
              <Key className="h-4 w-4" />
              Primary Key
            </Button>
          </Tooltip>

          <Tooltip content="Rename columns">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 justify-start"
              onClick={() => {
                const renames: Record<string, string> = {};
                columns.forEach(c => renames[c.name] = c.name);
                setColumnRenames(renames);
                setShowColumnRenameModal(true);
              }}
            >
              <Edit2 className="h-4 w-4" />
              Column Names
            </Button>
          </Tooltip>
        </div>

        {/* Column Selection Helper */}
        {columns.length > 0 && (
          <div className="px-3 pb-3 border-t dark:border-slate-700 pt-3">
            <p className="text-xs text-slate-500 mb-2">
              Select columns to apply masking or aggregation policies
            </p>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-auto">
              {columns.slice(0, 10).map((col) => (
                <button
                  key={col.name}
                  className={cn(
                    'px-2 py-1 text-xs rounded-full border transition-colors',
                    selectedColumns.has(col.name)
                      ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                  )}
                  onClick={() => onColumnSelect(col.name, !selectedColumns.has(col.name))}
                >
                  {col.name}
                </button>
              ))}
              {columns.length > 10 && (
                <span className="px-2 py-1 text-xs text-slate-400">
                  +{columns.length - 10} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      <Modal isOpen={showRenameModal} onClose={() => setShowRenameModal(false)}>
        <div className="p-6 max-w-md">
          <h3 className="text-lg font-bold mb-4">Rename Table</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Original Name</label>
              <p className="text-slate-500 text-sm">{table.table}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">New Name</label>
              <Input
                value={newTableName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTableName(e.target.value)}
                placeholder="Enter new table name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowRenameModal(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!newTableName.trim() || newTableName === table.table}>
              Rename
            </Button>
          </div>
        </div>
      </Modal>

      {/* Ingestion Mode Modal */}
      <Modal isOpen={showIngestionModal} onClose={() => setShowIngestionModal(false)}>
        <div className="p-6 max-w-lg">
          <h3 className="text-lg font-bold mb-4">Set Ingestion Mode</h3>
          <div className="space-y-3 mb-4">
            {ingestionModes.map((mode) => (
              <button
                key={mode.value}
                className={cn(
                  'w-full flex items-start gap-3 p-3 border rounded-lg text-left transition-colors',
                  selectedIngestionMode === mode.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
                onClick={() => setSelectedIngestionMode(mode.value)}
              >
                <mode.icon className={cn(
                  'h-5 w-5 mt-0.5',
                  selectedIngestionMode === mode.value ? 'text-blue-500' : 'text-slate-400'
                )} />
                <div>
                  <p className="font-medium">{mode.label}</p>
                  <p className="text-sm text-slate-500">{mode.description}</p>
                </div>
                {selectedIngestionMode === mode.value && (
                  <Check className="h-5 w-5 text-blue-500 ml-auto" />
                )}
              </button>
            ))}
          </div>

          {/* SCD Type 2 Config */}
          {selectedIngestionMode === 'scd_type2' && (
            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4">
              <h4 className="font-medium text-sm">SCD Type 2 Configuration</h4>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Effective Date Column</label>
                <select
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 text-sm"
                  value={scdConfig.effectiveDateColumn}
                  onChange={(e) => setScdConfig({ ...scdConfig, effectiveDateColumn: e.target.value })}
                >
                  <option value="">Select column...</option>
                  {columns.filter(c => c.dataType.includes('DATE') || c.dataType.includes('TIMESTAMP')).map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Expiration Date Column</label>
                <select
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 text-sm"
                  value={scdConfig.expirationDateColumn}
                  onChange={(e) => setScdConfig({ ...scdConfig, expirationDateColumn: e.target.value })}
                >
                  <option value="">Select column...</option>
                  {columns.filter(c => c.dataType.includes('DATE') || c.dataType.includes('TIMESTAMP')).map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Current Flag Column</label>
                <select
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 text-sm"
                  value={scdConfig.currentFlagColumn}
                  onChange={(e) => setScdConfig({ ...scdConfig, currentFlagColumn: e.target.value })}
                >
                  <option value="">Select column...</option>
                  {columns.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Incremental Config */}
          {selectedIngestionMode === 'incremental' && (
            <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg mb-4">
              <h4 className="font-medium text-sm">Incremental Configuration</h4>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Incremental Column (watermark)</label>
                <select
                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 text-sm"
                  value={scdConfig.incrementalColumn}
                  onChange={(e) => setScdConfig({ ...scdConfig, incrementalColumn: e.target.value })}
                >
                  <option value="">Select column...</option>
                  {columns.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowIngestionModal(false)}>Cancel</Button>
            <Button onClick={handleIngestionMode}>Apply</Button>
          </div>
        </div>
      </Modal>

      {/* Masking Modal */}
      <Modal isOpen={showMaskingModal} onClose={() => setShowMaskingModal(false)}>
        <div className="p-6 max-w-md">
          <h3 className="text-lg font-bold mb-2">Apply Masking Policy</h3>
          <p className="text-sm text-slate-500 mb-4">
            Apply to {selectedColumns.size} selected column(s)
          </p>
          <div className="space-y-2 mb-4">
            {maskingPolicies.map((policy) => (
              <button
                key={policy.name}
                className={cn(
                  'w-full flex items-center justify-between p-3 border rounded-lg text-left',
                  selectedMaskingPolicy === policy.name
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
                onClick={() => setSelectedMaskingPolicy(policy.name)}
              >
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-500" />
                    {policy.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{policy.description}</p>
                </div>
                <Badge className="bg-slate-100 text-slate-600">{policy.type}</Badge>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowMaskingModal(false)}>Cancel</Button>
            <Button onClick={handleMasking} disabled={!selectedMaskingPolicy}>Apply</Button>
          </div>
        </div>
      </Modal>

      {/* Aggregation Modal */}
      <Modal isOpen={showAggregationModal} onClose={() => setShowAggregationModal(false)}>
        <div className="p-6 max-w-md">
          <h3 className="text-lg font-bold mb-2">Apply Aggregation Policy</h3>
          <p className="text-sm text-slate-500 mb-4">
            Apply to {selectedColumns.size} selected column(s)
          </p>
          <div className="space-y-2 mb-4">
            {aggregationPolicies.map((policy) => (
              <button
                key={policy.name}
                className={cn(
                  'w-full flex items-center justify-between p-3 border rounded-lg text-left',
                  selectedAggregationPolicy === policy.name
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
                onClick={() => setSelectedAggregationPolicy(policy.name)}
              >
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Database className="h-4 w-4 text-cyan-500" />
                    {policy.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{policy.description}</p>
                </div>
                <Badge className="bg-cyan-100 text-cyan-600">{policy.type}</Badge>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAggregationModal(false)}>Cancel</Button>
            <Button onClick={() => {
              toast.success(`Aggregation policy applied`);
              setShowAggregationModal(false);
            }} disabled={!selectedAggregationPolicy}>Apply</Button>
          </div>
        </div>
      </Modal>

      {/* Primary Key Modal */}
      <Modal isOpen={showPrimaryKeyModal} onClose={() => setShowPrimaryKeyModal(false)}>
        <div className="p-6 max-w-md">
          <h3 className="text-lg font-bold mb-4">Set Primary Key</h3>
          <p className="text-sm text-slate-500 mb-4">
            Select one or more columns to form the primary key
          </p>
          <div className="max-h-60 overflow-auto space-y-1 mb-4">
            {columns.map((col) => (
              <button
                key={col.name}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-lg text-left',
                  selectedPrimaryKeys.has(col.name)
                    ? 'bg-amber-50 dark:bg-amber-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
                onClick={() => {
                  const next = new Set(selectedPrimaryKeys);
                  if (next.has(col.name)) {
                    next.delete(col.name);
                  } else {
                    next.add(col.name);
                  }
                  setSelectedPrimaryKeys(next);
                }}
              >
                {selectedPrimaryKeys.has(col.name) ? (
                  <Key className="h-4 w-4 text-amber-500" />
                ) : (
                  <div className="h-4 w-4 border rounded border-slate-300" />
                )}
                <span className="flex-1">{col.name}</span>
                <span className="text-xs text-slate-400 font-mono">{col.dataType}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPrimaryKeyModal(false)}>Cancel</Button>
            <Button onClick={handlePrimaryKey} disabled={selectedPrimaryKeys.size === 0}>
              Set Primary Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Column Rename Modal */}
      <Modal isOpen={showColumnRenameModal} onClose={() => setShowColumnRenameModal(false)}>
        <div className="p-6 max-w-lg">
          <h3 className="text-lg font-bold mb-4">Rename Columns</h3>
          <div className="max-h-80 overflow-auto space-y-2 mb-4">
            {columns.map((col) => (
              <div key={col.name} className="flex items-center gap-2">
                <span className="text-sm text-slate-500 w-32 truncate" title={col.name}>
                  {col.name}
                </span>
                <span className="text-slate-300">→</span>
                <Input
                  value={columnRenames[col.name] || col.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setColumnRenames({ ...columnRenames, [col.name]: e.target.value })
                  }
                  className="flex-1"
                  size="sm"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowColumnRenameModal(false)}>Cancel</Button>
            <Button onClick={handleColumnRename}>
              Apply Renames
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default TableToolbar;
