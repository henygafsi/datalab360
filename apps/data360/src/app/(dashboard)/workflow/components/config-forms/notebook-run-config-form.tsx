'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * NotebookRunConfigForm — handles block type(s): `notebook_run`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const NotebookRunConfigForm: React.FC<{
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
      <FormField label="Database" required error={errors.database}>
        <Input
          value={config.database || ''}
          onChange={(v) => updateConfig({ database: v })}
          placeholder="e.g., MY_DATABASE"
          error={!!errors.database}
        />
      </FormField>

      <FormField label="Schema" required error={errors.schema}>
        <Input
          value={config.schema || ''}
          onChange={(v) => updateConfig({ schema: v })}
          placeholder="e.g., PUBLIC"
          error={!!errors.schema}
        />
      </FormField>

      <FormField label="Notebook Name" required error={errors.notebook_name}>
        <Input
          value={config.notebook_name || ''}
          onChange={(v) => updateConfig({ notebook_name: v })}
          placeholder="e.g., MY_NOTEBOOK"
          error={!!errors.notebook_name}
        />
      </FormField>
    </div>
  );
};

export default NotebookRunConfigForm;
