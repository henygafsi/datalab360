'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * DocumentAIConfigForm — handles block type(s): `document_ai`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const DocumentAIConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">Parse documents (PDF, images) using Snowflake Document AI. Extracts text and structured fields.</p>
      </div>
      <FormField label="Model Name" required error={errors.model}>
        <Input value={config.model || ''} onChange={(v) => updateConfig({ model: v })} placeholder="my_document_model" error={!!errors.model} />
      </FormField>
      <FormField label="Input Column" required error={errors.input_column} hint="Column containing file paths or URLs">
        <Select value={config.input_column || ''} onChange={(v) => updateConfig({ input_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.input_column} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'parsed_content'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default DocumentAIConfigForm;
