'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
      case 'destination':
        return <DestinationConfigForm data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} availableColumns={availableColumns} />;
      case 'export_file':
      case 'export_excel':
        return <ExportFileConfigForm data={formData} onChange={handleChange} errors={errors} />;
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
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
            hasChanges
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
