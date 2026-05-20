'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * DateTransformConfigForm — handles block type(s): `date_transform`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const DateTransformConfigForm: React.FC<{
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
          Perform date/time operations: add intervals, calculate differences, truncate dates, or extract date parts.
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={columnOptions}
          placeholder="Select date column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Operation" required>
        <Select
          value={config.operation || 'DATEADD'}
          onChange={(v) => updateConfig({ operation: v })}
          options={[
            { value: 'DATEADD', label: 'DATEADD (add interval)' },
            { value: 'DATEDIFF', label: 'DATEDIFF (difference)' },
            { value: 'DATE_TRUNC', label: 'DATE_TRUNC (truncate)' },
            { value: 'DATE_PART', label: 'DATE_PART (extract part)' },
            { value: 'LAST_DAY', label: 'LAST_DAY (last day of period)' },
          ]}
        />
      </FormField>

      <FormField label="Date Part" required>
        <Select
          value={config.date_part || 'DAY'}
          onChange={(v) => updateConfig({ date_part: v })}
          options={[
            { value: 'YEAR', label: 'YEAR' },
            { value: 'MONTH', label: 'MONTH' },
            { value: 'DAY', label: 'DAY' },
            { value: 'HOUR', label: 'HOUR' },
            { value: 'MINUTE', label: 'MINUTE' },
            { value: 'SECOND', label: 'SECOND' },
          ]}
        />
      </FormField>

      {(config.operation === 'DATEADD' || config.operation === 'DATEDIFF') && (
        <FormField label="Interval" hint="Number of date parts to add or measure">
          <Input
            type="number"
            value={config.interval ?? ''}
            onChange={(v) => updateConfig({ interval: parseInt(v) || 0 })}
            placeholder="e.g., 7"
          />
        </FormField>
      )}

      {config.operation === 'DATEDIFF' && (
        <FormField label="Second Column" required error={errors.second_column} hint="End date column for DATEDIFF">
          <Select
            value={config.second_column || ''}
            onChange={(v) => updateConfig({ second_column: v })}
            options={columnOptions}
            placeholder="Select end date column..."
            error={!!errors.second_column}
          />
        </FormField>
      )}

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., date_result"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default DateTransformConfigForm;
