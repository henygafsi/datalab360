'use client';

import React from 'react';
import { FormField, Input, Select, Textarea } from './_shared';

/**
 * RollupCubeConfigForm — handles block type `rollup_cube`.
 *
 * Multi-level GROUP BY using ROLLUP, CUBE or GROUPING SETS. Aggregations and
 * grouping sets are entered as comma / newline lists kept as plain strings so
 * the form stays light; the backend compiler parses them.
 */

const GROUPING_OPTIONS = [
  { value: 'ROLLUP', label: 'ROLLUP — hierarchical sub-totals' },
  { value: 'CUBE', label: 'CUBE — all combinations' },
  { value: 'GROUPING_SETS', label: 'GROUPING SETS — explicit sets' },
];

const RollupCubeConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns?: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const groupingType = config.grouping_type || 'ROLLUP';

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Compute sub-totals and grand totals with GROUP BY ROLLUP / CUBE / GROUPING SETS.
        </p>
      </div>

      <FormField label="Grouping Type" required error={errors.grouping_type}>
        <Select
          value={groupingType}
          onChange={(v) => updateConfig({ grouping_type: v })}
          options={GROUPING_OPTIONS}
        />
      </FormField>

      <FormField label="Group By Columns" required error={errors.group_by}
        hint="Comma-separated columns (e.g., REGION, PRODUCT)">
        <Input
          value={config.group_by || ''}
          onChange={(v) => updateConfig({ group_by: v })}
          placeholder="e.g., REGION, PRODUCT"
          error={!!errors.group_by}
        />
      </FormField>

      {groupingType === 'GROUPING_SETS' && (
        <FormField label="Grouping Sets" error={errors.grouping_sets}
          hint="One set per line; columns comma-separated. e.g. REGION, PRODUCT / REGION / (empty for grand total)">
          <Textarea
            value={config.grouping_sets || ''}
            onChange={(v) => updateConfig({ grouping_sets: v })}
            placeholder={'REGION, PRODUCT\nREGION\n'}
            rows={3}
          />
        </FormField>
      )}

      <FormField label="Aggregations" required error={errors.aggregations}
        hint="One per line: FN(COLUMN) AS ALIAS. e.g. SUM(AMOUNT) AS TOTAL">
        <Textarea
          value={config.aggregations || ''}
          onChange={(v) => updateConfig({ aggregations: v })}
          placeholder={'SUM(AMOUNT) AS TOTAL\nCOUNT(*) AS ROWS'}
          rows={3}
          error={!!errors.aggregations}
        />
      </FormField>
    </div>
  );
};

export default RollupCubeConfigForm;
