'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * FinetuneConfigForm — handles block type(s): `finetune`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const FinetuneConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
        <p className="text-xs text-purple-700 dark:text-purple-300">Fine-tune a Cortex LLM on your data. Creates a custom model for your specific use case.</p>
      </div>
      <FormField label="Base Model" required error={errors.base_model}>
        <Select value={config.base_model || 'llama3.1-8b'} onChange={(v) => updateConfig({ base_model: v })} options={[
          { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
          { value: 'mistral-7b', label: 'Mistral 7B' },
        ]} error={!!errors.base_model} />
      </FormField>
      <FormField label="Training Table" required error={errors.training_table} hint="Table with prompt/completion columns">
        <Input value={config.training_table || ''} onChange={(v) => updateConfig({ training_table: v })} placeholder="DB.SCHEMA.TRAINING_DATA" error={!!errors.training_table} />
      </FormField>
      <FormField label="Output Model Name" required error={errors.model_name}>
        <Input value={config.model_name || ''} onChange={(v) => updateConfig({ model_name: v })} placeholder="my_finetuned_model" error={!!errors.model_name} />
      </FormField>
    </div>
  );
};

export default FinetuneConfigForm;
