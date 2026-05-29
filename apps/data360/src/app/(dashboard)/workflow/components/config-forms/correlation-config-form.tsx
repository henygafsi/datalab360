'use client';

import React from 'react';
import { FormField, Select } from './_shared';

/**
 * CorrelationConfigForm — handles block type(s): `correlation`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const CorrelationConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Calculate Pearson correlation and covariance between two numeric columns using CORR / COVAR_SAMP.</p>
      </div>
      <FormField label="Column A" required error={errors.column_a}>
        <Select value={config.column_a || ''} onChange={(v) => updateConfig({ column_a: v })} options={columnOptions} placeholder="Select numeric column" error={!!errors.column_a} />
      </FormField>
      <FormField label="Column B" required error={errors.column_b}>
        <Select value={config.column_b || ''} onChange={(v) => updateConfig({ column_b: v })} options={columnOptions} placeholder="Select numeric column" error={!!errors.column_b} />
      </FormField>
    </div>
  );
};

export default CorrelationConfigForm;
