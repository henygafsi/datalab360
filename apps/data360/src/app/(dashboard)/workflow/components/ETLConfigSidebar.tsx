'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Node } from 'reactflow';
import {
  X, AlertCircle, Check, ChevronDown, Loader2,
  Database, GitMerge, BarChart3, ArrowUpDown, Filter,
  Copy, Scale, MapPin, FileSpreadsheet, Trash2, Save
} from 'lucide-react';
import { getBlockByType, ETLBlockDefinition } from './etl-blocks';

// Form field component with validation
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

// Select component
interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

const Select: React.FC<SelectProps> = ({ value, onChange, options, placeholder, disabled, error }) => {
  // Ensure value is a string
  const safeValue = typeof value === 'string' ? value : (value && typeof value === 'object' && 'name' in (value as any) ? (value as any).name : String(value || ''));

  // Ensure options have string values and labels
  const safeOptions = options.map((opt) => ({
    value: typeof opt.value === 'string' ? opt.value : String(opt.value || ''),
    label: typeof opt.label === 'string' ? opt.label : String(opt.label || ''),
  }));

  return (
    <div className="relative">
      <select
        value={safeValue}
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
        {safeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
    </div>
  );
};

// Multi-select component
interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: (string | { name: string })[];
  placeholder?: string;
  disabled?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ values, onChange, options, placeholder, disabled }) => {
  // Ensure all options are strings (handle objects with {name} keys)
  const safeOptions = options.map((opt) =>
    typeof opt === 'string' ? opt : (opt && typeof opt === 'object' && 'name' in opt ? opt.name : String(opt))
  );

  // Ensure all values are strings
  const safeValues = values.map((v) =>
    typeof v === 'string' ? v : (v && typeof v === 'object' && 'name' in (v as any) ? (v as any).name : String(v))
  );

  return (
    <select
      multiple
      value={safeValues}
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
      {safeOptions.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
};

// Input component
interface InputProps {
  value: string;
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

// Props for the sidebar
interface ETLConfigSidebarProps {
  node: Node | null;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
  onDelete: (nodeId: string) => void;
  availableColumns: string[];
  // API data fetching
  accessToken?: string | null;
  // For join nodes - columns from left and right inputs
  leftInputColumns?: string[];
  rightInputColumns?: string[];
}

// Helper to extract string from API response item (handles string, {name: string}, or other object formats)
const extractString = (item: unknown): string => {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    if ('name' in item) return String((item as { name: unknown }).name);
    if ('value' in item) return String((item as { value: unknown }).value);
    if ('database' in item) return String((item as { database: unknown }).database);
    if ('schema' in item) return String((item as { schema: unknown }).schema);
    if ('table' in item) return String((item as { table: unknown }).table);
  }
  return String(item);
};

// Helper to normalize API response array to string array
const normalizeToStringArray = (items: unknown): string[] => {
  if (!items) return [];
  if (!Array.isArray(items)) return [];
  return items.map(extractString).filter(Boolean);
};

// Configuration forms for each node type
const SourceConfig: React.FC<{
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

  // Fetch databases
  useEffect(() => {
    if (!accessToken) return;
    setLoading('databases');
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((result) => {
        // Handle various API response formats
        const dbs = result.databases || result.data || result;
        setDatabases(normalizeToStringArray(dbs));
      })
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken]);

  // Fetch schemas when database changes
  useEffect(() => {
    if (!accessToken || !data.database) return;
    setLoading('schemas');
    setSchemas([]);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mapping/schemas/${data.database}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((result) => {
        const schms = result.schemas || result.data || result;
        setSchemas(normalizeToStringArray(schms));
      })
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, data.database]);

  // Fetch tables when schema changes
  useEffect(() => {
    if (!accessToken || !data.database || !data.schema) return;
    setLoading('tables');
    setTables([]);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mapping/tables/${data.database}/${data.schema}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((result) => {
        const tbls = result.tables || result.data || result;
        setTables(normalizeToStringArray(tbls));
      })
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, data.database, data.schema]);

  // Fetch columns when table changes
  useEffect(() => {
    if (!accessToken || !data.database || !data.schema || !data.table) return;
    setLoading('columns');
    setColumns([]);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mapping/get_table_columns/?database_name=${data.database}&schema_name=${data.schema}&table_name=${data.table}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((result) => {
        const cols = result.columns || result.data || result;
        setColumns(normalizeToStringArray(cols));
      })
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, data.database, data.schema, data.table]);

  return (
    <div className="space-y-4">
      <FormField label="Database" required error={errors.database}>
        <Select
          value={data.database || ''}
          onChange={(v) => onChange({ ...data, database: v, schema: '', table: '', columns: [] })}
          options={databases.map((d) => ({ value: d, label: d }))}
          placeholder="Select database..."
          disabled={loading === 'databases'}
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema}>
        <Select
          value={data.schema || ''}
          onChange={(v) => onChange({ ...data, schema: v, table: '', columns: [] })}
          options={schemas.map((s) => ({ value: s, label: s }))}
          placeholder="Select schema..."
          disabled={!data.database || loading === 'schemas'}
          error={!!errors.schema}
        />
      </FormField>

      <FormField label="Table" required error={errors.table}>
        <Select
          value={data.table || ''}
          onChange={(v) => onChange({ ...data, table: v, columns: [] })}
          options={tables.map((t) => ({ value: t, label: t }))}
          placeholder="Select table..."
          disabled={!data.schema || loading === 'tables'}
          error={!!errors.table}
        />
      </FormField>

      <FormField label="Columns" hint="Hold Ctrl/Cmd to select multiple">
        <MultiSelect
          values={Array.isArray(data.columns)
            ? data.columns.map((c: string | { name: string }) => typeof c === 'string' ? c : c.name)
            : (data.columns ? data.columns.split(', ') : [])}
          onChange={(v) => onChange({ ...data, columns: v })}
          options={columns}
          disabled={!data.table || loading === 'columns'}
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

const JoinConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  leftInputColumns: string[];
  rightInputColumns: string[];
}> = ({ data, onChange, errors, leftInputColumns, rightInputColumns }) => {
  const joinTypes = [
    { value: 'INNER', label: 'Inner Join' },
    { value: 'LEFT', label: 'Left Join' },
    { value: 'RIGHT', label: 'Right Join' },
    { value: 'FULL', label: 'Full Outer Join' },
  ];

  return (
    <div className="space-y-4">
      <FormField label="Join Type" required>
        <Select
          value={data.join_type || 'INNER'}
          onChange={(v) => onChange({ ...data, join_type: v })}
          options={joinTypes}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Left Key" required error={errors.left_key}>
          <Select
            value={data.left_key || ''}
            onChange={(v) => onChange({ ...data, left_key: v })}
            options={leftInputColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Select..."
            error={!!errors.left_key}
          />
        </FormField>

        <FormField label="Right Key" required error={errors.right_key}>
          <Select
            value={data.right_key || ''}
            onChange={(v) => onChange({ ...data, right_key: v })}
            options={rightInputColumns.map((c) => ({ value: c, label: c }))}
            placeholder="Select..."
            error={!!errors.right_key}
          />
        </FormField>
      </div>

      <FormField label="Left Columns" hint="Columns to include from left input">
        <MultiSelect
          values={data.left_columns || []}
          onChange={(v) => onChange({ ...data, left_columns: v })}
          options={leftInputColumns}
        />
      </FormField>

      <FormField label="Right Columns" hint="Columns to include from right input">
        <MultiSelect
          values={data.right_columns || []}
          onChange={(v) => onChange({ ...data, right_columns: v })}
          options={rightInputColumns}
        />
      </FormField>
    </div>
  );
};

const AggregateConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const aggTypes = [
    { value: 'SUM', label: 'Sum' },
    { value: 'AVG', label: 'Average' },
    { value: 'COUNT', label: 'Count' },
    { value: 'MIN', label: 'Minimum' },
    { value: 'MAX', label: 'Maximum' },
  ];

  // Ensure columns are strings (handle objects with {name} keys)
  const safeColumns = (data.columns || []).map((c: string | { name: string }) =>
    typeof c === 'string' ? c : c.name
  );

  return (
    <div className="space-y-4">
      <FormField label="KPI Name" required error={errors.kpi_name} hint="Name for the resulting column">
        <Input
          value={data.kpi_name || ''}
          onChange={(v) => onChange({ ...data, kpi_name: v })}
          placeholder="e.g., total_sales"
          error={!!errors.kpi_name}
        />
      </FormField>

      <FormField label="Aggregation Type" required error={errors.agg_type}>
        <Select
          value={data.agg_type || ''}
          onChange={(v) => onChange({ ...data, agg_type: v })}
          options={aggTypes}
          placeholder="Select aggregation..."
          error={!!errors.agg_type}
        />
      </FormField>

      <FormField label="Columns to Aggregate" required error={errors.agg_columns} hint="Select at least one column to aggregate">
        <MultiSelect
          values={safeColumns}
          onChange={(v) => onChange({ ...data, columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

const SortConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => (
  <div className="space-y-4">
    <FormField label="Sort Column" required error={errors.sort_column}>
      <Select
        value={data.sort_column || ''}
        onChange={(v) => onChange({ ...data, sort_column: v })}
        options={availableColumns.map((c) => ({ value: c, label: c }))}
        placeholder="Select column..."
        error={!!errors.sort_column}
      />
    </FormField>

    <FormField label="Sort Order">
      <Select
        value={data.sort_order || 'ASC'}
        onChange={(v) => onChange({ ...data, sort_order: v })}
        options={[
          { value: 'ASC', label: 'Ascending' },
          { value: 'DESC', label: 'Descending' },
        ]}
      />
    </FormField>
  </div>
);

const DropNullsConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => (
  <div className="space-y-4">
    <FormField label="Column to Check" required error={errors.null_column} hint="Rows with null values in this column will be removed">
      <Select
        value={data.null_column || ''}
        onChange={(v) => onChange({ ...data, null_column: v })}
        options={availableColumns.map((c) => ({ value: c, label: c }))}
        placeholder="Select column..."
        error={!!errors.null_column}
      />
    </FormField>
  </div>
);

const DropDuplicatesConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => (
  <div className="space-y-4">
    <FormField label="Deduplication Columns" hint="Columns to check for duplicates">
      <MultiSelect
        values={data.dedup_columns || []}
        onChange={(v) => onChange({ ...data, dedup_columns: v })}
        options={availableColumns}
      />
    </FormField>

    <FormField label="Order Column" error={errors.order_column} hint="Used to determine which duplicate to keep">
      <Select
        value={data.order_column || ''}
        onChange={(v) => onChange({ ...data, order_column: v })}
        options={availableColumns.map((c) => ({ value: c, label: c }))}
        placeholder="Select column..."
        error={!!errors.order_column}
      />
    </FormField>
  </div>
);

const NormalizeConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
}> = ({ data, onChange, errors, availableColumns }) => {
  const isZScore = data.normalize_type === 'zscore' || !data.normalize_type;

  return (
    <div className="space-y-4">
      <FormField label="Normalization Type">
        <Select
          value={data.normalize_type || 'zscore'}
          onChange={(v) => onChange({ ...data, normalize_type: v })}
          options={[
            { value: 'zscore', label: 'Z-Score' },
            { value: 'minmax', label: 'Min-Max' },
          ]}
        />
      </FormField>

      <FormField label="Target Column" required error={errors.target_column}>
        <Select
          value={isZScore ? (data.zscore_column || '') : (data.minmax_column || '')}
          onChange={(v) => onChange({
            ...data,
            [isZScore ? 'zscore_column' : 'minmax_column']: v,
          })}
          options={availableColumns.map((c) => ({ value: c, label: c }))}
          placeholder="Select column..."
          error={!!errors.target_column}
        />
      </FormField>

      <FormField label="Output Column Name" required error={errors.output_column} hint="Name for the normalized column">
        <Input
          value={isZScore ? (data.zscore_column_normalized || '') : (data.minmax_column_normalized || '')}
          onChange={(v) => onChange({
            ...data,
            [isZScore ? 'zscore_column_normalized' : 'minmax_column_normalized']: v,
          })}
          placeholder="e.g., amount_normalized"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

const DestinationConfig: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
}> = ({ data, onChange, errors, accessToken }) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading('databases');
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mapping/databases`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((result) => {
        const dbs = result.databases || result.data || result;
        setDatabases(normalizeToStringArray(dbs));
      })
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !data.database) return;
    setLoading('schemas');
    setSchemas([]);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/mapping/schemas/${data.database}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((result) => {
        const schms = result.schemas || result.data || result;
        setSchemas(normalizeToStringArray(schms));
      })
      .catch(console.error)
      .finally(() => setLoading(null));
  }, [accessToken, data.database]);

  return (
    <div className="space-y-4">
      <FormField label="Database" required error={errors.database}>
        <Select
          value={data.database || ''}
          onChange={(v) => onChange({ ...data, database: v, schema: '' })}
          options={databases.map((d) => ({ value: d, label: d }))}
          placeholder="Select database..."
          disabled={loading === 'databases'}
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Schema" error={errors.schema}>
        <Select
          value={data.schema || ''}
          onChange={(v) => onChange({ ...data, schema: v })}
          options={schemas.map((s) => ({ value: s, label: s }))}
          placeholder="Select schema..."
          disabled={!data.database || loading === 'schemas'}
        />
      </FormField>

      <FormField label="Destination Table" required error={errors.destination_table}>
        <Input
          value={data.destination_table || ''}
          onChange={(v) => onChange({ ...data, destination_table: v })}
          placeholder="e.g., fact_sales"
          error={!!errors.destination_table}
        />
      </FormField>
    </div>
  );
};

// Main sidebar component
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

  // Initialize form data when node changes
  useEffect(() => {
    if (node) {
      setFormData(node.data || {});
      setErrors({});
      setHasChanges(false);
    }
  }, [node]);

  // Handle form data changes
  const handleChange = useCallback((data: any) => {
    setFormData(data);
    setHasChanges(true);
    setErrors({});
  }, []);

  // Validate form
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!node) return false;

    switch (node.type) {
      case 'src':
        if (!formData.database) newErrors.database = 'Database is required';
        if (!formData.schema) newErrors.schema = 'Schema is required';
        if (!formData.table) newErrors.table = 'Table is required';
        break;
      case 'join':
        if (!formData.left_key) newErrors.left_key = 'Left key is required';
        if (!formData.right_key) newErrors.right_key = 'Right key is required';
        break;
      case 'aggregate_kpi':
        if (!formData.kpi_name) newErrors.kpi_name = 'KPI name is required';
        if (!formData.agg_type) newErrors.agg_type = 'Aggregation type is required';
        if (!formData.columns || formData.columns.length === 0) newErrors.agg_columns = 'At least one column is required';
        break;
      case 'sort':
        if (!formData.sort_column) newErrors.sort_column = 'Sort column is required';
        break;
      case 'drop_nulls':
        if (!formData.null_column) newErrors.null_column = 'Column is required';
        break;
      case 'normalize':
        const isZScore = formData.normalize_type === 'zscore' || !formData.normalize_type;
        if (isZScore && !formData.zscore_column) newErrors.target_column = 'Target column is required';
        if (!isZScore && !formData.minmax_column) newErrors.target_column = 'Target column is required';
        if (isZScore && !formData.zscore_column_normalized) newErrors.output_column = 'Output column name is required';
        if (!isZScore && !formData.minmax_column_normalized) newErrors.output_column = 'Output column name is required';
        break;
      case 'destination':
        if (!formData.database) newErrors.database = 'Database is required';
        if (!formData.destination_table) newErrors.destination_table = 'Table name is required';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [node, formData]);

  // Handle save
  const handleSave = useCallback(() => {
    if (!node) return;
    if (validate()) {
      // Format columns as comma-separated string for source node
      const dataToSave = { ...formData };
      if (node.type === 'src' && Array.isArray(dataToSave.columns)) {
        dataToSave.columns = dataToSave.columns.join(', ');
      }
      onSave(node.id, dataToSave);
      setHasChanges(false);
    }
  }, [node, formData, validate, onSave]);

  // Handle delete
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

  // Render appropriate config form
  const renderConfig = () => {
    switch (node.type) {
      case 'src':
        return <SourceConfig data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'join':
        return <JoinConfig data={formData} onChange={handleChange} errors={errors} leftInputColumns={leftInputColumns} rightInputColumns={rightInputColumns} />;
      case 'aggregate_kpi':
        return <AggregateConfig data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'sort':
        return <SortConfig data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'drop_nulls':
        return <DropNullsConfig data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'drop_duplicates':
        return <DropDuplicatesConfig data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'normalize':
        return <NormalizeConfig data={formData} onChange={handleChange} errors={errors} availableColumns={availableColumns} />;
      case 'destination':
        return <DestinationConfig data={formData} onChange={handleChange} errors={errors} accessToken={accessToken} />;
      case 'export_excel':
        return (
          <FormField label="Filename">
            <Input
              value={formData.filename || ''}
              onChange={(v) => handleChange({ ...formData, filename: v })}
              placeholder="output.xlsx"
            />
          </FormField>
        );
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

      {/* Config form */}
      <div className="flex-1 overflow-auto p-4">
        {renderConfig()}
      </div>

      {/* Validation errors summary */}
      {Object.keys(errors).length > 0 && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Please fix the errors above</span>
          </div>
        </div>
      )}

      {/* Footer actions */}
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
