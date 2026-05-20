'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * AITranslateConfigForm — handles block type(s): `ai_translate`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AITranslateConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  const langOptions = [
    { value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' },
    { value: 'de', label: 'German' }, { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' },
    { value: 'ja', label: 'Japanese' }, { value: 'zh', label: 'Chinese' }, { value: 'ko', label: 'Korean' },
    { value: 'ar', label: 'Arabic' },
  ];
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">Translate text between languages using Cortex AI_TRANSLATE.</p>
      </div>
      <FormField label="Text Column" required error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.text_column} />
      </FormField>
      <FormField label="Source Language" error={errors.source_lang} hint="Leave empty for auto-detect">
        <Select value={config.source_lang || ''} onChange={(v) => updateConfig({ source_lang: v })} options={langOptions} placeholder="Auto-detect" />
      </FormField>
      <FormField label="Target Language" required error={errors.target_lang}>
        <Select value={config.target_lang || ''} onChange={(v) => updateConfig({ target_lang: v })} options={langOptions} placeholder="Select language" error={!!errors.target_lang} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'translated_text'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default AITranslateConfigForm;
