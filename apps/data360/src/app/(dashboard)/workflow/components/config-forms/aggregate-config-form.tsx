'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Select, MultiSelect, Input, _uid } from './_shared';
import type { AggregateConfig, AggregationDef } from '@/app/services/etl/types';

/**
 * AggregateConfigForm — handles block type(s): `aggregate`, `aggregate_kpi`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const AggregateConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const aggregations: AggregationDef[] = config.aggregations || [];

  const aggFunctions = [
    { value: 'SUM', label: 'SUM' },
    { value: 'AVG', label: 'AVG' },
    { value: 'COUNT', label: 'COUNT' },
    { value: 'MIN', label: 'MIN' },
    { value: 'MAX', label: 'MAX' },
    { value: 'COUNT_DISTINCT', label: 'COUNT DISTINCT' },
    { value: 'LISTAGG', label: 'LISTAGG' },
  ];

  const updateConfig = (updates: Partial<AggregateConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addAggregation = () => {
    updateConfig({ aggregations: [...aggregations, { _key: _uid(), column: '', function: 'SUM', alias: '' }] });
  };

  const removeAggregation = (index: number) => {
    updateConfig({ aggregations: aggregations.filter((_, i) => i !== index) });
  };

  const updateAggregation = (index: number, updates: Partial<AggregationDef>) => {
    const newAggregations = [...aggregations];
    newAggregations[index] = { ...newAggregations[index], ...updates };
    updateConfig({ aggregations: newAggregations });
  };

  return (
    <div className="space-y-4">
      <FormField label="Group By" hint="Columns to group by">
        <MultiSelect
          values={config.group_by || []}
          onChange={(v) => updateConfig({ group_by: v })}
          options={availableColumns}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Aggregations</label>
          <button
            onClick={addAggregation}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {aggregations.map((agg, i) => (
          <div key={agg._key || i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={agg.function}
                onChange={(v) => updateAggregation(i, { function: v as AggregationDef['function'] })}
                options={aggFunctions}
              />
              <Select
                value={agg.column}
                onChange={(v) => updateAggregation(i, { column: v })}
                options={columnOptions}
                placeholder="Column"
              />
              <button
                onClick={() => removeAggregation(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <Input
              value={agg.alias}
              onChange={(v) => updateAggregation(i, { alias: v })}
              placeholder="Alias (e.g., total_sales)"
            />
          </div>
        ))}

        {aggregations.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No aggregations added</p>
        )}
      </div>
    </div>
  );
};

export default AggregateConfigForm;
