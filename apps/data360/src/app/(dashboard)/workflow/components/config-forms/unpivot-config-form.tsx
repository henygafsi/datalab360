'use client';

import React from 'react';
import { FormField, Select, MultiSelect, Input } from './_shared';

/**
 * UnpivotConfigForm — handles block type(s): `unpivot`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const UnpivotConfigForm: React.FC<{
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
          Rotates columns into rows. Transforms multiple columns into name-value pairs, normalizing wide tables into tall format.
        </p>
      </div>

      <FormField label="Value Column Name" hint="Name for the column holding values">
        <Input
          value={config.value_column_name || 'VALUE'}
          onChange={(v) => updateConfig({ value_column_name: v })}
          placeholder="VALUE"
        />
      </FormField>

      <FormField label="Name Column Name" hint="Name for the column holding attribute names">
        <Input
          value={config.name_column_name || 'ATTRIBUTE'}
          onChange={(v) => updateConfig({ name_column_name: v })}
          placeholder="ATTRIBUTE"
        />
      </FormField>

      <FormField label="Columns to Unpivot" required error={errors.unpivot_columns} hint="Select columns to rotate into rows">
        <MultiSelect
          values={config.unpivot_columns || []}
          onChange={(v) => updateConfig({ unpivot_columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

export default UnpivotConfigForm;
