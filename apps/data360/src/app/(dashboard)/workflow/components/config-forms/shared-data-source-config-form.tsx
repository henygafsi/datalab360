'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * SharedDataSourceConfigForm — handles block type(s): `shared_data_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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

export default SharedDataSourceConfigForm;
