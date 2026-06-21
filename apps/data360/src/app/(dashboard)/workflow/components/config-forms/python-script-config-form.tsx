'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Info, Loader2, Save } from 'lucide-react';
import { FormField, Select, Input } from './_shared';
import { CodeEditor } from './_code-editor';
import { AIGenerateDrawer } from './_ai-drawer';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

/**
 * PythonScriptConfigForm — handles block type(s): `python_script`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const PythonScriptConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
  accessToken?: string | null;
}> = ({ data, onChange, errors, accessToken }) => {
  const config = data.config || data;
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [showBackendGap, setShowBackendGap] = useState(false);
  const mode = config.python_mode || 'procedure';
  // accessToken is forwarded by the sidebar but currently unused inside this form.
  void accessToken;

  const updateConfig = (updates: Record<string, unknown>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const handleTestCode = async () => {
    if (!config.python_code) return;
    setIsTesting(true);
    setTestOutput(null);
    setTestError(null);
    try {
      const response = await apiClient.post('/workflow/run-python', { code: config.python_code });
      const result = response.data as Record<string, any>;
      if (result.status === 'success') {
        setTestOutput((result.output as string) || '(no output)');
      } else {
        setTestError((result.detail as any)?.message || result.message || 'Execution failed');
      }
    } catch (err: any) {
      setTestError(getApiErrorMessage(err) || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="Mode" hint="Choose between calling an existing procedure or writing inline code">
        <Select
          value={mode}
          onChange={(v) => updateConfig({ python_mode: v })}
          options={[
            { value: 'procedure', label: 'Call Stored Procedure' },
            { value: 'inline', label: 'Inline Python Code' },
          ]}
        />
      </FormField>

      {mode === 'procedure' ? (
        <>
          <FormField label="Database" required error={errors.database}>
            <Input
              value={config.database || ''}
              onChange={(v) => updateConfig({ database: v })}
              placeholder="e.g., MY_DATABASE"
              error={!!errors.database}
            />
          </FormField>

          <FormField label="Schema" required error={errors.schema}>
            <Input
              value={config.schema || ''}
              onChange={(v) => updateConfig({ schema: v })}
              placeholder="e.g., PUBLIC"
              error={!!errors.schema}
            />
          </FormField>

          <FormField label="Procedure Name" required error={errors.proc_name}>
            <Input
              value={config.proc_name || ''}
              onChange={(v) => updateConfig({ proc_name: v })}
              placeholder="e.g., MY_PYTHON_PROC"
              error={!!errors.proc_name}
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField label="Python Code" required error={errors.python_code}
            hint="Write Python code. Use the 'session' variable to access the data warehouse.">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800">
                  Python
                </span>
                <button
                  type="button"
                  onClick={() => setAiOpen((v) => !v)}
                  aria-expanded={aiOpen}
                  aria-controls="python-ai-drawer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-800 hover:bg-purple-200/70 dark:hover:bg-purple-900/60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate with AI
                </button>
              </div>

              <CodeEditor
                value={config.python_code || ''}
                onChange={(v) => updateConfig({ python_code: v })}
                language="python"
                placeholder={`# Python — 'df' is the upstream DataFrame\n# return df_out at the end\ndf_out = df.filter(df["STATUS"] == "ACTIVE")`}
                rows={14}
                ariaLabel="Python code editor"
                error={!!errors.python_code}
              />

              <div id="python-ai-drawer">
                <AIGenerateDrawer
                  open={aiOpen}
                  onClose={() => setAiOpen(false)}
                  language="python"
                  onGenerated={(code) => updateConfig({ python_code: code })}
                />
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Code editor (lightweight — install Monaco for syntax highlighting). Tab inserts 2 spaces.
              </p>
            </div>
          </FormField>

          <FormField label="Runtime Version" hint="Python runtime version">
            <Select
              value={config.runtime_version || '3.11'}
              onChange={(v) => updateConfig({ runtime_version: v })}
              options={[
                { value: '3.11', label: 'Python 3.11' },
                { value: '3.10', label: 'Python 3.10' },
                { value: '3.9', label: 'Python 3.9' },
              ]}
            />
          </FormField>

          <FormField label="Packages" hint="Comma-separated packages">
            <Input
              value={config.packages || 'snowflake-snowpark-python'}
              onChange={(v) => updateConfig({ packages: v })}
              placeholder="snowflake-snowpark-python, pandas"
            />
          </FormField>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestCode}
              disabled={isTesting || !config.python_code}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isTesting || !config.python_code
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-yellow-500 text-white hover:bg-yellow-600'
              )}
              title="Calls POST /workflow/run-python — backend endpoint may not be deployed yet"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isTesting ? 'Running...' : 'Test Python Code'}
            </button>
            <button
              type="button"
              onClick={() => setShowBackendGap((v) => !v)}
              aria-expanded={showBackendGap}
              aria-controls="python-backend-gap"
              className="px-2.5 py-2 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-800 hover:bg-amber-100"
              title="Show backend contract for Test Python"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>

          {showBackendGap && (
            <div
              id="python-backend-gap"
              role="region"
              aria-label="Backend Gap — Test Python endpoint contract"
              className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
                <Info className="h-3.5 w-3.5" />
                Backend Gap · Test Python contract
              </div>
              <pre className="text-[11px] text-amber-700/90 dark:text-amber-200 whitespace-pre-wrap font-mono">
{`POST /workflow/run-python
body: { code: string, runtime_version?: '3.9' | '3.10' | '3.11', packages?: string }
resp: { status: 'success' | 'error', output?: string, message?: string, detail?: { message: string } }

If the endpoint is not deployed yet, the test button will surface a network error.`}
              </pre>
            </div>
          )}

          {testOutput && (
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-emerald-400 mb-1 font-medium">Output:</div>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{testOutput}</pre>
            </div>
          )}

          {testError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Error:</div>
              <pre className="text-xs text-red-500 dark:text-red-300 whitespace-pre-wrap font-mono">{testError}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PythonScriptConfigForm;
