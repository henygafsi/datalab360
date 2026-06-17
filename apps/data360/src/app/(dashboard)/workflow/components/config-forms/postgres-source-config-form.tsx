'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * PostgresSourceConfigForm — handles block type(s): `postgres_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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
          Ingest data from a PostgreSQL database via a managed connector. Specify the connection and target location in the data warehouse.
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

export default PostgresSourceConfigForm;
