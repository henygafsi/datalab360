'use client';

import React from 'react';
import { FormField, Select, MultiSelect } from './_shared';
import type { JoinConfig } from '@/app/services/etl/types';

/**
 * JoinConfigForm — handles block type(s): `join`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const JoinConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  leftInputColumns: string[];
  rightInputColumns: string[];
}> = ({ data, onChange, errors, leftInputColumns, rightInputColumns }) => {
  const config = data.config || data;
  const joinTypes = [
    { value: 'INNER', label: 'Inner Join' },
    { value: 'LEFT', label: 'Left Join' },
    { value: 'RIGHT', label: 'Right Join' },
    { value: 'FULL', label: 'Full Outer Join' },
    { value: 'CROSS', label: 'Cross Join' },
  ];

  const updateConfig = (updates: Partial<JoinConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const noColumnsAvailable = leftInputColumns.length === 0 && rightInputColumns.length === 0;

  return (
    <div className="space-y-4">
      {noColumnsAvailable && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>No columns available.</strong> Please configure the Source nodes connected to this Join and select their columns first.
          </p>
        </div>
      )}

      <FormField label="Join Type" required>
        <Select
          value={config.join_type || 'INNER'}
          onChange={(v) => updateConfig({ join_type: v as JoinConfig['join_type'] })}
          options={joinTypes}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Left Key" required error={errors.left_key}>
          <Select
            value={config.left_key || ''}
            onChange={(v) => updateConfig({ left_key: v })}
            options={leftInputColumns.map((c) => ({ value: c, label: c }))}
            placeholder={leftInputColumns.length === 0 ? 'No columns' : 'Select...'}
            error={!!errors.left_key}
            disabled={leftInputColumns.length === 0}
          />
          {leftInputColumns.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Configure left Source first</p>
          )}
        </FormField>

        <FormField label="Right Key" required error={errors.right_key}>
          <Select
            value={config.right_key || ''}
            onChange={(v) => updateConfig({ right_key: v })}
            options={rightInputColumns.map((c) => ({ value: c, label: c }))}
            placeholder={rightInputColumns.length === 0 ? 'No columns' : 'Select...'}
            error={!!errors.right_key}
            disabled={rightInputColumns.length === 0}
          />
          {rightInputColumns.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">Configure right Source first</p>
          )}
        </FormField>
      </div>

      <FormField label="Exclude Right Columns" hint="Columns to exclude from right table (avoid duplicates)">
        <MultiSelect
          values={config.exclude_right_columns || []}
          onChange={(v) => updateConfig({ exclude_right_columns: v })}
          options={rightInputColumns}
          disabled={rightInputColumns.length === 0}
        />
      </FormField>
    </div>
  );
};

export default JoinConfigForm;
