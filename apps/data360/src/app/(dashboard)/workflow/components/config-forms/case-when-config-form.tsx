'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Input, _uid } from './_shared';

/**
 * CaseWhenConfigForm — handles block type(s): `case_when`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const CaseWhenConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const conditions: Array<{ _key?: string; when: string; then: string }> = config.conditions || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addCondition = () => {
    updateConfig({ conditions: [...conditions, { _key: _uid(), when: '', then: '' }] });
  };

  const removeCondition = (index: number) => {
    updateConfig({ conditions: conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: Partial<{ when: string; then: string }>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    updateConfig({ conditions: newConditions });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Create conditional logic using CASE WHEN expressions. Define multiple conditions and their output values, plus an optional ELSE default.
        </p>
      </div>

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
          <div key={cond._key || i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">WHEN</span>
              <Input
                value={cond.when}
                onChange={(v) => updateCondition(i, { when: v })}
                placeholder="e.g., status = 'active'"
              />
              <button
                onClick={() => removeCondition(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">THEN</span>
              <Input
                value={cond.then}
                onChange={(v) => updateCondition(i, { then: v })}
                placeholder="e.g., 'Active User'"
              />
            </div>
          </div>
        ))}

        {conditions.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No conditions added</p>
        )}
      </div>

      <FormField label="ELSE Value" hint="Default value when no conditions match">
        <Input
          value={config.else_value || ''}
          onChange={(v) => updateConfig({ else_value: v })}
          placeholder="e.g., 'Unknown'"
        />
      </FormField>

      <FormField label="Output Column" required error={errors.output_column}>
        <Input
          value={config.output_column || ''}
          onChange={(v) => updateConfig({ output_column: v })}
          placeholder="e.g., user_category"
          error={!!errors.output_column}
        />
      </FormField>

      <div className="text-xs text-slate-500 p-2 bg-slate-100 dark:bg-slate-800 rounded">
        Available columns: {availableColumns.join(', ') || 'Connect an input first'}
      </div>
    </div>
  );
};

export default CaseWhenConfigForm;
