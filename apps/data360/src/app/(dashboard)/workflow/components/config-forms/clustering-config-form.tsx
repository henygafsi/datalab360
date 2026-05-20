'use client';

import React from 'react';
import { FormField, Select, MultiSelect, Input } from './_shared';
import type { ClusteringConfig } from '@/app/services/etl/types';

/**
 * ClusteringConfigForm — handles block type(s): `clustering`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const ClusteringConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;

  const updateConfig = (updates: Partial<ClusteringConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <FormField label="Cluster Column" required error={errors.cluster_column} hint="Name of the output cluster column">
        <Input
          value={config.cluster_column || ''}
          onChange={(v) => updateConfig({ cluster_column: v })}
          placeholder="e.g., cluster_id"
          error={!!errors.cluster_column}
        />
      </FormField>

      <FormField label="Method" required>
        <Select
          value={config.method || 'kmeans_sql'}
          onChange={(v) => updateConfig({ method: v as ClusteringConfig['method'] })}
          options={[
            { value: 'kmeans_sql', label: 'K-Means (SQL)' },
            { value: 'cortex_ml', label: 'Cortex ML' },
          ]}
        />
      </FormField>

      <FormField label="Number of Clusters" error={errors.n_clusters}>
        <Input
          type="number"
          value={config.n_clusters || ''}
          onChange={(v) => updateConfig({ n_clusters: parseInt(v) || undefined })}
          placeholder="e.g., 5"
          error={!!errors.n_clusters}
        />
      </FormField>

      <FormField label="Feature Columns" hint="Columns used as features for clustering">
        <MultiSelect
          values={config.feature_columns || []}
          onChange={(v) => updateConfig({ feature_columns: v })}
          options={availableColumns}
        />
      </FormField>
    </div>
  );
};

export default ClusteringConfigForm;
