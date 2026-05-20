'use client';

import React from 'react';
import { FormField, Select, Input, Textarea } from './_shared';

/**
 * AICompleteConfigForm — handles block type(s): `ai_complete`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AICompleteConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">Generate text completions using Cortex AI_COMPLETE. Use {'{{column_name}}'} placeholders in your prompt template.</p>
      </div>
      <FormField label="Prompt Template" required error={errors.prompt_template} hint="Use {{column}} to reference row values">
        <Textarea value={config.prompt_template || ''} onChange={(v) => updateConfig({ prompt_template: v })} placeholder="Summarize the following text: {{description}}" rows={4} error={!!errors.prompt_template} />
      </FormField>
      <FormField label="Model" error={errors.model}>
        <Select value={config.model || 'mistral-large2'} onChange={(v) => updateConfig({ model: v })} options={AI_MODEL_OPTIONS} />
      </FormField>
      <FormField label="Max Tokens" error={errors.max_tokens} hint="Maximum tokens in the response">
        <Input value={config.max_tokens || 256} onChange={(v) => updateConfig({ max_tokens: parseInt(v) || 256 })} type="number" />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'ai_response'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default AICompleteConfigForm;
