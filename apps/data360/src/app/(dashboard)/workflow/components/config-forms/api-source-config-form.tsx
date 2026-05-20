'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * ApiSourceConfigForm — handles block type(s): `api_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ApiSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Schema Name" required error={errors.schema_name}>
        <Input value={config.schema_name || ''} onChange={(v) => updateConfig({ schema_name: v })} placeholder="CUSTOM_API" error={!!errors.schema_name} />
      </FormField>
      <FormField label="Table Name" required error={errors.table_name}>
        <Input value={config.table_name || ''} onChange={(v) => updateConfig({ table_name: v })} placeholder="API_DATA" error={!!errors.table_name} />
      </FormField>
    </div>
  );
};

export default ApiSourceConfigForm;
