'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * ClassificationTrainConfigForm — handles block type(s): `classification_train`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ClassificationTrainConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Train a classification model using Snowflake ML. Predicts categorical labels from features.</p>
      </div>
      <FormField label="Target Column" required error={errors.target_column} hint="Column to predict">
        <Select value={config.target_column || ''} onChange={(v) => updateConfig({ target_column: v })} options={columnOptions} placeholder="Select target" error={!!errors.target_column} />
      </FormField>
      <FormField label="Feature Columns" error={errors.feature_columns} hint="Leave empty to use all columns except target">
        <div className="text-xs text-slate-500 dark:text-slate-400">{(config.feature_columns || []).length || 'All'} columns selected</div>
      </FormField>
      <FormField label="Model Name" required error={errors.model_name}>
        <Input value={config.model_name || ''} onChange={(v) => updateConfig({ model_name: v })} placeholder="my_classifier" error={!!errors.model_name} />
      </FormField>
    </div>
  );
};

export default ClassificationTrainConfigForm;
