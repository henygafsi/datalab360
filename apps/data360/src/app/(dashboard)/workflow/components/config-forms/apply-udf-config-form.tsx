'use client';

import React from 'react';
import { FormField, MultiSelect, Input } from './_shared';

/**
 * ApplyUDFConfigForm — handles block type(s): `apply_udf`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ApplyUDFConfigForm: React.FC<{
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
      <div className="p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          Apply an existing User-Defined Function (UDF) to columns in the current dataset. The function is called for each row.
        </p>
      </div>

      <FormField label="Function Name" required error={errors.function_name} hint="Fully qualified name (e.g., DB.SCHEMA.MY_UDF)">
        <Input
          value={config.function_name || ''}
          onChange={(v) => updateConfig({ function_name: v })}
          placeholder="e.g., MY_DB.PUBLIC.CALCULATE_SCORE"
          error={!!errors.function_name}
        />
      </FormField>

      <FormField label="Input Columns" required error={errors.input_columns} hint="Columns to pass as arguments to the function">
        <MultiSelect
          values={config.input_columns || []}
          onChange={(v) => updateConfig({ input_columns: v })}
          options={availableColumns}
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., score_result"
          error={!!errors.output_column}
        />
      </FormField>
    </div>
  );
};

// ============================================
// AI BLOCK CONFIG FORMS
// ============================================

const AI_MODEL_OPTIONS = [
  { value: 'mistral-large2', label: 'Mistral Large 2' },
  { value: 'llama3.1-70b', label: 'Llama 3.1 70B' },
  { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
  { value: 'snowflake-arctic', label: 'Snowflake Arctic' },
];

export default ApplyUDFConfigForm;
