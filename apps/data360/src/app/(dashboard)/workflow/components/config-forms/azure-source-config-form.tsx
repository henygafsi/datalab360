'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * AzureSourceConfigForm — handles block type(s): `azure_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

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
          Load data from an Azure Blob Storage external stage into the data warehouse. Configure the stage, file path, and format.
        </p>
      </div>

      <FormField label="Stage Name" required error={errors.stage_name} hint="External stage pointing to Azure Blob">
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

export default AzureSourceConfigForm;
