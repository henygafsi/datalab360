'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * AIFilterConfigForm — handles block type(s): `ai_filter`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AIFilterConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Filter rows using natural language with Cortex AI_FILTER. Describe what rows to keep in plain English.</p>
      </div>
      <FormField label="Filter Prompt" required error={errors.filter_prompt} hint="Describe which rows to keep">
        <Input value={config.filter_prompt || ''} onChange={(v) => updateConfig({ filter_prompt: v })} placeholder="e.g. rows about customer complaints" error={!!errors.filter_prompt} />
      </FormField>
      <FormField label="Text Column" error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={columnOptions} placeholder="Select column" />
      </FormField>
    </div>
  );
};

export default AIFilterConfigForm;
