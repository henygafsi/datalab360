'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * AIExtractConfigForm — handles block type(s): `ai_extract`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AIExtractConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">Extract structured data from text using Cortex AI. Returns JSON with specified keys.</p>
      </div>
      <FormField label="Input Column" required error={errors.input_column}>
        <Select value={config.input_column || ''} onChange={(v) => updateConfig({ input_column: v })} options={columnOptions} placeholder="Select text column" error={!!errors.input_column} />
      </FormField>
      <FormField label="Extract Keys" required error={errors.extract_keys} hint="Comma-separated keys to extract (e.g. name, email, phone)">
        <Input value={(config.extract_keys || []).join(', ')} onChange={(v) => updateConfig({ extract_keys: v.split(',').map((s: string) => s.trim()).filter(Boolean) })} placeholder="name, email, phone" error={!!errors.extract_keys} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'llama3.1-70b'} onChange={(v) => updateConfig({ model: v })} options={[
          { value: 'llama3.1-70b', label: 'Llama 3.1 70B' },
          { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
          { value: 'mistral-large2', label: 'Mistral Large 2' },
        ]} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'extracted_data'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default AIExtractConfigForm;
