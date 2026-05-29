'use client';

import React from 'react';
import { FormField, Select, Input, AI_MODEL_OPTIONS } from './_shared';

/**
 * AISentimentConfigForm — handles block type(s): `ai_sentiment`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AISentimentConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <p className="text-xs text-green-700 dark:text-green-300">Analyze sentiment of text using Cortex AI_SENTIMENT. Returns a score from -1 (negative) to 1 (positive).</p>
      </div>
      <FormField label="Text Column" required error={errors.text_column}>
        <Select value={config.text_column || ''} onChange={(v) => updateConfig({ text_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.text_column} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'sentiment_score'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default AISentimentConfigForm;
