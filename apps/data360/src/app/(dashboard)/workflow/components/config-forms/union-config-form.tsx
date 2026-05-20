'use client';

import React from 'react';
import { FormField, Select } from './_shared';
import type { UnionConfig } from '@/app/services/etl/types';

/**
 * UnionConfigForm — handles block type(s): `union`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const UnionConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<UnionConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Union Mode">
        <Select
          value={config.union_all ? 'true' : 'false'}
          onChange={(v) => updateConfig({ union_all: v === 'true' })}
          options={[
            { value: 'false', label: 'UNION (remove duplicates)' },
            { value: 'true', label: 'UNION ALL (keep all rows)' },
          ]}
        />
      </FormField>
    </div>
  );
};

export default UnionConfigForm;
