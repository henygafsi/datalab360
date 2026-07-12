'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Select, Badge, Checkbox } from 'rizzui';
import DesignDockPanel from './DesignDockPanel';
import { Plus, Trash2, Save, X, Database, Table as TableIcon, Key, Cloud, Snowflake, Clock, Timer, Sparkles, Loader2, ThumbsUp, ThumbsDown, CheckCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore } from '../stores/event-store';
import { aiSuggestColumns, aiCheckNaming, aiMaterialization } from '@/app/services/api/exploreDesignApi';
import type { NamingCheckItem, MaterializationResult } from '@/app/services/api/types';
import { cn } from '@/lib/utils';
import { getCortexRecommend } from '@/app/services/cortex';
import { useAiFeatures } from '../stores/ai-store';

// Inline schema for table name validation
const tableNameSchema = z.object({
  tableName: z
    .string()
    .min(1, 'Table name is required')
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      'Must start with a letter or underscore. Only letters, numbers, and underscores allowed.'
    ),
});

export type SnowflakeTableType = 'standard' | 'temporary' | 'transient' | 'external' | 'iceberg';

interface Column {
  id: string;
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  projectId: string;
  initialTableType?: SnowflakeTableType;
  onTableCreated?: (tableName: string, database: string, schema: string, columns: Column[]) => void;
}

const DATA_TYPES = [
  { value: 'VARCHAR', label: 'VARCHAR' },
  { value: 'NUMBER', label: 'NUMBER' },
  { value: 'INTEGER', label: 'INTEGER' },
  { value: 'FLOAT', label: 'FLOAT' },
  { value: 'BOOLEAN', label: 'BOOLEAN' },
  { value: 'DATE', label: 'DATE' },
  { value: 'TIMESTAMP', label: 'TIMESTAMP' },
  { value: 'VARIANT', label: 'VARIANT' },
  { value: 'OBJECT', label: 'OBJECT' },
  { value: 'ARRAY', label: 'ARRAY' },
  { value: 'BINARY', label: 'BINARY' },
];

const TABLE_PURPOSES = [
  { value: 'fact', label: 'Fact Table' },
  { value: 'dimension', label: 'Dimension Table' },
  { value: 'staging', label: 'Staging' },
  { value: 'ods', label: 'ODS (Operational Data Store)' },
  { value: 'bridge', label: 'Bridge Table' },
  { value: 'aggregate', label: 'Aggregate / Summary' },
  { value: 'lookup', label: 'Lookup / Reference' },
  { value: 'audit', label: 'Audit / Log' },
  { value: 'snapshot', label: 'Snapshot' },
  { value: 'other', label: 'Other' },
];

const TABLE_TYPES: { value: SnowflakeTableType; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'standard', label: 'Standard', description: 'Permanent table with full Time Travel & Fail-safe', icon: <TableIcon className="h-4 w-4" /> },
  { value: 'temporary', label: 'Temporary', description: 'Session-scoped, dropped when session ends', icon: <Clock className="h-4 w-4" /> },
  { value: 'transient', label: 'Transient', description: 'Persistent but no Fail-safe (lower storage cost)', icon: <Timer className="h-4 w-4" /> },
  { value: 'external', label: 'External', description: 'Read-only table over files in a stage', icon: <Cloud className="h-4 w-4" /> },
  { value: 'iceberg', label: 'Iceberg', description: 'Apache Iceberg-managed table (open format)', icon: <Snowflake className="h-4 w-4" /> },
];

