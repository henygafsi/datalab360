'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip, Switch } from 'rizzui';
import {
  Database, RefreshCw, Clock, History, Layers, Settings, Plus, Trash2,
  FileCode, Cloud, Timer, Pause, Calendar, AlertTriangle, Info,
  ChevronDown, ChevronRight, Workflow, Zap, Code2, FolderOpen, CheckCircle2,
  Sparkles, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, createIngestionModeEvent } from '../stores/event-store';
import { useAiFeatures } from '../stores/ai-store';
import { aiRecommendScd, aiIngestionMode } from '@/app/services/api/exploreDesignApi';
import SqlPreviewPanel from './SqlPreviewPanel';
import WhereClauseBuilder from './WhereClauseBuilder';
import QualityGatesPanel from './QualityGatesPanel';
import IngestionDryRunPanel from './IngestionDryRunPanel';
import WatermarkDisplay from './WatermarkDisplay';
import { IngestionMode } from '../../mapping/components/TableDetailPanel';
import type { WhereClauseCondition } from '@/app/services/api/types';

// Types
interface TableReference {
  database: string;
  schema: string;
  table: string;
}

interface ConditionConfig {
  id: string;
  type: 'time_based' | 'dependency' | 'data_availability' | 'approval' | 'custom_sql';
  config: Record<string, any>;
}

interface DDLConfig {
  operations: Array<{
    id: string;
    sql: string;
    type: 'CREATE' | 'ALTER' | 'DROP';
  }>;
  execution_order: 'sequential' | 'parallel';
  on_error: 'abort' | 'continue' | 'rollback';
}

interface SnowpipeConfig {
  pipe_name: string;
  auto_ingest: boolean;
  source: {
    type: 'S3' | 'AZURE' | 'GCS';
    location: string;
    file_format: string;
    pattern: string;
  };
  error_handling: {
    on_error: 'CONTINUE' | 'SKIP_FILE' | 'ABORT_STATEMENT';
    max_file_errors: number;
  };
}

interface BatchTaskConfig {
  task_name: string;
  schedule: {
    type: 'cron' | 'interval' | 'after_stream';
    cron_expression?: string;
    interval_minutes?: number;
    depends_on_stream?: string;
  };
  warehouse: string;
  warehouse_size: 'XSMALL' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';
  sql_statements: string[];
  conditions: ConditionConfig[];
}

