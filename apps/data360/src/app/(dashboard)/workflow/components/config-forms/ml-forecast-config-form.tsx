'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * MLForecastConfigForm — handles block type(s): `forecast`, `ml_forecast`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const MLForecastConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <p className="text-xs text-indigo-700 dark:text-indigo-300">Time-series forecasting using Snowflake ML. Predicts future values based on historical data.</p>
      </div>
      <FormField label="Timestamp Column" required error={errors.timestamp_column}>
        <Select value={config.timestamp_column || ''} onChange={(v) => updateConfig({ timestamp_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.timestamp_column} />
      </FormField>
      <FormField label="Value Column" required error={errors.value_column}>
        <Select value={config.value_column || ''} onChange={(v) => updateConfig({ value_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.value_column} />
      </FormField>
      <FormField label="Forecast Periods" required error={errors.forecast_periods} hint="Number of future periods to predict">
        <Input value={config.forecast_periods || 30} onChange={(v) => updateConfig({ forecast_periods: parseInt(v) || 30 })} type="number" error={!!errors.forecast_periods} />
      </FormField>
      <FormField label="Model Name" error={errors.model_name} hint="Auto-generated if empty">
        <Input value={config.model_name || ''} onChange={(v) => updateConfig({ model_name: v })} placeholder="forecast_model_1" />
      </FormField>
    </div>
  );
};

export default MLForecastConfigForm;
