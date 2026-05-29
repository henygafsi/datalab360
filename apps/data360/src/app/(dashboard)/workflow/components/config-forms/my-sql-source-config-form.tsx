'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * MySQLSourceConfigForm — handles block type(s): `mysql_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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

export default MySQLSourceConfigForm;
