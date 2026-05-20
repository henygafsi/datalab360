'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * JSONPathExtractConfigForm — handles block type(s): `json_path_extract`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const JSONPathExtractConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">Extract nested values from VARIANT/JSON columns using JSON_EXTRACT_PATH_TEXT.</p>
      </div>
      <FormField label="JSON Column" required error={errors.json_column}>
        <Select value={config.json_column || ''} onChange={(v) => updateConfig({ json_column: v })} options={columnOptions} placeholder="Select VARIANT column" error={!!errors.json_column} />
      </FormField>
      <FormField label="JSON Path" required error={errors.json_path} hint="e.g. 'address', 'name'">
        <Input value={config.json_path || ''} onChange={(v) => updateConfig({ json_path: v })} placeholder="key.nested_key" error={!!errors.json_path} />
      </FormField>
    </div>
  );
};

export default JSONPathExtractConfigForm;
