'use client';

import React from 'react';
import { FormField, Select } from './_shared';

/**
 * RecursiveCTEConfigForm — handles block type(s): `recursive_cte`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const RecursiveCTEConfigForm: React.FC<{
  data: any; onChange: (data: any) => void; errors: Record<string, string>; availableColumns: string[]; columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => onChange({ ...data, config: { ...config, ...updates } });
  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">Build recursive CTE for hierarchical data: org charts, bill of materials, category trees. Traverses parent-child relationships.</p>
      </div>
      <FormField label="ID Column" required error={errors.id_column}>
        <Select value={config.id_column || ''} onChange={(v) => updateConfig({ id_column: v })} options={columnOptions} placeholder="Select ID column" error={!!errors.id_column} />
      </FormField>
      <FormField label="Parent Column" required error={errors.parent_column}>
        <Select value={config.parent_column || ''} onChange={(v) => updateConfig({ parent_column: v })} options={columnOptions} placeholder="Select parent ID column" error={!!errors.parent_column} />
      </FormField>
      <FormField label="Name Column" required error={errors.name_column}>
        <Select value={config.name_column || ''} onChange={(v) => updateConfig({ name_column: v })} options={columnOptions} placeholder="Select display name column" error={!!errors.name_column} />
      </FormField>
    </div>
  );
};

export default RecursiveCTEConfigForm;
