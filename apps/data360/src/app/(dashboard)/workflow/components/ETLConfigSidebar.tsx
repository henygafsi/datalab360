'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Node } from 'reactflow';
import {
  X, AlertCircle, ChevronDown, Loader2, Trash2, Save, Plus, Minus
} from 'lucide-react';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { getBlockByType } from './etl-blocks';
import apiClient from '@/lib/api-client';
import type {
  ComponentType,
  SourceConfig,
  JoinConfig,
  FilterConfig,
  FilterCondition,
  AggregateConfig,
  AggregationDef,
  SelectConfig,
  RenameConfig,
  CastConfig,
  FormulaConfig,
  FormulaDef,
  SortConfig,
  SortOrderDef,
  UnionConfig,
  DistinctConfig,
  LimitConfig,
  RecommendationConfig,
  SegmentationConfig,
  ClusteringConfig,
  DestinationConfig,
  ExportFileConfig,
} from '@/app/services/etl/types';

// ============================================
// FORM COMPONENTS
// ============================================

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

const FormField: React.FC<FormFieldProps> = ({ label, error, required, children, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && !error && (
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    )}
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {error}
      </p>
    )}
  </div>
);

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder, disabled, error }) => (
  <div className="relative">
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 rounded-lg border appearance-none',
        'bg-white dark:bg-slate-800',
        'text-sm text-slate-800 dark:text-slate-100',
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
        error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
  </div>
);

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ values, onChange, options, placeholder, disabled }) => (
  <select
    multiple
    value={values}
    onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
    disabled={disabled}
    className={cn(
      'w-full px-3 py-2 rounded-lg border h-32',
      'bg-white dark:bg-slate-800',
      'text-sm text-slate-800 dark:text-slate-100',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      'border-slate-200 dark:border-slate-700',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  >
    {options.map((opt) => (
      <option key={opt} value={opt}>{opt}</option>
    ))}
  </select>
);

interface InputProps {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  type?: string;
}

const Input: React.FC<InputProps> = ({ value, onChange, placeholder, disabled, error, type = 'text' }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    className={cn(
      'w-full px-3 py-2 rounded-lg border',
      'bg-white dark:bg-slate-800',
      'text-sm text-slate-800 dark:text-slate-100',
      'placeholder:text-slate-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  />
);

interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  rows?: number;
  className?: string;
}

const Textarea: React.FC<TextareaProps> = ({ value, onChange, placeholder, disabled, error, rows = 4, className }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    rows={rows}
    className={cn(
      'w-full px-3 py-2 rounded-lg border resize-y',
      'bg-white dark:bg-slate-800',
      'text-sm text-slate-800 dark:text-slate-100',
      'placeholder:text-slate-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500',
      error ? 'border-red-500' : 'border-slate-200 dark:border-slate-700',
      disabled && 'opacity-50 cursor-not-allowed',
      className
    )}
  />
);

// ============================================
// HELPER FUNCTIONS
// ============================================

const extractString = (item: unknown): string => {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    if ('name' in item) return String((item as { name: unknown }).name);
    if ('value' in item) return String((item as { value: unknown }).value);
  }
  return String(item);
};

const normalizeToStringArray = (items: unknown): string[] => {
  if (!items) return [];
  if (!Array.isArray(items)) return [];
  return items.map(extractString).filter(Boolean);
};

// ============================================
// CONFIG FORMS
// ============================================

// Source Config
const SourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
}> = ({ data, onChange, errors, accessToken }) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const config = data.config || data;

  useEffect(() => {
    if (!accessToken) return;
    setLoading('databases');
    getDatabases()
      .then(setDatabases)
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !config.database) return;
    setLoading('schemas');
    setSchemas([]);
    getSchemas(config.database)
      .then(setSchemas)
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, config.database]);

  useEffect(() => {
    if (!accessToken || !config.database || !config.schema) return;
    setLoading('tables');
    setTables([]);
    getTables(config.database, config.schema)
      .then(setTables)
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, config.database, config.schema]);

  useEffect(() => {
    if (!accessToken || !config.database || !config.schema || !config.table) return;
    setLoading('columns');
    setColumns([]);
    getTableColumns(config.database, config.schema, config.table)
      .then((cols) => setColumns(cols.map((c) => (c.name ?? (c as any).COLUMN_NAME) || '').filter(Boolean)))
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, config.database, config.schema, config.table]);

  const updateConfig = (updates: Partial<SourceConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Database" required error={errors.database}>
        <Select
          value={config.database || ''}
          onChange={(v) => updateConfig({ database: v, schema: '', table: '', columns: [] })}
          options={databases.map((d) => ({ value: d, label: d }))}
          placeholder="Select database..."
          disabled={loading === 'databases'}
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema}>
        <Select
          value={config.schema || ''}
          onChange={(v) => updateConfig({ schema: v, table: '', columns: [] })}
          options={schemas.map((s) => ({ value: s, label: s }))}
          placeholder="Select schema..."
          disabled={!config.database || loading === 'schemas'}
          error={!!errors.schema}
        />
      </FormField>

      <FormField label="Table" required error={errors.table}>
        <Select
          value={config.table || ''}
          onChange={(v) => updateConfig({ table: v, columns: [] })}
          options={tables.map((t) => ({ value: t, label: t }))}
          placeholder="Select table..."
          disabled={!config.schema || loading === 'tables'}
          error={!!errors.table}
        />
      </FormField>

      <FormField label="Columns" hint="Select columns or leave for all (SELECT *)">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={columns}
          disabled={!config.table || loading === 'columns'}
        />
        {columns.length > 0 && (!config.columns || config.columns.length === 0) && (
          <button
            type="button"
            onClick={() => updateConfig({ columns: columns })}
            className="mt-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
          >
            Select all {columns.length} columns
          </button>
        )}
      </FormField>

      <FormField label="WHERE Clause" hint="Optional filter condition">
        <Input
          value={config.where_clause || ''}
          onChange={(v) => updateConfig({ where_clause: v })}
          placeholder="e.g., STATUS = 'active'"
        />
      </FormField>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {loading}...
        </div>
      )}
    </div>
  );
};

// Join Config
const JoinConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  leftInputColumns: string[];
  rightInputColumns: string[];
}> = ({ data, onChange, errors, leftInputColumns, rightInputColumns }) => {
  const config = data.config || data;
  const joinTypes = [
    { value: 'INNER', label: 'Inner Join' },
    { value: 'LEFT', label: 'Left Join' },
    { value: 'RIGHT', label: 'Right Join' },
    { value: 'FULL', label: 'Full Outer Join' },
    { value: 'CROSS', label: 'Cross Join' },
  ];

  const updateConfig = (updates: Partial<JoinConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const noColumnsAvailable = leftInputColumns.length === 0 && rightInputColumns.length === 0;

  return (
    <div className="space-y-4">
      {noColumnsAvailable && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>No columns available.</strong> Please configure the Source nodes connected to this Join and select their columns first.
          </p>
        </div>
      )}

      <FormField label="Join Type" required>
        <Select
          value={config.join_type || 'INNER'}
          onChange={(v) => updateConfig({ join_type: v as JoinConfig['join_type'] })}
          options={joinTypes}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Left Key" required error={errors.left_key}>
          <Select
            value={config.left_key || ''}
            onChange={(v) => updateConfig({ left_key: v })}
            options={leftInputColumns.map((c) => ({ value: c, label: c }))}
            placeholder={leftInputColumns.length === 0 ? 'No columns' : 'Select...'}
            error={!!errors.left_key}
            disabled={leftInputColumns.length === 0}
          />
          {leftInputColumns.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Configure left Source first</p>
          )}
        </FormField>

        <FormField label="Right Key" required error={errors.right_key}>
          <Select
            value={config.right_key || ''}
            onChange={(v) => updateConfig({ right_key: v })}
            options={rightInputColumns.map((c) => ({ value: c, label: c }))}
            placeholder={rightInputColumns.length === 0 ? 'No columns' : 'Select...'}
            error={!!errors.right_key}
            disabled={rightInputColumns.length === 0}
          />
          {rightInputColumns.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Configure right Source first</p>
          )}
        </FormField>
      </div>

      <FormField label="Exclude Right Columns" hint="Columns to exclude from right table (avoid duplicates)">
        <MultiSelect
          values={config.exclude_right_columns || []}
          onChange={(v) => updateConfig({ exclude_right_columns: v })}
          options={rightInputColumns}
          disabled={rightInputColumns.length === 0}
        />
      </FormField>
    </div>
  );
};

