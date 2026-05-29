'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Select, Input, _uid } from './_shared';

/**
 * JsonExtractConfigForm — handles block type(s): `json_extract`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const JsonExtractConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const extractPaths: Array<{ _key?: string; path: string; type: string; output: string }> = config.extract_paths || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addPath = () => {
    updateConfig({ extract_paths: [...extractPaths, { _key: _uid(), path: '', type: 'VARCHAR', output: '' }] });
  };

  const removePath = (index: number) => {
    updateConfig({ extract_paths: extractPaths.filter((_, i) => i !== index) });
  };

  const updatePath = (index: number, updates: Partial<{ path: string; type: string; output: string }>) => {
    const newPaths = [...extractPaths];
    newPaths[index] = { ...newPaths[index], ...updates };
    updateConfig({ extract_paths: newPaths });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300">
          Extract specific values from a JSON/VARIANT column using dot-notation paths, casting each to a desired data type.
        </p>
      </div>

      <FormField label="Input Column" required error={errors.input_column}>
        <Select
          value={config.input_column || ''}
          onChange={(v) => updateConfig({ input_column: v })}
          options={columnOptions}
          placeholder="Select VARIANT column..."
          error={!!errors.input_column}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Extract Paths</label>
          <button
            onClick={addPath}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {extractPaths.map((ep, i) => (
          <div key={ep._key || i} className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={ep.path}
                onChange={(v) => updatePath(i, { path: v })}
                placeholder="JSON path (e.g., user.name)"
              />
              <button
                onClick={() => removePath(i)}
                className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={ep.type}
                onChange={(v) => updatePath(i, { type: v })}
                options={[
                  { value: 'VARCHAR', label: 'VARCHAR' },
                  { value: 'NUMBER', label: 'NUMBER' },
                  { value: 'FLOAT', label: 'FLOAT' },
                  { value: 'BOOLEAN', label: 'BOOLEAN' },
                  { value: 'DATE', label: 'DATE' },
                  { value: 'TIMESTAMP', label: 'TIMESTAMP' },
                  { value: 'VARIANT', label: 'VARIANT' },
                ]}
              />
              <Input
                value={ep.output}
                onChange={(v) => updatePath(i, { output: v })}
                placeholder="Output column name"
              />
            </div>
          </div>
        ))}

        {extractPaths.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No extract paths added</p>
        )}
      </div>
    </div>
  );
};

export default JsonExtractConfigForm;
