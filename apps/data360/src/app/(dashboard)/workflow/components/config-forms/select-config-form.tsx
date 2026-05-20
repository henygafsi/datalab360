'use client';

import React from 'react';
import { FormField, Select, MultiSelect } from './_shared';
import type { SelectConfig } from '@/app/services/etl/types';

/**
 * SelectConfigForm — handles block type(s): `select`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const SelectConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<SelectConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Columns" required error={errors.columns} hint="Select columns to include">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

export default SelectConfigForm;
