'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';
import type { ExportFileConfig } from '@/app/services/etl/types';

/**
 * ExportFileConfigForm — handles block type(s): `export_file`, `export_excel`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ExportFileConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<ExportFileConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Format" required>
        <Select
          value={config.format || 'csv'}
          onChange={(v) => updateConfig({ format: v as ExportFileConfig['format'] })}
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'parquet', label: 'Parquet' },
            { value: 'json', label: 'JSON' },
          ]}
        />
      </FormField>

      <FormField label="Stage Name" required error={errors.stage_name}>
        <Input
          value={config.stage_name || ''}
          onChange={(v) => updateConfig({ stage_name: v })}
          placeholder="e.g., CP_DATA360.STAGING.ETL_EXPORT"
          error={!!errors.stage_name}
        />
      </FormField>

      <FormField label="File Name" hint="Optional, auto-generated if empty">
        <Input
          value={config.file_name || ''}
          onChange={(v) => updateConfig({ file_name: v })}
          placeholder="export.csv"
        />
      </FormField>

      <FormField label="Compression">
        <Select
          value={config.compression || 'NONE'}
          onChange={(v) => updateConfig({ compression: v as ExportFileConfig['compression'] })}
          options={[
            { value: 'NONE', label: 'None' },
            { value: 'GZIP', label: 'GZIP' },
          ]}
        />
      </FormField>
    </div>
  );
};

export default ExportFileConfigForm;
