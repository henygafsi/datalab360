'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';
import type { RecommendationConfig } from '@/app/services/etl/types';

/**
 * RecommendationConfigForm — handles block type(s): `recommendation`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const RecommendationConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<RecommendationConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/20 border border-fuchsia-200 dark:border-fuchsia-800">
        <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300">
          Score or rank rows using a Cortex LLM or a custom SQL expression. All upstream columns are preserved.
        </p>
      </div>

      <FormField label="Method">
        <Select
          value={config.model_type || 'cortex'}
          onChange={(v) => updateConfig({ model_type: v as RecommendationConfig['model_type'] })}
          options={[
            { value: 'cortex', label: 'Cortex LLM' },
            { value: 'custom', label: 'Custom SQL Expression' },
          ]}
        />
      </FormField>

      {config.model_type === 'custom' ? (
        <FormField label="Score Expression" required error={errors.score_expression} hint="SQL expression to compute the score">
          <textarea
            value={config.score_expression || ''}
            onChange={(e) => updateConfig({ score_expression: e.target.value })}
            placeholder={"e.g., CASE WHEN TOTAL > 10000 THEN 1.0\n     WHEN TOTAL > 1000 THEN 0.7\n     ELSE 0.3 END"}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </FormField>
      ) : (
        <>
          <FormField label="Model" hint="Cortex LLM model to use">
            <Select
              value={config.cortex_model || 'mistral-large2'}
              onChange={(v) => updateConfig({ cortex_model: v })}
              options={[
                { value: 'mistral-large2', label: 'Mistral Large 2' },
                { value: 'llama3.1-70b', label: 'Llama 3.1 70B' },
                { value: 'llama3.1-8b', label: 'Llama 3.1 8B' },
                { value: 'mistral-7b', label: 'Mistral 7B' },
                { value: 'gemma-7b', label: 'Gemma 7B' },
              ]}
            />
          </FormField>

          <FormField label="Input Column" required error={errors.input_column} hint="Column containing data to score">
            <Select
              value={config.input_column || ''}
              onChange={(v) => updateConfig({ input_column: v })}
              options={columnOptions}
              placeholder="Select column..."
              error={!!errors.input_column}
            />
          </FormField>

          <FormField label="Prompt" required error={errors.prompt} hint="Instruction for the LLM. Use {column} to reference the input.">
            <textarea
              value={config.prompt || ''}
              onChange={(e) => updateConfig({ prompt: e.target.value })}
              placeholder={"e.g., Rate the following product review from 1-10 and respond with only the number: {REVIEW_TEXT}"}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </FormField>
        </>
      )}

      <FormField label="Output Column Name" required error={errors.score_column} hint="Name of the new score column">
        <Input
          value={config.score_column || ''}
          onChange={(v) => updateConfig({ score_column: v })}
          placeholder="e.g., RECOMMENDATION_SCORE"
          error={!!errors.score_column}
        />
      </FormField>
    </div>
  );
};

export default RecommendationConfigForm;
