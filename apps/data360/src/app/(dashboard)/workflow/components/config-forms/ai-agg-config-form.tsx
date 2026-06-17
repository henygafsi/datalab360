'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * AIAggConfigForm — handles block type(s): `ai_agg`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AIAggConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Aggregate text data semantically with AI. Summarize grouped text using AI.</p>
      </div>
      <FormField label="Group Column" required error={errors.group_column}>
        <Select value={config.group_column || ''} onChange={(v) => updateConfig({ group_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.group_column} />
      </FormField>
      <FormField label="Text Column" error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={columnOptions} placeholder="Select text column" />
      </FormField>
      <FormField label="Aggregation Prompt" required error={errors.aggregation_prompt} hint="How to summarize the text">
        <Input value={config.aggregation_prompt || ''} onChange={(v) => updateConfig({ aggregation_prompt: v })} placeholder="e.g. summarize the key themes" error={!!errors.aggregation_prompt} />
      </FormField>
    </div>
  );
};

export default AIAggConfigForm;
