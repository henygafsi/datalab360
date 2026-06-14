'use client';

import React, { useState, useEffect } from 'react';
import { FormField, Select, Input } from './_shared';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';

/**
 * StreamConsumeConfigForm — handles block type(s): `stream_consume`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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
  const [loadError, setLoadError] = useState<string | null>(null);

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  useEffect(() => {
    if (!accessToken) return;
    setLoading('databases');
    getDatabases().then(setDatabases).catch((e) => { console.error(e); setLoadError("Couldn't load data sources."); }).finally(() => setLoading(null));
  }, [accessToken]);

  useEffect(() => {
    if (!config.database) return;
    setLoading('schemas');
    setSchemas([]);
    getSchemas(config.database).then(setSchemas).catch((e) => { console.error(e); setLoadError("Couldn't load data sources."); }).finally(() => setLoading(null));
  }, [config.database]);

  useEffect(() => {
    if (!config.database || !config.schema) return;
    setLoading('tables');
    setTables([]);
    getTables(config.database, config.schema).then(setTables).catch((e) => { console.error(e); setLoadError("Couldn't load data sources."); }).finally(() => setLoading(null));
  }, [config.database, config.schema]);

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">
          Creates a Snowflake Stream on a table or view to track changes (INSERT, UPDATE, DELETE). The stream captures CDC data for downstream processing.
        </p>
      </div>

      {loadError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{loadError}</p>
      )}

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

export default StreamConsumeConfigForm;
