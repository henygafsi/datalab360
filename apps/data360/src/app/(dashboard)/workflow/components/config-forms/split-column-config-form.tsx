'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Select, Input } from './_shared';

/**
 * SplitColumnConfigForm — handles block type(s): `split_column`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const SplitColumnConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const outputColumns: string[] = config.output_columns || ['', ''];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addOutputColumn = () => {
    updateConfig({ output_columns: [...outputColumns, ''] });
  };

  const removeOutputColumn = (index: number) => {
    if (outputColumns.length <= 2) return;
    updateConfig({ output_columns: outputColumns.filter((_, i) => i !== index) });
  };

  const updateOutputColumn = (index: number, value: string) => {
    const newCols = [...outputColumns];
    newCols[index] = value;
    updateConfig({ output_columns: newCols });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Split a string column into multiple columns using a delimiter. For example, split &quot;first_last&quot; by &quot;_&quot; into two separate columns.
        </p>
      </div>

      <FormField label="Column" required error={errors.column}>
        <Select
          value={config.column || ''}
          onChange={(v) => updateConfig({ column: v })}
          options={columnOptions}
          placeholder="Select column to split..."
          error={!!errors.column}
        />
      </FormField>

      <FormField label="Delimiter" required error={errors.delimiter}>
        <Input
          value={config.delimiter ?? ','}
          onChange={(v) => updateConfig({ delimiter: v })}
          placeholder=","
          error={!!errors.delimiter}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Output Columns</label>
          <button
            onClick={addOutputColumn}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {outputColumns.map((col, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Part {i + 1}:</span>
            <Input
              value={col}
              onChange={(v) => updateOutputColumn(i, v)}
              placeholder={`e.g., part_${i + 1}`}
            />
            {outputColumns.length > 2 && (
              <button
                onClick={() => removeOutputColumn(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
              >
                <Minus className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SplitColumnConfigForm;
