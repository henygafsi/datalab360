'use client';

import React from 'react';
import { FormField, MultiSelect, Input } from './_shared';

/**
 * WindowNtileConfigForm — handles block type(s): `window_ntile`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const WindowNtileConfigForm: React.FC<{
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
          Divides an ordered partition into a specified number of roughly equal buckets (quantiles), assigning a bucket number to each row.
        </p>
      </div>

      <FormField label="Number of Buckets" required error={errors.buckets}>
        <Input
          type="number"
          value={config.buckets ?? 4}
          onChange={(v) => updateConfig({ buckets: parseInt(v) || 4 })}
          placeholder="4"
          error={!!errors.buckets}
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

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || 'ntile_bucket'}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="ntile_bucket"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default WindowNtileConfigForm;