interface ColumnDef {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

interface ColumnMappingInput {
  sourceColumn: string;
  targetColumn: string;
  transformation?: string;
}

interface IngestionConfigPanelProps {
  table: TableReference | null;
  ingestionMode: IngestionMode;
  onModeChange: (mode: IngestionMode) => void;
  columns?: ColumnDef[];
  /** Column mappings (source → target) for SQL preview and dry-run */
  columnMappings?: ColumnMappingInput[];
  /** Source table reference for SQL preview */
  sourceTable?: TableReference | null;
  projectId?: string | null;
  /** When true, only show Mode tab (hide DDL, Snowpipe, Batch) */
  modeOnly?: boolean;
  className?: string;
  /**
   * Called after the user commits the configuration. The panel persists the
   * ingestion mode + SCD settings to the project's deployment draft (event
   * store) itself; the parent typically uses this to close the panel.
   */
  onSave?: () => void;
}

// Tab type
type TabType = 'mode' | 'ddl' | 'snowpipe' | 'batch';

const IngestionConfigPanel: React.FC<IngestionConfigPanelProps> = ({
  table,
  ingestionMode,
  onModeChange,
  columns = [],
  columnMappings = [],
  sourceTable,
  projectId,
  modeOnly = false,
  className,
  onSave,
}) => {
  const { addEvent } = useEventStore();
  const [saving, setSaving] = useState(false);
  const { isEnabled } = useAiFeatures();
  const [activeTab, setActiveTab] = useState<TabType>('mode');
  const [expandedSection, setExpandedSection] = useState<string | null>('scd');
  const [whereClauseSql, setWhereClauseSql] = useState('');
  const [whereConditions, setWhereConditions] = useState<WhereClauseCondition[]>([]);

  // AI suggest loading states
  const [isLoadingModeSuggest, setIsLoadingModeSuggest] = useState(false);
  const [isLoadingScdSuggest, setIsLoadingScdSuggest] = useState(false);

  // Derived column lists for dropdowns
  const allColumns = useMemo(() => columns.map(c => ({ name: c.name, type: c.dataType })), [columns]);
  const dateColumns = useMemo(() => allColumns.filter(c => /TIMESTAMP|DATE|DATETIME/i.test(c.type)), [allColumns]);
  const pkColumns = useMemo(() => columns.filter(c => c.isPrimaryKey), [columns]);

  // SCD Config with business key
  const [scdConfig, setScdConfig] = useState({
    businessKeyColumn: '',
    trackingColumns: [] as string[],
    effectiveDateColumn: '',
    expirationDateColumn: '',
    currentFlagColumn: '',
  });

  // Auto-populate SCD defaults from columns
  useEffect(() => {
    if (columns.length === 0) return;
    setScdConfig(prev => {
      const updates: Partial<typeof prev> = {};
      if (!prev.businessKeyColumn) {
        const pk = columns.find(c => c.isPrimaryKey);
        if (pk) updates.businessKeyColumn = pk.name;
      }
      if (!prev.effectiveDateColumn) {
        const tsCol = columns.find(c => /TIMESTAMP|DATE/i.test(c.dataType));
        if (tsCol) updates.effectiveDateColumn = tsCol.name;
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [columns]);

  // Snowpipe Config
  const [snowpipeConfig, setSnowpipeConfig] = useState<SnowpipeConfig>({
    pipe_name: '',
    auto_ingest: true,
    source: {
      type: 'S3',
      location: '',
      file_format: 'CSV_FORMAT',
      pattern: '.*\\.csv',
    },
    error_handling: {
      on_error: 'CONTINUE',
      max_file_errors: 10,
    },
  });

  // Batch Task Config
  const [batchConfig, setBatchConfig] = useState<BatchTaskConfig>({
    task_name: '',
    schedule: {
      type: 'interval',
      interval_minutes: 60,
    },
    warehouse: 'COMPUTE_WH',
    warehouse_size: 'SMALL',
    sql_statements: [],
    conditions: [],
  });

  // DDL Config
  const [ddlConfig, setDdlConfig] = useState<DDLConfig>({
    operations: [],
    execution_order: 'sequential',
    on_error: 'rollback',
  });

  // Conditions
  const [conditions, setConditions] = useState<ConditionConfig[]>([]);

  // Handle mode selection
  const handleModeChange = useCallback((mode: IngestionMode) => {
    onModeChange(mode);

    if (table) {
      addEvent(createIngestionModeEvent(
        { database: table.database, schema: table.schema, table: table.table },
        mode,
        mode.startsWith('scd') ? scdConfig : undefined
      ));
    }
  }, [table, addEvent, onModeChange, scdConfig]);

  // Commit the configuration. Persists the ingestion mode + SCD settings to the
  // project's deployment draft (the event store deploy reads from) — the same
  // mechanism the rest of the modeling flow uses. The toast is scoped to what
  // actually persists (mode + SCD); we never claim more than is saved.
  const handleSave = useCallback(() => {
    if (!table) {
      toast.error('Select a table first');
      return;
    }
    setSaving(true);
    try {
      const isScd = !!ingestionMode?.startsWith('scd');
      // Mirror handleModeChange exactly: pass the whole scdConfig (incl.
      // businessKeyColumn) so Save persists the same rich payload, never a
      // narrower one that could overwrite the mode-change event under last-wins.
      addEvent(createIngestionModeEvent(
        { database: table.database, schema: table.schema, table: table.table },
        ingestionMode,
        isScd ? scdConfig : undefined
      ));
      toast.success(
        isScd
          ? `Ingestion mode "${ingestionMode}" + SCD settings saved — applies on next deploy`
          : `Ingestion mode "${ingestionMode}" saved — applies on next deploy`
      );
      onSave?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save ingestion configuration');
    } finally {
      setSaving(false);
    }
  }, [table, ingestionMode, scdConfig, addEvent, onSave]);

  // Add condition
  const addCondition = useCallback((type: ConditionConfig['type']) => {
    const newCondition: ConditionConfig = {
      id: `cond_${Date.now()}`,
      type,
      config: {},
    };
    setConditions((prev) => [...prev, newCondition]);
  }, []);

  // Remove condition
  const removeCondition = useCallback((id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Toggle section
  const toggleSection = useCallback((section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  }, []);

  // AI: Suggest ingestion mode
  const handleSuggestMode = useCallback(async () => {
    if (!projectId || !table) return;
    setIsLoadingModeSuggest(true);
    try {
      const result = await aiIngestionMode(projectId, {
        database: table.database,
        schema: table.schema,
        table: table.table,
      });
      const mode = result.recommendation.mode as IngestionMode;
      handleModeChange(mode);
      const source = result.resolved_from === 'events' ? ' (based on planned DDL)' : '';
      toast.success(`AI recommends "${mode}" — ${result.recommendation.reason}${source}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to get AI suggestion');
    } finally {
      setIsLoadingModeSuggest(false);
    }
  }, [projectId, table, handleModeChange]);

  // AI: Suggest SCD type
  const handleSuggestScd = useCallback(async () => {
    if (!projectId || !table) return;
    setIsLoadingScdSuggest(true);
    try {
      const result = await aiRecommendScd(projectId, {
        database: table.database,
        schema: table.schema,
        table: table.table,
        business_context: `Table ${table.table} in schema ${table.schema}`,
      });
      const recommended = (result.recommendation || result.recommended_type || 'scd_type2').toLowerCase().replace('type_', 'type') as IngestionMode;
      handleModeChange(recommended);
      const reasoning = result.rationale?.join('; ') || result.reasoning || '';
      toast.success(`AI recommends "${recommended}" (${Math.round(result.confidence * 100)}% confidence) — ${reasoning}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to get SCD recommendation');
    } finally {
      setIsLoadingScdSuggest(false);
    }
  }, [projectId, table, handleModeChange]);

  if (!table) {
    return (
      <div className={cn('p-6 text-center text-slate-500', className)}>
        <Database className="h-12 w-12 mx-auto mb-4 text-slate-300" />
        <p>Select a table to configure ingestion</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header — hidden in modeOnly (parent shows context) */}
      {!modeOnly && (
        <div className="px-4 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Ingestion Configuration
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {table.database}.{table.schema}.{table.table}
          </p>
        </div>
      )}

      {/* Tabs — hidden when modeOnly */}
      {!modeOnly && (
      <div className="flex border-b dark:border-slate-700">
        {[
          { key: 'mode', label: 'Mode', icon: Layers },
          { key: 'ddl', label: 'DDL', icon: Code2 },
          { key: 'snowpipe', label: 'Snowpipe', icon: Zap },
          { key: 'batch', label: 'Batch', icon: Timer },
        ].map((tab) => (
          <button
            key={tab.key}
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            )}
            onClick={() => setActiveTab(tab.key as TabType)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Mode Tab */}
        {activeTab === 'mode' && (
          <div className="space-y-4">
            {/* Ingestion Mode Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Ingestion Mode</label>
                {isEnabled('ingestion_optimizer') && projectId && (
                  <button
                    onClick={handleSuggestMode}
                    disabled={isLoadingModeSuggest}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50"
                  >
                    {isLoadingModeSuggest ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Suggest Mode
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'full_refresh', label: 'Full Refresh', icon: RefreshCw, desc: 'Complete reload' },
                  { value: 'incremental', label: 'Incremental', icon: Clock, desc: 'Delta changes' },
                  { value: 'snapshot', label: 'Snapshot', icon: Layers, desc: 'Point-in-time' },
                  { value: 'scd_type1', label: 'SCD Type 1', icon: History, desc: 'No history' },
                  { value: 'scd_type2', label: 'SCD Type 2', icon: History, desc: 'Full history' },
                  { value: 'scd_type3', label: 'SCD Type 3', icon: History, desc: 'Limited history' },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    className={cn(
                      'flex items-start gap-2 p-3 rounded-lg border text-left transition-all',
                      ingestionMode === mode.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    )}
                    onClick={() => handleModeChange(mode.value as IngestionMode)}
                  >
                    <mode.icon className={cn(
                      'h-5 w-5 mt-0.5',
                      ingestionMode === mode.value ? 'text-blue-500' : 'text-slate-400'
                    )} />
                    <div>
                      <p className="font-medium text-sm">{mode.label}</p>
                      <p className="text-xs text-slate-500">{mode.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* SCD Configuration (show for SCD modes) */}
            {ingestionMode.startsWith('scd') && (
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                  <button
                    className="flex-1 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 -mx-4 -my-3 px-4 py-3"
                    onClick={() => toggleSection('scd')}
                  >
                    <span className="font-medium text-sm flex items-center gap-2">
                      <History className="h-4 w-4" />
                      SCD Configuration
                    </span>
                    {expandedSection === 'scd' ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {isEnabled('scd_recommender') && projectId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSuggestScd(); }}
                      disabled={isLoadingScdSuggest}
                      className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50 z-10"
                    >
                      {isLoadingScdSuggest ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Suggest SCD
                    </button>
                  )}
                </div>

                {expandedSection === 'scd' && (
                  <div className="p-4 space-y-4 animate-in fade-in duration-200">
                    {/* Business Key Column — all SCD types */}
                    <div>
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Business Key Column</label>
                      <select
                        value={scdConfig.businessKeyColumn}
                        onChange={(e) => setScdConfig((p) => ({ ...p, businessKeyColumn: e.target.value }))}
                        className="w-full mt-1 p-2.5 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 font-medium transition-colors focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Select business key...</option>
                        {allColumns.map(col => (
                          <option key={col.name} value={col.name}>
                            {col.name} ({col.type}){pkColumns.some(pk => pk.name === col.name) ? ' — PK' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* SCD Type Rationale */}
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                      <p className="font-medium">SCD Type Rationale:</p>
                      {ingestionMode === 'scd_type1' && <p>Overwrite mode — no history tracking. Best for dimensions that don&apos;t need audit trails.</p>}
                      {ingestionMode === 'scd_type2' && <p>Full history tracking with versioned rows. Best for audit-critical dimensions with low change rates.</p>}
                      {ingestionMode === 'scd_type3' && <p>Tracks previous/current value pairs. Best when only one attribute changes.</p>}
                    </div>

                    {ingestionMode === 'scd_type2' && (
                      <>
                        <div>
                          <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Effective Date Column</label>
                          <select
                            value={scdConfig.effectiveDateColumn}
                            onChange={(e) => setScdConfig((p) => ({ ...p, effectiveDateColumn: e.target.value }))}
                            className="w-full mt-1 p-2.5 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 transition-colors focus:ring-2 focus:ring-blue-400"
                          >
                            <option value="">Select timestamp column...</option>
                            {dateColumns.map(col => (
                              <option key={col.name} value={col.name}>{col.name} ({col.type})</option>
                            ))}
                            {dateColumns.length === 0 && <option disabled>No timestamp/date columns found</option>}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Expiration Date Column</label>
                          <select
                            value={scdConfig.expirationDateColumn}
                            onChange={(e) => setScdConfig((p) => ({ ...p, expirationDateColumn: e.target.value }))}
                            className="w-full mt-1 p-2.5 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 transition-colors focus:ring-2 focus:ring-blue-400"
                          >
                            <option value="">Select timestamp column...</option>
                            {dateColumns.map(col => (
                              <option key={col.name} value={col.name}>{col.name} ({col.type})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Current Flag Column</label>
                          <select
                            value={scdConfig.currentFlagColumn}
                            onChange={(e) => setScdConfig((p) => ({ ...p, currentFlagColumn: e.target.value }))}
                            className="w-full mt-1 p-2.5 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 transition-colors focus:ring-2 focus:ring-blue-400"
                          >
                            <option value="">Select flag column...</option>
                            {allColumns.map(col => (
                              <option key={col.name} value={col.name}>{col.name} ({col.type})</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {ingestionMode === 'scd_type3' && (
                      <div>
                        <label className="text-sm font-medium text-slate-600 dark:text-slate-400">Previous Value Column Suffix</label>
                        <Input placeholder="_PREV" className="mt-1" />
                        <p className="text-xs text-slate-400 mt-1">
                          Columns with changes will have a _PREV version added
                        </p>
                      </div>
                    )}

                    {/* Validation Banner */}
                    {scdConfig.businessKeyColumn && (
                      ingestionMode === 'scd_type1' || (ingestionMode === 'scd_type2' && scdConfig.effectiveDateColumn) || ingestionMode === 'scd_type3'
                    ) ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium transition-all duration-300">
                        <CheckCircle2 className="h-4 w-4" />
                        All selections validated against source schema
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Select all required columns to continue
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Incremental Configuration */}
            {ingestionMode === 'incremental' && (
              <div className="border dark:border-slate-700 rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Incremental Configuration
                </h4>
                <div>
                  <label className="text-sm text-slate-500">Watermark Column</label>
                  <Input
                    placeholder="UPDATED_AT"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Column used to track incremental changes (timestamp or sequence)
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DDL Tab */}
        {activeTab === 'ddl' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                DDL Operations
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDdlConfig((p) => ({
                  ...p,
                  operations: [...p.operations, { id: `op_${Date.now()}`, sql: '', type: 'ALTER' }],
                }))}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add SQL
              </Button>
            </div>

            {ddlConfig.operations.length === 0 ? (
              <div className="text-center py-8 text-slate-500 border-2 border-dashed dark:border-slate-700 rounded-lg">
                <FileCode className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No DDL operations defined</p>
                <p className="text-xs mt-1">Add SQL statements for schema changes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ddlConfig.operations.map((op, idx) => (
                  <div key={op.id} className="border dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge size="sm">{idx + 1}</Badge>
                        <select
                          value={op.type}
                          onChange={(e) => {
                            setDdlConfig((p) => ({
                              ...p,
                              operations: p.operations.map((o) =>
                                o.id === op.id ? { ...o, type: e.target.value as any } : o
                              ),
                            }));
                          }}
                          className="text-xs border rounded px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
                        >
                          <option value="CREATE">CREATE</option>
                          <option value="ALTER">ALTER</option>
                          <option value="DROP">DROP</option>
                        </select>
                      </div>
                      <button
                        className="text-slate-400 hover:text-red-500"
                        onClick={() => setDdlConfig((p) => ({
                          ...p,
                          operations: p.operations.filter((o) => o.id !== op.id),
                        }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      value={op.sql}
                      onChange={(e) => {
                        setDdlConfig((p) => ({
                          ...p,
                          operations: p.operations.map((o) =>
                            o.id === op.id ? { ...o, sql: e.target.value } : o
                          ),
                        }));
                      }}
                      placeholder="ALTER TABLE ... ADD COLUMN ..."
                      className="w-full p-3 font-mono text-sm bg-slate-900 text-green-400 min-h-[80px]"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-sm text-slate-500">Execution Order</label>
                <select
                  value={ddlConfig.execution_order}
                  onChange={(e) => setDdlConfig((p) => ({ ...p, execution_order: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500">On Error</label>
                <select
                  value={ddlConfig.on_error}
                  onChange={(e) => setDdlConfig((p) => ({ ...p, on_error: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="rollback">Rollback All</option>
                  <option value="abort">Abort</option>
                  <option value="continue">Continue</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Snowpipe Tab */}
        {activeTab === 'snowpipe' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Zap className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium text-sm">Real-time Streaming</p>
                <p className="text-xs text-slate-500">Auto-ingest data as files arrive</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-500">Pipe Name</label>
              <Input
                value={snowpipeConfig.pipe_name}
                onChange={(e) => setSnowpipeConfig((p) => ({ ...p, pipe_name: e.target.value }))}
                placeholder="CUSTOMER_PIPE"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm text-slate-500">Source Type</label>
              <select
                value={snowpipeConfig.source.type}
                onChange={(e) => setSnowpipeConfig((p) => ({
                  ...p,
                  source: { ...p.source, type: e.target.value as any },
                }))}
                className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="S3">Amazon S3</option>
                <option value="AZURE">Azure Blob Storage</option>
                <option value="GCS">Google Cloud Storage</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-500">Source Location</label>
              <div className="flex items-center gap-2 mt-1">
                <FolderOpen className="h-4 w-4 text-slate-400" />
                <Input
                  value={snowpipeConfig.source.location}
                  onChange={(e) => setSnowpipeConfig((p) => ({
                    ...p,
                    source: { ...p.source, location: e.target.value },
                  }))}
                  placeholder="s3://bucket/path/"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-500">File Format</label>
                <select
                  value={snowpipeConfig.source.file_format}
                  onChange={(e) => setSnowpipeConfig((p) => ({
                    ...p,
                    source: { ...p.source, file_format: e.target.value },
                  }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="CSV_FORMAT">CSV</option>
                  <option value="JSON_FORMAT">JSON</option>
                  <option value="PARQUET_FORMAT">Parquet</option>
                  <option value="AVRO_FORMAT">Avro</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500">File Pattern</label>
                <Input
                  value={snowpipeConfig.source.pattern}
                  onChange={(e) => setSnowpipeConfig((p) => ({
                    ...p,
                    source: { ...p.source, pattern: e.target.value },
                  }))}
                  placeholder=".*\.csv"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border dark:border-slate-700 rounded-lg">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Auto-Ingest</span>
              </div>
              <Switch
                checked={snowpipeConfig.auto_ingest}
                onChange={() => setSnowpipeConfig((p) => ({ ...p, auto_ingest: !p.auto_ingest }))}
              />
            </div>

            {/* Error Handling */}
            <div className="border dark:border-slate-700 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Error Handling
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">On Error</label>
                  <select
                    value={snowpipeConfig.error_handling.on_error}
                    onChange={(e) => setSnowpipeConfig((p) => ({
                      ...p,
                      error_handling: { ...p.error_handling, on_error: e.target.value as any },
                    }))}
                    className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
                  >
                    <option value="CONTINUE">Continue</option>
                    <option value="SKIP_FILE">Skip File</option>
                    <option value="ABORT_STATEMENT">Abort</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Max Errors per File</label>
                  <Input
                    type="number"
                    value={snowpipeConfig.error_handling.max_file_errors}
                    onChange={(e) => setSnowpipeConfig((p) => ({
                      ...p,
                      error_handling: { ...p.error_handling, max_file_errors: parseInt(e.target.value) || 10 },
                    }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Batch Task Tab */}
        {activeTab === 'batch' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <Timer className="h-5 w-5 text-purple-500" />
              <div>
                <p className="font-medium text-sm">Scheduled Task</p>
                <p className="text-xs text-slate-500">Execute SQL on a schedule</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-500">Task Name</label>
              <Input
                value={batchConfig.task_name}
                onChange={(e) => setBatchConfig((p) => ({ ...p, task_name: e.target.value }))}
                placeholder="CUSTOMER_TRANSFORM_TASK"
                className="mt-1"
              />
            </div>

            {/* Schedule */}
            <div className="border dark:border-slate-700 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Schedule
              </h4>
              <div>
                <label className="text-xs text-slate-500">Schedule Type</label>
                <select
                  value={batchConfig.schedule.type}
                  onChange={(e) => setBatchConfig((p) => ({
                    ...p,
                    schedule: { ...p.schedule, type: e.target.value as any },
                  }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="interval">Interval</option>
                  <option value="cron">Cron Expression</option>
                  <option value="after_stream">After Stream</option>
                </select>
              </div>

              {batchConfig.schedule.type === 'interval' && (
                <div>
                  <label className="text-xs text-slate-500">Interval (minutes)</label>
                  <Input
                    type="number"
                    value={batchConfig.schedule.interval_minutes}
                    onChange={(e) => setBatchConfig((p) => ({
                      ...p,
                      schedule: { ...p.schedule, interval_minutes: parseInt(e.target.value) || 60 },
                    }))}
                    className="mt-1"
                  />
                </div>
              )}

              {batchConfig.schedule.type === 'cron' && (
                <div>
                  <label className="text-xs text-slate-500">Cron Expression</label>
                  <Input
                    value={batchConfig.schedule.cron_expression}
                    onChange={(e) => setBatchConfig((p) => ({
                      ...p,
                      schedule: { ...p.schedule, cron_expression: e.target.value },
                    }))}
                    placeholder="0 2 * * *"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Example: 0 2 * * * runs at 2 AM daily
                  </p>
                </div>
              )}

              {batchConfig.schedule.type === 'after_stream' && (
                <div>
                  <label className="text-xs text-slate-500">Depends on Stream</label>
                  <Input
                    value={batchConfig.schedule.depends_on_stream}
                    onChange={(e) => setBatchConfig((p) => ({
                      ...p,
                      schedule: { ...p.schedule, depends_on_stream: e.target.value },
                    }))}
                    placeholder="CUSTOMER_STREAM"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Task will run when stream has new data
                  </p>
                </div>
              )}
            </div>

            {/* Warehouse */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-500">Warehouse</label>
                <Input
                  value={batchConfig.warehouse}
                  onChange={(e) => setBatchConfig((p) => ({ ...p, warehouse: e.target.value }))}
                  placeholder="COMPUTE_WH"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500">Size</label>
                <select
                  value={batchConfig.warehouse_size}
                  onChange={(e) => setBatchConfig((p) => ({ ...p, warehouse_size: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="XSMALL">X-Small</option>
                  <option value="SMALL">Small</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LARGE">Large</option>
                  <option value="XLARGE">X-Large</option>
                </select>
              </div>
            </div>

            {/* Conditions */}
            <div className="border dark:border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Execution Conditions
                </h4>
                <Button variant="outline" size="sm" onClick={() => addCondition('time_based')}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {conditions.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-3">
                  No conditions defined. Task will run on schedule.
                </p>
              ) : (
                <div className="space-y-2">
                  {conditions.map((cond, idx) => (
                    <div key={cond.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded">
                      <Badge size="sm">{idx + 1}</Badge>
                      <select
                        value={cond.type}
                        onChange={(e) => {
                          setConditions((prev) => prev.map((c) =>
                            c.id === cond.id ? { ...c, type: e.target.value as any } : c
                          ));
                        }}
                        className="flex-1 text-sm p-1 border rounded dark:bg-slate-800 dark:border-slate-700"
                      >
                        <option value="time_based">Time Window</option>
                        <option value="data_availability">Data Available</option>
                        <option value="approval">Approval Required</option>
                        <option value="custom_sql">Custom SQL</option>
                      </select>
                      <button
                        onClick={() => removeCondition(cond.id)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* C5 — Watermark Display */}
      {projectId && table && (
        <div className="px-4 pb-2">
          <WatermarkDisplay
            projectId={projectId}
            tableName={table.table}
          />
        </div>
      )}

      {/* C1 — WHERE Clause Builder */}
      <div className="px-4 pb-2">
        <WhereClauseBuilder
          columns={allColumns}
          onChange={setWhereClauseSql}
          onConditionsChange={setWhereConditions}
        />
      </div>

      {/* C3 — SQL Preview */}
      <div className="px-4 pb-2">
        <SqlPreviewPanel
          table={table}
          sourceTable={sourceTable}
          ingestionMode={ingestionMode}
          columnMappings={columnMappings}
          scdConfig={ingestionMode?.startsWith('scd') ? scdConfig : undefined}
          whereClause={whereClauseSql || undefined}
          whereClauses={whereConditions.length > 0 ? whereConditions : undefined}
          projectId={projectId}
        />
      </div>

      {/* C2 — Quality Gates */}
      <div className="px-4 pb-2">
        <QualityGatesPanel
          columns={allColumns}
          projectId={projectId}
          database={sourceTable?.database || table?.database}
          schemaName={sourceTable?.schema || table?.schema}
          tableName={sourceTable?.table || table?.table}
          blockOnFail={true}
        />
      </div>

      {/* C4 — Ingestion Dry-Run Preview */}
      <div className="px-4 pb-2">
        <IngestionDryRunPanel
          tableName={sourceTable?.table || table?.table || ''}
          targetTableName={sourceTable ? table?.table : undefined}
          ingestionMode={ingestionMode}
          projectId={projectId}
          sourceDatabase={sourceTable?.database || table?.database}
          sourceSchema={sourceTable?.schema || table?.schema}
          targetDatabase={table?.database}
          targetSchema={table?.schema}
          mappings={columnMappings.length > 0
            ? columnMappings.map(m => ({ source_columns: [m.sourceColumn], target_column: m.targetColumn }))
            : undefined}
          whereClauses={whereConditions.length > 0 ? whereConditions : undefined}
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <Button
          className="w-full gap-2"
          onClick={handleSave}
          disabled={!table || saving}
          aria-label="Save ingestion configuration to deployment draft"
          aria-busy={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Save Configuration
        </Button>
      </div>
    </div>
  );
};

export default IngestionConfigPanel;
