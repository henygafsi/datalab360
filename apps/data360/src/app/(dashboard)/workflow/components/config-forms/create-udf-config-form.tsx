'use client';

import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { FormField, Select, Input, Textarea, _uid } from './_shared';

/**
 * CreateUDFConfigForm — handles block type(s): `create_udf`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const CreateUDFConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const parameters: Array<{ _key?: string; name: string; type: string }> = config.parameters || [];

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const addParameter = () => {
    updateConfig({ parameters: [...parameters, { _key: _uid(), name: '', type: 'VARCHAR' }] });
  };

  const removeParameter = (index: number) => {
    updateConfig({ parameters: parameters.filter((_, i) => i !== index) });
  };

  const updateParameter = (index: number, updates: Partial<{ name: string; type: string }>) => {
    const newParams = [...parameters];
    newParams[index] = { ...newParams[index], ...updates };
    updateConfig({ parameters: newParams });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          Create a User-Defined Function (UDF) in the data warehouse. The function can be written in Python, SQL, or Java and used in SQL queries.
        </p>
      </div>

      <FormField label="Function Name" required error={errors.function_name}>
        <Input
          value={config.function_name || ''}
          onChange={(v) => updateConfig({ function_name: v })}
          placeholder="e.g., CALCULATE_SCORE"
          error={!!errors.function_name}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Database" required error={errors.database_name}>
          <Input
            value={config.database_name || ''}
            onChange={(v) => updateConfig({ database_name: v })}
            placeholder="e.g., MY_DB"
            error={!!errors.database_name}
          />
        </FormField>

        <FormField label="Schema" required error={errors.schema_name}>
          <Input
            value={config.schema_name || ''}
            onChange={(v) => updateConfig({ schema_name: v })}
            placeholder="e.g., PUBLIC"
            error={!!errors.schema_name}
          />
        </FormField>
      </div>

      <FormField label="Language" required>
        <Select
          value={config.language || 'PYTHON'}
          onChange={(v) => updateConfig({ language: v })}
          options={[
            { value: 'PYTHON', label: 'Python' },
            { value: 'SQL', label: 'SQL' },
            { value: 'JAVA', label: 'Java' },
          ]}
        />
      </FormField>

      <FormField label="Return Type" required>
        <Select
          value={config.return_type || 'VARCHAR'}
          onChange={(v) => updateConfig({ return_type: v })}
          options={[
            { value: 'VARCHAR', label: 'VARCHAR' },
            { value: 'NUMBER', label: 'NUMBER' },
            { value: 'FLOAT', label: 'FLOAT' },
            { value: 'BOOLEAN', label: 'BOOLEAN' },
            { value: 'VARIANT', label: 'VARIANT' },
          ]}
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Parameters</label>
          <button
            onClick={addParameter}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>

        {parameters.map((param, i) => (
          <div key={param._key || i} className="flex items-center gap-2">
            <Input
              value={param.name}
              onChange={(v) => updateParameter(i, { name: v })}
              placeholder="Param name"
            />
            <Select
              value={param.type}
              onChange={(v) => updateParameter(i, { type: v })}
              options={[
                { value: 'VARCHAR', label: 'VARCHAR' },
                { value: 'NUMBER', label: 'NUMBER' },
                { value: 'FLOAT', label: 'FLOAT' },
                { value: 'BOOLEAN', label: 'BOOLEAN' },
                { value: 'VARIANT', label: 'VARIANT' },
              ]}
            />
            <button
              onClick={() => removeParameter(i)}
              className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remove item"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ))}

        {parameters.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">No parameters added</p>
        )}
      </div>

      <FormField label="Function Body" required error={errors.function_body}>
        <Textarea
          value={config.function_body || ''}
          onChange={(v) => updateConfig({ function_body: v })}
          placeholder={config.language === 'PYTHON' ? 'def handler(arg1):\n    return result' : 'SELECT ...'}
          rows={8}
          className="font-mono text-sm"
          error={!!errors.function_body}
        />
      </FormField>

      {config.language === 'PYTHON' && (
        <FormField label="Packages" hint="Comma-separated Python packages">
          <Input
            value={config.packages || ''}
            onChange={(v) => updateConfig({ packages: v })}
            placeholder="e.g., pandas, numpy"
          />
        </FormField>
      )}
    </div>
  );
};

export default CreateUDFConfigForm;