const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  projectId,
  initialTableType = 'standard',
  onTableCreated,
}) => {
  const { addEvent } = useEventStore();
  const { isEnabled: isAiEnabled } = useAiFeatures();
  const [tableType, setTableType] = useState<SnowflakeTableType>(initialTableType);
  const [tableName, setTableName] = useState('');
  const [tablePurpose, setTablePurpose] = useState('');

  // react-hook-form for table name validation
  const {
    register: registerTableName,
    trigger: triggerTableNameValidation,
    formState: { errors: tableNameErrors },
    setValue: setTableNameValue,
    clearErrors: clearTableNameErrors,
  } = useForm({
    resolver: zodResolver(tableNameSchema),
    mode: 'onBlur',
    defaultValues: { tableName: '' },
  });
  const [columns, setColumns] = useState<Column[]>([
    { id: '1', name: '', dataType: 'VARCHAR', nullable: true, primaryKey: false },
  ]);
  const [tableComment, setTableComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // External table fields
  const [stageLocation, setStageLocation] = useState('');
  const [fileFormat, setFileFormat] = useState('PARQUET');
  const [filePattern, setFilePattern] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Iceberg table fields
  const [externalVolume, setExternalVolume] = useState('');
  const [icebergCatalog, setIcebergCatalog] = useState('SNOWFLAKE');
  const [baseLocation, setBaseLocation] = useState('');

  // AI column suggestions
  const [aiSuggestions, setAiSuggestions] = useState<Column[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);
  const lastAiQuery = useRef('');

  // AI materialization strategy
  const [matLoading, setMatLoading] = useState(false);
  const [matResult, setMatResult] = useState<MaterializationResult | null>(null);

  // AI Naming Convention Checker
  const [tableNameCheck, setTableNameCheck] = useState<NamingCheckItem | null>(null);
  const [tableNameCheckLoading, setTableNameCheckLoading] = useState(false);
  const [columnNameChecks, setColumnNameChecks] = useState<Record<string, NamingCheckItem>>({});
  // Single shared debounce timer + a pending {columnId -> name} map so we
  // batch all dirty columns into ONE /ai/check-naming call instead of one
  // call per column blur. The check-naming endpoint accepts names[].
  const columnCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingColumnChecks = useRef<Record<string, string>>({});

  // Sync tableType when initialTableType changes (dropdown re-opens)
  useEffect(() => {
    setTableType(initialTableType);
  }, [initialTableType]);

  // AI Naming: check table name on blur
  const checkTableNaming = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2 || !isAiEnabled('naming_checker')) return;
    setTableNameCheckLoading(true);
    try {
      const result = await aiCheckNaming(projectId, {
        names: [trimmed],
        entity_type: 'table',
        convention: 'UPPER_SNAKE',
      });
      if (result.results?.length > 0) {
        setTableNameCheck(result.results[0]);
      }
    } catch (err) {
      console.warn('[AI] Naming check failed for table:', err);
    } finally {
      setTableNameCheckLoading(false);
    }
  }, [projectId, isAiEnabled]);

  // AI Naming: queue a column for checking. All columns dirtied within the
  // 800ms debounce window are sent together as a single batched API call.
  const checkColumnNaming = useCallback((columnId: string, name: string) => {
    const trimmed = name.trim();
    if (!isAiEnabled('naming_checker')) return;

    if (!trimmed || trimmed.length < 2) {
      delete pendingColumnChecks.current[columnId];
      return;
    }
    pendingColumnChecks.current[columnId] = trimmed;

    if (columnCheckTimer.current) clearTimeout(columnCheckTimer.current);
    columnCheckTimer.current = setTimeout(async () => {
      const batch = { ...pendingColumnChecks.current };
      pendingColumnChecks.current = {};
      const entries = Object.entries(batch);
      if (entries.length === 0) return;
      try {
        const result = await aiCheckNaming(projectId, {
          names: entries.map(([, n]) => n),
          entity_type: 'column',
          convention: 'UPPER_SNAKE',
        });
        // Map results back to columnIds by name (results preserve order,
        // but match by name to stay correct if the API reorders/dedupes).
        const byName = new Map(result.results?.map(r => [r.name, r]) ?? []);
        setColumnNameChecks(prev => {
          const next = { ...prev };
          for (const [colId, n] of entries) {
            const item = byName.get(n);
            if (item) next[colId] = item;
          }
          return next;
        });
      } catch (err) {
        console.warn('[AI] Naming check failed for columns:', err);
      }
    }, 800);
  }, [projectId, isAiEnabled]);

  // Flush any pending debounce timer on unmount to avoid a leaked timeout.
  useEffect(() => {
    return () => {
      if (columnCheckTimer.current) clearTimeout(columnCheckTimer.current);
    };
  }, []);

  // AI: Suggest columns — uses dedicated API when table_templates feature is enabled, falls back to Cortex
  const fetchAiSuggestions = useCallback(async (force = false) => {
    const name = tableName.trim().toUpperCase();
    if (!name || name.length < 3) return;
    if (!force && name === lastAiQuery.current) return;
    lastAiQuery.current = name;
    setAiLoading(true);
    setAiDismissed(false);
    setAiSuggestions([]);

    try {
      // Prefer dedicated AI API when the feature toggle is on
      if (isAiEnabled('table_templates')) {
        const purpose = tablePurpose
          ? `${TABLE_PURPOSES.find(p => p.value === tablePurpose)?.label ?? tablePurpose}: ${name}`
          : name;

        const result = await aiSuggestColumns(projectId, {
          table_purpose: purpose,
          domain: database,
          existing_tables: [],
        });

        if (result.suggested_columns?.length > 0) {
          const suggested: Column[] = result.suggested_columns.map((c, i) => ({
            id: `ai_${Date.now()}_${i}`,
            name: (c.name || '').toUpperCase(),
            dataType: (c.type || 'VARCHAR').split('(')[0].toUpperCase(),
            nullable: c.nullable ?? true,
            primaryKey: c.role === 'pk' || c.role === 'primary_key',
            comment: [c.role, c.references ? `→ ${c.references}` : ''].filter(Boolean).join(' ') || undefined,
          }));
          setAiSuggestions(suggested);
          return;
        }
        console.warn('[AI] API returned no suggested columns, falling back to Cortex');
      }

      // Fallback: Cortex-based suggestion (original implementation)
      const prompt = `You are a data warehouse expert. Given the table name "${name}"${tablePurpose ? ` (purpose: ${TABLE_PURPOSES.find(p => p.value === tablePurpose)?.label ?? tablePurpose})` : ''}, suggest the most common columns for this table. Return ONLY a valid JSON array (no markdown, no explanation) of objects with these exact fields: "name" (UPPER_SNAKE_CASE string), "dataType" (SQL type e.g. VARCHAR(200), NUMBER(38,0), TIMESTAMP_LTZ, DECIMAL(12,2), BOOLEAN, DATE), "nullable" (boolean), "primaryKey" (boolean). Include a primary key column first. Suggest 6-12 columns.`;

      const res = await getCortexRecommend({ error_context: prompt });
      const text = res?.response || '';

      // Parse JSON — handle markdown code blocks or raw JSON
      const cleaned = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          name: string;
          dataType: string;
          nullable: boolean;
          primaryKey: boolean;
        }>;
        if (parsed.length > 0) {
          const suggested: Column[] = parsed.map((c, i) => ({
            id: `ai_${Date.now()}_${i}`,
            name: (c.name || '').toUpperCase(),
            dataType: (c.dataType || 'VARCHAR').split('(')[0].toUpperCase(),
            nullable: c.nullable ?? true,
            primaryKey: c.primaryKey ?? false,
            comment: c.dataType?.includes('(') ? c.dataType : undefined,
          }));
          setAiSuggestions(suggested);
          return;
        }
      }
      console.warn('[AI] Could not parse column suggestions from response');
    } catch (err) {
      console.warn('[AI] Column suggestion failed:', err);
      toast.error('AI suggestion failed — try again');
    } finally {
      setAiLoading(false);
    }
  }, [tableName, tablePurpose, projectId, database, isAiEnabled]);

  // Trigger on blur (auto)
  const handleTableNameBlur = useCallback(() => {
    if (tableName.trim().length >= 3) {
      fetchAiSuggestions();
    }
    // Also trigger naming convention check
    checkTableNaming(tableName);
  }, [tableName, fetchAiSuggestions, checkTableNaming]);

  // AI: Suggest materialization type
  const handleSuggestType = async () => {
    if (!tableName.trim()) return;
    setMatLoading(true);
    setMatResult(null);
    try {
      const result = await aiMaterialization(projectId, {
        database,
        schema,
        table: tableName.trim().toUpperCase(),
      });
      setMatResult(result);
      // Map recommendation string to our SnowflakeTableType
      const typeMap: Record<string, SnowflakeTableType> = {
        REGULAR_TABLE: 'standard',
        TABLE: 'standard',
        STANDARD: 'standard',
        TEMPORARY: 'temporary',
        TRANSIENT: 'transient',
        EXTERNAL: 'external',
        ICEBERG: 'iceberg',
        MATERIALIZED_VIEW: 'standard',
        DYNAMIC_TABLE: 'standard',
        VIEW: 'standard',
      };
      const rec = typeof result.recommendation === 'string' ? result.recommendation : '';
      const mapped = typeMap[rec.toUpperCase()] || 'standard';
      setTableType(mapped);
    } catch (err: any) {
      console.warn('[AI] Materialization suggestion failed:', err);
      toast.error('Failed to get type recommendation');
    } finally {
      setMatLoading(false);
    }
  };

  const handleAcceptAllSuggestions = () => {
    const merged = aiSuggestions.map((s, i) => ({
      ...s,
      id: `${Date.now()}_${i}`,
      dataType: DATA_TYPES.find(dt => s.dataType.startsWith(dt.value))?.value || 'VARCHAR',
    }));
    setColumns(merged);
    setAiSuggestions([]);
    toast.success(`Added ${merged.length} AI-suggested columns`);
  };

  const handleAcceptSuggestion = (suggestion: Column) => {
    const newCol: Column = {
      ...suggestion,
      id: Date.now().toString(),
      dataType: DATA_TYPES.find(dt => suggestion.dataType.startsWith(dt.value))?.value || 'VARCHAR',
    };
    // Replace empty first column or append
    if (columns.length === 1 && !columns[0].name.trim()) {
      setColumns([newCol]);
    } else {
      setColumns([...columns, newCol]);
    }
    setAiSuggestions(aiSuggestions.filter(s => s.id !== suggestion.id));
  };

  const handleRejectSuggestion = (id: string) => {
    setAiSuggestions(aiSuggestions.filter(s => s.id !== id));
  };

  const handleAddColumn = () => {
    const newColumn: Column = {
      id: Date.now().toString(),
      name: '',
      dataType: 'VARCHAR',
      nullable: true,
      primaryKey: false,
    };
    setColumns([...columns, newColumn]);
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length === 1 && tableType !== 'external') {
      toast.error('Table must have at least one column');
      return;
    }
    setColumns(columns.filter((col) => col.id !== id));
    // Clean up naming check for removed column
    delete pendingColumnChecks.current[id];
    setColumnNameChecks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleColumnChange = (id: string, field: keyof Column, value: any) => {
    setColumns(
      columns.map((col) => (col.id === id ? { ...col, [field]: value } : col))
    );
  };

  // Column name blur handler for naming check
  const handleColumnNameBlur = useCallback((columnId: string, name: string) => {
    checkColumnNaming(columnId, name);
  }, [checkColumnNaming]);

  // Apply suggested name from naming checker
  const applyTableNameSuggestion = useCallback((suggested: string) => {
    setTableName(suggested);
    setTableNameValue('tableName', suggested);
    clearTableNameErrors('tableName');
    setTableNameCheck({ name: suggested, valid: true, suggested: null });
  }, []);

  const applyColumnNameSuggestion = useCallback((columnId: string, suggested: string) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, name: suggested } : col
    ));
    setColumnNameChecks(prev => ({
      ...prev,
      [columnId]: { name: suggested, valid: true, suggested: null },
    }));
  }, []);

  const handleTogglePrimaryKey = (id: string) => {
    setColumns(
      columns.map((col) => ({
        ...col,
        primaryKey: col.id === id ? !col.primaryKey : col.primaryKey,
        nullable: col.id === id && !col.primaryKey ? false : col.nullable,
      }))
    );
  };

  const validateForm = (): string | null => {
    if (!tableName.trim()) return 'Table name is required';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return 'Table name must start with a letter or underscore and contain only letters, numbers, and underscores';
    }

    if (tableType === 'external') {
      if (!stageLocation.trim()) return 'Stage location is required for external tables';
    }

    if (tableType === 'iceberg') {
      if (!externalVolume.trim()) return 'External volume is required for Iceberg tables';
      if (!baseLocation.trim()) return 'Base location is required for Iceberg tables';
    }

    // Column validation for non-external types (external can infer columns)
    if (tableType !== 'external' || columns.some(c => c.name.trim())) {
      const columnNames = columns.map((col) => col.name.trim().toUpperCase());
      const duplicateNames = columnNames.filter(
        (name, index) => name && columnNames.indexOf(name) !== index
      );
      if (duplicateNames.length > 0) return `Duplicate column names: ${duplicateNames.join(', ')}`;

      for (const col of columns) {
        if (!col.name.trim()) return 'All columns must have a name';
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)) {
          return `Column "${col.name}" has an invalid name format`;
        }
      }
    }

    return null;
  };

  const generateSQL = (): string => {
    const primaryKeyColumns = columns.filter((col) => col.primaryKey).map((col) => col.name);
    const columnDefinitions = columns
      .filter(c => c.name.trim())
      .map((col) => {
        let def = `  ${col.name} ${col.dataType}`;
        if (!col.nullable) def += ' NOT NULL';
        if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
        if (col.comment) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
        return def;
      })
      .join(',\n');

    const fqn = `${database}.${schema}.${tableName}`;

    // SQL prefix per table type
    let prefix: string;
    switch (tableType) {
      case 'temporary':
        prefix = `CREATE TEMPORARY TABLE ${fqn}`;
        break;
      case 'transient':
        prefix = `CREATE TRANSIENT TABLE ${fqn}`;
        break;
      case 'external':
        prefix = `CREATE EXTERNAL TABLE ${fqn}`;
        break;
      case 'iceberg':
        prefix = `CREATE ICEBERG TABLE ${fqn}`;
        break;
      default:
        prefix = `CREATE TABLE IF NOT EXISTS${fqn}`;
    }

    let sql = '';

    if (tableType === 'external') {
      // External table: columns are optional (can use inferred schema)
      if (columnDefinitions) {
        sql = `${prefix} (\n${columnDefinitions}\n)\n`;
      } else {
        sql = `${prefix}\n`;
      }
      sql += `  WITH LOCATION = ${stageLocation}\n`;
      sql += `  FILE_FORMAT = (TYPE = '${fileFormat}')`;
      if (filePattern) sql += `\n  PATTERN = '${filePattern}'`;
      if (autoRefresh) sql += `\n  AUTO_REFRESH = TRUE`;
    } else if (tableType === 'iceberg') {
      sql = `${prefix} (\n${columnDefinitions}`;
      if (primaryKeyColumns.length > 0) {
        sql += `,\n  PRIMARY KEY (${primaryKeyColumns.join(', ')})`;
      }
      sql += `\n)\n`;
      sql += `  CATALOG = '${icebergCatalog}'\n`;
      sql += `  EXTERNAL_VOLUME = '${externalVolume}'\n`;
      sql += `  BASE_LOCATION = '${baseLocation}'`;
    } else {
      // Standard / Temporary / Transient — same column structure
      sql = `${prefix} (\n${columnDefinitions}`;
      if (primaryKeyColumns.length > 0) {
        sql += `,\n  PRIMARY KEY (${primaryKeyColumns.join(', ')})`;
      }
      sql += '\n)';
    }

    if (tableComment) {
      sql += `\nCOMMENT = '${tableComment.replace(/'/g, "''")}'`;
    }

    sql += ';';
    return sql;
  };

  const handleCreate = async () => {
    // Trigger react-hook-form validation on table name first
    const tableNameValid = await triggerTableNameValidation('tableName');
    if (!tableNameValid) return;

    const error = validateForm();
    if (error) { toast.error(error); return; }
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const sql = generateSQL();

      // DDL action is auto-synced by the central DDL sync effect in page.tsx
      addEvent({
        type: 'TABLE_CREATED',
        projectId,
        target: { database, schema, table: tableName },
        payload: {
          tableName,
          tableType,
          columns: columns.filter(c => c.name.trim()).map((col) => ({
            name: col.name, dataType: col.dataType, nullable: col.nullable,
            primaryKey: col.primaryKey, defaultValue: col.defaultValue, comment: col.comment,
          })),
          primaryKeys: columns.filter((col) => col.primaryKey).map((col) => col.name),
          comment: tableComment,
          sql,
        },
      });

      toast.success(`${TABLE_TYPES.find(t => t.value === tableType)?.label || 'Table'} "${tableName}" added to deployment queue`);

      if (onTableCreated) {
        onTableCreated(tableName, database, schema, columns);
      }

      // Reset form
      setTableName('');
      setTablePurpose('');
      setColumns([{ id: '1', name: '', dataType: 'VARCHAR', nullable: true, primaryKey: false }]);
      setTableComment('');
      setStageLocation(''); setFileFormat('PARQUET'); setFilePattern(''); setAutoRefresh(false);
      setExternalVolume(''); setIcebergCatalog('SNOWFLAKE'); setBaseLocation('');
      setAiSuggestions([]); setAiDismissed(false); lastAiQuery.current = '';
      setMatResult(null);
      setTableNameCheck(null); setColumnNameChecks({});
      pendingColumnChecks.current = {};
      if (columnCheckTimer.current) clearTimeout(columnCheckTimer.current);

      onClose();
    } catch (error: any) {
      console.error('Failed to create table event:', error);
      toast.error(error.message || 'Failed to create table event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const primaryKeyCount = columns.filter((col) => col.primaryKey).length;
  const namingCheckerEnabled = isAiEnabled('naming_checker');
  const currentTypeInfo = TABLE_TYPES.find(t => t.value === tableType);

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title={`Create ${currentTypeInfo?.label} Table`}
      subtitle={`${database}.${schema}`}
      widthClass="max-w-2xl"
      icon={
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <TableIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} className="gap-2" disabled={isSubmitting} isLoading={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Creating...' : `Create ${currentTypeInfo?.label} Table`}
          </Button>
        </div>
      }
    >
      <div>
        {/* Table Type Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2 dark:text-white">Table Type</label>
          <div className="grid grid-cols-5 gap-2">
            {TABLE_TYPES.map((tt) => (
              <button
                key={tt.value}
                onClick={() => setTableType(tt.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center',
                  tableType === tt.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                )}
              >
                {tt.icon}
                <span className="text-xs font-medium">{tt.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-xs text-slate-500 flex-1">{currentTypeInfo?.description}</p>
            {isAiEnabled('materialization_strategy') && (
              <button
                type="button"
                disabled={matLoading || !tableName.trim()}
                onClick={handleSuggestType}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  'border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300',
                  'hover:bg-violet-50 dark:hover:bg-violet-900/30',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {matLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Suggest Type
              </button>
            )}
          </div>
          {matResult?.recommendation && (
            <div className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">
              <p>
                <Sparkles className="inline h-3 w-3 mr-1" />
                <span className="font-medium">{matResult.recommendation}</span>
                {' — '}{matResult.rationale}
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                Reads: {matResult.read_count_30d} · Writes: {matResult.write_count_30d} · Ratio: {matResult.read_write_ratio}:1
              </p>
            </div>
          )}
        </div>

        {/* Table Name */}
        <div className="mb-4">
          <label htmlFor="create-table-name" className="block text-sm font-medium mb-2 dark:text-white">
            Table Name <span className="text-red-500">*</span>
          </label>
          <Input
            value={tableName}
            onChange={(e) => {
              setTableName(e.target.value);
              setTableNameValue('tableName', e.target.value);
              if (tableNameErrors.tableName) clearTableNameErrors('tableName');
              if (tableNameCheck) setTableNameCheck(null);
            }}
            onBlur={handleTableNameBlur}
            placeholder="e.g., DIM_CUSTOMER"
            className="w-full"
          />
          {/* Naming convention feedback for table name */}
          {namingCheckerEnabled && tableNameCheckLoading && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Loader2 className="h-3 w-3 text-slate-400 animate-spin" />
              <span className="text-xs text-slate-400">Checking naming convention...</span>
            </div>
          )}
          {namingCheckerEnabled && tableNameCheck && !tableNameCheckLoading && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {tableNameCheck.valid ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-green-600 dark:text-green-400">Naming convention OK</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Does not follow UPPER_SNAKE convention
                    {tableNameCheck.suggested && (
                      <>
                        {" \u2014 "}
                        <button
                          type="button"
                          onClick={() => applyTableNameSuggestion(tableNameCheck.suggested!)}
                          className="underline font-medium hover:text-amber-700 dark:hover:text-amber-300"
                        >
                          use {tableNameCheck.suggested}
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Table Purpose + AI Suggest */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 dark:text-white">
            Table Purpose
            <span className="text-xs text-slate-400 ml-1.5 font-normal">(improves AI suggestions)</span>
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                options={TABLE_PURPOSES}
                value={tablePurpose}
                onChange={(v: any) => setTablePurpose(v?.value || v || '')}
                placeholder="Select table purpose..."
                clearable
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAiSuggestions(true)}
              disabled={aiLoading || tableName.trim().length < 3}
              className="gap-1.5 flex-shrink-0 border-violet-300 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20"
              title="Suggest columns with AI"
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{aiLoading ? 'Suggesting...' : 'Suggest Columns'}</span>
            </Button>
          </div>
          {tableNameErrors.tableName && (
            <p id="create-table-name-error" className="mt-1 text-xs text-red-500" role="alert">
              {tableNameErrors.tableName.message as string}
            </p>
          )}
        </div>

        {/* External Table Fields */}
        {tableType === 'external' && (
          <div className="mb-4 p-4 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 space-y-3">
            <h4 className="text-sm font-semibold text-sky-700 dark:text-sky-400 flex items-center gap-2">
              <Cloud className="h-4 w-4" /> External Table Configuration
            </h4>
            <Input
              label="Stage Location *"
              value={stageLocation}
              onChange={(e) => setStageLocation(e.target.value)}
              placeholder="@my_stage/path/"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="File Format"
                options={[
                  { value: 'PARQUET', label: 'PARQUET' },
                  { value: 'CSV', label: 'CSV' },
                  { value: 'JSON', label: 'JSON' },
                  { value: 'AVRO', label: 'AVRO' },
                  { value: 'ORC', label: 'ORC' },
                ]}
                value={fileFormat}
                onChange={(v: any) => setFileFormat(v?.value || v)}
              />
              <Input
                label="File Pattern"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
                placeholder=".*\\.parquet"
              />
            </div>
            <Checkbox
              checked={autoRefresh}
              onChange={() => setAutoRefresh(!autoRefresh)}
              label="Auto-refresh metadata"
              className="text-sm"
            />
          </div>
        )}

        {/* Iceberg Table Fields */}
        {tableType === 'iceberg' && (
          <div className="mb-4 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 space-y-3">
            <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
              <Snowflake className="h-4 w-4" /> Iceberg Configuration
            </h4>
            <Input
              label="External Volume *"
              value={externalVolume}
              onChange={(e) => setExternalVolume(e.target.value)}
              placeholder="my_external_volume"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Catalog"
                options={[
                  { value: 'SNOWFLAKE', label: 'Managed (default)' },
                  { value: 'GLUE', label: 'AWS Glue' },
                  { value: 'OBJECT_STORE', label: 'Object Store' },
                ]}
                value={icebergCatalog}
                onChange={(v: any) => setIcebergCatalog(v?.value || v)}
              />
              <Input
                label="Base Location *"
                value={baseLocation}
                onChange={(e) => setBaseLocation(e.target.value)}
                placeholder="my_db/my_table"
              />
            </div>
          </div>
        )}

        {/* Table Comment */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 dark:text-white">Table Comment (Optional)</label>
          <Input
            value={tableComment}
            onChange={(e) => setTableComment(e.target.value)}
            placeholder="Description of the table"
            className="w-full"
          />
        </div>

        {/* AI Suggested Columns */}
        {aiLoading && (
          <div className="mb-4 p-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 flex items-center gap-3">
            <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
            <span className="text-sm text-violet-600 dark:text-violet-400">AI is suggesting columns for "{tableName}"...</span>
          </div>
        )}

        {aiSuggestions.length > 0 && !aiDismissed && (
          <div className="mb-4 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between bg-violet-100/50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800">
              <span className="text-sm font-medium text-violet-700 dark:text-violet-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                AI Suggested Columns ({aiSuggestions.length})
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs border-violet-300 text-violet-600 hover:bg-violet-100"
                  onClick={handleAcceptAllSuggestions}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Accept All
                </Button>
                <button
                  onClick={() => { setAiDismissed(true); setAiSuggestions([]); }}
                  className="p-1 text-violet-400 hover:text-violet-600 rounded"
                  title="Dismiss suggestions"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="divide-y divide-violet-100 dark:divide-violet-800/50 max-h-52 overflow-y-auto">
              {aiSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="px-4 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono font-medium text-slate-800 dark:text-slate-200">
                      {suggestion.name}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      {suggestion.comment || suggestion.dataType}
                    </span>
                    {suggestion.primaryKey && (
                      <Badge size="sm" className="ml-2 bg-amber-100 text-amber-700 text-[10px]">
                        <Key className="h-2.5 w-2.5 mr-0.5" />PK
                      </Badge>
                    )}
                    {!suggestion.nullable && !suggestion.primaryKey && (
                      <Badge size="sm" className="ml-1 bg-slate-100 text-slate-500 text-[10px]">NOT NULL</Badge>
                    )}
                  </div>
                  <button
                    onClick={() => handleAcceptSuggestion(suggestion)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 transition-colors"
                    title="Accept"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleRejectSuggestion(suggestion.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 transition-colors"
                    title="Reject"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Columns Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold dark:text-white">Columns</h3>
            <Badge className="bg-slate-100 text-slate-600">{columns.length}</Badge>
            {primaryKeyCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
                <Key className="h-3 w-3" />
                {primaryKeyCount} PK
              </Badge>
            )}
          </div>
          <Button size="sm" onClick={handleAddColumn} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Column
          </Button>
        </div>

        {/* Columns List */}
        <div className="max-h-64 overflow-y-auto space-y-3 mb-6 border dark:border-slate-700 rounded-lg p-4">
          {columns.map((column) => (
            <div
              key={column.id}
              className="p-3 border dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 dark:text-slate-300">
                      Column Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={column.name}
                      onChange={(e) => {
                        handleColumnChange(column.id, 'name', e.target.value);
                        if (columnNameChecks[column.id]) {
                          setColumnNameChecks(prev => {
                            const next = { ...prev };
                            delete next[column.id];
                            return next;
                          });
                        }
                      }}
                      onBlur={() => handleColumnNameBlur(column.id, column.name)}
                      placeholder="e.g., CUSTOMER_ID"
                      size="sm"
                    />
                    {/* Naming convention feedback for column */}
                    {namingCheckerEnabled && columnNameChecks[column.id] && (
                      <div className="flex items-center gap-1 mt-1">
                        {columnNameChecks[column.id].valid ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                        ) : (
                          <>
                            <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 truncate">
                              {columnNameChecks[column.id].suggested ? (
                                <button
                                  type="button"
                                  onClick={() => applyColumnNameSuggestion(column.id, columnNameChecks[column.id].suggested!)}
                                  className="underline hover:text-amber-700 dark:hover:text-amber-300"
                                >
                                  use {columnNameChecks[column.id].suggested}
                                </button>
                              ) : (
                                'Invalid naming'
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 dark:text-slate-300">Data Type</label>
                    <Select
                      options={DATA_TYPES}
                      value={column.dataType}
                      onChange={(value) => handleColumnChange(column.id, 'dataType', value)}
                      size="sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 dark:text-slate-300">Default Value</label>
                    <Input
                      value={column.defaultValue || ''}
                      onChange={(e) => handleColumnChange(column.id, 'defaultValue', e.target.value)}
                      placeholder="NULL, 0, 'value'"
                      size="sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 dark:text-slate-300">Comment</label>
                    <Input
                      value={column.comment || ''}
                      onChange={(e) => handleColumnChange(column.id, 'comment', e.target.value)}
                      placeholder="Column description"
                      size="sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-6">
                  <button
                    onClick={() => handleTogglePrimaryKey(column.id)}
                    className={`p-2 rounded border transition-colors ${
                      column.primaryKey
                        ? 'bg-amber-100 border-amber-300 text-amber-700'
                        : 'border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="Primary Key"
                  >
                    <Key className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveColumn(column.id)}
                    className="p-2 rounded border border-slate-300 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                    title="Remove Column"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 pt-3 border-t dark:border-slate-600">
                <Checkbox
                  checked={!column.nullable}
                  onChange={() => handleColumnChange(column.id, 'nullable', !column.nullable)}
                  disabled={column.primaryKey}
                  label="NOT NULL"
                  className="text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </DesignDockPanel>
  );
};

export default CreateTableModal;
