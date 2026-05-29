'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * FillNullsConfigForm — handles block type(s): `fill_nulls`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const FillNullsConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Replace NULL values in a column using a chosen strategy: a fixed value, forward/backward fill, or statistical imputation (mean/median).
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={columnOptions}
          placeholder="Select column..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Strategy" required>
        <Select
          value={config.strategy || 'VALUE'}
          onChange={(v) => updateConfig({ strategy: v })}
          options={[
            { value: 'VALUE', label: 'Fixed Value' },
            { value: 'FORWARD_FILL', label: 'Forward Fill (previous row)' },
            { value: 'BACKWARD_FILL', label: 'Backward Fill (next row)' },
            { value: 'MEAN', label: 'Mean (average)' },
            { value: 'MEDIAN', label: 'Median' },
          ]}
        />
      </FormField>

      {config.strategy === 'VALUE' && (
        <FormField label="Fill Value" required error={errors.fill_value}>
          <Input
            value={config.fill_value || ''}
            onChange={(v) => updateConfig({ fill_value: v })}
            placeholder="e.g., 0 or N/A"
            error={!!errors.fill_value}
          />
        </FormField>
      )}

      {(config.strategy === 'FORWARD_FILL' || config.strategy === 'BACKWARD_FILL') && (
        <FormField label="Order Column" required error={errors.order_column} hint="Column that defines row ordering for fill direction">
          <Select
            value={config.order_column || ''}
            onChange={(v) => updateConfig({ order_column: v })}
            options={columnOptions}
            placeholder="Select order column..."
            error={!!errors.order_column}
          />
        </FormField>
      )}
    </div>
  );
};

export default FillNullsConfigForm;
