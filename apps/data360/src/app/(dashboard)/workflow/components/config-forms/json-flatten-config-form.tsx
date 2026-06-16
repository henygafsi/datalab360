'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * JsonFlattenConfigForm — handles block type(s): `json_flatten`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const JsonFlattenConfigForm: React.FC<{
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
          Flattens a VARIANT, OBJECT, or ARRAY column into separate rows using FLATTEN. Useful for expanding nested JSON data.
        </p>
      </div>

      <FormField label="Input Column" required error={errors.input_column}>
        <Select
          value={config.input_column || ''}
          onChange={(v) => updateConfig({ input_column: v })}
          options={columnOptions}
          placeholder="Select VARIANT column..."
          error={!!errors.input_column}
        />
      </FormField>

      <FormField label="JSON Path" hint="Optional path within the JSON (e.g., 'data.items')">
        <Input
          value={config.json_path || ''}
          onChange={(v) => updateConfig({ json_path: v })}
          placeholder="e.g., data.items"
        />
      </FormField>

      <FormField label="Recursive" hint="Recursively flatten nested structures">
        <Select
          value={config.recursive ? 'true' : 'false'}
          onChange={(v) => updateConfig({ recursive: v === 'true' })}
          options={[
            { value: 'false', label: 'No' },
            { value: 'true', label: 'Yes' },
          ]}
        />
      </FormField>

      <FormField label="Flatten Mode" hint="Type of elements to flatten">
        <Select
          value={config.flatten_mode || 'BOTH'}
          onChange={(v) => updateConfig({ flatten_mode: v })}
          options={[
            { value: 'BOTH', label: 'BOTH (objects and arrays)' },
            { value: 'OBJECT', label: 'OBJECT only' },
            { value: 'ARRAY', label: 'ARRAY only' },
          ]}
        />
      </FormField>
    </div>
  );
};

export default JsonFlattenConfigForm;
