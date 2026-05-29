'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * ContainerServiceConfigForm — handles block type(s): `container_service`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ContainerServiceConfigForm: React.FC<{
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
      <FormField label="Service Name" required error={errors.service_name}>
        <Input
          value={config.service_name || ''}
          onChange={(v) => updateConfig({ service_name: v })}
          placeholder="e.g., MY_SERVICE"
          error={!!errors.service_name}
        />
      </FormField>

      <FormField label="Compute Pool" required error={errors.compute_pool}>
        <Input
          value={config.compute_pool || ''}
          onChange={(v) => updateConfig({ compute_pool: v })}
          placeholder="e.g., MY_COMPUTE_POOL"
          error={!!errors.compute_pool}
        />
      </FormField>

      <FormField label="Stage" required error={errors.stage}>
        <Input
          value={config.stage || ''}
          onChange={(v) => updateConfig({ stage: v })}
          placeholder="e.g., @MY_STAGE"
          error={!!errors.stage}
        />
      </FormField>

      <FormField label="Spec File" required error={errors.spec_file}>
        <Input
          value={config.spec_file || ''}
          onChange={(v) => updateConfig({ spec_file: v })}
          placeholder="e.g., service_spec.yaml"
          error={!!errors.spec_file}
        />
      </FormField>
    </div>
  );
};

export default ContainerServiceConfigForm;
