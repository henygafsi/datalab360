'use client';

import React from 'react';
import { FormField, Input, Select, Textarea } from './_shared';

/**
 * MatchRecognizeConfigForm — handles block type `match_recognize`.
 *
 * Row-pattern matching (MATCH_RECOGNIZE). Partition / order keys, the pattern
 * expression, DEFINE variable rules, optional MEASURES, and rows-per-match.
 */

const ROWS_PER_MATCH_OPTIONS = [
  { value: 'ONE ROW PER MATCH', label: 'One row per match' },
  { value: 'ALL ROWS PER MATCH', label: 'All rows per match' },
];

const MatchRecognizeConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns?: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/20 border border-fuchsia-200 dark:border-fuchsia-800">
        <p className="text-xs text-fuchsia-700 dark:text-fuchsia-300">
          Detect sequential patterns in ordered rows with MATCH_RECOGNIZE — funnels,
          sessionization, anomaly streaks.
        </p>
      </div>

      <FormField label="Partition By" required error={errors.partition_by}
        hint="Comma-separated columns (e.g., USER_ID)">
        <Input
          value={config.partition_by || ''}
          onChange={(v) => updateConfig({ partition_by: v })}
          placeholder="e.g., USER_ID"
          error={!!errors.partition_by}
        />
      </FormField>

      <FormField label="Order By" required error={errors.order_by}
        hint="Comma-separated columns defining row order (e.g., EVENT_TS)">
        <Input
          value={config.order_by || ''}
          onChange={(v) => updateConfig({ order_by: v })}
          placeholder="e.g., EVENT_TS"
          error={!!errors.order_by}
        />
      </FormField>

      <FormField label="Pattern" required error={errors.pattern}
        hint="Row pattern, e.g. (START DOWN+ UP+)">
        <Input
          value={config.pattern || ''}
          onChange={(v) => updateConfig({ pattern: v })}
          placeholder="e.g., (A B+ C)"
          error={!!errors.pattern}
        />
      </FormField>

      <FormField label="Define" required error={errors.define}
        hint="One per line: VAR AS condition. e.g. DOWN AS price < PREV(price)">
        <Textarea
          value={config.define || ''}
          onChange={(v) => updateConfig({ define: v })}
          placeholder={'DOWN AS price < PREV(price)\nUP AS price > PREV(price)'}
          rows={3}
          error={!!errors.define}
        />
      </FormField>

      <FormField label="Measures" error={errors.measures}
        hint="Optional, one per line: EXPR AS ALIAS. e.g. MATCH_NUMBER() AS MATCH_NUM">
        <Textarea
          value={config.measures || ''}
          onChange={(v) => updateConfig({ measures: v })}
          placeholder={'MATCH_NUMBER() AS MATCH_NUM'}
          rows={2}
        />
      </FormField>

      <FormField label="Rows Per Match" error={errors.rows_per_match}>
        <Select
          value={config.rows_per_match || 'ONE ROW PER MATCH'}
          onChange={(v) => updateConfig({ rows_per_match: v })}
          options={ROWS_PER_MATCH_OPTIONS}
        />
      </FormField>
    </div>
  );
};

export default MatchRecognizeConfigForm;
