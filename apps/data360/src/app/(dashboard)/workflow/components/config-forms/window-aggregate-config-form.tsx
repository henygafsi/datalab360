'use client';

import React from 'react';
import { FormField, Select, MultiSelect, Input } from './_shared';

/**
 * WindowAggregateConfigForm — handles block type(s): `window_aggregate`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const WindowAggregateConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Compute aggregate functions (SUM, AVG, etc.) over a window frame, allowing running totals, moving averages, and similar calculations.
        </p>
      </div>

      <FormField label="Aggregate Function" required>
        <Select
          value={config.agg_function || 'SUM'}
          onChange={(v) => updateConfig({ agg_function: v })}
          options={[
            { value: 'SUM', label: 'SUM' },
            { value: 'AVG', label: 'AVG' },
            { value: 'COUNT', label: 'COUNT' },
            { value: 'MIN', label: 'MIN' },
            { value: 'MAX', label: 'MAX' },
          ]}
        />
      </FormField>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={columnOptions}
          placeholder="Select column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" hint="Columns to order by within each partition">
        <MultiSelect
          values={config.order_by || []}
          onChange={(v) => updateConfig({ order_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Frame Clause" hint="Defines the window frame boundaries">
        <Select
          value={config.frame_clause || 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW'}
          onChange={(v) => updateConfig({ frame_clause: v })}
          options={[
            { value: 'ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW', label: 'Running total (unbounded preceding to current)' },
            { value: 'ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING', label: 'Moving window (1 preceding to 1 following)' },
            { value: 'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING', label: 'Entire partition' },
            { value: 'RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW', label: 'Range: unbounded preceding to current' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., running_total"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default WindowAggregateConfigForm;
