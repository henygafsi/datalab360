'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * QualifyFilterConfigForm — handles block type(s): `qualify_filter`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const QualifyFilterConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">Use QUALIFY to filter after window functions. Keeps only the top row per partition (dedup by ROW_NUMBER).</p>
      </div>
      <FormField label="Partition Columns" required error={errors.partition_columns} hint="Comma-separated columns">
        <Input value={config.partition_columns || ''} onChange={(v) => updateConfig({ partition_columns: v })} placeholder="e.g. customer_id, region" error={!!errors.partition_columns} />
      </FormField>
      <FormField label="Order Column" required error={errors.order_column}>
        <Select value={config.order_column || ''} onChange={(v) => updateConfig({ order_column: v })} options={columnOptions} placeholder="Select column" error={!!errors.order_column} />
      </FormField>
    </div>
  );
};

export default QualifyFilterConfigForm;
