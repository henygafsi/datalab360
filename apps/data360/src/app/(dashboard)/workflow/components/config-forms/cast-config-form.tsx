'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { Select } from './_shared';
import type { CastConfig } from '@/app/services/etl/types';

/**
 * CastConfigForm — handles block type(s): `cast`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const CastConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const casts: Record<string, string> = config.casts || {};
  const entries = Object.entries(casts);

  const dataTypes = [
    { value: 'VARCHAR', label: 'VARCHAR' },
    { value: 'NUMBER', label: 'NUMBER' },
    { value: 'DECIMAL(18,2)', label: 'DECIMAL(18,2)' },
    { value: 'INTEGER', label: 'INTEGER' },
    { value: 'FLOAT', label: 'FLOAT' },
    { value: 'DATE', label: 'DATE' },
    { value: 'TIMESTAMP', label: 'TIMESTAMP' },
    { value: 'BOOLEAN', label: 'BOOLEAN' },
  ];

  const updateConfig = (updates: Partial<CastConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addCast = () => {
    updateConfig({ casts: { ...casts, '': 'VARCHAR' } });
  };

  const removeCast = (col: string) => {
    const newCasts = { ...casts };
    delete newCasts[col];
    updateConfig({ casts: newCasts });
  };

  const updateCast = (oldCol: string, newCol: string, type: string) => {
    const newCasts = { ...casts };
    delete newCasts[oldCol];
    newCasts[newCol] = type;
    updateConfig({ casts: newCasts });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Type Casts</label>
        <button
          onClick={addCast}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {entries.map(([col, type], i) => (
        <div key={col || i} className="flex items-center gap-2">
          <Select
            value={col}
            onChange={(v) => updateCast(col, v, type)}
            options={columnOptions}
            placeholder="Column"
          />
          <span className="text-slate-400">→</span>
          <Select
            value={type}
            onChange={(v) => updateCast(col, col, v)}
            options={dataTypes}
          />
          <button
            onClick={() => removeCast(col)}
            className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}

      {entries.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No casts added</p>
      )}
    </div>
  );
};

export default CastConfigForm;
