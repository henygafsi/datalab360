'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { FormField, Select, MultiSelect, Input } from './_shared';
import type { DestinationConfig } from '@/app/services/etl/types';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';

/**
 * DestinationConfigForm — handles block type(s): `destination`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const DestinationConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, accessToken, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
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

export default DestinationConfigForm;
