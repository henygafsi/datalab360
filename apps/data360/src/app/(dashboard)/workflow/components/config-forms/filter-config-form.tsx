'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Select, Input, _uid } from './_shared';
import type { FilterConfig, FilterCondition } from '@/app/services/etl/types';

/**
 * FilterConfigForm — handles block type(s): `filter`, `drop_nulls`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const FilterConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const conditions: FilterCondition[] = config.conditions || [];

  const operators = [
    { value: '=', label: '=' },
    { value: '!=', label: '!=' },
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: 'LIKE', label: 'LIKE' },
    { value: 'IN', label: 'IN' },
    { value: 'IS NULL', label: 'IS NULL' },
    { value: 'IS NOT NULL', label: 'IS NOT NULL' },
  ];

  const updateConfig = (updates: Partial<FilterConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addCondition = () => {
    updateConfig({ conditions: [...conditions, { _key: _uid(), column: '', operator: '=', value: '' }] });
  };

  const removeCondition = (index: number) => {
    updateConfig({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    updateConfig({ conditions: newConditions });
  };

  return (
    <div className="space-y-4">
      <FormField label="Logic">
        <Select
          value={config.logic || 'AND'}
          onChange={(v) => updateConfig({ logic: v as 'AND' | 'OR' })}
          options={[
            { value: 'AND', label: 'AND (all conditions)' },
            { value: 'OR', label: 'OR (any condition)' },
          ]}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Conditions</label>
          <button
            onClick={addCondition}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {conditions.map((cond, i) => (
          <div key={cond._key || i} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <Select
              value={cond.column}
              onChange={(v) => updateCondition(i, { column: v })}
              options={columnOptions}
              placeholder="Column"
            />
            <Select
              value={cond.operator}
              onChange={(v) => updateCondition(i, { operator: v as FilterCondition['operator'] })}
              options={operators}
            />
            {!['IS NULL', 'IS NOT NULL'].includes(cond.operator) && (
              <Input
                value={String(cond.value || '')}
                onChange={(v) => updateCondition(i, { value: v })}
                placeholder="Value"
              />
            )}
            <button
              onClick={() => removeCondition(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ))}

        {conditions.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No conditions added</p>
        )}
      </div>
    </div>
  );
};

export default FilterConfigForm;
