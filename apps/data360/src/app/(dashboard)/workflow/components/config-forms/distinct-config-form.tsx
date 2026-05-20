'use client';

import React from 'react';
import { FormField, MultiSelect } from './_shared';
import type { DistinctConfig } from '@/app/services/etl/types';

/**
 * DistinctConfigForm — handles block type(s): `distinct`, `drop_duplicates`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const DistinctConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<DistinctConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Columns" hint="Leave empty for all columns">
        <MultiSelect
          values={config.columns || []}
          onChange={(v) => updateConfig({ columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

export default DistinctConfigForm;
