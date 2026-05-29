'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Select, Input, _uid } from './_shared';
import type { SegmentationConfig } from '@/app/services/etl/types';

/**
 * SegmentationConfigForm — handles block type(s): `segmentation`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const SegmentationConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const rules: Array<{ _key?: string; name: string; condition: string }> = config.rules || [];

  const updateConfig = (updates: Partial<SegmentationConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addRule = () => {
    updateConfig({ rules: [...rules, { _key: _uid(), name: '', condition: '' }] });
  };

  const removeRule = (index: number) => {
    updateConfig({ rules: rules.filter((_, i) => i !== index) });
  };

  const updateRule = (index: number, updates: Partial<{ name: string; condition: string }>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    updateConfig({ rules: newRules });
  };

  return (
    <div className="space-y-4">
      <FormField label="Segment Column" required error={errors.segment_column} hint="Name of the output segment column">
        <Input
          value={config.segment_column || ''}
          onChange={(v) => updateConfig({ segment_column: v })}
          placeholder="e.g., customer_segment"
          error={!!errors.segment_column}
        />
      </FormField>

      <FormField label="Method" required>
        <Select
          value={config.method || 'rules'}
          onChange={(v) => updateConfig({ method: v as SegmentationConfig['method'] })}
          options={[
            { value: 'rules', label: 'Rule-based (CASE WHEN)' },
            { value: 'rfm', label: 'RFM Analysis' },
            { value: 'model', label: 'ML Model' },
          ]}
        />
      </FormField>

      {config.method === 'rules' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Rules</label>
            <button
              onClick={addRule}
              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>

          {rules.map((rule, i) => (
            <div key={rule._key || i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={rule.name}
                  onChange={(v) => updateRule(i, { name: v })}
                  placeholder="Segment name (e.g., VIP)"
                />
                <button
                  onClick={() => removeRule(i)}
                  className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={rule.condition}
                onChange={(v) => updateRule(i, { condition: v })}
                placeholder="Condition (e.g., total_spend > 1000)"
              />
            </div>
          ))}

          {rules.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-2">No rules added</p>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 p-2 bg-slate-100 dark:bg-slate-800 rounded">
        Available columns: {availableColumns.join(', ') || 'Connect an input first'}
      </div>
    </div>
  );
};

export default SegmentationConfigForm;
