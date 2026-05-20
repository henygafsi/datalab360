'use client';

import React from 'react';
import { FormField, Select, Input } from './_shared';

/**
 * ComputePoolConfigForm — handles block type(s): `compute_pool`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ComputePoolConfigForm: React.FC<{
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
      <FormField label="Pool Name" required error={errors.pool_name}>
        <Input
          value={config.pool_name || ''}
          onChange={(v) => updateConfig({ pool_name: v })}
          placeholder="e.g., MY_COMPUTE_POOL"
          error={!!errors.pool_name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Min Nodes" required error={errors.min_nodes}>
          <Input
            type="number"
            value={config.min_nodes || ''}
            onChange={(v) => updateConfig({ min_nodes: parseInt(v) || 0 })}
            placeholder="1"
            error={!!errors.min_nodes}
          />
        </FormField>

        <FormField label="Max Nodes" required error={errors.max_nodes}>
          <Input
            type="number"
            value={config.max_nodes || ''}
            onChange={(v) => updateConfig({ max_nodes: parseInt(v) || 0 })}
            placeholder="3"
            error={!!errors.max_nodes}
          />
        </FormField>
      </div>

      <FormField label="Instance Family" required>
        <Select
          value={config.instance_family || 'CPU_X64_XS'}
          onChange={(v) => updateConfig({ instance_family: v })}
          options={[
            { value: 'CPU_X64_XS', label: 'CPU_X64_XS' },
            { value: 'CPU_X64_S', label: 'CPU_X64_S' },
            { value: 'CPU_X64_M', label: 'CPU_X64_M' },
            { value: 'GPU_NV_S', label: 'GPU_NV_S' },
          ]}
        />
      </FormField>
    </div>
  );
};

export default ComputePoolConfigForm;
