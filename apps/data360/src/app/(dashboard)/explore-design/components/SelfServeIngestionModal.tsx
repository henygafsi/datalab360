'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip } from 'rizzui';
import {
  ArrowRight, ArrowLeft, Check, Database, Table2, Columns3,
  Settings, Rocket, Loader2, Search, Plus, Trash2, Link2,
  AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Zap,
  Wand2, Eye, Info,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, EventType } from '../stores/event-store';
import DesignDockPanel from './DesignDockPanel';

// ── Types ──────────────────────────────────────────────────────────────────────

type IngestionMode = 'full_refresh' | 'incremental' | 'snapshot' | 'scd_type1' | 'scd_type2' | 'scd_type3';

interface TableRef {
  database: string;
  schema: string;
  table: string;
}

interface ColumnInfo {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

type Transformation = null | 'CONCAT' | 'CONCAT_WS' | 'COALESCE' | 'UPPER' | 'LOWER' | 'TRIM' | 'SUM';

interface ColumnMapping {
  id: string;
  sourceColumns: string[];
  targetColumn: string;
  transformation: Transformation;
}

interface IngestionConfig {
  mode: IngestionMode;
  pkColumns: string[];
  incrementalColumn: string;
  scdEffectiveDate: string;
  scdExpirationDate: string;
  scdCurrentFlag: string;
  whereClause: string;
  warehouse: string;
}

type WizardStep = 'source' | 'target' | 'mapping' | 'config' | 'review';

interface SelfServeIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | null;
  /** Available source tables (from data source / datalake browser) */
  sourceTables?: TableRef[];
  /** Available target tables (from modeling canvas) */
  targetTables?: TableRef[];
  /** Pre-selected source table */
  defaultSource?: TableRef;
  /** Pre-selected target table */
  defaultTarget?: TableRef;
  /** Source column metadata (if known) */
  sourceColumnsFn?: (table: TableRef) => Promise<ColumnInfo[]>;
  /** Target column metadata (from events or API) */
  targetColumnsFn?: (table: TableRef) => Promise<ColumnInfo[]>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const INGESTION_MODES: Array<{ value: IngestionMode; label: string; description: string; icon: string }> = [
  { value: 'full_refresh', label: 'Full Refresh', description: 'Replace all rows every run', icon: '🔄' },
  { value: 'incremental', label: 'Incremental', description: 'Append new/changed rows using a watermark column', icon: '📈' },
  { value: 'scd_type1', label: 'SCD Type 1', description: 'Overwrite — no history', icon: '1️⃣' },
  { value: 'scd_type2', label: 'SCD Type 2', description: 'Track full history with effective dates', icon: '2️⃣' },
  { value: 'snapshot', label: 'Snapshot', description: 'Daily/time-stamped copy of the full table', icon: '📸' },
];

const TRANSFORMATION_OPTIONS: Array<{ value: Transformation; label: string }> = [
  { value: null, label: 'No Transformation' },
  { value: 'UPPER', label: 'UPPER — Uppercase' },
  { value: 'LOWER', label: 'LOWER — Lowercase' },
  { value: 'TRIM', label: 'TRIM — Remove whitespace' },
  { value: 'COALESCE', label: 'COALESCE — First non-null' },
  { value: 'CONCAT', label: 'CONCAT — Concatenate' },
  { value: 'CONCAT_WS', label: 'CONCAT_WS — Concat with separator' },
];

const STEPS: Array<{ key: WizardStep; label: string; icon: React.ComponentType<any> }> = [
  { key: 'source', label: 'Source', icon: Database },
  { key: 'target', label: 'Target', icon: Table2 },
  { key: 'mapping', label: 'Columns', icon: Columns3 },
  { key: 'config', label: 'Config', icon: Settings },
  { key: 'review', label: 'Review', icon: Eye },
];

const STEP_KEYS = STEPS.map(s => s.key);

// ── Component ──────────────────────────────────────────────────────────────────

const SelfServeIngestionModal: React.FC<SelfServeIngestionModalProps> = ({
  isOpen,
  onClose,
  projectId,
  sourceTables = [],
  targetTables = [],
  defaultSource,
  defaultTarget,
  sourceColumnsFn,
  targetColumnsFn,
}) => {
  const { events, addEvent } = useEventStore(projectId);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('source');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Source
  const [sourceTable, setSourceTable] = useState<TableRef | null>(defaultSource || null);
  const [sourceSearch, setSourceSearch] = useState('');

  // Step 2: Target
  const [targetTable, setTargetTable] = useState<TableRef | null>(defaultTarget || null);
  const [targetSearch, setTargetSearch] = useState('');

  // Step 3: Column Mappings
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [sourceColumns, setSourceColumns] = useState<ColumnInfo[]>([]);
  const [targetColumns, setTargetColumns] = useState<ColumnInfo[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);

  // Step 4: Ingestion Config
  const [config, setConfig] = useState<IngestionConfig>({
    mode: 'full_refresh',
    pkColumns: [],
    incrementalColumn: '',
    scdEffectiveDate: 'EFF_DATE',
    scdExpirationDate: 'EXP_DATE',
    scdCurrentFlag: 'IS_CURRENT',
    whereClause: '',
    warehouse: 'COMPUTE_WH',
  });

  // Derive available tables from events if not provided
  const derivedSourceTables = useMemo(() => {
    if (sourceTables.length > 0) return sourceTables;
    const seen = new Map<string, TableRef>();
    for (const ev of events) {
      if (ev.type === 'TABLE_ADDED_TO_MODELING' || ev.type === 'SCHEMA_SELECTED') {
        const t = ev.target;
        if (t?.table) {
          const key = `${t.database}.${t.schema}.${t.table}`;
          if (!seen.has(key)) seen.set(key, { database: t.database, schema: t.schema, table: t.table });
        }
      }
    }
    return Array.from(seen.values());
  }, [sourceTables, events]);

  const derivedTargetTables = useMemo(() => {
    if (targetTables.length > 0) return targetTables;
    const seen = new Map<string, TableRef>();
    for (const ev of events) {
      if (ev.type === 'TABLE_CREATED' || ev.type === 'ADD_COLUMN') {
        const t = ev.target;
        if (t?.table && t.table !== t.schema) {
          const key = `${t.database}.${t.schema}.${t.table}`;
          if (!seen.has(key)) seen.set(key, { database: t.database, schema: t.schema, table: t.table });
        }
      }
    }
    return Array.from(seen.values());
  }, [targetTables, events]);

  // Derive columns from events when no external fn provided
  const deriveColumnsFromEvents = useCallback((table: TableRef): ColumnInfo[] => {
    const cols: ColumnInfo[] = [];
    for (const ev of events) {
      if (ev.type === 'ADD_COLUMN' &&
          ev.target.database === table.database &&
          ev.target.schema === table.schema &&
          ev.target.table === table.table) {
        const name = ev.payload?.columnName || ev.payload?.name;
        const dataType = ev.payload?.columnType || ev.payload?.dataType || 'VARCHAR';
        if (name && !cols.some(c => c.name === name)) {
          cols.push({ name, dataType, isNullable: ev.payload?.nullable !== false });
        }
      }
      if (ev.type === 'PRIMARY_KEY_SET' &&
          ev.target.database === table.database &&
          ev.target.schema === table.schema &&
          ev.target.table === table.table) {
        const pkCols = ev.payload?.columns || [];
        for (const pk of pkCols) {
          const col = cols.find(c => c.name === pk);
          if (col) col.isPrimaryKey = true;
        }
      }
    }
    return cols;
  }, [events]);

  // Load columns when source/target changes
  const loadColumns = useCallback(async () => {
    setIsLoadingColumns(true);
    try {
      const [srcCols, tgtCols] = await Promise.all([
        sourceTable
          ? (sourceColumnsFn ? sourceColumnsFn(sourceTable) : Promise.resolve(deriveColumnsFromEvents(sourceTable)))
          : Promise.resolve([]),
        targetTable
          ? (targetColumnsFn ? targetColumnsFn(targetTable) : Promise.resolve(deriveColumnsFromEvents(targetTable)))
          : Promise.resolve([]),
      ]);
      setSourceColumns(srcCols);
      setTargetColumns(tgtCols);

      // Auto-map by name match
      if (mappings.length === 0 && srcCols.length > 0 && tgtCols.length > 0) {
        const autoMapped: ColumnMapping[] = [];
        for (const tgt of tgtCols) {
          const match = srcCols.find(s => s.name.toUpperCase() === tgt.name.toUpperCase());
          if (match) {
            autoMapped.push({
              id: `map_${autoMapped.length}`,
              sourceColumns: [match.name],
              targetColumn: tgt.name,
              transformation: null,
            });
          }
        }
        if (autoMapped.length > 0) {
          setMappings(autoMapped);
          toast.success(`Auto-mapped ${autoMapped.length} column(s) by name`);
        }
      }
    } catch {
      toast.error('Failed to load column metadata');
    } finally {
      setIsLoadingColumns(false);
    }
  }, [sourceTable, targetTable, sourceColumnsFn, targetColumnsFn, deriveColumnsFromEvents, mappings.length]);

  // Navigate steps
  const stepIdx = STEP_KEYS.indexOf(step);

  const goNext = useCallback(() => {
    if (step === 'source' && !sourceTable) { toast.error('Select a source table'); return; }
    if (step === 'target' && !targetTable) { toast.error('Select a target table'); return; }
    if (step === 'mapping' && mappings.length === 0) { toast.error('Add at least one column mapping'); return; }

    const nextIdx = stepIdx + 1;
    if (nextIdx < STEP_KEYS.length) {
      const nextStep = STEP_KEYS[nextIdx];
      // Load columns when entering mapping step
      if (nextStep === 'mapping') loadColumns();
      setStep(nextStep);
    }
  }, [step, stepIdx, sourceTable, targetTable, mappings.length, loadColumns]);

  const goBack = useCallback(() => {
    const prevIdx = stepIdx - 1;
    if (prevIdx >= 0) setStep(STEP_KEYS[prevIdx]);
  }, [stepIdx]);

  // Add a new empty mapping row
  const addMapping = useCallback(() => {
    setMappings(prev => [...prev, {
      id: `map_${Date.now()}`,
      sourceColumns: [],
      targetColumn: '',
      transformation: null,
    }]);
  }, []);

  const removeMapping = useCallback((id: string) => {
    setMappings(prev => prev.filter(m => m.id !== id));
  }, []);

  const updateMapping = useCallback((id: string, updates: Partial<ColumnMapping>) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  // Submit: create COLUMN_MAPPING_CREATED + INGESTION_MODE_SET events
  const handleSubmit = useCallback(async () => {
    if (!sourceTable || !targetTable || mappings.length === 0) return;
    setIsSubmitting(true);

    try {
      // Create column mapping events
      for (const mapping of mappings) {
        addEvent({
          type: 'COLUMN_MAPPING_CREATED' as EventType,
          projectId: projectId || undefined,
          target: {
            database: targetTable.database,
            schema: targetTable.schema,
            table: targetTable.table,
          },
          payload: {
            source: {
              database: sourceTable.database,
              schema: sourceTable.schema,
              table: sourceTable.table,
              columns: mapping.sourceColumns,
            },
            target: {
              database: targetTable.database,
              schema: targetTable.schema,
              table: targetTable.table,
              column: mapping.targetColumn,
            },
            transformation: mapping.transformation || null,
          },
        });
      }

      // Create ingestion mode event
      addEvent({
        type: 'INGESTION_MODE_SET' as EventType,
        projectId: projectId || undefined,
        target: {
          database: targetTable.database,
          schema: targetTable.schema,
          table: targetTable.table,
        },
        payload: {
          mode: config.mode,
          config: {
            pkColumns: config.pkColumns,
            incrementalColumn: config.incrementalColumn || undefined,
            effectiveDateColumn: config.mode === 'scd_type2' ? config.scdEffectiveDate : undefined,
            expirationDateColumn: config.mode === 'scd_type2' ? config.scdExpirationDate : undefined,
            currentFlagColumn: config.mode === 'scd_type2' ? config.scdCurrentFlag : undefined,
            whereClause: config.whereClause || undefined,
            warehouse: config.warehouse,
          },
        },
      });

      toast.success(`Ingestion configured: ${mappings.length} mapping(s) from ${sourceTable.table} → ${targetTable.table}`);
      onClose();
    } catch {
      toast.error('Failed to create ingestion events');
    } finally {
      setIsSubmitting(false);
    }
  }, [sourceTable, targetTable, mappings, config, addEvent, projectId, onClose]);

  // Filtered table lists
  const filteredSourceTables = useMemo(() => {
    if (!sourceSearch) return derivedSourceTables;
    const q = sourceSearch.toLowerCase();
    return derivedSourceTables.filter(t =>
      t.table.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
    );
  }, [derivedSourceTables, sourceSearch]);

  const filteredTargetTables = useMemo(() => {
    if (!targetSearch) return derivedTargetTables;
    const q = targetSearch.toLowerCase();
    return derivedTargetTables.filter(t =>
      t.table.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
    );
  }, [derivedTargetTables, targetSearch]);

  // Table picker helper
  const renderTablePicker = (
    tables: TableRef[],
    selected: TableRef | null,
    onSelect: (t: TableRef) => void,
    search: string,
    onSearch: (q: string) => void,
    label: string,
  ) => (
    <div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{label}</p>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search tables..."
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-slate-800 dark:border-slate-700"
        />
      </div>
      <div className="max-h-[300px] overflow-auto space-y-1">
        {tables.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No tables available
          </div>
        ) : (
          tables.map((t) => {
            const key = `${t.database}.${t.schema}.${t.table}`;
            const isSelected = selected && `${selected.database}.${selected.schema}.${selected.table}` === key;
            return (
              <button
                key={key}
                onClick={() => onSelect(t)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm',
                  isSelected
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-400'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <div className="flex items-center gap-2">
                  <Table2 className={cn('h-4 w-4', isSelected ? 'text-blue-500' : 'text-slate-400')} />
                  <span className="font-mono font-medium">{t.table}</span>
                  {isSelected && <Check className="h-4 w-4 text-blue-500 ml-auto" />}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 ml-6 font-mono">
                  {t.database}.{t.schema}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Self-Serve Ingestion"
      subtitle="Configure source → target column mappings & ingestion mode"
      widthClass="max-w-2xl"
      icon={
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <Columns3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-between">
          <div>
            {stepIdx > 0 && (
              <Button variant="outline" onClick={goBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {step !== 'review' ? (
              <Button onClick={goNext} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Create Ingestion ({mappings.length} mappings)
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col">
        {/* Step Progress */}
        <div className="px-1 py-3 mb-2 border-b dark:border-slate-700">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <React.Fragment key={s.key}>
                <button
                  onClick={() => idx < stepIdx && setStep(s.key)}
                  disabled={idx >= stepIdx}
                  className="flex items-center gap-1.5"
                >
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors',
                    step === s.key ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                      : idx < stepIdx ? 'bg-green-500 text-white cursor-pointer'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-400',
                  )}>
                    {idx < stepIdx ? <Check className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
                  </div>
                  <span className={cn(
                    'text-xs font-medium hidden sm:inline',
                    step === s.key ? 'text-emerald-600' : idx < stepIdx ? 'text-green-600' : 'text-slate-400',
                  )}>
                    {s.label}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn('flex-1 h-0.5 mx-1', idx < stepIdx ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700')} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="pt-4">
          {/* Step 1: Source Table */}
          {step === 'source' && renderTablePicker(
            filteredSourceTables, sourceTable,
            (t) => setSourceTable(t),
            sourceSearch, setSourceSearch,
            'Select Source Table (where data comes from)',
          )}

          {/* Step 2: Target Table */}
          {step === 'target' && renderTablePicker(
            filteredTargetTables, targetTable,
            (t) => setTargetTable(t),
            targetSearch, setTargetSearch,
            'Select Target Table (where data goes to)',
          )}

          {/* Step 3: Column Mappings */}
          {step === 'mapping' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Column Mappings
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    {sourceTable?.table} → {targetTable?.table}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={loadColumns} disabled={isLoadingColumns} className="gap-1 text-xs">
                    <Wand2 className="h-3 w-3" />
                    Auto-Map
                  </Button>
                  <Button variant="outline" size="sm" onClick={addMapping} className="gap-1 text-xs">
                    <Plus className="h-3 w-3" />
                    Add Row
                  </Button>
                </div>
              </div>

              {isLoadingColumns ? (
                <div className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  <p className="text-sm text-slate-400 mt-2">Loading columns...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 px-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    <span>Source Column(s)</span>
                    <span></span>
                    <span>Target Column</span>
                    <span>Transform</span>
                    <span></span>
                  </div>

                  {mappings.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg text-slate-400">
                      <Link2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No mappings yet</p>
                      <p className="text-xs mt-1">Click "Auto-Map" or "Add Row" to start</p>
                    </div>
                  ) : (
                    mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg px-2 py-1.5"
                      >
                        {/* Source columns (multi-select) */}
                        <select
                          value={mapping.sourceColumns[0] || ''}
                          onChange={(e) => updateMapping(mapping.id, { sourceColumns: e.target.value ? [e.target.value] : [] })}
                          className="px-2 py-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                        >
                          <option value="">-- source --</option>
                          {sourceColumns.map(c => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.dataType})
                            </option>
                          ))}
                        </select>

                        <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />

                        {/* Target column */}
                        <select
                          value={mapping.targetColumn}
                          onChange={(e) => updateMapping(mapping.id, { targetColumn: e.target.value })}
                          className="px-2 py-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                        >
                          <option value="">-- target --</option>
                          {targetColumns.map(c => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.dataType})
                            </option>
                          ))}
                        </select>

                        {/* Transformation */}
                        <select
                          value={mapping.transformation || ''}
                          onChange={(e) => updateMapping(mapping.id, { transformation: (e.target.value || null) as Transformation })}
                          className="px-2 py-1 text-[10px] border rounded dark:bg-slate-800 dark:border-slate-700 w-28"
                        >
                          {TRANSFORMATION_OPTIONS.map(o => (
                            <option key={o.value || ''} value={o.value || ''}>{o.label}</option>
                          ))}
                        </select>

                        <button
                          onClick={() => removeMapping(mapping.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Mapping summary */}
              {mappings.length > 0 && (
                <div className="mt-3 p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  {mappings.length} mapping(s) configured. Unmapped source columns will be ignored.
                </div>
              )}
            </div>
          )}

          {/* Step 4: Ingestion Config */}
          {step === 'config' && (
            <div className="space-y-5">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ingestion Mode
              </p>

              {/* Mode grid */}
              <div className="grid grid-cols-2 gap-2">
                {INGESTION_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setConfig(prev => ({ ...prev, mode: m.value }))}
                    className={cn(
                      'text-left p-3 rounded-lg border transition-all',
                      config.mode === m.value
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{m.icon}</span>
                      <span className="text-sm font-medium">{m.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{m.description}</p>
                  </button>
                ))}
              </div>

              {/* Mode-specific config */}
              {config.mode === 'incremental' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-slate-600">Incremental Settings</p>
                  <div>
                    <label className="text-[10px] text-slate-500">Watermark Column</label>
                    <select
                      value={config.incrementalColumn}
                      onChange={(e) => setConfig(prev => ({ ...prev, incrementalColumn: e.target.value }))}
                      className="w-full mt-0.5 px-2 py-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                    >
                      <option value="">-- select column --</option>
                      {targetColumns.filter(c => c.dataType.includes('TIMESTAMP') || c.dataType.includes('DATE') || c.dataType.includes('NUMBER')).map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {config.mode === 'scd_type2' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-slate-600">SCD Type 2 Settings</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500">Effective Date Col</label>
                      <Input size="sm" value={config.scdEffectiveDate} onChange={(e) => setConfig(prev => ({ ...prev, scdEffectiveDate: e.target.value }))} className="mt-0.5 font-mono text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Expiration Date Col</label>
                      <Input size="sm" value={config.scdExpirationDate} onChange={(e) => setConfig(prev => ({ ...prev, scdExpirationDate: e.target.value }))} className="mt-0.5 font-mono text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Current Flag Col</label>
                      <Input size="sm" value={config.scdCurrentFlag} onChange={(e) => setConfig(prev => ({ ...prev, scdCurrentFlag: e.target.value }))} className="mt-0.5 font-mono text-xs" />
                    </div>
                  </div>
                </div>
              )}

              {/* PK Columns */}
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Primary Key Columns (for MERGE)</p>
                <div className="flex flex-wrap gap-1.5">
                  {targetColumns.map(c => {
                    const isSelected = config.pkColumns.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        onClick={() => setConfig(prev => ({
                          ...prev,
                          pkColumns: isSelected
                            ? prev.pkColumns.filter(p => p !== c.name)
                            : [...prev.pkColumns, c.name],
                        }))}
                        className={cn(
                          'px-2 py-1 text-[10px] rounded-full border font-mono transition-colors',
                          isSelected
                            ? 'border-emerald-400 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-emerald-300',
                        )}
                      >
                        {c.isPrimaryKey && '🔑 '}{c.name}
                      </button>
                    );
                  })}
                  {targetColumns.length === 0 && (
                    <p className="text-xs text-slate-400">No target columns available</p>
                  )}
                </div>
              </div>

              {/* WHERE clause */}
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">WHERE Clause (optional filter)</p>
                <textarea
                  value={config.whereClause}
                  onChange={(e) => setConfig(prev => ({ ...prev, whereClause: e.target.value }))}
                  placeholder="e.g., STATUS = 'ACTIVE' AND CREATED_AT > '2024-01-01'"
                  className="w-full px-3 py-2 text-xs font-mono border rounded-lg dark:bg-slate-800 dark:border-slate-700 min-h-[60px]"
                />
              </div>

              {/* Warehouse */}
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Warehouse</p>
                <Input
                  size="sm"
                  value={config.warehouse}
                  onChange={(e) => setConfig(prev => ({ ...prev, warehouse: e.target.value }))}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Review Ingestion Configuration</p>

              {/* Source → Target summary */}
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="flex-1 text-center">
                  <Badge className="bg-blue-100 text-blue-700 mb-1">Source</Badge>
                  <p className="font-mono text-sm font-bold">{sourceTable?.table}</p>
                  <p className="text-[10px] text-slate-400">{sourceTable?.database}.{sourceTable?.schema}</p>
                </div>
                <ArrowRight className="h-6 w-6 text-emerald-500 flex-shrink-0" />
                <div className="flex-1 text-center">
                  <Badge className="bg-green-100 text-green-700 mb-1">Target</Badge>
                  <p className="font-mono text-sm font-bold">{targetTable?.table}</p>
                  <p className="text-[10px] text-slate-400">{targetTable?.database}.{targetTable?.schema}</p>
                </div>
              </div>

              {/* Mode */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {INGESTION_MODES.find(m => m.value === config.mode)?.icon}{' '}
                  Mode: {INGESTION_MODES.find(m => m.value === config.mode)?.label}
                </p>
                {config.pkColumns.length > 0 && (
                  <p className="text-[10px] text-emerald-600 mt-1">PK: {config.pkColumns.join(', ')}</p>
                )}
                {config.whereClause && (
                  <p className="text-[10px] text-emerald-600 mt-0.5 font-mono">WHERE {config.whereClause}</p>
                )}
              </div>

              {/* Mappings table */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">{mappings.length} Column Mapping(s)</p>
                <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">#</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Source</th>
                        <th className="px-3 py-2 text-center text-slate-500 font-medium"></th>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Target</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Transform</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-700">
                      {mappings.map((m, idx) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-mono text-blue-600">{m.sourceColumns.join(', ') || '—'}</td>
                          <td className="px-3 py-2 text-center"><ArrowRight className="h-3 w-3 text-emerald-400 inline" /></td>
                          <td className="px-3 py-2 font-mono text-green-600">{m.targetColumn || '—'}</td>
                          <td className="px-3 py-2 text-slate-400">{m.transformation || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DesignDockPanel>
  );
};

export default SelfServeIngestionModal;
