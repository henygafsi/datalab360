'use client';

import React from 'react';
import { FormField, Input, Textarea } from './_shared';

/**
 * DynamicTableConfigForm — handles block type(s): `dynamic_table`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const DynamicTableConfigForm: React.FC<{
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
      <FormField label="Table Name" required error={errors.table_name}>
        <Input
          value={config.table_name || ''}
          onChange={(v) => updateConfig({ table_name: v })}
          placeholder="e.g., DYN_SALES_SUMMARY"
          error={!!errors.table_name}
        />
      </FormField>

      <FormField label="Target Lag" required error={errors.target_lag} hint="Refresh lag interval (e.g., 1 hour, 30 minutes)">
        <Input
          value={config.target_lag || ''}
          onChange={(v) => updateConfig({ target_lag: v })}
          placeholder="e.g., 1 hour"
          error={!!errors.target_lag}
        />
      </FormField>

      <FormField label="Warehouse" required error={errors.warehouse}>
        <Input
          value={config.warehouse || ''}
          onChange={(v) => updateConfig({ warehouse: v })}
          placeholder="e.g., COMPUTE_WH"
          error={!!errors.warehouse}
        />
      </FormField>

      <FormField label="Query" required error={errors.query} hint="SQL query defining the dynamic table content">
        <Textarea
          value={config.query || ''}
          onChange={(v) => updateConfig({ query: v })}
          placeholder="SELECT * FROM source_table WHERE ..."
          rows={6}
          className="font-mono text-sm"
          error={!!errors.query}
        />
      </FormField>
    </div>
  );
};

export default DynamicTableConfigForm;
