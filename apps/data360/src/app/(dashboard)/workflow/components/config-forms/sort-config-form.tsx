'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { Select, _uid } from './_shared';
import type { SortConfig, SortOrderDef } from '@/app/services/etl/types';

/**
 * SortConfigForm — handles block type(s): `sort`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const SortConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const orderBy: SortOrderDef[] = config.order_by || [];

  const updateConfig = (updates: Partial<SortConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addSort = () => {
    updateConfig({ order_by: [...orderBy, { _key: _uid(), column: '', direction: 'ASC' }] });
  };

  const removeSort = (index: number) => {
    updateConfig({ order_by: orderBy.filter((_, i) => i !== index) });
  };

  const updateSort = (index: number, updates: Partial<SortOrderDef>) => {
    const newOrderBy = [...orderBy];
    newOrderBy[index] = { ...newOrderBy[index], ...updates };
    updateConfig({ order_by: newOrderBy });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Sort Order</label>
        <button
          onClick={addSort}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {orderBy.map((sort, i) => (
        <div key={sort._key || i} className="flex items-center gap-2">
          <Select
            value={sort.column}
            onChange={(v) => updateSort(i, { column: v })}
            options={columnOptions}
            placeholder="Column"
          />
          <Select
            value={sort.direction}
            onChange={(v) => updateSort(i, { direction: v as 'ASC' | 'DESC' })}
            options={[
              { value: 'ASC', label: 'ASC' },
              { value: 'DESC', label: 'DESC' },
            ]}
          />
          <button
            onClick={() => removeSort(i)}
            className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}

      {orderBy.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No sort columns added</p>
      )}
    </div>
  );
};

export default SortConfigForm;
