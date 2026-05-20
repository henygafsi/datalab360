'use client';

import React from 'react';
import { FormField, Select, Input, Textarea } from './_shared';

/**
 * AIClassifyConfigForm — handles block type(s): `ai_classify`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AIClassifyConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Classify text into categories using Cortex AI_CLASSIFY.</p>
      </div>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Input Column" required error={errors.input_column}>
        <Select value={config.input_column || ''} onChange={(v) => updateConfig({ input_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.input_column} />
      </FormField>
      <FormField label="Categories" required error={errors.categories} hint="One category per line">
        <Textarea value={config.categories || ''} onChange={(v) => updateConfig({ categories: v })} placeholder="positive\nnegative\nneutral" rows={4} error={!!errors.categories} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'classified_label'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default AIClassifyConfigForm;