// Filter Config
const FilterConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const conditions: FilterCondition[] = config.conditions || [];

  const operators = [
    { value: '=', label: '=' },
    { value: '!=', label: '!=' },
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: 'LIKE', label: 'LIKE' },
    { value: 'IN', label: 'IN' },
    { value: 'IS NULL', label: 'IS NULL' },
    { value: 'IS NOT NULL', label: 'IS NOT NULL' },
  ];

  const updateConfig = (updates: Partial<FilterConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addCondition = () => {
    updateConfig({ conditions: [...conditions, { column: '', operator: '=', value: '' }] });
  };

  const removeCondition = (index: number) => {
    updateConfig({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    updateConfig({ conditions: newConditions });
  };

  return (
    <div className="space-y-4">
      <FormField label="Logic">
        <Select
          value={config.logic || 'AND'}
          onChange={(v) => updateConfig({ logic: v as 'AND' | 'OR' })}
          options={[
            { value: 'AND', label: 'AND (all conditions)' },
            { value: 'OR', label: 'OR (any condition)' },
          ]}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Conditions</label>
          <button
            onClick={addCondition}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {conditions.map((cond, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <Select
              value={cond.column}
              onChange={(v) => updateCondition(i, { column: v })}
              options={availableColumns.map((c) => ({ value: c, label: c }))}
              placeholder="Column"
            />
            <Select
              value={cond.operator}
              onChange={(v) => updateCondition(i, { operator: v as FilterCondition['operator'] })}
              options={operators}
            />
            {!['IS NULL', 'IS NOT NULL'].includes(cond.operator) && (
              <Input
                value={String(cond.value || '')}
                onChange={(v) => updateCondition(i, { value: v })}
                placeholder="Value"
              />
            )}
            <button
              onClick={() => removeCondition(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ))}

        {conditions.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No conditions added</p>
        )}
      </div>
    </div>
  );
};

// Aggregate Config
const AggregateConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const aggregations: AggregationDef[] = config.aggregations || [];

  const aggFunctions = [
    { value: 'SUM', label: 'SUM' },
    { value: 'AVG', label: 'AVG' },
    { value: 'COUNT', label: 'COUNT' },
    { value: 'MIN', label: 'MIN' },
    { value: 'MAX', label: 'MAX' },
    { value: 'COUNT_DISTINCT', label: 'COUNT DISTINCT' },
    { value: 'LISTAGG', label: 'LISTAGG' },
  ];

  const updateConfig = (updates: Partial<AggregateConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addAggregation = () => {
    updateConfig({ aggregations: [...aggregations, { column: '', function: 'SUM', alias: '' }] });
  };

  const removeAggregation = (index: number) => {
    updateConfig({ aggregations: aggregations.filter((_, i) => i !== index) });
  };

  const updateAggregation = (index: number, updates: Partial<AggregationDef>) => {
    const newAggregations = [...aggregations];
    newAggregations[index] = { ...newAggregations[index], ...updates };
    updateConfig({ aggregations: newAggregations });
  };

  return (
    <div className="space-y-4">
      <FormField label="Group By" hint="Columns to group by">
        <MultiSelect
          values={config.group_by || []}
          onChange={(v) => updateConfig({ group_by: v })}
          options={availableColumns}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Aggregations</label>
          <button
            onClick={addAggregation}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {aggregations.map((agg, i) => (
          <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={agg.function}
                onChange={(v) => updateAggregation(i, { function: v as AggregationDef['function'] })}
                options={aggFunctions}
              />
              <Select
                value={agg.column}
                onChange={(v) => updateAggregation(i, { column: v })}
                options={availableColumns.map((c) => ({ value: c, label: c }))}
                placeholder="Column"
              />
              <button
                onClick={() => removeAggregation(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <Input
              value={agg.alias}
              onChange={(v) => updateAggregation(i, { alias: v })}
              placeholder="Alias (e.g., total_sales)"
            />
          </div>
        ))}

        {aggregations.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No aggregations added</p>
        )}
      </div>
    </div>
  );
};

// Select Config
const SelectConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<SelectConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Columns" required error={errors.columns} hint="Select columns to include">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

// Rename Config
const RenameConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const mappings: Record<string, string> = config.mappings || {};
  const entries = Object.entries(mappings);

  const updateConfig = (updates: Partial<RenameConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addMapping = () => {
    updateConfig({ mappings: { ...mappings, '': '' } });
  };

  const removeMapping = (oldName: string) => {
    const newMappings = { ...mappings };
    delete newMappings[oldName];
    updateConfig({ mappings: newMappings });
  };

  const updateMapping = (oldKey: string, newKey: string, newValue: string) => {
    const newMappings = { ...mappings };
    delete newMappings[oldKey];
    newMappings[newKey] = newValue;
    updateConfig({ mappings: newMappings });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Column Mappings</label>
        <button
          onClick={addMapping}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {entries.map(([oldName, newName], i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={oldName}
            onChange={(v) => updateMapping(oldName, v, newName)}
            options={availableColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Old name"
          />
          <span className="text-slate-400">→</span>
          <Input
            value={newName}
            onChange={(v) => updateMapping(oldName, oldName, v)}
            placeholder="New name"
          />
          <button
            onClick={() => removeMapping(oldName)}
            className="p-1 text-red-500 hover:bg-red-100 rounded"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}

      {entries.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No mappings added</p>
      )}
    </div>
  );
};

// Cast Config
const CastConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const casts: Record<string, string> = config.casts || {};
  const entries = Object.entries(casts);

  const dataTypes = [
    { value: 'VARCHAR', label: 'VARCHAR' },
    { value: 'NUMBER', label: 'NUMBER' },
    { value: 'DECIMAL(18,2)', label: 'DECIMAL(18,2)' },
    { value: 'INTEGER', label: 'INTEGER' },
    { value: 'FLOAT', label: 'FLOAT' },
    { value: 'DATE', label: 'DATE' },
    { value: 'TIMESTAMP', label: 'TIMESTAMP' },
    { value: 'BOOLEAN', label: 'BOOLEAN' },
  ];

  const updateConfig = (updates: Partial<CastConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addCast = () => {
    updateConfig({ casts: { ...casts, '': 'VARCHAR' } });
  };

  const removeCast = (col: string) => {
    const newCasts = { ...casts };
    delete newCasts[col];
    updateConfig({ casts: newCasts });
  };

  const updateCast = (oldCol: string, newCol: string, type: string) => {
    const newCasts = { ...casts };
    delete newCasts[oldCol];
    newCasts[newCol] = type;
    updateConfig({ casts: newCasts });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Type Casts</label>
        <button
          onClick={addCast}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {entries.map(([col, type], i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={col}
            onChange={(v) => updateCast(col, v, type)}
            options={availableColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Column"
          />
          <span className="text-slate-400">→</span>
          <Select
            value={type}
            onChange={(v) => updateCast(col, col, v)}
            options={dataTypes}
          />
          <button
            onClick={() => removeCast(col)}
            className="p-1 text-red-500 hover:bg-red-100 rounded"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}

      {entries.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No casts added</p>
      )}
    </div>
  );
};

// Formula Config
const FormulaConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const formulas: FormulaDef[] = config.formulas || [];

  const updateConfig = (updates: Partial<FormulaConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addFormula = () => {
    updateConfig({ formulas: [...formulas, { name: '', expression: '' }] });
  };

  const removeFormula = (index: number) => {
    updateConfig({ formulas: formulas.filter((_, i) => i !== index) });
  };

  const updateFormula = (index: number, updates: Partial<FormulaDef>) => {
    const newFormulas = [...formulas];
    newFormulas[index] = { ...newFormulas[index], ...updates };
    updateConfig({ formulas: newFormulas });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Calculated Columns</label>
        <button
          onClick={addFormula}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {formulas.map((formula, i) => (
        <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={formula.name}
              onChange={(v) => updateFormula(i, { name: v })}
              placeholder="Column name"
            />
            <button
              onClick={() => removeFormula(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
          <Input
            value={formula.expression}
            onChange={(v) => updateFormula(i, { expression: v })}
            placeholder="Expression (e.g., revenue - cost)"
          />
        </div>
      ))}

      {formulas.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No formulas added</p>
      )}

      <div className="text-xs text-slate-500 p-2 bg-slate-100 dark:bg-slate-800 rounded">
        Available columns: {availableColumns.join(', ') || 'Connect an input first'}
      </div>
    </div>
  );
};

// Sort Config
const SortConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const orderBy: SortOrderDef[] = config.order_by || [];

  const updateConfig = (updates: Partial<SortConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addSort = () => {
    updateConfig({ order_by: [...orderBy, { column: '', direction: 'ASC' }] });
  };

  const removeSort = (index: number) => {
    updateConfig({ order_by: orderBy.filter((_, i) => i !== index) });
  };

  const updateSort = (index: number, updates: Partial<SortOrderDef>) => {
    const newOrderBy = [...orderBy];
    newOrderBy[index] = { ...newOrderBy[index], ...updates };
    updateConfig({ order_by: newOrderBy });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Sort Order</label>
        <button
          onClick={addSort}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {orderBy.map((sort, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={sort.column}
            onChange={(v) => updateSort(i, { column: v })}
            options={availableColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Column"
          />
          <Select
            value={sort.direction}
            onChange={(v) => updateSort(i, { direction: v as 'ASC' | 'DESC' })}
            options={[
              { value: 'ASC', label: 'ASC' },
              { value: 'DESC', label: 'DESC' },
            ]}
          />
          <button
            onClick={() => removeSort(i)}
            className="p-1 text-red-500 hover:bg-red-100 rounded"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}

      {orderBy.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No sort columns added</p>
      )}
    </div>
  );
};

// Union Config
const UnionConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<UnionConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Union Mode">
        <Select
          value={config.union_all ? 'true' : 'false'}
          onChange={(v) => updateConfig({ union_all: v === 'true' })}
          options={[
            { value: 'false', label: 'UNION (remove duplicates)' },
            { value: 'true', label: 'UNION ALL (keep all rows)' },
          ]}
        />
      </FormField>
    </div>
  );
};

// Distinct Config
const DistinctConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<DistinctConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Columns" hint="Leave empty for all columns">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

// Limit Config
const LimitConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<LimitConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Limit" required error={errors.limit}>
        <Input
          type="number"
          value={config.limit || ''}
          onChange={(v) => updateConfig({ limit: parseInt(v) || 0 })}
          placeholder="Number of rows"
          error={!!errors.limit}
        />
      </FormField>

      <FormField label="Offset" hint="Number of rows to skip">
        <Input
          type="number"
          value={config.offset || ''}
          onChange={(v) => updateConfig({ offset: parseInt(v) || 0 })}
          placeholder="0"
        />
      </FormField>
    </div>
  );
};

// Recommendation Config
const RecommendationConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<RecommendationConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Score Column" required error={errors.score_column} hint="Name of the output score/rank column">
        <Input
          value={config.score_column || ''}
          onChange={(v) => updateConfig({ score_column: v })}
          placeholder="e.g., recommendation_score"
          error={!!errors.score_column}
        />
      </FormField>

      <FormField label="Model Type">
        <Select
          value={config.model_type || 'cortex'}
          onChange={(v) => updateConfig({ model_type: v as RecommendationConfig['model_type'] })}
          options={[
            { value: 'cortex', label: 'Cortex LLM' },
            { value: 'custom', label: 'Custom Model' },
          ]}
        />
      </FormField>

      <FormField label="Input ID Column" hint="Column identifying items to score">
        <Select
          value={config.input_id_column || ''}
          onChange={(v) => updateConfig({ input_id_column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
        />
      </FormField>

      <FormField label="Output Table" hint="Optional table to store results">
        <Input
          value={config.output_table || ''}
          onChange={(v) => updateConfig({ output_table: v })}
          placeholder="e.g., RECOMMENDATIONS_OUTPUT"
        />
      </FormField>
    </div>
  );
};

// Segmentation Config
const SegmentationConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const rules: Array<{ name: string; condition: string }> = config.rules || [];

  const updateConfig = (updates: Partial<SegmentationConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addRule = () => {
    updateConfig({ rules: [...rules, { name: '', condition: '' }] });
  };

  const removeRule = (index: number) => {
    updateConfig({ rules: rules.filter((_, i) => i !== index) });
  };

  const updateRule = (index: number, updates: Partial<{ name: string; condition: string }>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    updateConfig({ rules: newRules });
  };

  return (
    <div className="space-y-4">
      <FormField label="Segment Column" required error={errors.segment_column} hint="Name of the output segment column">
        <Input
          value={config.segment_column || ''}
          onChange={(v) => updateConfig({ segment_column: v })}
          placeholder="e.g., customer_segment"
          error={!!errors.segment_column}
        />
      </FormField>

      <FormField label="Method" required>
        <Select
          value={config.method || 'rules'}
          onChange={(v) => updateConfig({ method: v as SegmentationConfig['method'] })}
          options={[
            { value: 'rules', label: 'Rule-based (CASE WHEN)' },
            { value: 'rfm', label: 'RFM Analysis' },
            { value: 'model', label: 'ML Model' },
          ]}
        />
      </FormField>

      {config.method === 'rules' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Rules</label>
            <button
              onClick={addRule}
              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>

          {rules.map((rule, i) => (
            <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={rule.name}
                  onChange={(v) => updateRule(i, { name: v })}
                  placeholder="Segment name (e.g., VIP)"
                />
                <button
                  onClick={() => removeRule(i)}
                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={rule.condition}
                onChange={(v) => updateRule(i, { condition: v })}
                placeholder="Condition (e.g., total_spend > 1000)"
              />
            </div>
          ))}

          {rules.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-2">No rules added</p>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 p-2 bg-slate-100 dark:bg-slate-800 rounded">
        Available columns: {availableColumns.join(', ') || 'Connect an input first'}
      </div>
    </div>
  );
};

// Clustering Config
const ClusteringConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<ClusteringConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Cluster Column" required error={errors.cluster_column} hint="Name of the output cluster column">
        <Input
          value={config.cluster_column || ''}
          onChange={(v) => updateConfig({ cluster_column: v })}
          placeholder="e.g., cluster_id"
          error={!!errors.cluster_column}
        />
      </FormField>

      <FormField label="Method" required>
        <Select
          value={config.method || 'kmeans_sql'}
          onChange={(v) => updateConfig({ method: v as ClusteringConfig['method'] })}
          options={[
            { value: 'kmeans_sql', label: 'K-Means (SQL)' },
            { value: 'cortex_ml', label: 'Cortex ML' },
          ]}
        />
      </FormField>

      <FormField label="Number of Clusters" error={errors.n_clusters}>
        <Input
          type="number"
          value={config.n_clusters || ''}
          onChange={(v) => updateConfig({ n_clusters: parseInt(v) || undefined })}
          placeholder="e.g., 5"
          error={!!errors.n_clusters}
        />
      </FormField>

      <FormField label="Feature Columns" hint="Columns used as features for clustering">
        <MultiSelect
          values={config.feature_columns || []}
          onChange={(v) => updateConfig({ feature_columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

// Destination Config
const DestinationConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
  availableColumns: string[];
}> = ({ data, onChange, errors, accessToken, availableColumns }) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const config = data.config || data;

  useEffect(() => {
    if (!accessToken) return;
    setLoading('databases');
    getDatabases()
      .then(setDatabases)
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !config.database) return;
    setLoading('schemas');
    setSchemas([]);
    getSchemas(config.database)
      .then(setSchemas)
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, config.database]);

  const updateConfig = (updates: Partial<DestinationConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Database" required error={errors.database}>
        <Select
          value={config.database || ''}
          onChange={(v) => updateConfig({ database: v, schema: '' })}
          options={databases.map((d) => ({ value: d, label: d }))}
          placeholder="Select database..."
          disabled={loading === 'databases'}
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema}>
        <Select
          value={config.schema || ''}
          onChange={(v) => updateConfig({ schema: v })}
          options={schemas.map((s) => ({ value: s, label: s }))}
          placeholder="Select schema..."
          disabled={!config.database || loading === 'schemas'}
          error={!!errors.schema}
        />
      </FormField>

      <FormField label="Table Name" required error={errors.table}>
        <Input
          value={config.table || ''}
          onChange={(v) => updateConfig({ table: v })}
          placeholder="e.g., FACT_SALES"
          error={!!errors.table}
        />
      </FormField>

      <FormField label="Write Mode" required>
        <Select
          value={config.write_mode || 'overwrite'}
          onChange={(v) => updateConfig({ write_mode: v as DestinationConfig['write_mode'] })}
          options={[
            { value: 'overwrite', label: 'Overwrite' },
            { value: 'append', label: 'Append' },
            { value: 'merge', label: 'Merge (Upsert)' },
          ]}
        />
      </FormField>

      {config.write_mode === 'merge' && (
        <FormField label="Merge Keys" required error={errors.merge_keys} hint="Columns to match for merge">
          <MultiSelect
            values={config.merge_keys || []}
            onChange={(v) => updateConfig({ merge_keys: v })}
            options={availableColumns}
          />
        </FormField>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {loading}...
        </div>
      )}
    </div>
  );
};

// Export File Config
const ExportFileConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<ExportFileConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Format" required>
        <Select
          value={config.format || 'csv'}
          onChange={(v) => updateConfig({ format: v as ExportFileConfig['format'] })}
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'parquet', label: 'Parquet' },
            { value: 'json', label: 'JSON' },
          ]}
        />
      </FormField>

      <FormField label="Stage Name" required error={errors.stage_name}>
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., CP_DATA360.STAGING.ETL_EXPORT"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Name" hint="Optional, auto-generated if empty">
        <Input
          value={config.file_name || ''}
          onChange={(v) => updateConfig({ file_name: v })}
          placeholder="export.csv"
        />
      </FormField>

      <FormField label="Compression">
        <Select
          value={config.compression || 'NONE'}
          onChange={(v) => updateConfig({ compression: v as ExportFileConfig['compression'] })}
          options={[
            { value: 'NONE', label: 'None' },
            { value: 'GZIP', label: 'GZIP' },
          ]}
        />
      </FormField>
    </div>
  );
};

// SQL Script Config — with test runner
const SQLScriptConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const [testResult, setTestResult] = useState<{ columns: string[]; rows: Record<string, any>[]; count: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const handleTestSql = async () => {
    if (!config.sql_code) return;
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const response = await apiClient.post('/api/v1/workflows/run-sql', { sql: config.sql_code, limit: 10 });
      const result = response.data as Record<string, any>;
      if (result.status === 'success') {
        setTestResult({ columns: result.columns || [], rows: result.rows || [], count: result.count || 0 });
      } else {
        setTestError((result.detail as any)?.message || result.message || 'Execution failed');
      }
    } catch (err: any) {
      setTestError(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="SQL Code" required error={errors.sql_code} hint="Write your SQL script to execute">
        <Textarea
          value={config.sql_code || ''}
          onChange={(v) => updateConfig({ sql_code: v })}
          placeholder="SELECT * FROM ..."
          rows={10}
          className="font-mono text-sm"
          error={!!errors.sql_code}
        />
      </FormField>

      <button
        type="button"
        onClick={handleTestSql}
        disabled={isTesting || !config.sql_code}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isTesting || !config.sql_code
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        )}
      >
        {isTesting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isTesting ? 'Running...' : 'Test SQL (limit 10 rows)'}
      </button>

      {testResult && (
        <div className="p-3 bg-slate-900 rounded-lg overflow-auto max-h-60">
          <div className="text-xs text-emerald-400 mb-1 font-medium">
            {testResult.count} row{testResult.count !== 1 ? 's' : ''} returned
          </div>
          {testResult.columns.length > 0 && (
            <table className="text-xs text-slate-300 font-mono w-full">
              <thead>
                <tr>
                  {testResult.columns.map((col) => (
                    <th key={col} className="text-left pr-3 pb-1 text-slate-400 border-b border-slate-700">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testResult.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {testResult.columns.map((col) => (
                      <td key={col} className="pr-3 py-0.5 whitespace-nowrap">{String(row[col] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {testError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Error:</div>
          <pre className="text-xs text-red-500 dark:text-red-300 whitespace-pre-wrap font-mono">{testError}</pre>
        </div>
      )}
    </div>
  );
};

// Python Script Config — supports both stored procedure call and inline code
const PythonScriptConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
}> = ({ data, onChange, errors, accessToken }) => {
  const config = data.config || data;
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const mode = config.python_mode || 'procedure';

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const handleTestCode = async () => {
    if (!config.python_code) return;
    setIsTesting(true);
    setTestOutput(null);
    setTestError(null);
    try {
      const response = await apiClient.post('/api/v1/workflows/run-python', { code: config.python_code });
      const result = response.data as Record<string, any>;
      if (result.status === 'success') {
        setTestOutput((result.output as string) || '(no output)');
      } else {
        setTestError((result.detail as any)?.message || result.message || 'Execution failed');
      }
    } catch (err: any) {
      setTestError(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="Mode" hint="Choose between calling an existing procedure or writing inline code">
        <Select
          value={mode}
          onChange={(v) => updateConfig({ python_mode: v })}
          options={[
            { value: 'procedure', label: 'Call Stored Procedure' },
            { value: 'inline', label: 'Inline Python Code' },
          ]}
        />
      </FormField>

      {mode === 'procedure' ? (
        <>
          <FormField label="Database" required error={errors.database}>
            <Input
              value={config.database || ''}
              onChange={(v) => updateConfig({ database: v })}
              placeholder="e.g., MY_DATABASE"
              error={!!errors.database}
            />
          </FormField>

          <FormField label="Schema" required error={errors.schema}>
            <Input
              value={config.schema || ''}
              onChange={(v) => updateConfig({ schema: v })}
              placeholder="e.g., PUBLIC"
              error={!!errors.schema}
            />
          </FormField>

          <FormField label="Procedure Name" required error={errors.proc_name}>
            <Input
              value={config.proc_name || ''}
              onChange={(v) => updateConfig({ proc_name: v })}
              placeholder="e.g., MY_PYTHON_PROC"
              error={!!errors.proc_name}
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField label="Python Code" required error={errors.python_code}
            hint="Write Snowpark Python code. Use 'session' variable to access Snowflake.">
            <Textarea
              value={config.python_code || ''}
              onChange={(v) => updateConfig({ python_code: v })}
              placeholder={`# Snowpark Python — 'session' is available\ndf = session.table("MY_DB.MY_SCHEMA.MY_TABLE")\nprint(df.count())`}
              rows={12}
              className="font-mono text-sm"
              error={!!errors.python_code}
            />
          </FormField>

          <FormField label="Runtime Version" hint="Python runtime version on Snowflake">
            <Select
              value={config.runtime_version || '3.11'}
              onChange={(v) => updateConfig({ runtime_version: v })}
              options={[
                { value: '3.11', label: 'Python 3.11' },
                { value: '3.10', label: 'Python 3.10' },
                { value: '3.9', label: 'Python 3.9' },
              ]}
            />
          </FormField>

          <FormField label="Packages" hint="Comma-separated Snowpark packages">
            <Input
              value={config.packages || 'snowflake-snowpark-python'}
              onChange={(v) => updateConfig({ packages: v })}
              placeholder="snowflake-snowpark-python, pandas"
            />
          </FormField>

          <button
            type="button"
            onClick={handleTestCode}
            disabled={isTesting || !config.python_code}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isTesting || !config.python_code
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-yellow-500 text-white hover:bg-yellow-600'
            )}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isTesting ? 'Running...' : 'Test Python Code'}
          </button>

          {testOutput && (
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-emerald-400 mb-1 font-medium">Output:</div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{testOutput}</pre>
            </div>
          )}

          {testError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Error:</div>
              <pre className="text-xs text-red-500 dark:text-red-300 whitespace-pre-wrap font-mono">{testError}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Notebook Run Config
const NotebookRunConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Database" required error={errors.database}>
        <Input
          value={config.database || ''}
          onChange={(v) => updateConfig({ database: v })}
          placeholder="e.g., MY_DATABASE"
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema}>
        <Input
          value={config.schema || ''}
          onChange={(v) => updateConfig({ schema: v })}
          placeholder="e.g., PUBLIC"
          error={!!errors.schema}
        />
      </FormField>

      <FormField label="Notebook Name" required error={errors.notebook_name}>
        <Input
          value={config.notebook_name || ''}
          onChange={(v) => updateConfig({ notebook_name: v })}
          placeholder="e.g., MY_NOTEBOOK"
          error={!!errors.notebook_name}
        />
      </FormField>
    </div>
  );
};

// Dynamic Table Config
const DynamicTableConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Table Name" required error={errors.table_name}>
        <Input
          value={config.table_name || ''}
          onChange={(v) => updateConfig({ table_name: v })}
          placeholder="e.g., DYN_SALES_SUMMARY"
          error={!!errors.table_name}
        />
      </FormField>

      <FormField label="Target Lag" required error={errors.target_lag} hint="Refresh lag interval (e.g., 1 hour, 30 minutes)">
        <Input
          value={config.target_lag || ''}
          onChange={(v) => updateConfig({ target_lag: v })}
          placeholder="e.g., 1 hour"
          error={!!errors.target_lag}
        />
      </FormField>

      <FormField label="Warehouse" required error={errors.warehouse}>
        <Input
          value={config.warehouse || ''}
          onChange={(v) => updateConfig({ warehouse: v })}
          placeholder="e.g., COMPUTE_WH"
          error={!!errors.warehouse}
        />
      </FormField>

      <FormField label="Query" required error={errors.query} hint="SQL query defining the dynamic table content">
        <Textarea
          value={config.query || ''}
          onChange={(v) => updateConfig({ query: v })}
          placeholder="SELECT * FROM source_table WHERE ..."
          rows={6}
          className="font-mono text-sm"
          error={!!errors.query}
        />
      </FormField>
    </div>
  );
};

// Stream Consume Config
const StreamConsumeConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
}> = ({ data, onChange, errors, accessToken }) => {
  const config = data.config || data;
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  useEffect(() => {
    if (!accessToken) return;
    setLoading('databases');
    getDatabases().then(setDatabases).catch(console.error).finally(() => setLoading(null));
  }, [accessToken]);

  useEffect(() => {
    if (!config.database) return;
    setLoading('schemas');
    setSchemas([]);
    getSchemas(config.database).then(setSchemas).catch(console.error).finally(() => setLoading(null));
  }, [config.database]);

  useEffect(() => {
    if (!config.database || !config.schema) return;
    setLoading('tables');
    setTables([]);
    getTables(config.database, config.schema).then(setTables).catch(console.error).finally(() => setLoading(null));
  }, [config.database, config.schema]);

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">
          Creates a Snowflake Stream on a table or view to track changes (INSERT, UPDATE, DELETE). The stream captures CDC data for downstream processing.
        </p>
      </div>

      <FormField label="Stream Name" required error={errors.stream_name}
        hint="Name for the stream object (e.g., MY_TABLE_CHANGES)">
        <Input
          value={config.stream_name || ''}
          onChange={(v) => updateConfig({ stream_name: v })}
          placeholder="e.g., MY_TABLE_CHANGES"
          error={!!errors.stream_name}
        />
      </FormField>

      <FormField label="Source Database" required error={errors.database}>
        <Select
          value={config.database || ''}
          onChange={(v) => updateConfig({ database: v, schema: '', source_object: '' })}
          options={databases.map((d) => ({ value: d, label: d }))}
          placeholder={loading === 'databases' ? 'Loading...' : 'Select database'}
          disabled={loading === 'databases'}
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Source Schema" required error={errors.schema}>
        <Select
          value={config.schema || ''}
          onChange={(v) => updateConfig({ schema: v, source_object: '' })}
          options={schemas.map((s) => ({ value: s, label: s }))}
          placeholder={loading === 'schemas' ? 'Loading...' : 'Select schema'}
          disabled={!config.database || loading === 'schemas'}
          error={!!errors.schema}
        />
      </FormField>

      <FormField label="Source Table/View" required error={errors.source_object}
        hint="The table or view to create the stream on">
        <Select
          value={config.source_object || ''}
          onChange={(v) => updateConfig({ source_object: v })}
          options={tables.map((t) => ({ value: t, label: t }))}
          placeholder={loading === 'tables' ? 'Loading...' : 'Select table or view'}
          disabled={!config.schema || loading === 'tables'}
          error={!!errors.source_object}
        />
      </FormField>

      <FormField label="Stream Mode" hint="DEFAULT tracks all DML; APPEND_ONLY tracks only INSERTs">
        <Select
          value={config.consume_mode || 'DEFAULT'}
          onChange={(v) => updateConfig({ consume_mode: v })}
          options={[
            { value: 'DEFAULT', label: 'DEFAULT (all DML)' },
            { value: 'APPEND_ONLY', label: 'APPEND_ONLY (inserts only)' },
            { value: 'INSERT_ONLY', label: 'INSERT_ONLY (external tables)' },
          ]}
        />
      </FormField>

      <FormField label="Show Initial Rows" hint="Include existing rows as initial data">
        <Select
          value={config.show_initial_rows || 'FALSE'}
          onChange={(v) => updateConfig({ show_initial_rows: v })}
          options={[
            { value: 'FALSE', label: 'No (only new changes)' },
            { value: 'TRUE', label: 'Yes (include existing rows)' },
          ]}
        />
      </FormField>
    </div>
  );
};

// CDC Merge Config
const CdcMergeConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Reads CDC rows from a Snowflake Stream and applies a MERGE INTO on the target table. Use after a stream_consume block.
        </p>
      </div>

      <FormField label="Stream Name" required error={errors.stream_name}
        hint="Fully-qualified stream name (e.g., DB.SCHEMA.MY_STREAM)">
        <Input
          value={config.stream_name || ''}
          onChange={(v) => updateConfig({ stream_name: v })}
          placeholder="e.g., MY_DB.MY_SCHEMA.MY_STREAM"
          error={!!errors.stream_name}
        />
      </FormField>

      <FormField label="Target Table" required error={errors.target_table}
        hint="Fully-qualified target table (e.g., DB.SCHEMA.TABLE)">
        <Input
          value={config.target_table || ''}
          onChange={(v) => updateConfig({ target_table: v })}
          placeholder="e.g., MY_DB.MY_SCHEMA.MY_TABLE"
          error={!!errors.target_table}
        />
      </FormField>

      <FormField label="Merge Keys" required error={errors.merge_keys}
        hint="Comma-separated column names used to match rows (e.g., ID, ORDER_DATE)">
        <Input
          value={config.merge_keys || ''}
          onChange={(v) => updateConfig({ merge_keys: v })}
          placeholder="e.g., ID"
          error={!!errors.merge_keys}
        />
      </FormField>

      <FormField label="Update Columns" error={errors.update_columns}
        hint='Comma-separated columns to update on match, or "all" to update every column'>
        <Input
          value={config.update_columns || 'all'}
          onChange={(v) => updateConfig({ update_columns: v })}
          placeholder='e.g., NAME, STATUS or "all"'
        />
      </FormField>
    </div>
  );
};

// Git File Config
const GitFileConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Repository Name" required error={errors.repo_name}>
        <Input
          value={config.repo_name || ''}
          onChange={(v) => updateConfig({ repo_name: v })}
          placeholder="e.g., my-data-repo"
          error={!!errors.repo_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path}>
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., scripts/transform.sql"
          error={!!errors.file_path}
        />
      </FormField>

      <FormField label="Branch" hint="Git branch to use (defaults to main)">
        <Input
          value={config.branch || 'main'}
          onChange={(v) => updateConfig({ branch: v })}
          placeholder="main"
        />
      </FormField>
    </div>
  );
};

// Compute Pool Config
const ComputePoolConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Pool Name" required error={errors.pool_name}>
        <Input
          value={config.pool_name || ''}
          onChange={(v) => updateConfig({ pool_name: v })}
          placeholder="e.g., MY_COMPUTE_POOL"
          error={!!errors.pool_name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Min Nodes" required error={errors.min_nodes}>
          <Input
            type="number"
            value={config.min_nodes || ''}
            onChange={(v) => updateConfig({ min_nodes: parseInt(v) || 0 })}
            placeholder="1"
            error={!!errors.min_nodes}
          />
        </FormField>

        <FormField label="Max Nodes" required error={errors.max_nodes}>
          <Input
            type="number"
            value={config.max_nodes || ''}
            onChange={(v) => updateConfig({ max_nodes: parseInt(v) || 0 })}
            placeholder="3"
            error={!!errors.max_nodes}
          />
        </FormField>
      </div>

      <FormField label="Instance Family" required>
        <Select
          value={config.instance_family || 'CPU_X64_XS'}
          onChange={(v) => updateConfig({ instance_family: v })}
          options={[
            { value: 'CPU_X64_XS', label: 'CPU_X64_XS' },
            { value: 'CPU_X64_S', label: 'CPU_X64_S' },
            { value: 'CPU_X64_M', label: 'CPU_X64_M' },
            { value: 'GPU_NV_S', label: 'GPU_NV_S' },
          ]}
        />
      </FormField>
    </div>
  );
};

// Container Service Config
const ContainerServiceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Service Name" required error={errors.service_name}>
        <Input
          value={config.service_name || ''}
          onChange={(v) => updateConfig({ service_name: v })}
          placeholder="e.g., MY_SERVICE"
          error={!!errors.service_name}
        />
      </FormField>

      <FormField label="Compute Pool" required error={errors.compute_pool}>
        <Input
          value={config.compute_pool || ''}
          onChange={(v) => updateConfig({ compute_pool: v })}
          placeholder="e.g., MY_COMPUTE_POOL"
          error={!!errors.compute_pool}
        />
      </FormField>

      <FormField label="Stage" required error={errors.stage}>
        <Input
          value={config.stage || ''}
          onChange={(v) => updateConfig({ stage: v })}
          placeholder="e.g., @MY_STAGE"
          error={!!errors.stage}
        />
      </FormField>

      <FormField label="Spec File" required error={errors.spec_file}>
        <Input
          value={config.spec_file || ''}
          onChange={(v) => updateConfig({ spec_file: v })}
          placeholder="e.g., service_spec.yaml"
          error={!!errors.spec_file}
        />
      </FormField>
    </div>
  );
};

// ============================================
// WINDOW FUNCTION CONFIG FORMS
// ============================================

// Window Rank Config
const WindowRankConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Assigns a rank to each row within a partition. RANK leaves gaps after ties, DENSE_RANK does not, ROW_NUMBER assigns unique sequential numbers.
        </p>
      </div>

      <FormField label="Window Function" required>
        <Select
          value={config.window_function || 'RANK'}
          onChange={(v) => updateConfig({ window_function: v })}
          options={[
            { value: 'RANK', label: 'RANK' },
            { value: 'DENSE_RANK', label: 'DENSE_RANK' },
            { value: 'ROW_NUMBER', label: 'ROW_NUMBER' },
          ]}
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" required error={errors.order_by} hint="Columns to order by within each partition">
        <MultiSelect
          values={config.order_by || []}
          onChange={(v) => updateConfig({ order_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order Direction">
        <Select
          value={config.order_direction || 'ASC'}
          onChange={(v) => updateConfig({ order_direction: v })}
          options={[
            { value: 'ASC', label: 'Ascending' },
            { value: 'DESC', label: 'Descending' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || 'rank_num'}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="rank_num"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// Window Lag/Lead Config
const WindowLagLeadConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Access a value from a previous row (LAG) or a subsequent row (LEAD) within a partition, useful for calculating differences between rows.
        </p>
      </div>

      <FormField label="Function" required>
        <Select
          value={config.window_function || 'LAG'}
          onChange={(v) => updateConfig({ window_function: v })}
          options={[
            { value: 'LAG', label: 'LAG (previous row)' },
            { value: 'LEAD', label: 'LEAD (next row)' },
          ]}
        />
      </FormField>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Offset" hint="Number of rows to look back/ahead">
        <Input
          type="number"
          value={config.offset ?? 1}
          onChange={(v) => updateConfig({ offset: parseInt(v) || 1 })}
          placeholder="1"
        />
      </FormField>

      <FormField label="Default Value" hint="Value when no row exists at the offset (optional)">
        <Input
          value={config.default_value || ''}
          onChange={(v) => updateConfig({ default_value: v })}
          placeholder="NULL"
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" required error={errors.order_by}>
        <MultiSelect
          values={config.order_by || []}
          onChange={(v) => updateConfig({ order_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order Direction">
        <Select
          value={config.order_direction || 'ASC'}
          onChange={(v) => updateConfig({ order_direction: v })}
          options={[
            { value: 'ASC', label: 'Ascending' },
            { value: 'DESC', label: 'Descending' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., prev_value"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// Window Aggregate Config
const WindowAggregateConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Compute aggregate functions (SUM, AVG, etc.) over a window frame, allowing running totals, moving averages, and similar calculations.
        </p>
      </div>

      <FormField label="Aggregate Function" required>
        <Select
          value={config.agg_function || 'SUM'}
          onChange={(v) => updateConfig({ agg_function: v })}
          options={[
            { value: 'SUM', label: 'SUM' },
            { value: 'AVG', label: 'AVG' },
            { value: 'COUNT', label: 'COUNT' },
            { value: 'MIN', label: 'MIN' },
            { value: 'MAX', label: 'MAX' },
          ]}
        />
      </FormField>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" hint="Columns to order by within each partition">
        <MultiSelect
          values={config.order_by || []}
          onChange={(v) => updateConfig({ order_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Frame Clause" hint="Defines the window frame boundaries">
        <Select
          value={config.frame_clause || 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW'}
          onChange={(v) => updateConfig({ frame_clause: v })}
          options={[
            { value: 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW', label: 'Running total (unbounded preceding to current)' },
            { value: 'ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING', label: 'Moving window (1 preceding to 1 following)' },
            { value: 'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING', label: 'Entire partition' },
            { value: 'RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW', label: 'Range: unbounded preceding to current' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., running_total"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// Window NTILE Config
const WindowNtileConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Divides an ordered partition into a specified number of roughly equal buckets (quantiles), assigning a bucket number to each row.
        </p>
      </div>

      <FormField label="Number of Buckets" required error={errors.buckets}>
        <Input
          type="number"
          value={config.buckets ?? 4}
          onChange={(v) => updateConfig({ buckets: parseInt(v) || 4 })}
          placeholder="4"
          error={!!errors.buckets}
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" required error={errors.order_by}>
        <MultiSelect
          values={config.order_by || []}
          onChange={(v) => updateConfig({ order_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || 'ntile_bucket'}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="ntile_bucket"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// ============================================
// JSON CONFIG FORMS
// ============================================

// JSON Flatten Config
const JsonFlattenConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Flattens a VARIANT, OBJECT, or ARRAY column into separate rows using Snowflake FLATTEN. Useful for expanding nested JSON data.
        </p>
      </div>

      <FormField label="Input Column" required error={errors.input_column}>
        <Select
          value={config.input_column || ''}
          onChange={(v) => updateConfig({ input_column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select VARIANT column..."
          error={!!errors.input_column}
        />
      </FormField>

      <FormField label="JSON Path" hint="Optional path within the JSON (e.g., 'data.items')">
        <Input
          value={config.json_path || ''}
          onChange={(v) => updateConfig({ json_path: v })}
          placeholder="e.g., data.items"
        />
      </FormField>

      <FormField label="Recursive" hint="Recursively flatten nested structures">
        <Select
          value={config.recursive ? 'true' : 'false'}
          onChange={(v) => updateConfig({ recursive: v === 'true' })}
          options={[
            { value: 'false', label: 'No' },
            { value: 'true', label: 'Yes' },
          ]}
        />
      </FormField>

      <FormField label="Flatten Mode" hint="Type of elements to flatten">
        <Select
          value={config.flatten_mode || 'BOTH'}
          onChange={(v) => updateConfig({ flatten_mode: v })}
          options={[
            { value: 'BOTH', label: 'BOTH (objects and arrays)' },
            { value: 'OBJECT', label: 'OBJECT only' },
            { value: 'ARRAY', label: 'ARRAY only' },
          ]}
        />
      </FormField>
    </div>
  );
};

// JSON Extract Config
const JsonExtractConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const extractPaths: Array<{ path: string; type: string; output: string }> = config.extract_paths || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addPath = () => {
    updateConfig({ extract_paths: [...extractPaths, { path: '', type: 'VARCHAR', output: '' }] });
  };

  const removePath = (index: number) => {
    updateConfig({ extract_paths: extractPaths.filter((_, i) => i !== index) });
  };

  const updatePath = (index: number, updates: Partial<{ path: string; type: string; output: string }>) => {
    const newPaths = [...extractPaths];
    newPaths[index] = { ...newPaths[index], ...updates };
    updateConfig({ extract_paths: newPaths });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Extract specific values from a JSON/VARIANT column using dot-notation paths, casting each to a desired data type.
        </p>
      </div>

      <FormField label="Input Column" required error={errors.input_column}>
        <Select
          value={config.input_column || ''}
          onChange={(v) => updateConfig({ input_column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select VARIANT column..."
          error={!!errors.input_column}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Extract Paths</label>
          <button
            onClick={addPath}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {extractPaths.map((ep, i) => (
          <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={ep.path}
                onChange={(v) => updatePath(i, { path: v })}
                placeholder="JSON path (e.g., user.name)"
              />
              <button
                onClick={() => removePath(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={ep.type}
                onChange={(v) => updatePath(i, { type: v })}
                options={[
                  { value: 'VARCHAR', label: 'VARCHAR' },
                  { value: 'NUMBER', label: 'NUMBER' },
                  { value: 'FLOAT', label: 'FLOAT' },
                  { value: 'BOOLEAN', label: 'BOOLEAN' },
                  { value: 'DATE', label: 'DATE' },
                  { value: 'TIMESTAMP', label: 'TIMESTAMP' },
                  { value: 'VARIANT', label: 'VARIANT' },
                ]}
              />
              <Input
                value={ep.output}
                onChange={(v) => updatePath(i, { output: v })}
                placeholder="Output column name"
              />
            </div>
          </div>
        ))}

        {extractPaths.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No extract paths added</p>
        )}
      </div>
    </div>
  );
};

// JSON Construct Config
const JsonConstructConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Constructs a JSON object from selected columns using OBJECT_CONSTRUCT, outputting a single VARIANT column.
        </p>
      </div>

      <FormField label="Columns to Include" required error={errors.columns} hint="Select columns to combine into a JSON object">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || 'json_data'}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="json_data"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// ============================================
// PIVOT / UNPIVOT CONFIG FORMS
// ============================================

// Pivot Config
const PivotConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
        <p className="text-xs text-teal-700 dark:text-teal-300">
          Rotates rows into columns. Aggregates values from one column and creates new columns based on distinct values in another column.
        </p>
      </div>

      <FormField label="Value Column" required error={errors.value_column} hint="Column containing values to aggregate">
        <Select
          value={config.value_column || ''}
          onChange={(v) => updateConfig({ value_column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
          error={!!errors.value_column}
        />
      </FormField>

      <FormField label="Pivot Column" required error={errors.pivot_column} hint="Column whose values become new column headers">
        <Select
          value={config.pivot_column || ''}
          onChange={(v) => updateConfig({ pivot_column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
          error={!!errors.pivot_column}
        />
      </FormField>

      <FormField label="Pivot Values" required error={errors.pivot_values} hint="Comma-separated list of values to pivot on">
        <Input
          value={config.pivot_values || ''}
          onChange={(v) => updateConfig({ pivot_values: v })}
          placeholder="e.g., Q1, Q2, Q3, Q4"
          error={!!errors.pivot_values}
        />
      </FormField>

      <FormField label="Aggregate Function" required>
        <Select
          value={config.agg_function || 'SUM'}
          onChange={(v) => updateConfig({ agg_function: v })}
          options={[
            { value: 'SUM', label: 'SUM' },
            { value: 'COUNT', label: 'COUNT' },
            { value: 'AVG', label: 'AVG' },
            { value: 'MIN', label: 'MIN' },
            { value: 'MAX', label: 'MAX' },
          ]}
        />
      </FormField>
    </div>
  );
};

// Unpivot Config
const UnpivotConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
        <p className="text-xs text-teal-700 dark:text-teal-300">
          Rotates columns into rows. Transforms multiple columns into name-value pairs, normalizing wide tables into tall format.
        </p>
      </div>

      <FormField label="Value Column Name" hint="Name for the column holding values">
        <Input
          value={config.value_column_name || 'VALUE'}
          onChange={(v) => updateConfig({ value_column_name: v })}
          placeholder="VALUE"
        />
      </FormField>

      <FormField label="Name Column Name" hint="Name for the column holding attribute names">
        <Input
          value={config.name_column_name || 'ATTRIBUTE'}
          onChange={(v) => updateConfig({ name_column_name: v })}
          placeholder="ATTRIBUTE"
        />
      </FormField>

      <FormField label="Columns to Unpivot" required error={errors.unpivot_columns} hint="Select columns to rotate into rows">
        <MultiSelect
          values={config.unpivot_columns || []}
          onChange={(v) => updateConfig({ unpivot_columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

// ============================================
// DATE/TIME CONFIG FORMS
// ============================================

// Date Transform Config
const DateTransformConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Perform date/time operations: add intervals, calculate differences, truncate dates, or extract date parts.
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select date column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Operation" required>
        <Select
          value={config.operation || 'DATEADD'}
          onChange={(v) => updateConfig({ operation: v })}
          options={[
            { value: 'DATEADD', label: 'DATEADD (add interval)' },
            { value: 'DATEDIFF', label: 'DATEDIFF (difference)' },
            { value: 'DATE_TRUNC', label: 'DATE_TRUNC (truncate)' },
            { value: 'DATE_PART', label: 'DATE_PART (extract part)' },
            { value: 'LAST_DAY', label: 'LAST_DAY (last day of period)' },
          ]}
        />
      </FormField>

      <FormField label="Date Part" required>
        <Select
          value={config.date_part || 'DAY'}
          onChange={(v) => updateConfig({ date_part: v })}
          options={[
            { value: 'YEAR', label: 'YEAR' },
            { value: 'MONTH', label: 'MONTH' },
            { value: 'DAY', label: 'DAY' },
            { value: 'HOUR', label: 'HOUR' },
            { value: 'MINUTE', label: 'MINUTE' },
            { value: 'SECOND', label: 'SECOND' },
          ]}
        />
      </FormField>

      {(config.operation === 'DATEADD' || config.operation === 'DATEDIFF') && (
        <FormField label="Interval" hint="Number of date parts to add or measure">
          <Input
            type="number"
            value={config.interval ?? ''}
            onChange={(v) => updateConfig({ interval: parseInt(v) || 0 })}
            placeholder="e.g., 7"
          />
        </FormField>
      )}

      {config.operation === 'DATEDIFF' && (
        <FormField label="Second Column" required error={errors.second_column} hint="End date column for DATEDIFF">
          <Select
            value={config.second_column || ''}
            onChange={(v) => updateConfig({ second_column: v })}
            options={availableColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Select end date column..."
            error={!!errors.second_column}
          />
        </FormField>
      )}

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., date_result"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// Time Slice Config
const TimeSliceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Groups timestamps into fixed-size time intervals using TIME_SLICE, useful for time-series bucketing and aggregation.
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select timestamp column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Slice Length" required error={errors.slice_length}>
        <Input
          type="number"
          value={config.slice_length ?? 1}
          onChange={(v) => updateConfig({ slice_length: parseInt(v) || 1 })}
          placeholder="1"
          error={!!errors.slice_length}
        />
      </FormField>

      <FormField label="Slice Unit" required>
        <Select
          value={config.slice_unit || 'HOUR'}
          onChange={(v) => updateConfig({ slice_unit: v })}
          options={[
            { value: 'SECOND', label: 'SECOND' },
            { value: 'MINUTE', label: 'MINUTE' },
            { value: 'HOUR', label: 'HOUR' },
            { value: 'DAY', label: 'DAY' },
            { value: 'MONTH', label: 'MONTH' },
            { value: 'YEAR', label: 'YEAR' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., time_bucket"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// ============================================
// DATA CLEANING CONFIG FORMS
// ============================================

// Fill Nulls Config
const FillNullsConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Replace NULL values in a column using a chosen strategy: a fixed value, forward/backward fill, or statistical imputation (mean/median).
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Strategy" required>
        <Select
          value={config.strategy || 'VALUE'}
          onChange={(v) => updateConfig({ strategy: v })}
          options={[
            { value: 'VALUE', label: 'Fixed Value' },
            { value: 'FORWARD_FILL', label: 'Forward Fill (previous row)' },
            { value: 'BACKWARD_FILL', label: 'Backward Fill (next row)' },
            { value: 'MEAN', label: 'Mean (average)' },
            { value: 'MEDIAN', label: 'Median' },
          ]}
        />
      </FormField>

      {config.strategy === 'VALUE' && (
        <FormField label="Fill Value" required error={errors.fill_value}>
          <Input
            value={config.fill_value || ''}
            onChange={(v) => updateConfig({ fill_value: v })}
            placeholder="e.g., 0 or N/A"
            error={!!errors.fill_value}
          />
        </FormField>
      )}

      {(config.strategy === 'FORWARD_FILL' || config.strategy === 'BACKWARD_FILL') && (
        <FormField label="Order Column" required error={errors.order_column} hint="Column that defines row ordering for fill direction">
          <Select
            value={config.order_column || ''}
            onChange={(v) => updateConfig({ order_column: v })}
            options={availableColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Select order column..."
            error={!!errors.order_column}
          />
        </FormField>
      )}
    </div>
  );
};

// Case When Config
const CaseWhenConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const conditions: Array<{ when: string; then: string }> = config.conditions || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addCondition = () => {
    updateConfig({ conditions: [...conditions, { when: '', then: '' }] });
  };

  const removeCondition = (index: number) => {
    updateConfig({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: Partial<{ when: string; then: string }>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    updateConfig({ conditions: newConditions });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Create conditional logic using CASE WHEN expressions. Define multiple conditions and their output values, plus an optional ELSE default.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Conditions</label>
          <button
            onClick={addCondition}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {conditions.map((cond, i) => (
          <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">WHEN</span>
              <Input
                value={cond.when}
                onChange={(v) => updateCondition(i, { when: v })}
                placeholder="e.g., status = 'active'"
              />
              <button
                onClick={() => removeCondition(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">THEN</span>
              <Input
                value={cond.then}
                onChange={(v) => updateCondition(i, { then: v })}
                placeholder="e.g., 'Active User'"
              />
            </div>
          </div>
        ))}

        {conditions.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No conditions added</p>
        )}
      </div>

      <FormField label="ELSE Value" hint="Default value when no conditions match">
        <Input
          value={config.else_value || ''}
          onChange={(v) => updateConfig({ else_value: v })}
          placeholder="e.g., 'Unknown'"
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., user_category"
          error={!!errors.output_column}
        />
      </FormField>

      <div className="text-xs text-slate-500 p-2 bg-slate-100 dark:bg-slate-800 rounded">
        Available columns: {availableColumns.join(', ') || 'Connect an input first'}
      </div>
    </div>
  );
};

// Split Column Config
const SplitColumnConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const outputColumns: string[] = config.output_columns || ['', ''];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addOutputColumn = () => {
    updateConfig({ output_columns: [...outputColumns, ''] });
  };

  const removeOutputColumn = (index: number) => {
    if (outputColumns.length <= 2) return;
    updateConfig({ output_columns: outputColumns.filter((_, i) => i !== index) });
  };

  const updateOutputColumn = (index: number, value: string) => {
    const newCols = [...outputColumns];
    newCols[index] = value;
    updateConfig({ output_columns: newCols });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Split a string column into multiple columns using a delimiter. For example, split &quot;first_last&quot; by &quot;_&quot; into two separate columns.
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column to split..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Delimiter" required error={errors.delimiter}>
        <Input
          value={config.delimiter ?? ','}
          onChange={(v) => updateConfig({ delimiter: v })}
          placeholder=","
          error={!!errors.delimiter}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Output Columns</label>
          <button
            onClick={addOutputColumn}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {outputColumns.map((col, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Part {i + 1}:</span>
            <Input
              value={col}
              onChange={(v) => updateOutputColumn(i, v)}
              placeholder={`e.g., part_${i + 1}`}
            />
            {outputColumns.length > 2 && (
              <button
                onClick={() => removeOutputColumn(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded"
              >
                <Minus className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// CLOUD SOURCE CONFIG FORMS
// ============================================

// S3 Source Config
const S3SourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
        <p className="text-xs text-orange-700 dark:text-orange-300">
          Load data from an Amazon S3 external stage into Snowflake. Configure the stage, file path, and format.
        </p>
      </div>

      <FormField label="Stage Name" required error={errors.stage_name} hint="Snowflake external stage pointing to S3">
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., @MY_S3_STAGE"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path} hint="Path within the stage (e.g., data/2024/)">
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., data/sales/"
          error={!!errors.file_path}
        />
      </FormField>

      <FormField label="File Format" required>
        <Select
          value={config.file_format || 'PARQUET'}
          onChange={(v) => updateConfig({ file_format: v })}
          options={[
            { value: 'CSV', label: 'CSV' },
            { value: 'JSON', label: 'JSON' },
            { value: 'PARQUET', label: 'PARQUET' },
          ]}
        />
      </FormField>
    </div>
  );
};

// Azure Source Config
const AzureSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Load data from an Azure Blob Storage external stage into Snowflake. Configure the stage, file path, and format.
        </p>
      </div>

      <FormField label="Stage Name" required error={errors.stage_name} hint="Snowflake external stage pointing to Azure Blob">
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., @MY_AZURE_STAGE"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path}>
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., container/data/"
          error={!!errors.file_path}
        />
      </FormField>

      <FormField label="File Format" required>
        <Select
          value={config.file_format || 'PARQUET'}
          onChange={(v) => updateConfig({ file_format: v })}
          options={[
            { value: 'CSV', label: 'CSV' },
            { value: 'JSON', label: 'JSON' },
            { value: 'PARQUET', label: 'PARQUET' },
          ]}
        />
      </FormField>
    </div>
  );
};

// GCS Source Config
const GCSSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <p className="text-xs text-green-700 dark:text-green-300">
          Load data from a Google Cloud Storage external stage into Snowflake. Configure the stage, file path, and format.
        </p>
      </div>

      <FormField label="Stage Name" required error={errors.stage_name} hint="Snowflake external stage pointing to GCS">
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., @MY_GCS_STAGE"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path}>
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., bucket/data/"
          error={!!errors.file_path}
        />
      </FormField>

      <FormField label="File Format" required>
        <Select
          value={config.file_format || 'PARQUET'}
          onChange={(v) => updateConfig({ file_format: v })}
          options={[
            { value: 'CSV', label: 'CSV' },
            { value: 'JSON', label: 'JSON' },
            { value: 'PARQUET', label: 'PARQUET' },
          ]}
        />
      </FormField>
    </div>
  );
};

// ============================================
// DB SOURCE CONFIG FORMS
// ============================================

// Postgres Source Config
const PostgresSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <p className="text-xs text-indigo-700 dark:text-indigo-300">
          Ingest data from a PostgreSQL database via Snowflake connector. Specify the connection and target location in Snowflake.
        </p>
      </div>

      <FormField label="Connection Name" required error={errors.connection_name} hint="Name of the configured PostgreSQL connection">
        <Input
          value={config.connection_name || ''}
          onChange={(v) => updateConfig({ connection_name: v })}
          placeholder="e.g., my_postgres_conn"
          error={!!errors.connection_name}
        />
      </FormField>

      <FormField label="Source Table" required error={errors.source_table} hint="Table name in PostgreSQL (schema.table)">
        <Input
          value={config.source_table || ''}
          onChange={(v) => updateConfig({ source_table: v })}
          placeholder="e.g., public.orders"
          error={!!errors.source_table}
        />
      </FormField>

      <FormField label="Target Database" required error={errors.target_database}>
        <Input
          value={config.target_database || ''}
          onChange={(v) => updateConfig({ target_database: v })}
          placeholder="e.g., RAW_DATA"
          error={!!errors.target_database}
        />
      </FormField>

      <FormField label="Target Schema" required error={errors.target_schema}>
        <Input
          value={config.target_schema || ''}
          onChange={(v) => updateConfig({ target_schema: v })}
          placeholder="e.g., POSTGRES_INGEST"
          error={!!errors.target_schema}
        />
      </FormField>
    </div>
  );
};

// MySQL Source Config
const MySQLSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <p className="text-xs text-indigo-700 dark:text-indigo-300">
          Ingest data from a MySQL database via Snowflake connector. Specify the connection and target location in Snowflake.
        </p>
      </div>

      <FormField label="Connection Name" required error={errors.connection_name} hint="Name of the configured MySQL connection">
        <Input
          value={config.connection_name || ''}
          onChange={(v) => updateConfig({ connection_name: v })}
          placeholder="e.g., my_mysql_conn"
          error={!!errors.connection_name}
        />
      </FormField>

      <FormField label="Source Table" required error={errors.source_table} hint="Table name in MySQL (database.table)">
        <Input
          value={config.source_table || ''}
          onChange={(v) => updateConfig({ source_table: v })}
          placeholder="e.g., mydb.customers"
          error={!!errors.source_table}
        />
      </FormField>

      <FormField label="Target Database" required error={errors.target_database}>
        <Input
          value={config.target_database || ''}
          onChange={(v) => updateConfig({ target_database: v })}
          placeholder="e.g., RAW_DATA"
          error={!!errors.target_database}
        />
      </FormField>

      <FormField label="Target Schema" required error={errors.target_schema}>
        <Input
          value={config.target_schema || ''}
          onChange={(v) => updateConfig({ target_schema: v })}
          placeholder="e.g., MYSQL_INGEST"
          error={!!errors.target_schema}
        />
      </FormField>
    </div>
  );
};

// ============================================
// SALESFORCE SOURCE CONFIG
// ============================================
const SalesforceSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Object Name" required error={errors.object_name}>
        <Input value={config.object_name || ''} onChange={(v) => updateConfig({ object_name: v })} placeholder="Account, Contact, Opportunity..." error={!!errors.object_name} />
      </FormField>
    </div>
  );
};

// ============================================
// SAP SOURCE CONFIG
// ============================================
const SapSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Table Name" required error={errors.table_name}>
        <Input value={config.table_name || ''} onChange={(v) => updateConfig({ table_name: v })} placeholder="MARA, BKPF, VBAK..." error={!!errors.table_name} />
      </FormField>
    </div>
  );
};

// ============================================
// ORACLE SOURCE CONFIG
// ============================================
const OracleSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Table Name" required error={errors.table_name}>
        <Input value={config.table_name || ''} onChange={(v) => updateConfig({ table_name: v })} placeholder="EMPLOYEES, ORDERS..." error={!!errors.table_name} />
      </FormField>
    </div>
  );
};

// ============================================
// HUBSPOT SOURCE CONFIG
// ============================================
const HubspotSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Object Name" required error={errors.object_name}>
        <Input value={config.object_name || ''} onChange={(v) => updateConfig({ object_name: v })} placeholder="contacts, companies, deals..." error={!!errors.object_name} />
      </FormField>
    </div>
  );
};

// ============================================
// SERVICENOW SOURCE CONFIG
// ============================================
const ServicenowSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Table Name" required error={errors.table_name}>
        <Input value={config.table_name || ''} onChange={(v) => updateConfig({ table_name: v })} placeholder="incident, cmdb_ci, change_request..." error={!!errors.table_name} />
      </FormField>
    </div>
  );
};

// ============================================
// REST API SOURCE CONFIG
// ============================================
const ApiSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Schema Name" required error={errors.schema_name}>
        <Input value={config.schema_name || ''} onChange={(v) => updateConfig({ schema_name: v })} placeholder="CUSTOM_API" error={!!errors.schema_name} />
      </FormField>
      <FormField label="Table Name" required error={errors.table_name}>
        <Input value={config.table_name || ''} onChange={(v) => updateConfig({ table_name: v })} placeholder="API_DATA" error={!!errors.table_name} />
      </FormField>
    </div>
  );
};

// ============================================
// OTHER SOURCE CONFIG FORMS
// ============================================

// External Table Source Config
const ExternalTableSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">
          Read data from a Snowflake external table. External tables reference data stored in external stages (S3, Azure, GCS).
        </p>
      </div>

      <FormField label="Database" required error={errors.database_name}>
        <Input
          value={config.database_name || ''}
          onChange={(v) => updateConfig({ database_name: v })}
          placeholder="e.g., MY_DATABASE"
          error={!!errors.database_name}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema_name}>
        <Input
          value={config.schema_name || ''}
          onChange={(v) => updateConfig({ schema_name: v })}
          placeholder="e.g., PUBLIC"
          error={!!errors.schema_name}
        />
      </FormField>

      <FormField label="Table Name" required error={errors.table_name}>
        <Input
          value={config.table_name || ''}
          onChange={(v) => updateConfig({ table_name: v })}
          placeholder="e.g., EXT_SALES_DATA"
          error={!!errors.table_name}
        />
      </FormField>
    </div>
  );
};

// Dynamic Table Source Config
const DynamicTableSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">
          Read data from a Snowflake dynamic table. Dynamic tables automatically refresh based on a target lag and underlying query.
        </p>
      </div>

      <FormField label="Database" required error={errors.database_name}>
        <Input
          value={config.database_name || ''}
          onChange={(v) => updateConfig({ database_name: v })}
          placeholder="e.g., MY_DATABASE"
          error={!!errors.database_name}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema_name}>
        <Input
          value={config.schema_name || ''}
          onChange={(v) => updateConfig({ schema_name: v })}
          placeholder="e.g., PUBLIC"
          error={!!errors.schema_name}
        />
      </FormField>

      <FormField label="Table Name" required error={errors.table_name}>
        <Input
          value={config.table_name || ''}
          onChange={(v) => updateConfig({ table_name: v })}
          placeholder="e.g., DYN_CUSTOMER_360"
          error={!!errors.table_name}
        />
      </FormField>
    </div>
  );
};

// Shared Data Source Config
const SharedDataSourceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">
          Read data from a Snowflake Data Sharing database. Access shared tables from other Snowflake accounts without copying data.
        </p>
      </div>

      <FormField label="Shared Database" required error={errors.share_database} hint="Database created from the shared data">
        <Input
          value={config.share_database || ''}
          onChange={(v) => updateConfig({ share_database: v })}
          placeholder="e.g., SHARED_WEATHER_DB"
          error={!!errors.share_database}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema_name}>
        <Input
          value={config.schema_name || ''}
          onChange={(v) => updateConfig({ schema_name: v })}
          placeholder="e.g., PUBLIC"
          error={!!errors.schema_name}
        />
      </FormField>

      <FormField label="Table Name" required error={errors.table_name}>
        <Input
          value={config.table_name || ''}
          onChange={(v) => updateConfig({ table_name: v })}
          placeholder="e.g., DAILY_WEATHER"
          error={!!errors.table_name}
        />
      </FormField>
    </div>
  );
};

// ============================================
// PYTHON UDF/PROCEDURE CONFIG FORMS
// ============================================

// Create UDF Config
const CreateUDFConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const parameters: Array<{ name: string; type: string }> = config.parameters || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addParameter = () => {
    updateConfig({ parameters: [...parameters, { name: '', type: 'VARCHAR' }] });
  };

  const removeParameter = (index: number) => {
    updateConfig({ parameters: parameters.filter((_, i) => i !== index) });
  };

  const updateParameter = (index: number, updates: Partial<{ name: string; type: string }>) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], ...updates };
    updateConfig({ parameters: newParams });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          Create a User-Defined Function (UDF) in Snowflake. The function can be written in Python, SQL, or Java and used in SQL queries.
        </p>
      </div>

      <FormField label="Function Name" required error={errors.function_name}>
        <Input
          value={config.function_name || ''}
          onChange={(v) => updateConfig({ function_name: v })}
          placeholder="e.g., CALCULATE_SCORE"
          error={!!errors.function_name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Database" required error={errors.database_name}>
          <Input
            value={config.database_name || ''}
            onChange={(v) => updateConfig({ database_name: v })}
            placeholder="e.g., MY_DB"
            error={!!errors.database_name}
          />
        </FormField>

        <FormField label="Schema" required error={errors.schema_name}>
          <Input
            value={config.schema_name || ''}
            onChange={(v) => updateConfig({ schema_name: v })}
            placeholder="e.g., PUBLIC"
            error={!!errors.schema_name}
          />
        </FormField>
      </div>

      <FormField label="Language" required>
        <Select
          value={config.language || 'PYTHON'}
          onChange={(v) => updateConfig({ language: v })}
          options={[
            { value: 'PYTHON', label: 'Python' },
            { value: 'SQL', label: 'SQL' },
            { value: 'JAVA', label: 'Java' },
          ]}
        />
      </FormField>

      <FormField label="Return Type" required>
        <Select
          value={config.return_type || 'VARCHAR'}
          onChange={(v) => updateConfig({ return_type: v })}
          options={[
            { value: 'VARCHAR', label: 'VARCHAR' },
            { value: 'NUMBER', label: 'NUMBER' },
            { value: 'FLOAT', label: 'FLOAT' },
            { value: 'BOOLEAN', label: 'BOOLEAN' },
            { value: 'VARIANT', label: 'VARIANT' },
          ]}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Parameters</label>
          <button
            onClick={addParameter}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {parameters.map((param, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={param.name}
              onChange={(v) => updateParameter(i, { name: v })}
              placeholder="Param name"
            />
            <Select
              value={param.type}
              onChange={(v) => updateParameter(i, { type: v })}
              options={[
                { value: 'VARCHAR', label: 'VARCHAR' },
                { value: 'NUMBER', label: 'NUMBER' },
                { value: 'FLOAT', label: 'FLOAT' },
                { value: 'BOOLEAN', label: 'BOOLEAN' },
                { value: 'VARIANT', label: 'VARIANT' },
              ]}
            />
            <button
              onClick={() => removeParameter(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ))}

        {parameters.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No parameters added</p>
        )}
      </div>

      <FormField label="Function Body" required error={errors.function_body}>
        <Textarea
          value={config.function_body || ''}
          onChange={(v) => updateConfig({ function_body: v })}
          placeholder={config.language === 'PYTHON' ? 'def handler(arg1):\n    return result' : 'SELECT ...'}
          rows={8}
          className="font-mono text-sm"
          error={!!errors.function_body}
        />
      </FormField>

      {config.language === 'PYTHON' && (
        <FormField label="Packages" hint="Comma-separated Python packages">
          <Input
            value={config.packages || ''}
            onChange={(v) => updateConfig({ packages: v })}
            placeholder="e.g., pandas, numpy"
          />
        </FormField>
      )}
    </div>
  );
};

// Create Procedure Config
const CreateProcedureConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const parameters: Array<{ name: string; type: string }> = config.parameters || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addParameter = () => {
    updateConfig({ parameters: [...parameters, { name: '', type: 'VARCHAR' }] });
  };

  const removeParameter = (index: number) => {
    updateConfig({ parameters: parameters.filter((_, i) => i !== index) });
  };

  const updateParameter = (index: number, updates: Partial<{ name: string; type: string }>) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], ...updates };
    updateConfig({ parameters: newParams });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          Create a Stored Procedure in Snowflake. Procedures can execute complex logic, multiple SQL statements, and return results.
        </p>
      </div>

      <FormField label="Procedure Name" required error={errors.procedure_name}>
        <Input
          value={config.procedure_name || ''}
          onChange={(v) => updateConfig({ procedure_name: v })}
          placeholder="e.g., PROCESS_ORDERS"
          error={!!errors.procedure_name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Database" required error={errors.database_name}>
          <Input
            value={config.database_name || ''}
            onChange={(v) => updateConfig({ database_name: v })}
            placeholder="e.g., MY_DB"
            error={!!errors.database_name}
          />
        </FormField>

        <FormField label="Schema" required error={errors.schema_name}>
          <Input
            value={config.schema_name || ''}
            onChange={(v) => updateConfig({ schema_name: v })}
            placeholder="e.g., PUBLIC"
            error={!!errors.schema_name}
          />
        </FormField>
      </div>

      <FormField label="Return Type" required>
        <Select
          value={config.return_type || 'VARCHAR'}
          onChange={(v) => updateConfig({ return_type: v })}
          options={[
            { value: 'VARCHAR', label: 'VARCHAR' },
            { value: 'NUMBER', label: 'NUMBER' },
            { value: 'FLOAT', label: 'FLOAT' },
            { value: 'BOOLEAN', label: 'BOOLEAN' },
            { value: 'VARIANT', label: 'VARIANT' },
          ]}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Parameters</label>
          <button
            onClick={addParameter}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {parameters.map((param, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={param.name}
              onChange={(v) => updateParameter(i, { name: v })}
              placeholder="Param name"
            />
            <Select
              value={param.type}
              onChange={(v) => updateParameter(i, { type: v })}
              options={[
                { value: 'VARCHAR', label: 'VARCHAR' },
                { value: 'NUMBER', label: 'NUMBER' },
                { value: 'FLOAT', label: 'FLOAT' },
                { value: 'BOOLEAN', label: 'BOOLEAN' },
                { value: 'VARIANT', label: 'VARIANT' },
              ]}
            />
            <button
              onClick={() => removeParameter(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ))}

        {parameters.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No parameters added</p>
        )}
      </div>

      <FormField label="Procedure Body" required error={errors.procedure_body}>
        <Textarea
          value={config.procedure_body || ''}
          onChange={(v) => updateConfig({ procedure_body: v })}
          placeholder="BEGIN\n  -- procedure logic\nEND;"
          rows={10}
          className="font-mono text-sm"
          error={!!errors.procedure_body}
        />
      </FormField>
    </div>
  );
};

// Apply UDF Config
const ApplyUDFConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          Apply an existing User-Defined Function (UDF) to columns in the current dataset. The function is called for each row.
        </p>
      </div>

      <FormField label="Function Name" required error={errors.function_name} hint="Fully qualified name (e.g., DB.SCHEMA.MY_UDF)">
        <Input
          value={config.function_name || ''}
          onChange={(v) => updateConfig({ function_name: v })}
          placeholder="e.g., MY_DB.PUBLIC.CALCULATE_SCORE"
          error={!!errors.function_name}
        />
      </FormField>

      <FormField label="Input Columns" required error={errors.input_columns} hint="Columns to pass as arguments to the function">
        <MultiSelect
          values={config.input_columns || []}
          onChange={(v) => updateConfig({ input_columns: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., score_result"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// ============================================
// AI BLOCK CONFIG FORMS
// ============================================

const AI_MODEL_OPTIONS = [
  { value: 'mistral-large2', label: 'Mistral Large 2' },
  { value: 'llama3.1-70b', label: 'Llama 3.1 70B' },
  { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
  { value: 'snowflake-arctic', label: 'Snowflake Arctic' },
];

const AIClassifyConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Classify text into categories using Cortex AI_CLASSIFY.</p>
      </div>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Input Column" required error={errors.input_column}>
        <Select value={config.input_column || ''} onChange={(v) => updateConfig({ input_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.input_column} />
      </FormField>
      <FormField label="Categories" required error={errors.categories} hint="One category per line">
        <Textarea value={config.categories || ''} onChange={(v) => updateConfig({ categories: v })} placeholder="positive\nnegative\nneutral" rows={4} error={!!errors.categories} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'classified_label'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

const AISentimentConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <p className="text-xs text-green-700 dark:text-green-300">Analyze sentiment of text using Cortex AI_SENTIMENT. Returns a score from -1 (negative) to 1 (positive).</p>
      </div>
      <FormField label="Text Column" required error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.text_column} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'sentiment_score'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

const AITranslateConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  const langOptions = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' },
    { value: 'de', label: 'German' }, { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' },
    { value: 'ja', label: 'Japanese' }, { value: 'zh', label: 'Chinese' }, { value: 'ko', label: 'Korean' },
    { value: 'ar', label: 'Arabic' },
  ];
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">Translate text between languages using Cortex AI_TRANSLATE.</p>
      </div>
      <FormField label="Text Column" required error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.text_column} />
      </FormField>
      <FormField label="Source Language" error={errors.source_lang} hint="Leave empty for auto-detect">
        <Select value={config.source_lang || ''} onChange={(v) => updateConfig({ source_lang: v })} options={langOptions} placeholder="Auto-detect" />
      </FormField>
      <FormField label="Target Language" required error={errors.target_lang}>
        <Select value={config.target_lang || ''} onChange={(v) => updateConfig({ target_lang: v })} options={langOptions} placeholder="Select language" error={!!errors.target_lang} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'translated_text'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

const AICompleteConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">Generate text completions using Cortex AI_COMPLETE. Use {'{{column_name}}'} placeholders in your prompt template.</p>
      </div>
      <FormField label="Prompt Template" required error={errors.prompt_template} hint="Use {{column}} to reference row values">
        <Textarea value={config.prompt_template || ''} onChange={(v) => updateConfig({ prompt_template: v })} placeholder="Summarize the following text: {{description}}" rows={4} error={!!errors.prompt_template} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Max Tokens" error={errors.max_tokens} hint="Maximum tokens in the response">
        <Input value={config.max_tokens || 256} onChange={(v) => updateConfig({ max_tokens: parseInt(v) || 256 })} type="number" />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'ai_response'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

const FuzzyMatchConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">Find similar strings using EDITDISTANCE. Great for deduplication, record linking, and fuzzy lookups.</p>
      </div>
      <FormField label="Source Column" required error={errors.source_column}>
        <Select value={config.source_column || ''} onChange={(v) => updateConfig({ source_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.source_column} />
      </FormField>
      <FormField label="Target Column" required error={errors.target_column}>
        <Select value={config.target_column || ''} onChange={(v) => updateConfig({ target_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.target_column} />
      </FormField>
      <FormField label="Distance Threshold" error={errors.threshold} hint="Max edit distance (default: 3)">
        <Input value={config.threshold || 3} onChange={(v) => updateConfig({ threshold: parseInt(v) || 3 })} type="number" />
      </FormField>
    </div>
  );
};

const JSONPathExtractConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">Extract nested values from VARIANT/JSON columns using JSON_EXTRACT_PATH_TEXT.</p>
      </div>
      <FormField label="JSON Column" required error={errors.json_column}>
        <Select value={config.json_column || ''} onChange={(v) => updateConfig({ json_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select VARIANT column" error={!!errors.json_column} />
      </FormField>
      <FormField label="JSON Path" required error={errors.json_path} hint="e.g. 'address', 'name'">
        <Input value={config.json_path || ''} onChange={(v) => updateConfig({ json_path: v })} placeholder="key.nested_key" error={!!errors.json_path} />
      </FormField>
    </div>
  );
};

const QualifyFilterConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">Use QUALIFY to filter after window functions. Keeps only the top row per partition (dedup by ROW_NUMBER).</p>
      </div>
      <FormField label="Partition Columns" required error={errors.partition_columns} hint="Comma-separated columns">
        <Input value={config.partition_columns || ''} onChange={(v) => updateConfig({ partition_columns: v })} placeholder="e.g. customer_id, region" error={!!errors.partition_columns} />
      </FormField>
      <FormField label="Order Column" required error={errors.order_column}>
        <Select value={config.order_column || ''} onChange={(v) => updateConfig({ order_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.order_column} />
      </FormField>
    </div>
  );
};

const CorrelationConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Calculate Pearson correlation and covariance between two numeric columns using CORR / COVAR_SAMP.</p>
      </div>
      <FormField label="Column A" required error={errors.column_a}>
        <Select value={config.column_a || ''} onChange={(v) => updateConfig({ column_a: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select numeric column" error={!!errors.column_a} />
      </FormField>
      <FormField label="Column B" required error={errors.column_b}>
        <Select value={config.column_b || ''} onChange={(v) => updateConfig({ column_b: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select numeric column" error={!!errors.column_b} />
      </FormField>
    </div>
  );
};

const HistogramConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
        <p className="text-xs text-pink-700 dark:text-pink-300">Analyze value distribution using WIDTH_BUCKET. Creates histogram buckets for numeric columns.</p>
      </div>
      <FormField label="Column" required error={errors.column}>
        <Select value={config.column || ''} onChange={(v) => updateConfig({ column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select numeric column" error={!!errors.column} />
      </FormField>
      <FormField label="Number of Buckets" error={errors.num_buckets} hint="Default: 10">
        <Input value={config.num_buckets || 10} onChange={(v) => updateConfig({ num_buckets: parseInt(v) || 10 })} type="number" />
      </FormField>
    </div>
  );
};

const AIFilterConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Filter rows using natural language with Cortex AI_FILTER. Describe what rows to keep in plain English.</p>
      </div>
      <FormField label="Filter Prompt" required error={errors.filter_prompt} hint="Describe which rows to keep">
        <Input value={config.filter_prompt || ''} onChange={(v) => updateConfig({ filter_prompt: v })} placeholder="e.g. rows about customer complaints" error={!!errors.filter_prompt} />
      </FormField>
      <FormField label="Text Column" error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" />
      </FormField>
    </div>
  );
};

const AIAggConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Aggregate text data semantically with Cortex AI_AGG. Summarize grouped text using AI.</p>
      </div>
      <FormField label="Group Column" required error={errors.group_column}>
        <Select value={config.group_column || ''} onChange={(v) => updateConfig({ group_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.group_column} />
      </FormField>
      <FormField label="Text Column" error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select text column" />
      </FormField>
      <FormField label="Aggregation Prompt" required error={errors.aggregation_prompt} hint="How to summarize the text">
        <Input value={config.aggregation_prompt || ''} onChange={(v) => updateConfig({ aggregation_prompt: v })} placeholder="e.g. summarize the key themes" error={!!errors.aggregation_prompt} />
      </FormField>
    </div>
  );
};

const RecursiveCTEConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">Build recursive CTE for hierarchical data: org charts, bill of materials, category trees. Traverses parent-child relationships.</p>
      </div>
      <FormField label="ID Column" required error={errors.id_column}>
        <Select value={config.id_column || ''} onChange={(v) => updateConfig({ id_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select ID column" error={!!errors.id_column} />
      </FormField>
      <FormField label="Parent Column" required error={errors.parent_column}>
        <Select value={config.parent_column || ''} onChange={(v) => updateConfig({ parent_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select parent ID column" error={!!errors.parent_column} />
      </FormField>
      <FormField label="Name Column" required error={errors.name_column}>
        <Select value={config.name_column || ''} onChange={(v) => updateConfig({ name_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select display name column" error={!!errors.name_column} />
      </FormField>
    </div>
  );
};

const MLForecastConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <p className="text-xs text-indigo-700 dark:text-indigo-300">Time-series forecasting using Snowflake ML. Predicts future values based on historical data.</p>
      </div>
      <FormField label="Timestamp Column" required error={errors.timestamp_column}>
        <Select value={config.timestamp_column || ''} onChange={(v) => updateConfig({ timestamp_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.timestamp_column} />
      </FormField>
      <FormField label="Value Column" required error={errors.value_column}>
        <Select value={config.value_column || ''} onChange={(v) => updateConfig({ value_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.value_column} />
      </FormField>
      <FormField label="Forecast Periods" required error={errors.forecast_periods} hint="Number of future periods to predict">
        <Input value={config.forecast_periods || 30} onChange={(v) => updateConfig({ forecast_periods: parseInt(v) || 30 })} type="number" error={!!errors.forecast_periods} />
      </FormField>
      <FormField label="Model Name" error={errors.model_name} hint="Auto-generated if empty">
        <Input value={config.model_name || ''} onChange={(v) => updateConfig({ model_name: v })} placeholder="forecast_model_1" />
      </FormField>
    </div>
  );
};

const MLAnomalyConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-xs text-red-700 dark:text-red-300">Detect anomalies in time-series data using Snowflake ML. Flags outlier data points.</p>
      </div>
      <FormField label="Timestamp Column" required error={errors.timestamp_column}>
        <Select value={config.timestamp_column || ''} onChange={(v) => updateConfig({ timestamp_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.timestamp_column} />
      </FormField>
      <FormField label="Value Column" required error={errors.value_column}>
        <Select value={config.value_column || ''} onChange={(v) => updateConfig({ value_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.value_column} />
      </FormField>
      <FormField label="Contamination" error={errors.contamination} hint="Expected proportion of anomalies (0.01 = 1%, 0.1 = 10%)">
        <Input value={config.contamination || 0.05} onChange={(v) => updateConfig({ contamination: parseFloat(v) || 0.05 })} type="number" />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'is_anomaly'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

// ============================================
// AI EXTRACT CONFIG FORM
// ============================================
const AIExtractConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">Extract structured data from text using Cortex AI. Returns JSON with specified keys.</p>
      </div>
      <FormField label="Input Column" required error={errors.input_column}>
        <Select value={config.input_column || ''} onChange={(v) => updateConfig({ input_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select text column" error={!!errors.input_column} />
      </FormField>
      <FormField label="Extract Keys" required error={errors.extract_keys} hint="Comma-separated keys to extract (e.g. name, email, phone)">
        <Input value={(config.extract_keys || []).join(', ')} onChange={(v) => updateConfig({ extract_keys: v.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="name, email, phone" error={!!errors.extract_keys} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'llama3.1-70b'} onChange={(v) => updateConfig({ model: v })} options={[
          { value: 'llama3.1-70b', label: 'Llama 3.1 70B' },
          { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
          { value: 'mistral-large2', label: 'Mistral Large 2' },
        ]} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'extracted_data'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

// ============================================
// DOCUMENT AI CONFIG FORM
// ============================================
const DocumentAIConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">Parse documents (PDF, images) using Snowflake Document AI. Extracts text and structured fields.</p>
      </div>
      <FormField label="Model Name" required error={errors.model}>
        <Input value={config.model || ''} onChange={(v) => updateConfig({ model: v })} placeholder="my_document_model" error={!!errors.model} />
      </FormField>
      <FormField label="Input Column" required error={errors.input_column} hint="Column containing file paths or URLs">
        <Select value={config.input_column || ''} onChange={(v) => updateConfig({ input_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select column" error={!!errors.input_column} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'parsed_content'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

// ============================================
// FINETUNE CONFIG FORM
// ============================================
const FinetuneConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Fine-tune a Cortex LLM on your data. Creates a custom model for your specific use case.</p>
      </div>
      <FormField label="Base Model" required error={errors.base_model}>
        <Select value={config.base_model || 'llama3.1-8b'} onChange={(v) => updateConfig({ base_model: v })} options={[
          { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
          { value: 'mistral-7b', label: 'Mistral 7B' },
        ]} error={!!errors.base_model} />
      </FormField>
      <FormField label="Training Table" required error={errors.training_table} hint="Table with prompt/completion columns">
        <Input value={config.training_table || ''} onChange={(v) => updateConfig({ training_table: v })} placeholder="DB.SCHEMA.TRAINING_DATA" error={!!errors.training_table} />
      </FormField>
      <FormField label="Output Model Name" required error={errors.model_name}>
        <Input value={config.model_name || ''} onChange={(v) => updateConfig({ model_name: v })} placeholder="my_finetuned_model" error={!!errors.model_name} />
      </FormField>
    </div>
  );
};

// ============================================
// CLASSIFICATION TRAIN CONFIG FORM
// ============================================
const ClassificationTrainConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Train a classification model using Snowflake ML. Predicts categorical labels from features.</p>
      </div>
      <FormField label="Target Column" required error={errors.target_column} hint="Column to predict">
        <Select value={config.target_column || ''} onChange={(v) => updateConfig({ target_column: v })} options={availableColumns.map(c => ({ value: c, label: c }))} placeholder="Select target" error={!!errors.target_column} />
      </FormField>
      <FormField label="Feature Columns" error={errors.feature_columns} hint="Leave empty to use all columns except target">
        <div className="text-xs text-slate-500 dark:text-slate-400">{(config.feature_columns || []).length || 'All'} columns selected</div>
      </FormField>
      <FormField label="Model Name" required error={errors.model_name}>
        <Input value={config.model_name || ''} onChange={(v) => updateConfig({ model_name: v })} placeholder="my_classifier" error={!!errors.model_name} />
      </FormField>
    </div>
  );
};

// ============================================
// MAIN SIDEBAR COMPONENT
// ============================================

interface ETLConfigSidebarProps {
  node: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
  onDelete: (nodeId: string) => void;
  availableColumns: string[];
  accessToken?: string | null;
  leftInputColumns?: string[];
  rightInputColumns?: string[];
}

const ETLConfigSidebar: React.FC<ETLConfigSidebarProps> = ({
  node,
  onClose,
  onSave,
  onDelete,
  availableColumns,
  accessToken,
  leftInputColumns = [],
  rightInputColumns = [],
}) => {
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (node) {
      setFormData(node.data || {});
      setErrors({});
      setHasChanges(false);
    }
  }, [node]);

  const handleChange = useCallback((data: any) => {
    setFormData(data);
    setHasChanges(true);
    setErrors({});
  }, []);

  // Real-time validation errors (computed on every formData change)
  const validationErrors = useMemo(() => {
    if (!node) return [];
    const config = formData.config || formData;
    const errs: string[] = [];
    const type = node.type || '';

    if (['source', 'src'].includes(type)) {
      if (!config.database && !config.database_name) errs.push('Database is required');
      if (!config.schema && !config.schema_name) errs.push('Schema is required');
      if (!config.table && !config.table_name) errs.push('Table is required');
    }
    if (['s3_source', 'azure_source', 'gcs_source'].includes(type)) {
      if (!config.stage_name) errs.push('Stage name is required');
      if (!config.file_path) errs.push('File path is required');
    }
    if (type === 'join') {
      if (!config.left_key && !config.join_key) errs.push('Left key is required');
      if (!config.right_key) errs.push('Right key is required');
    }
    if (type === 'destination') {
      if (!config.database && !config.database_name) errs.push('Database is required');
      if (!config.schema && !config.schema_name) errs.push('Schema is required');
      if (!config.table && !config.table_name) errs.push('Table name is required');
    }
    if (type === 'filter') {
      if (!config.filter_condition && (!config.conditions || config.conditions.length === 0)) {
        errs.push('At least one filter condition is required');
      }
    }
    if (type === 'aggregate') {
      if (!config.aggregations || config.aggregations.length === 0) {
        errs.push('At least one aggregation is required');
      }
    }
    if (type === 'select') {
      if (!config.columns || config.columns.length === 0) errs.push('Select at least one column');
    }
    return errs;
  }, [node, formData]);

  const isValid = validationErrors.length === 0;

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!node) return false;

    const config = formData.config || formData;

    switch (node.type) {
      case 'source':
      case 'src':
        if (!config.database) newErrors.database = 'Database is required';
        if (!config.schema) newErrors.schema = 'Schema is required';
        if (!config.table) newErrors.table = 'Table is required';
        break;
      case 'join':
        if (!config.left_key) newErrors.left_key = 'Left key is required';
        if (!config.right_key) newErrors.right_key = 'Right key is required';
        break;
      case 'select':
        if (!config.columns || config.columns.length === 0) newErrors.columns = 'Select at least one column';
        break;
      case 'limit':
        if (!config.limit || config.limit <= 0) newErrors.limit = 'Limit must be greater than 0';
        break;
      case 'recommendation':
        if (!config.score_column) newErrors.score_column = 'Score column name is required';
        break;
      case 'segmentation':
        if (!config.segment_column) newErrors.segment_column = 'Segment column name is required';
        break;
      case 'clustering':
        if (!config.cluster_column) newErrors.cluster_column = 'Cluster column name is required';
        break;
      case 'destination':
        if (!config.database) newErrors.database = 'Database is required';
        if (!config.schema) newErrors.schema = 'Schema is required';
        if (!config.table) newErrors.table = 'Table name is required';
        if (config.write_mode === 'merge' && (!config.merge_keys || config.merge_keys.length === 0)) {
          newErrors.merge_keys = 'Merge keys are required for merge mode';
        }
        break;
      case 'export_file':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        break;
      case 'sql_script':
        if (!config.sql_code) newErrors.sql_code = 'SQL code is required';
        break;
      case 'python_script':
        if (config.python_mode === 'inline') {
          if (!config.python_code) newErrors.python_code = 'Python code is required';
        } else {
          if (!config.database) newErrors.database = 'Database is required';
          if (!config.schema) newErrors.schema = 'Schema is required';
          if (!config.proc_name) newErrors.proc_name = 'Procedure name is required';
        }
        break;
      case 'notebook_run':
        if (!config.database) newErrors.database = 'Database is required';
        if (!config.schema) newErrors.schema = 'Schema is required';
        if (!config.notebook_name) newErrors.notebook_name = 'Notebook name is required';
        break;
      case 'dynamic_table':
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        if (!config.target_lag) newErrors.target_lag = 'Target lag is required';
        if (!config.warehouse) newErrors.warehouse = 'Warehouse is required';
        if (!config.query) newErrors.query = 'Query is required';
        break;
      case 'stream_consume':
        if (!config.stream_name) newErrors.stream_name = 'Stream name is required';
        if (!config.database) newErrors.database = 'Source database is required';
        if (!config.schema) newErrors.schema = 'Source schema is required';
        if (!config.source_object) newErrors.source_object = 'Source table/view is required';
        break;
      case 'cdc_merge':
        if (!config.stream_name) newErrors.stream_name = 'Stream name is required';
        if (!config.target_table) newErrors.target_table = 'Target table is required';
        if (!config.merge_keys) newErrors.merge_keys = 'Merge keys are required';
        break;
      case 'git_file':
        if (!config.repo_name) newErrors.repo_name = 'Repository name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      case 'compute_pool':
        if (!config.pool_name) newErrors.pool_name = 'Pool name is required';
        if (!config.min_nodes || config.min_nodes <= 0) newErrors.min_nodes = 'Min nodes must be greater than 0';
        if (!config.max_nodes || config.max_nodes <= 0) newErrors.max_nodes = 'Max nodes must be greater than 0';
        break;
      case 'container_service':
        if (!config.service_name) newErrors.service_name = 'Service name is required';
        if (!config.compute_pool) newErrors.compute_pool = 'Compute pool is required';
        if (!config.stage) newErrors.stage = 'Stage is required';
        if (!config.spec_file) newErrors.spec_file = 'Spec file is required';
        break;
      // Window Functions
      case 'window_rank':
        if (!config.order_by || config.order_by.length === 0) newErrors.order_by = 'At least one order by column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      case 'window_lag_lead':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.order_by || config.order_by.length === 0) newErrors.order_by = 'At least one order by column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      case 'window_aggregate':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      case 'window_ntile':
        if (!config.buckets || config.buckets <= 0) newErrors.buckets = 'Number of buckets must be greater than 0';
        if (!config.order_by || config.order_by.length === 0) newErrors.order_by = 'At least one order by column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // JSON
      case 'json_flatten':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        break;
      case 'json_extract':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        if (!config.extract_paths || config.extract_paths.length === 0) newErrors.extract_paths = 'At least one extract path is required';
        break;
      // AI Blocks validation
      case 'ai_classify':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        if (!config.categories) newErrors.categories = 'Categories are required';
        break;
      case 'ai_sentiment':
        if (!config.text_column) newErrors.text_column = 'Text column is required';
        break;
      case 'ai_translate':
        if (!config.text_column) newErrors.text_column = 'Text column is required';
        if (!config.target_lang) newErrors.target_lang = 'Target language is required';
        break;
      case 'ai_complete':
        if (!config.prompt_template) newErrors.prompt_template = 'Prompt template is required';
        break;
      case 'ml_forecast':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        if (!config.forecast_periods || config.forecast_periods <= 0) newErrors.forecast_periods = 'Forecast periods must be greater than 0';
        break;
      case 'ml_anomaly':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        break;
      case 'json_construct':
        if (!config.columns || config.columns.length === 0) newErrors.columns = 'Select at least one column';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // Pivot/Unpivot
      case 'pivot':
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        if (!config.pivot_column) newErrors.pivot_column = 'Pivot column is required';
        if (!config.pivot_values) newErrors.pivot_values = 'Pivot values are required';
        break;
      case 'unpivot':
        if (!config.unpivot_columns || config.unpivot_columns.length === 0) newErrors.unpivot_columns = 'Select at least one column to unpivot';
        break;
      // Date/Time
      case 'date_transform':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        if (config.operation === 'DATEDIFF' && !config.second_column) newErrors.second_column = 'Second column is required for DATEDIFF';
        break;
      case 'time_slice':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.slice_length || config.slice_length <= 0) newErrors.slice_length = 'Slice length must be greater than 0';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // Data Cleaning
      case 'fill_nulls':
        if (!config.column) newErrors.column = 'Column is required';
        if (config.strategy === 'VALUE' && !config.fill_value) newErrors.fill_value = 'Fill value is required when strategy is VALUE';
        if ((config.strategy === 'FORWARD_FILL' || config.strategy === 'BACKWARD_FILL') && !config.order_column) {
          newErrors.order_column = 'Order column is required for forward/backward fill';
        }
        break;
      case 'case_when':
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        if (!config.conditions || config.conditions.length === 0) newErrors.conditions = 'At least one condition is required';
        break;
      case 'split_column':
        if (!config.column) newErrors.column = 'Column is required';
        if (!config.delimiter) newErrors.delimiter = 'Delimiter is required';
        break;
      case 'fuzzy_match':
        if (!config.source_column) newErrors.source_column = 'Source column is required';
        if (!config.target_column) newErrors.target_column = 'Target column is required';
        break;
      case 'json_path_extract':
        if (!config.json_column) newErrors.json_column = 'JSON column is required';
        if (!config.json_path) newErrors.json_path = 'JSON path is required';
        break;
      case 'qualify_filter':
        if (!config.partition_columns) newErrors.partition_columns = 'Partition columns are required';
        if (!config.order_column) newErrors.order_column = 'Order column is required';
        break;
      case 'correlation':
        if (!config.column_a) newErrors.column_a = 'Column A is required';
        if (!config.column_b) newErrors.column_b = 'Column B is required';
        break;
      case 'histogram':
        if (!config.column) newErrors.column = 'Column is required';
        break;
      case 'ai_filter':
        if (!config.filter_prompt) newErrors.filter_prompt = 'Filter prompt is required';
        break;
      case 'ai_agg':
        if (!config.group_column) newErrors.group_column = 'Group column is required';
        if (!config.aggregation_prompt) newErrors.aggregation_prompt = 'Aggregation prompt is required';
        break;
      case 'recursive_cte':
        if (!config.id_column) newErrors.id_column = 'ID column is required';
        if (!config.parent_column) newErrors.parent_column = 'Parent column is required';
        if (!config.name_column) newErrors.name_column = 'Name column is required';
        break;
      // Cloud Sources
      case 's3_source':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      case 'azure_source':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      case 'gcs_source':
        if (!config.stage_name) newErrors.stage_name = 'Stage name is required';
        if (!config.file_path) newErrors.file_path = 'File path is required';
        break;
      // DB Sources
      case 'postgres_source':
        if (!config.connection_name) newErrors.connection_name = 'Connection name is required';
        if (!config.source_table) newErrors.source_table = 'Source table is required';
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.target_schema) newErrors.target_schema = 'Target schema is required';
        break;
      case 'mysql_source':
        if (!config.connection_name) newErrors.connection_name = 'Connection name is required';
        if (!config.source_table) newErrors.source_table = 'Source table is required';
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.target_schema) newErrors.target_schema = 'Target schema is required';
        break;
      // CRM/ERP Sources
      case 'salesforce_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.object_name) newErrors.object_name = 'Object name is required';
        break;
      case 'sap_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'oracle_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'hubspot_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.object_name) newErrors.object_name = 'Object name is required';
        break;
      case 'servicenow_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'api_source':
        if (!config.target_database) newErrors.target_database = 'Target database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema name is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      // Other Sources
      case 'external_table_source':
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'dynamic_table_source':
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      case 'shared_data_source':
        if (!config.share_database) newErrors.share_database = 'Shared database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.table_name) newErrors.table_name = 'Table name is required';
        break;
      // Python UDF/Procedure
      case 'create_udf':
        if (!config.function_name) newErrors.function_name = 'Function name is required';
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.function_body) newErrors.function_body = 'Function body is required';
        break;
      case 'create_procedure':
        if (!config.procedure_name) newErrors.procedure_name = 'Procedure name is required';
        if (!config.database_name) newErrors.database_name = 'Database is required';
        if (!config.schema_name) newErrors.schema_name = 'Schema is required';
        if (!config.procedure_body) newErrors.procedure_body = 'Procedure body is required';
        break;
      case 'apply_udf':
        if (!config.function_name) newErrors.function_name = 'Function name is required';
        if (!config.input_columns || config.input_columns.length === 0) newErrors.input_columns = 'At least one input column is required';
        if (!config.output_column) newErrors.output_column = 'Output column name is required';
        break;
      // AI Functions
      case 'ai_extract':
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        if (!config.extract_keys || config.extract_keys.length === 0) newErrors.extract_keys = 'Extract keys are required';
        break;
      // ML Training
      case 'forecast':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        break;
      case 'anomaly_detect':
        if (!config.timestamp_column) newErrors.timestamp_column = 'Timestamp column is required';
        if (!config.value_column) newErrors.value_column = 'Value column is required';
        break;
      case 'document_ai':
        if (!config.model) newErrors.model = 'Model name is required';
        if (!config.input_column) newErrors.input_column = 'Input column is required';
        break;
      case 'finetune':
        if (!config.base_model) newErrors.base_model = 'Base model is required';
        if (!config.training_table) newErrors.training_table = 'Training table is required';
        break;
      case 'classification_train':
        if (!config.target_column) newErrors.target_column = 'Target column is required';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [node, formData]);

  const handleSave = useCallback(() => {
    if (!node) return;
    if (validate()) {
      onSave(node.id, formData);
      setHasChanges(false);
    }
  }, [node, formData, validate, onSave]);

  const handleDelete = useCallback(() => {
    if (!node) return;
    if (confirm('Are you sure you want to delete this node?')) {
      onDelete(node.id);
    }
  }, [node, onDelete]);

  if (!node || !node.type) return null;

  const blockDef = getBlockByType(node.type);
  if (!blockDef) return null;

  const Icon = blockDef.icon;

  const renderConfig = () => {
    switch (node.type) {
      case 'source':
      case 'src':
        return <SourceConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'join':
        return <JoinConfigForm data={formData} onChange={handleChange} errors={errors} leftInputColumns={leftInputColumns} rightInputColumns={rightInputColumns} />;
      case 'filter':
      case 'drop_nulls':
        return <FilterConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'aggregate':
      case 'aggregate_kpi':
        return <AggregateConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'select':
        return <SelectConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'rename':
        return <RenameConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'cast':
        return <CastConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'formula':
      case 'normalize':
        return <FormulaConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'sort':
        return <SortConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'union':
        return <UnionConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'distinct':
      case 'drop_duplicates':
        return <DistinctConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'limit':
        return <LimitConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'recommendation':
        return <RecommendationConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'segmentation':
        return <SegmentationConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'clustering':
        return <ClusteringConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'destination':
        return <DestinationConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} availableColumns={availableColumns} />;
      case 'export_file':
      case 'export_excel':
        return <ExportFileConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'sql_script':
        return <SQLScriptConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'python_script':
        return <PythonScriptConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'notebook_run':
        return <NotebookRunConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'dynamic_table':
        return <DynamicTableConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'stream_consume':
        return <StreamConsumeConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'cdc_merge':
        return <CdcMergeConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'git_file':
        return <GitFileConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'compute_pool':
        return <ComputePoolConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'container_service':
        return <ContainerServiceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // Window Functions
      case 'window_rank':
        return <WindowRankConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'window_lag_lead':
        return <WindowLagLeadConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'window_aggregate':
        return <WindowAggregateConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'window_ntile':
        return <WindowNtileConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // JSON
      case 'json_flatten':
        return <JsonFlattenConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'json_extract':
        return <JsonExtractConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'json_construct':
        return <JsonConstructConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // Pivot/Unpivot
      case 'pivot':
        return <PivotConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'unpivot':
        return <UnpivotConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // Date/Time
      case 'date_transform':
        return <DateTransformConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'time_slice':
        return <TimeSliceConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // Data Cleaning
      case 'fill_nulls':
        return <FillNullsConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'case_when':
        return <CaseWhenConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'split_column':
        return <SplitColumnConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // Cloud Sources
      case 's3_source':
        return <S3SourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'azure_source':
        return <AzureSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'gcs_source':
        return <GCSSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // DB Sources
      case 'postgres_source':
        return <PostgresSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'mysql_source':
        return <MySQLSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // CRM/ERP Sources
      case 'salesforce_source':
        return <SalesforceSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'sap_source':
        return <SapSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'oracle_source':
        return <OracleSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'hubspot_source':
        return <HubspotSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'servicenow_source':
        return <ServicenowSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'api_source':
        return <ApiSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // Other Sources
      case 'external_table_source':
        return <ExternalTableSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'dynamic_table_source':
        return <DynamicTableSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'shared_data_source':
        return <SharedDataSourceConfigForm data={formData} onChange={handleChange} errors={errors} />;
      // Python UDF/Procedure
      case 'create_udf':
        return <CreateUDFConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'create_procedure':
        return <CreateProcedureConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'apply_udf':
        return <ApplyUDFConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // AI Blocks
      case 'ai_classify':
        return <AIClassifyConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'ai_sentiment':
        return <AISentimentConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'ai_translate':
        return <AITranslateConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'ai_complete':
        return <AICompleteConfigForm data={formData} onChange={handleChange} errors={errors} />;
      case 'ai_extract':
        return <AIExtractConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'forecast':
      case 'ml_forecast':
        return <MLForecastConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'anomaly_detect':
      case 'ml_anomaly':
        return <MLAnomalyConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'document_ai':
        return <DocumentAIConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'finetune':
        return <FinetuneConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'classification_train':
        return <ClassificationTrainConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      // New blocks
      case 'fuzzy_match':
        return <FuzzyMatchConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'json_path_extract':
        return <JSONPathExtractConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'qualify_filter':
        return <QualifyFilterConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'correlation':
        return <CorrelationConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'histogram':
        return <HistogramConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'ai_filter':
        return <AIFilterConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'ai_agg':
        return <AIAggConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'recursive_cte':
        return <RecursiveCTEConfigForm data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      default:
        return <p className="text-slate-500">No configuration available for this block.</p>;
    }
  };

  return (
    <div className="w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className={cn('px-4 py-3 border-b border-slate-200 dark:border-slate-700', blockDef.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg bg-white/80 dark:bg-slate-700/80', blockDef.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                {blockDef.label}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {blockDef.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Node Name */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <FormField label="Component Name" hint="Optional display name">
          <Input
            value={formData.name || ''}
            onChange={(v) => handleChange({ ...formData, name: v })}
            placeholder={blockDef.label}
          />
        </FormField>
      </div>

      {/* Config form */}
      <div className="flex-1 overflow-auto p-4">
        {renderConfig()}
      </div>

      {/* Errors */}
      {Object.keys(errors).length > 0 && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Please fix the errors above</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2">
        {validationErrors.length > 0 && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Required fields missing:</p>
            {validationErrors.map((err, i) => (
              <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span>•</span> {err}
              </p>
            ))}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={!hasChanges || !isValid}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
            hasChanges && isValid
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
          )}
        >
          <Save className="h-4 w-4" />
          Save Configuration
        </button>

        <button
          onClick={handleDelete}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete Node
        </button>
      </div>
    </div>
  );
};

export default ETLConfigSidebar;
