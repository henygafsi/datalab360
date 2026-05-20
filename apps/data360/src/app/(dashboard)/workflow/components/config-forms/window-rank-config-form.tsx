'use client';

import React from 'react';
import { FormField, Select, MultiSelect, Input } from './_shared';

/**
 * WindowRankConfigForm — handles block type(s): `window_rank`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const WindowRankConfigForm: React.FC<{
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
          Assigns a rank to each row within a partition. RANK leaves gaps after ties, DENSE_RANK does not, ROW_NUMBER assigns unique sequential numbers.
        </p>
      </div>

      <FormField label="Window Function" required>
        <Select
          value={config.window_function || 'RANK'}
          onChange={(v) => updateConfig({ window_function: v })}
          options={[
            { value: 'RANK', label: 'RANK' },
            { value: 'DENSE_RANK', label: 'DENSE_RANK' },
            { value: 'ROW_NUMBER', label: 'ROW_NUMBER' },
          ]}
        />
      </FormField>

      <FormField label="Partition By" hint="Columns to partition the window by">
        <MultiSelect
          values={config.partition_by || []}
          onChange={(v) => updateConfig({ partition_by: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Order By" required error={errors.order_by} hint="Columns to order by within each partition">
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
          value={config.output_column || 'rank_num'}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="rank_num"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default WindowRankConfigForm;
