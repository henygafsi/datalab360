'use client';

import React from 'react';
import { FormField, Select, MultiSelect, Input } from './_shared';

/**
 * JsonConstructConfigForm — handles block type(s): `json_construct`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const JsonConstructConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Constructs a JSON object from selected columns using OBJECT_CONSTRUCT, outputting a single VARIANT column.
        </p>
      </div>

      <FormField label="Columns to Include" required error={errors.columns} hint="Select columns to combine into a JSON object">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || 'json_data'}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="json_data"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

export default JsonConstructConfigForm;
