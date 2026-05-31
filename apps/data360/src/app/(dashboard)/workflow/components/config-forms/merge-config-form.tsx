'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FormField, Input, Select, Textarea } from './_shared';

/**
 * MergeConfigForm — handles block type `merge`.
 *
 * Multi-clause MERGE INTO: a target table, the match keys, and one-or-more
 * WHEN MATCHED / WHEN NOT MATCHED clauses (each with an optional condition and
 * an action). First input = source, second input = target.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`.
 */

interface MergeClause {
  when: 'MATCHED' | 'NOT_MATCHED';
  action: 'UPDATE' | 'DELETE' | 'INSERT';
  condition?: string;
  /** UPDATE/INSERT column list or SET expression, free-form (or "all"). */
  set?: string;
}

const WHEN_OPTIONS = [
  { value: 'MATCHED', label: 'WHEN MATCHED' },
  { value: 'NOT_MATCHED', label: 'WHEN NOT MATCHED' },
];

const ACTION_OPTIONS = [
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'INSERT', label: 'INSERT' },
];

const MergeConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const clauses: MergeClause[] = Array.isArray(config.clauses) && config.clauses.length > 0
    ? config.clauses
    : [{ when: 'MATCHED', action: 'UPDATE', set: 'all' }];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const setClause = (i: number, patch: Partial<MergeClause>) => {
    const next = clauses.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    updateConfig({ clauses: next });
  };

  const addClause = () => {
    updateConfig({ clauses: [...clauses, { when: 'NOT_MATCHED', action: 'INSERT', set: 'all' }] });
  };

  const removeClause = (i: number) => {
    updateConfig({ clauses: clauses.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Upsert the source (first input) into the target using MERGE INTO. Add several
          WHEN MATCHED / WHEN NOT MATCHED clauses for full multi-clause merges.
        </p>
      </div>

      <FormField label="Target Table" required error={errors.target_table}
        hint="Fully-qualified target table (e.g., DB.SCHEMA.TABLE)">
        <Input
          value={config.target_table || ''}
          onChange={(v) => updateConfig({ target_table: v })}
          placeholder="e.g., MY_DB.MY_SCHEMA.MY_TABLE"
          error={!!errors.target_table}
        />
      </FormField>

      <FormField label="Merge Keys" required error={errors.merge_keys}
        hint="Comma-separated columns used in the ON clause (e.g., ID, REGION)">
        <Input
          value={config.merge_keys || ''}
          onChange={(v) => updateConfig({ merge_keys: v })}
          placeholder="e.g., ID"
          error={!!errors.merge_keys}
        />
      </FormField>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Clauses <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addClause}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            <Plus className="h-3 w-3" /> Add clause
          </button>
        </div>
        {errors.clauses && <p className="text-xs text-red-500">{errors.clauses}</p>}

        {clauses.map((clause, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={clause.when}
                  onChange={(v) => setClause(i, { when: v as MergeClause['when'] })}
                  options={WHEN_OPTIONS}
                />
              </div>
              <div className="flex-1">
                <Select
                  value={clause.action}
                  onChange={(v) => setClause(i, { action: v as MergeClause['action'] })}
                  options={ACTION_OPTIONS}
                />
              </div>
              {clauses.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeClause(i)}
                  aria-label="Remove clause"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Input
              value={clause.condition || ''}
              onChange={(v) => setClause(i, { condition: v })}
              placeholder="Optional condition (AND …), e.g. source.STATUS = 'ACTIVE'"
            />
            <Textarea
              value={clause.set || ''}
              onChange={(v) => setClause(i, { set: v })}
              placeholder={clause.action === 'DELETE' ? 'Not used for DELETE' : 'Columns/SET expression or "all"'}
              rows={2}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default MergeConfigForm;
