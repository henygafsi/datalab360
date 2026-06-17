'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * GCSSourceConfigForm — handles block type(s): `gcs_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const GCSSourceConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <p className="text-xs text-green-700 dark:text-green-300">
          Load data from a Google Cloud Storage external stage into the data warehouse. Configure the stage, file path, and format.
        </p>
      </div>

      <FormField label="Stage Name" required error={errors.stage_name} hint="External stage pointing to GCS">
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., @MY_GCS_STAGE"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path}>
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., bucket/data/"
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

export default GCSSourceConfigForm;
