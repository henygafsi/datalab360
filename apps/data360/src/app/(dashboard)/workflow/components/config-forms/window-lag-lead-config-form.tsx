'use client';

import React from 'react';
import { FormField, Select, MultiSelect, Input } from './_shared';

/**
 * WindowLagLeadConfigForm — handles block type(s): `window_lag_lead`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const WindowLagLeadConfigForm: React.FC<{
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
          Access a value from a previous row (LAG) or a subsequent row (LEAD) within a partition, useful for calculating differences between rows.
        </p>
      </div>

      <FormField label="Function" required>
        <Select
          value={config.window_function || 'LAG'}
          onChange={(v) => updateConfig({ window_function: v })}
          options={[
            { value: 'LAG', label: 'LAG (previous row)' },
            { value: 'LEAD', label: 'LEAD (next row)' },
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

      <FormField label="Offset" hint="Number of rows to look back/ahead">
        <Input
          type="number"
          value={config.offset ?? 1}
          onChange={(v) => updateConfig({ offset: parseInt(v) || 1 })}
          placeholder="1"
        />
      </FormField>

      <FormField label="Default Value" hint="Value when no row exists at the offset (optional)">
        <Input
          value={config.default_value || ''}
          onChange={(v) => updateConfig({ default_value: v })}
          placeholder="NULL"
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" required error={errors.order_by}>
        <MultiSelect
          values={config.order_by || []}
          onChange={(v) => updateConfig({ order_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order Direction">
        <Select
          value={config.order_direction || 'ASC'}
          onChange={(v) => updateConfig({ order_direction: v })}
          options={[
            { value: 'ASC', label: 'Ascending' },
            { value: 'DESC', label: 'Descending' },
          ]}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., prev_value"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default WindowLagLeadConfigForm;
