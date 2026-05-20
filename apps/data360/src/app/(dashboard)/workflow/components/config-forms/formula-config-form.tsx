'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { Input, _uid } from './_shared';
import type { FormulaConfig, FormulaDef } from '@/app/services/etl/types';

/**
 * FormulaConfigForm — handles block type(s): `formula`, `normalize`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const FormulaConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const formulas: FormulaDef[] = config.formulas || [];

  const updateConfig = (updates: Partial<FormulaConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addFormula = () => {
    updateConfig({ formulas: [...formulas, { _key: _uid(), name: '', expression: '' }] });
  };

  const removeFormula = (index: number) => {
    updateConfig({ formulas: formulas.filter((_, i) => i !== index) });
  };

  const updateFormula = (index: number, updates: Partial<FormulaDef>) => {
    const newFormulas = [...formulas];
    newFormulas[index] = { ...newFormulas[index], ...updates };
    updateConfig({ formulas: newFormulas });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Calculated Columns</label>
        <button
          onClick={addFormula}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {formulas.map((formula, i) => (
        <div key={formula._key || i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={formula.name}
              onChange={(v) => updateFormula(i, { name: v })}
              placeholder="Column name"
            />
            <button
              onClick={() => removeFormula(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
          <Input
            value={formula.expression}
            onChange={(v) => updateFormula(i, { expression: v })}
            placeholder="Expression (e.g., revenue - cost)"
          />
        </div>
      ))}

      {formulas.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No formulas added</p>
      )}

      <div className="text-xs text-slate-500 p-2 bg-slate-100 dark:bg-slate-800 rounded">
        Available columns: {availableColumns.join(', ') || 'Connect an input first'}
      </div>
    </div>
  );
};

export default FormulaConfigForm;
