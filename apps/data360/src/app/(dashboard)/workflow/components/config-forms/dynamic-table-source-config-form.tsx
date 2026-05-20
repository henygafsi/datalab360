'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * DynamicTableSourceConfigForm — handles block type(s): `dynamic_table_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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

export default DynamicTableSourceConfigForm;
