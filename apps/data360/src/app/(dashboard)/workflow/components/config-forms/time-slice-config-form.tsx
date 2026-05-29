'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * TimeSliceConfigForm — handles block type(s): `time_slice`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const TimeSliceConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Groups timestamps into fixed-size time intervals using TIME_SLICE, useful for time-series bucketing and aggregation.
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={columnOptions}
          placeholder="Select timestamp column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Slice Length" required error={errors.slice_length}>
        <Input
          type="number"
          value={config.slice_length ?? 1}
          onChange={(v) => updateConfig({ slice_length: parseInt(v) || 1 })}
          placeholder="1"
          error={!!errors.slice_length}
        />
      </FormField>

      <FormField label="Slice Unit" required>
        <Select
          value={config.slice_unit || 'HOUR'}
          onChange={(v) => updateConfig({ slice_unit: v })}
          options={[
            { value: 'SECOND', label: 'SECOND' },
            { value: 'MINUTE', label: 'MINUTE' },
            { value: 'HOUR', label: 'HOUR' },
            { value: 'DAY', label: 'DAY' },
            { value: 'MONTH', label: 'MONTH' },
            { value: 'YEAR', label: 'YEAR' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., time_bucket"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default TimeSliceConfigForm;
