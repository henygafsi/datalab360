'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2, Save } from 'lucide-react';
import { FormField } from './_shared';
import { CodeEditor } from './_code-editor';
import { AIGenerateDrawer } from './_ai-drawer';
import apiClient from '@/lib/api-client';

/**
 * SQLScriptConfigForm — handles block type(s): `sql_script`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const SQLScriptConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;
  const [testResult, setTestResult] = useState<{ columns: string[]; rows: Record<string, any>[]; count: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const updateConfig = (updates: Record<string, unknown>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  const handleTestSql = async () => {
    if (!config.sql_code) return;
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const response = await apiClient.post('/workflow/run-sql', { sql: config.sql_code, limit: 10 });
      const result = response.data as Record<string, any>;
      if (result.status === 'success') {
        setTestResult({ columns: result.columns || [], rows: result.rows || [], count: result.count || 0 });
      } else {
        setTestError((result.detail as any)?.message || result.message || 'Execution failed');
      }
    } catch (err: any) {
      setTestError(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="SQL Code" required error={errors.sql_code} hint="Write your SQL script to execute">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              SQL · Snowflake dialect
            </span>
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              aria-expanded={aiOpen}
              aria-controls="sql-ai-drawer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-800 hover:bg-purple-200/70 dark:hover:bg-purple-900/60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </button>
          </div>

          <CodeEditor
            value={config.sql_code || ''}
            onChange={(v) => updateConfig({ sql_code: v })}
            language="sql"
            placeholder="SELECT * FROM {{ input }} WHERE ..."
            rows={12}
            ariaLabel="SQL code editor"
            error={!!errors.sql_code}
          />

          <div id="sql-ai-drawer">
            <AIGenerateDrawer
              open={aiOpen}
              onClose={() => setAiOpen(false)}
              language="sql"
              onGenerated={(code) => updateConfig({ sql_code: code })}
            />
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Code editor (lightweight — install Monaco for syntax highlighting). Tab inserts 2 spaces.
          </p>
        </div>
      </FormField>

      <button
        type="button"
        onClick={handleTestSql}
        disabled={isTesting || !config.sql_code}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isTesting || !config.sql_code
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        )}
      >
        {isTesting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {isTesting ? 'Running...' : 'Test SQL (limit 10 rows)'}
      </button>

      {testResult && (
        <div className="p-3 bg-slate-900 rounded-lg overflow-auto max-h-60">
          <div className="text-xs text-emerald-400 mb-1 font-medium">
            {testResult.count} row{testResult.count !== 1 ? 's' : ''} returned
          </div>
          {testResult.columns.length > 0 && (
            <table className="text-xs text-slate-300 font-mono w-full">
              <thead>
                <tr>
                  {testResult.columns.map((col) => (
                    <th key={col} className="text-left pr-3 pb-1 text-slate-400 border-b border-slate-700">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testResult.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {testResult.columns.map((col) => (
                      <td key={col} className="pr-3 py-0.5 whitespace-nowrap">{String(row[col] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {testError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Error:</div>
          <pre className="text-xs text-red-500 dark:text-red-300 whitespace-pre-wrap font-mono">{testError}</pre>
        </div>
      )}
    </div>
  );
};

export default SQLScriptConfigForm;
