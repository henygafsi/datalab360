'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * MLAnomalyConfigForm — handles block type(s): `anomaly_detect`, `ml_anomaly`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const MLAnomalyConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-xs text-red-700 dark:text-red-300">Detect anomalies in time-series data using Snowflake ML. Flags outlier data points.</p>
      </div>
      <FormField label="Timestamp Column" required error={errors.timestamp_column}>
        <Select value={config.timestamp_column || ''} onChange={(v) => updateConfig({ timestamp_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.timestamp_column} />
      </FormField>
      <FormField label="Value Column" required error={errors.value_column}>
        <Select value={config.value_column || ''} onChange={(v) => updateConfig({ value_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.value_column} />
      </FormField>
      <FormField label="Contamination" error={errors.contamination} hint="Expected proportion of anomalies (0.01 = 1%, 0.1 = 10%)">
        <Input value={config.contamination || 0.05} onChange={(v) => updateConfig({ contamination: parseFloat(v) || 0.05 })} type="number" />
      </FormField>
      <FormField label="Output Column" error={errors.output_column}>
        <Input value={config.output_column || 'is_anomaly'} onChange={(v) => updateConfig({ output_column: v })} />
      </FormField>
    </div>
  );
};

export default MLAnomalyConfigForm;
