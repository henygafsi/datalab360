'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * SalesforceSourceConfigForm — handles block type(s): `salesforce_source`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const SalesforceSourceConfigForm: React.FC<{ data: any; onChange: (data: any) => void; errors: Record<string, string> }> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };
  return (
    <div className="space-y-4">
      <FormField label="Target Database" required error={errors.target_database}>
        <Input value={config.target_database || ''} onChange={(v) => updateConfig({ target_database: v })} placeholder="CP_DATA360" error={!!errors.target_database} />
      </FormField>
      <FormField label="Object Name" required error={errors.object_name}>
        <Input value={config.object_name || ''} onChange={(v) => updateConfig({ object_name: v })} placeholder="Account, Contact, Opportunity..." error={!!errors.object_name} />
      </FormField>
    </div>
  );
};

export default SalesforceSourceConfigForm;
