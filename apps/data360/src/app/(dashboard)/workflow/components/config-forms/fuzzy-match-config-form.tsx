'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * FuzzyMatchConfigForm — handles block type(s): `fuzzy_match`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const FuzzyMatchConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">Find similar strings using EDITDISTANCE. Great for deduplication, record linking, and fuzzy lookups.</p>
      </div>
      <FormField label="Source Column" required error={errors.source_column}>
        <Select value={config.source_column || ''} onChange={(v) => updateConfig({ source_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.source_column} />
      </FormField>
      <FormField label="Target Column" required error={errors.target_column}>
        <Select value={config.target_column || ''} onChange={(v) => updateConfig({ target_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.target_column} />
      </FormField>
      <FormField label="Distance Threshold" error={errors.threshold} hint="Max edit distance (default: 3)">
        <Input value={config.threshold || 3} onChange={(v) => updateConfig({ threshold: parseInt(v) || 3 })} type="number" />
      </FormField>
    </div>
  );
};

export default FuzzyMatchConfigForm;
