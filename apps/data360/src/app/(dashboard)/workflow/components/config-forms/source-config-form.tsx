'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { FormField, Select, MultiSelect, Input } from './_shared';
import type { SourceConfig } from '@/app/services/etl/types';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';

/**
 * SourceConfigForm — handles block type(s): `source`, `src`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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

export default SourceConfigForm;
