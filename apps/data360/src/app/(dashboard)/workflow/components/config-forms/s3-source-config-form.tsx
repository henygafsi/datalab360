'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * S3SourceConfigForm — handles block type(s): `s3_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const S3SourceConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
        <p className="text-xs text-orange-700 dark:text-orange-300">
          Load data from an Amazon S3 external stage into the data warehouse. Configure the stage, file path, and format.
        </p>
      </div>

      <FormField label="Stage Name" required error={errors.stage_name} hint="External stage pointing to S3">
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., @MY_S3_STAGE"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path} hint="Path within the stage (e.g., data/2024/)">
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., data/sales/"
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

export default S3SourceConfigForm;
