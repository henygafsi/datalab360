'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * HistogramConfigForm — handles block type(s): `histogram`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const HistogramConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
        <p className="text-xs text-pink-700 dark:text-pink-300">Analyze value distribution using WIDTH_BUCKET. Creates histogram buckets for numeric columns.</p>
      </div>
      <FormField label="Column" required error={errors.column}>
        <Select value={config.column || ''} onChange={(v) => updateConfig({ column: v })} options={columnOptions} placeholder="Select numeric column" error={!!errors.column} />
      </FormField>
      <FormField label="Number of Buckets" error={errors.num_buckets} hint="Default: 10">
        <Input value={config.num_buckets || 10} onChange={(v) => updateConfig({ num_buckets: parseInt(v) || 10 })} type="number" />
      </FormField>
    </div>
  );
};

export default HistogramConfigForm;
