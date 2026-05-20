'use client';

import React from 'react';
import { FormField, Input } from './_shared';
import type { LimitConfig } from '@/app/services/etl/types';

/**
 * LimitConfigForm — handles block type(s): `limit`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const LimitConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<LimitConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Limit" required error={errors.limit}>
        <Input
          type="number"
          value={config.limit || ''}
          onChange={(v) => updateConfig({ limit: parseInt(v) || 0 })}
          placeholder="Number of rows"
          error={!!errors.limit}
        />
      </FormField>

      <FormField label="Offset" hint="Number of rows to skip">
        <Input
          type="number"
          value={config.offset || ''}
          onChange={(v) => updateConfig({ offset: parseInt(v) || 0 })}
          placeholder="0"
        />
      </FormField>
    </div>
  );
};

export default LimitConfigForm;
