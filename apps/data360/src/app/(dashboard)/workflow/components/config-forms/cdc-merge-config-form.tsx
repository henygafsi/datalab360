'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * CdcMergeConfigForm — handles block type(s): `cdc_merge`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const CdcMergeConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Reads CDC rows from a change stream and applies a MERGE INTO on the target table. Use after a stream_consume block.
        </p>
      </div>

      <FormField label="Stream Name" required error={errors.stream_name}
        hint="Fully-qualified stream name (e.g., DB.SCHEMA.MY_STREAM)">
        <Input
          value={config.stream_name || ''}
          onChange={(v) => updateConfig({ stream_name: v })}
          placeholder="e.g., MY_DB.MY_SCHEMA.MY_STREAM"
          error={!!errors.stream_name}
        />
      </FormField>

      <FormField label="Target Table" required error={errors.target_table}
        hint="Fully-qualified target table (e.g., DB.SCHEMA.TABLE)">
        <Input
          value={config.target_table || ''}
          onChange={(v) => updateConfig({ target_table: v })}
          placeholder="e.g., MY_DB.MY_SCHEMA.MY_TABLE"
          error={!!errors.target_table}
        />
      </FormField>

      <FormField label="Merge Keys" required error={errors.merge_keys}
        hint="Comma-separated column names used to match rows (e.g., ID, ORDER_DATE)">
        <Input
          value={config.merge_keys || ''}
          onChange={(v) => updateConfig({ merge_keys: v })}
          placeholder="e.g., ID"
          error={!!errors.merge_keys}
        />
      </FormField>

      <FormField label="Update Columns" error={errors.update_columns}
        hint='Comma-separated columns to update on match, or "all" to update every column'>
        <Input
          value={config.update_columns || 'all'}
          onChange={(v) => updateConfig({ update_columns: v })}
          placeholder='e.g., NAME, STATUS or "all"'
        />
      </FormField>
    </div>
  );
};

export default CdcMergeConfigForm;
