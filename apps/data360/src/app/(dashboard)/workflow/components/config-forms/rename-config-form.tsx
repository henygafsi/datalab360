'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { Select, Input } from './_shared';
import type { RenameConfig } from '@/app/services/etl/types';

/**
 * RenameConfigForm — handles block type(s): `rename`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const RenameConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  availableColumns: string[];
  columnOptions?: { value: string; label: string }[];
}> = ({ data, onChange, errors, availableColumns, columnOptions = availableColumns.map(c => ({ value: c, label: c })) }) => {
  const config = data.config || data;
  const mappings: Record<string, string> = config.mappings || {};
  const entries = Object.entries(mappings);

  const updateConfig = (updates: Partial<RenameConfig>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addMapping = () => {
    updateConfig({ mappings: { ...mappings, '': '' } });
  };

  const removeMapping = (oldName: string) => {
    const newMappings = { ...mappings };
    delete newMappings[oldName];
    updateConfig({ mappings: newMappings });
  };

  const updateMapping = (oldKey: string, newKey: string, newValue: string) => {
    const newMappings = { ...mappings };
    delete newMappings[oldKey];
    newMappings[newKey] = newValue;
    updateConfig({ mappings: newMappings });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Column Mappings</label>
        <button
          onClick={addMapping}
          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {entries.map(([oldName, newName], i) => (
        <div key={oldName || i} className="flex items-center gap-2">
          <Select
            value={oldName}
            onChange={(v) => updateMapping(oldName, v, newName)}
            options={columnOptions}
            placeholder="Old name"
          />
          <span className="text-slate-400">→</span>
          <Input
            value={newName}
            onChange={(v) => updateMapping(oldName, oldName, v)}
            placeholder="New name"
          />
          <button
            onClick={() => removeMapping(oldName)}
            className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}

      {entries.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-2">No mappings added</p>
      )}
    </div>
  );
};

export default RenameConfigForm;
