'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * PivotConfigForm — handles block type(s): `pivot`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const PivotConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
        <p className="text-xs text-teal-700 dark:text-teal-300">
          Rotates rows into columns. Aggregates values from one column and creates new columns based on distinct values in another column.
        </p>
      </div>

      <FormField label="Value Column" required error={errors.value_column} hint="Column containing values to aggregate">
        <Select
          value={config.value_column || ''}
          onChange={(v) => updateConfig({ value_column: v })}
          options={columnOptions}
          placeholder="Select column..."
          error={!!errors.value_column}
        />
      </FormField>

      <FormField label="Pivot Column" required error={errors.pivot_column} hint="Column whose values become new column headers">
        <Select
          value={config.pivot_column || ''}
          onChange={(v) => updateConfig({ pivot_column: v })}
          options={columnOptions}
          placeholder="Select column..."
          error={!!errors.pivot_column}
        />
      </FormField>

      <FormField label="Pivot Values" required error={errors.pivot_values} hint="Comma-separated list of values to pivot on">
        <Input
          value={config.pivot_values || ''}
          onChange={(v) => updateConfig({ pivot_values: v })}
          placeholder="e.g., Q1, Q2, Q3, Q4"
          error={!!errors.pivot_values}
        />
      </FormField>

      <FormField label="Aggregate Function" required>
        <Select
          value={config.agg_function || 'SUM'}
          onChange={(v) => updateConfig({ agg_function: v })}
          options={[
            { value: 'SUM', label: 'SUM' },
            { value: 'COUNT', label: 'COUNT' },
            { value: 'AVG', label: 'AVG' },
            { value: 'MIN', label: 'MIN' },
            { value: 'MAX', label: 'MAX' },
          ]}
        />
      </FormField>
    </div>
  );
};

export default PivotConfigForm;
