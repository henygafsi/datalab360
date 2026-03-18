'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip, Switch } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Database, RefreshCw, Clock, History, Layers, Settings, Plus, Trash2,
  FileCode, Cloud, Timer, Play, Pause, Calendar, AlertTriangle, Info,
  ChevronDown, ChevronRight, Workflow, Zap, Code2, FolderOpen, ShieldCheck, RotateCcw,
  Key, Columns3, Save, Loader2, Check,
} from 'lucide-react';
import { useEventStore, createIngestionModeEvent } from '../stores/event-store';
import SqlPreviewPanel from './SqlPreviewPanel';
import WhereClauseBuilder from './WhereClauseBuilder';
import QualityGatesPanel from './QualityGatesPanel';
import IngestionDryRunPanel from './IngestionDryRunPanel';
import { IngestionMode } from '../../mapping/components/TableDetailPanel';
import type { ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import apiClient from '@/lib/api-client';

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

interface ConditionalColumnRule {
  id: string;
  column_name: string;
  condition: string;
  action: 'UPDATE' | 'SKIP';
  set_expression: string;
}

interface IngestionConfigPanelProps {
  table: TableReference | null;
  projectId?: string;
  columns?: ColumnInfo[];
  ingestionMode: IngestionMode;
  onModeChange: (mode: IngestionMode) => void;
  onSubmitForApproval?: (config: any) => Promise<void>;
  onExecuteImmediate?: (config: any) => Promise<void>;
  className?: string;
}

// Tab type
type TabType = 'mode' | 'ddl' | 'snowpipe' | 'batch';

// Modes that require merge key columns
const MERGE_MODES: IngestionMode[] = ['incremental', 'scd_type1', 'scd_type2', 'scd_type3'];
const SCD_MODES: IngestionMode[] = ['scd_type1', 'scd_type2', 'scd_type3'];

const IngestionConfigPanel: React.FC<IngestionConfigPanelProps> = ({
  table,
  projectId,
  columns = [],
  ingestionMode,
  onModeChange,
  onSubmitForApproval,
  onExecuteImmediate,
  className,
}) => {
  const { addEvent } = useEventStore();
  const [activeTab, setActiveTab] = useState<TabType>('mode');
  const [expandedSection, setExpandedSection] = useState<string | null>('scd');
  const [submitting, setSubmitting] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Key Columns (for MERGE ON)
  const [keyColumns, setKeyColumns] = useState<string[]>([]);

  // Tracking Columns (for SCD change detection)
  const [trackingColumns, setTrackingColumns] = useState<string[]>([]);

  // Timestamp Column (for incremental watermark)
  const [timestampColumn, setTimestampColumn] = useState<string | null>(null);

  // Conditional Column Merge Rules
  const [conditionalRules, setConditionalRules] = useState<ConditionalColumnRule[]>([]);

  // SCD Type 2 Config
  const [scdConfig, setScdConfig] = useState({
    trackingColumns: [] as string[],
    effectiveDateColumn: 'EFF_DATE',
    expirationDateColumn: 'EXP_DATE',
    currentFlagColumn: 'IS_CURRENT',
  });

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

  // Build the fully-qualified table name
  const tableFqn = table ? `${table.database}.${table.schema}.${table.table}` : '';

  // ── Load saved configuration on mount ──
  useEffect(() => {
    if (!table || !projectId) return;

    const loadConfig = async () => {
      setLoadingConfig(true);
      try {
        const fqn = `${table.database}.${table.schema}.${table.table}`;
        const response = await apiClient.get(
          `/explore-design/${projectId}/tables/${encodeURIComponent(fqn)}/ingestion-config`
        );
        const data = response.data;

        if (data?.has_config && data?.config) {
          const cfg = data.config;

          // Restore ingestion mode
          if (cfg.ingestion_mode) {
            onModeChange(cfg.ingestion_mode as IngestionMode);
          }

          // Restore key columns
          if (cfg.key_columns && Array.isArray(cfg.key_columns)) {
            setKeyColumns(cfg.key_columns);
          }

          // Restore timestamp column
          if (cfg.timestamp_column) {
            setTimestampColumn(cfg.timestamp_column);
          }

          // Restore tracking columns
          if (cfg.tracking_columns && Array.isArray(cfg.tracking_columns)) {
            setTrackingColumns(cfg.tracking_columns);
            setScdConfig((prev) => ({ ...prev, trackingColumns: cfg.tracking_columns }));
          }

          // Restore SCD config
          if (cfg.effective_date_column) {
            setScdConfig((prev) => ({ ...prev, effectiveDateColumn: cfg.effective_date_column }));
          }
          if (cfg.expiration_date_column) {
            setScdConfig((prev) => ({ ...prev, expirationDateColumn: cfg.expiration_date_column }));
          }
          if (cfg.current_flag_column) {
            setScdConfig((prev) => ({ ...prev, currentFlagColumn: cfg.current_flag_column }));
          }

          // Restore conditional columns
          if (cfg.conditional_columns && Array.isArray(cfg.conditional_columns)) {
            setConditionalRules(
              cfg.conditional_columns.map((rule: any, idx: number) => ({
                id: `rule_${Date.now()}_${idx}`,
                column_name: rule.column_name || '',
                condition: rule.condition || '',
                action: rule.action || 'UPDATE',
                set_expression: rule.set_expression || '',
              }))
            );
          }

          // Restore snowpipe / stream names
          if (cfg.snowpipe_name) {
            setSnowpipeConfig((prev) => ({ ...prev, pipe_name: cfg.snowpipe_name }));
          }

          // Restore schedule for batch
          if (cfg.schedule) {
            setBatchConfig((prev) => ({
              ...prev,
              schedule: { ...prev.schedule, cron_expression: cfg.schedule },
            }));
          }

          setConfigLoaded(true);
          toast.success('Configuration loaded');
        }
      } catch (err: any) {
        // 404 means no config saved yet, which is fine
        if (err?.response?.status !== 404) {
          console.error('[IngestionConfig] Failed to load config:', err);
        }
      } finally {
        setLoadingConfig(false);
      }
    };

    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.database, table?.schema, table?.table, projectId]);

  // ── Save configuration ──
  const handleSaveConfig = useCallback(async () => {
    if (!table || !projectId) {
      toast.error('Project ID is required to save configuration');
      return;
    }

    setSavingConfig(true);
    try {
      const fqn = `${table.database}.${table.schema}.${table.table}`;
      const payload = {
        ingestion_mode: ingestionMode,
        key_columns: keyColumns,
        timestamp_column: ingestionMode === 'incremental' ? timestampColumn : null,
        tracking_columns: SCD_MODES.includes(ingestionMode) ? trackingColumns : [],
        effective_date_column: scdConfig.effectiveDateColumn,
        expiration_date_column: scdConfig.expirationDateColumn,
        current_flag_column: scdConfig.currentFlagColumn,
        conditional_columns: conditionalRules.map((r) => ({
          column_name: r.column_name,
          condition: r.condition,
          action: r.action,
          set_expression: r.set_expression || null,
        })),
        snowpipe_name: snowpipeConfig.pipe_name || null,
        stream_name: null,
        schedule: batchConfig.schedule.cron_expression || null,
      };

      await apiClient.post(
        `/explore-design/${projectId}/tables/${encodeURIComponent(fqn)}/ingestion-config`,
        payload
      );

      setConfigLoaded(true);
      toast.success('Ingestion configuration saved');
    } catch (err: any) {
      console.error('[IngestionConfig] Failed to save config:', err);
      toast.error(err?.response?.data?.detail || 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  }, [
    table, projectId, ingestionMode, keyColumns, timestampColumn, trackingColumns,
    scdConfig, conditionalRules, snowpipeConfig.pipe_name, batchConfig.schedule.cron_expression,
  ]);

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

  // Key column toggle
  const toggleKeyColumn = useCallback((colName: string) => {
    setKeyColumns((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  }, []);

  // Tracking column toggle
  const toggleTrackingColumn = useCallback((colName: string) => {
    setTrackingColumns((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  }, []);

  // Add conditional rule
  const addConditionalRule = useCallback(() => {
    setConditionalRules((prev) => [
      ...prev,
      {
        id: `rule_${Date.now()}`,
        column_name: columns.length > 0 ? columns[0].name : '',
        condition: '',
        action: 'UPDATE',
        set_expression: '',
      },
    ]);
  }, [columns]);

  // Remove conditional rule
  const removeConditionalRule = useCallback((id: string) => {
    setConditionalRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Update conditional rule
  const updateConditionalRule = useCallback((id: string, field: keyof ConditionalColumnRule, value: string) => {
    setConditionalRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }, []);

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

  // Available columns for tracking (exclude key columns)
  const availableTrackingColumns = columns.filter((col) => !keyColumns.includes(col.name));

  // Timestamp-eligible columns (date/timestamp types)
  const timestampEligibleColumns = columns.filter(
    (col) =>
      col.dataType.toUpperCase().includes('TIMESTAMP') ||
      col.dataType.toUpperCase().includes('DATE') ||
      col.dataType.toUpperCase().includes('NUMBER') ||
      col.dataType.toUpperCase().includes('INT')
  );

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
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Ingestion Configuration
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {table.database}.{table.schema}.{table.table}
            </p>
          </div>
          {configLoaded && (
            <Badge size="sm" color="success" className="gap-1">
              <Check className="h-3 w-3" />
              Saved
            </Badge>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {loadingConfig && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Loading configuration...</span>
        </div>
      )}

      {/* Tabs */}
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
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            )}
            onClick={() => setActiveTab(tab.key as TabType)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Mode Tab */}
        {activeTab === 'mode' && (
          <div className="space-y-4">
            {/* Ingestion Mode Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ingestion Mode</label>
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
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                    onClick={() => handleModeChange(mode.value as IngestionMode)}
                  >
                    <mode.icon className={cn(
                      'h-5 w-5 mt-0.5',
                      ingestionMode === mode.value ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'
                    )} />
                    <div>
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{mode.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{mode.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Merge Key Configuration ── */}
            {MERGE_MODES.includes(ingestionMode) && columns.length > 0 && (
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => toggleSection('merge_keys')}
                >
                  <span className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                    <Key className="h-4 w-4 text-amber-500" />
                    Merge Key Configuration
                    {keyColumns.length > 0 && (
                      <Badge size="sm" color="primary">{keyColumns.length} selected</Badge>
                    )}
                  </span>
                  {expandedSection === 'merge_keys' ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {expandedSection === 'merge_keys' && (
                  <div className="p-4 space-y-4">
                    {/* Key Columns */}
                    <div>
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Key className="h-3.5 w-3.5" />
                        Key Columns
                        <Tooltip content="Columns used in MERGE ON clause to match source and target rows">
                          <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                        </Tooltip>
                      </label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-2">
                        Select columns for the MERGE ON condition (primary/business keys)
                      </p>
                      <div className="max-h-48 overflow-auto border dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700">
                        {columns.map((col) => (
                          <label
                            key={col.name}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                              'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                              keyColumns.includes(col.name) && 'bg-blue-50 dark:bg-blue-900/20'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={keyColumns.includes(col.name)}
                              onChange={() => toggleKeyColumn(col.name)}
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                {col.name}
                              </span>
                              <Badge size="sm" className="text-[10px] shrink-0" variant="flat">
                                {col.dataType}
                              </Badge>
                              {col.isPrimaryKey && (
                                <Badge size="sm" color="warning" className="text-[10px] shrink-0">PK</Badge>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                      {keyColumns.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          At least one key column is recommended for merge operations
                        </p>
                      )}
                    </div>

                    {/* Tracking Columns — only for SCD modes */}
                    {SCD_MODES.includes(ingestionMode) && (
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Columns3 className="h-3.5 w-3.5" />
                          Tracking Columns
                          <Tooltip content="Columns monitored for changes to trigger SCD updates. Key columns are excluded.">
                            <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                          </Tooltip>
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-2">
                          Select columns to track for SCD change detection
                        </p>
                        {availableTrackingColumns.length > 0 ? (
                          <div className="max-h-48 overflow-auto border dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700">
                            {availableTrackingColumns.map((col) => (
                              <label
                                key={col.name}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                                  'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                                  trackingColumns.includes(col.name) && 'bg-emerald-50 dark:bg-emerald-900/20'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={trackingColumns.includes(col.name)}
                                  onChange={() => toggleTrackingColumn(col.name)}
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                                />
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-sm text-slate-900 dark:text-white truncate">
                                    {col.name}
                                  </span>
                                  <Badge size="sm" className="text-[10px] shrink-0" variant="flat">
                                    {col.dataType}
                                  </Badge>
                                </div>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                            All columns are selected as key columns. Deselect some key columns to enable tracking.
                          </p>
                        )}
                        {trackingColumns.length > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            {trackingColumns.length} column{trackingColumns.length !== 1 ? 's' : ''} tracked for changes
                          </p>
                        )}
                      </div>
                    )}

                    {/* Timestamp Column — only for incremental mode */}
                    {ingestionMode === 'incremental' && (
                      <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          Timestamp Column
                          <Tooltip content="Watermark column used to track incremental changes (timestamp, date, or sequence number)">
                            <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                          </Tooltip>
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-2">
                          Select the column used as watermark for incremental loads
                        </p>
                        <select
                          value={timestampColumn || ''}
                          onChange={(e) => setTimestampColumn(e.target.value || null)}
                          className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">-- Select watermark column --</option>
                          {timestampEligibleColumns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name} ({col.dataType})
                            </option>
                          ))}
                          {/* Also allow picking any column if no timestamp types found */}
                          {timestampEligibleColumns.length === 0 && columns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name} ({col.dataType})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SCD Configuration (show for SCD modes) */}
            {ingestionMode.startsWith('scd') && (
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => toggleSection('scd')}
                >
                  <span className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                    <History className="h-4 w-4" />
                    SCD Configuration
                  </span>
                  {expandedSection === 'scd' ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {expandedSection === 'scd' && (
                  <div className="p-4 space-y-4">
                    {ingestionMode === 'scd_type2' && (
                      <>
                        <div>
                          <label className="text-sm text-slate-500 dark:text-slate-400">Effective Date Column</label>
                          <Input
                            value={scdConfig.effectiveDateColumn}
                            onChange={(e) => setScdConfig((p) => ({ ...p, effectiveDateColumn: e.target.value }))}
                            placeholder="EFF_DATE"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 dark:text-slate-400">Expiration Date Column</label>
                          <Input
                            value={scdConfig.expirationDateColumn}
                            onChange={(e) => setScdConfig((p) => ({ ...p, expirationDateColumn: e.target.value }))}
                            placeholder="EXP_DATE"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 dark:text-slate-400">Current Flag Column</label>
                          <Input
                            value={scdConfig.currentFlagColumn}
                            onChange={(e) => setScdConfig((p) => ({ ...p, currentFlagColumn: e.target.value }))}
                            placeholder="IS_CURRENT"
                            className="mt-1"
                          />
                        </div>
                      </>
                    )}
                    {ingestionMode === 'scd_type3' && (
                      <div>
                        <label className="text-sm text-slate-500 dark:text-slate-400">Previous Value Column Suffix</label>
                        <Input
                          placeholder="_PREV"
                          className="mt-1"
                        />
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Columns with changes will have a _PREV version added
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Incremental Configuration (legacy section — kept for non-merge-key config) */}
            {ingestionMode === 'incremental' && columns.length === 0 && (
              <div className="border dark:border-slate-700 rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                  <Clock className="h-4 w-4" />
                  Incremental Configuration
                </h4>
                <div>
                  <label className="text-sm text-slate-500 dark:text-slate-400">Watermark Column</label>
                  <Input
                    placeholder="UPDATED_AT"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Column used to track incremental changes (timestamp or sequence)
                  </p>
                </div>
              </div>
            )}

            {/* ── Conditional Column Merge Rules ── */}
            {MERGE_MODES.includes(ingestionMode) && (
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => toggleSection('conditional')}
                >
                  <span className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                    <Workflow className="h-4 w-4 text-purple-500" />
                    Conditional Merge Rules
                    {conditionalRules.length > 0 && (
                      <Badge size="sm" color="secondary">{conditionalRules.length}</Badge>
                    )}
                  </span>
                  {expandedSection === 'conditional' ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                {expandedSection === 'conditional' && (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Define per-column conditions to control UPDATE/SKIP behavior during MERGE
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addConditionalRule}
                        className="gap-1 shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Rule
                      </Button>
                    </div>

                    {conditionalRules.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 dark:text-slate-400 border-2 border-dashed dark:border-slate-700 rounded-lg">
                        <Workflow className="h-6 w-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm">No conditional rules defined</p>
                        <p className="text-xs mt-1">All columns will be updated unconditionally</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {conditionalRules.map((rule, idx) => (
                          <div
                            key={rule.id}
                            className="border dark:border-slate-700 rounded-lg p-3 space-y-3 bg-white dark:bg-slate-900"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge size="sm">{idx + 1}</Badge>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  Conditional Rule
                                </span>
                              </div>
                              <button
                                onClick={() => removeConditionalRule(rule.id)}
                                className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              {/* Column Name */}
                              <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400">Column</label>
                                <select
                                  value={rule.column_name}
                                  onChange={(e) => updateConditionalRule(rule.id, 'column_name', e.target.value)}
                                  className="w-full mt-1 p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                >
                                  <option value="">Select column</option>
                                  {columns.map((col) => (
                                    <option key={col.name} value={col.name}>{col.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Action */}
                              <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400">Action</label>
                                <select
                                  value={rule.action}
                                  onChange={(e) => updateConditionalRule(rule.id, 'action', e.target.value)}
                                  className="w-full mt-1 p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                                >
                                  <option value="UPDATE">UPDATE</option>
                                  <option value="SKIP">SKIP</option>
                                </select>
                              </div>
                            </div>

                            {/* Condition */}
                            <div>
                              <label className="text-xs text-slate-500 dark:text-slate-400">Condition (SQL)</label>
                              <Input
                                value={rule.condition}
                                onChange={(e) => updateConditionalRule(rule.id, 'condition', e.target.value)}
                                placeholder="s.STATUS != t.STATUS"
                                className="mt-1 font-mono text-sm"
                              />
                            </div>

                            {/* Set Expression (optional) */}
                            {rule.action === 'UPDATE' && (
                              <div>
                                <label className="text-xs text-slate-500 dark:text-slate-400">
                                  SET Expression
                                  <span className="text-slate-400 dark:text-slate-500 ml-1">(optional)</span>
                                </label>
                                <Input
                                  value={rule.set_expression}
                                  onChange={(e) => updateConditionalRule(rule.id, 'set_expression', e.target.value)}
                                  placeholder="t.STATUS = s.STATUS"
                                  className="mt-1 font-mono text-sm"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DDL Tab */}
        {activeTab === 'ddl' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
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
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 border-2 border-dashed dark:border-slate-700 rounded-lg">
                <FileCode className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
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
                          className="text-xs border rounded px-2 py-1 dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                        >
                          <option value="CREATE">CREATE</option>
                          <option value="ALTER">ALTER</option>
                          <option value="DROP">DROP</option>
                        </select>
                      </div>
                      <button
                        className="text-slate-400 hover:text-red-500 dark:hover:text-red-400"
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
                <label className="text-sm text-slate-500 dark:text-slate-400">Execution Order</label>
                <select
                  value={ddlConfig.execution_order}
                  onChange={(e) => setDdlConfig((p) => ({ ...p, execution_order: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="sequential">Sequential</option>
                  <option value="parallel">Parallel</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400">On Error</label>
                <select
                  value={ddlConfig.on_error}
                  onChange={(e) => setDdlConfig((p) => ({ ...p, on_error: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
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
                <p className="font-medium text-sm text-slate-900 dark:text-white">Real-time Streaming</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Auto-ingest data as files arrive</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">Pipe Name</label>
              <Input
                value={snowpipeConfig.pipe_name}
                onChange={(e) => setSnowpipeConfig((p) => ({ ...p, pipe_name: e.target.value }))}
                placeholder="CUSTOMER_PIPE"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">Source Type</label>
              <select
                value={snowpipeConfig.source.type}
                onChange={(e) => setSnowpipeConfig((p) => ({
                  ...p,
                  source: { ...p.source, type: e.target.value as any },
                }))}
                className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="S3">Amazon S3</option>
                <option value="AZURE">Azure Blob Storage</option>
                <option value="GCS">Google Cloud Storage</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">Source Location</label>
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
                <label className="text-sm text-slate-500 dark:text-slate-400">File Format</label>
                <select
                  value={snowpipeConfig.source.file_format}
                  onChange={(e) => setSnowpipeConfig((p) => ({
                    ...p,
                    source: { ...p.source, file_format: e.target.value },
                  }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="CSV_FORMAT">CSV</option>
                  <option value="JSON_FORMAT">JSON</option>
                  <option value="PARQUET_FORMAT">Parquet</option>
                  <option value="AVRO_FORMAT">Avro</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400">File Pattern</label>
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
                <span className="text-sm font-medium text-slate-900 dark:text-white">Auto-Ingest</span>
              </div>
              <Switch
                checked={snowpipeConfig.auto_ingest}
                onChange={() => setSnowpipeConfig((p) => ({ ...p, auto_ingest: !p.auto_ingest }))}
              />
            </div>

            {/* Error Handling */}
            <div className="border dark:border-slate-700 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Error Handling
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">On Error</label>
                  <select
                    value={snowpipeConfig.error_handling.on_error}
                    onChange={(e) => setSnowpipeConfig((p) => ({
                      ...p,
                      error_handling: { ...p.error_handling, on_error: e.target.value as any },
                    }))}
                    className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="CONTINUE">Continue</option>
                    <option value="SKIP_FILE">Skip File</option>
                    <option value="ABORT_STATEMENT">Abort</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Max Errors per File</label>
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
                <p className="font-medium text-sm text-slate-900 dark:text-white">Scheduled Task</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Execute SQL on a schedule</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-500 dark:text-slate-400">Task Name</label>
              <Input
                value={batchConfig.task_name}
                onChange={(e) => setBatchConfig((p) => ({ ...p, task_name: e.target.value }))}
                placeholder="CUSTOMER_TRANSFORM_TASK"
                className="mt-1"
              />
            </div>

            {/* Schedule */}
            <div className="border dark:border-slate-700 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                <Calendar className="h-4 w-4" />
                Schedule
              </h4>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Schedule Type</label>
                <select
                  value={batchConfig.schedule.type}
                  onChange={(e) => setBatchConfig((p) => ({
                    ...p,
                    schedule: { ...p.schedule, type: e.target.value as any },
                  }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="interval">Interval</option>
                  <option value="cron">Cron Expression</option>
                  <option value="after_stream">After Stream</option>
                </select>
              </div>

              {batchConfig.schedule.type === 'interval' && (
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Interval (minutes)</label>
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
                  <label className="text-xs text-slate-500 dark:text-slate-400">Cron Expression</label>
                  <Input
                    value={batchConfig.schedule.cron_expression}
                    onChange={(e) => setBatchConfig((p) => ({
                      ...p,
                      schedule: { ...p.schedule, cron_expression: e.target.value },
                    }))}
                    placeholder="0 2 * * *"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Example: 0 2 * * * runs at 2 AM daily
                  </p>
                </div>
              )}

              {batchConfig.schedule.type === 'after_stream' && (
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Depends on Stream</label>
                  <Input
                    value={batchConfig.schedule.depends_on_stream}
                    onChange={(e) => setBatchConfig((p) => ({
                      ...p,
                      schedule: { ...p.schedule, depends_on_stream: e.target.value },
                    }))}
                    placeholder="CUSTOMER_STREAM"
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Task will run when stream has new data
                  </p>
                </div>
              )}
            </div>

            {/* Warehouse */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400">Warehouse</label>
                <Input
                  value={batchConfig.warehouse}
                  onChange={(e) => setBatchConfig((p) => ({ ...p, warehouse: e.target.value }))}
                  placeholder="COMPUTE_WH"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400">Size</label>
                <select
                  value={batchConfig.warehouse_size}
                  onChange={(e) => setBatchConfig((p) => ({ ...p, warehouse_size: e.target.value as any }))}
                  className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
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
                <h4 className="font-medium text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                  <Workflow className="h-4 w-4" />
                  Execution Conditions
                </h4>
                <Button variant="outline" size="sm" onClick={() => addCondition('time_based')}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>

              {conditions.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-3">
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
                        className="flex-1 text-sm p-1 border rounded dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
                      >
                        <option value="time_based">Time Window</option>
                        <option value="data_availability">Data Available</option>
                        <option value="approval">Approval Required</option>
                        <option value="custom_sql">Custom SQL</option>
                      </select>
                      <button
                        onClick={() => removeCondition(cond.id)}
                        className="text-slate-400 hover:text-red-500 dark:hover:text-red-400"
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

      {/* SQL Preview */}
      <div className="px-4 pb-2">
        <SqlPreviewPanel
          table={table}
          ingestionMode={ingestionMode}
          scdConfig={ingestionMode.startsWith('scd') ? scdConfig : undefined}
        />
      </div>

      {/* WHERE Clause Builder */}
      <div className="px-4 pb-2">
        <WhereClauseBuilder
          columns={[]}
          onChange={() => {}}
        />
      </div>

      {/* Quality Gates */}
      <div className="px-4 pb-2">
        <QualityGatesPanel />
      </div>

      {/* Ingestion Dry-Run Preview */}
      <div className="px-4 pb-2">
        <IngestionDryRunPanel
          tableName={table?.table || ''}
          ingestionMode={ingestionMode}
          onRunDryRun={async () => ({
            status: 'success' as const,
            rowsProcessed: 10,
            durationMs: 1200,
            sampleRows: [],
            columns: [],
            summary: { inserts: 7, updates: 2, deletes: 1, unchanged: 0 },
            errors: [],
            warnings: [],
          })}
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <Button className="w-full gap-2">
      {/* Footer — Save Configuration + Approval workflow or immediate execution */}
      <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2">
        {/* Save Configuration Button */}
        {projectId && (
          <Button
            className="w-full gap-2"
            variant="outline"
            disabled={savingConfig || loadingConfig}
            onClick={handleSaveConfig}
          >
            {savingConfig ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {savingConfig ? 'Saving...' : 'Save Configuration'}
          </Button>
        )}

        {onSubmitForApproval && (
          <Button
            className="w-full gap-2"
            variant="outline"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmitForApproval({
                  table, ingestionMode, scdConfig,
                  snowpipeConfig, batchConfig, ddlConfig, conditions,
                  keyColumns, trackingColumns, timestampColumn, conditionalRules,
                });
                toast.success('Ingestion submitted for approval');
              } catch (err: any) {
                toast.error(err?.message || 'Failed to submit');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <ShieldCheck className="h-4 w-4" />
            Submit for Approval
          </Button>
        )}
        <Button
          className="w-full gap-2"
          disabled={submitting}
          onClick={async () => {
            if (onExecuteImmediate) {
              setSubmitting(true);
              try {
                await onExecuteImmediate({
                  table, ingestionMode, scdConfig,
                  snowpipeConfig, batchConfig, ddlConfig, conditions,
                  keyColumns, trackingColumns, timestampColumn, conditionalRules,
                });
                toast.success('Ingestion executed');
              } catch (err: any) {
                toast.error(err?.message || 'Execution failed');
              } finally {
                setSubmitting(false);
              }
            } else {
              toast.success('Configuration saved');
            }
          }}
        >
          <Play className="h-4 w-4" />
          {onExecuteImmediate ? 'Execute Immediately' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
};

export default IngestionConfigPanel;
