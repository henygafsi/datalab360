'use client';

/**
 * AccountParametersPanel — read-only view of every account-level Snowflake
 * parameter (SHOW PARAMETERS IN ACCOUNT), for the Administration hub's Config
 * tab. Surfaces the account's real security/session/retention knobs that had no
 * UI: MFA caching, network/IP allow-lists, statement timeouts, data retention…
 *
 * GET /api/administration/account-parameters — read-only, honest degrade.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  getAccountParameters,
  SECURITY_PARAM_HINT,
  type AccountParameter,
} from '@/app/services/administration/account-parameters';

function isCustomized(p: AccountParameter): boolean {
  return (p.value ?? '') !== (p.default ?? '') && (p.default ?? '') !== '';
}

export default function AccountParametersPanel() {
  const [params, setParams] = useState<AccountParameter[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [secOnly, setSecOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAccountParameters();
      setParams(res.parameters);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setParams(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!params) return [];
    const q = query.trim().toLowerCase();
    return params.filter((p) => {
      if (secOnly && !SECURITY_PARAM_HINT.test(p.name)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
    });
  }, [params, query, secOnly]);

  const secCount = useMemo(
    () => (params ?? []).filter((p) => SECURITY_PARAM_HINT.test(p.name)).length,
    [params],
  );
  const customCount = useMemo(
    () => (params ?? []).filter(isCustomized).length,
    [params],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" data-testid="account-parameters-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-500" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Account Parameters</h3>
          {params && (
            <span className="text-[11px] text-slate-400">
              {params.length} total · {secCount} security · {customCount} customized
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden /> Refresh
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Live <code className="font-mono">SHOW PARAMETERS IN ACCOUNT</code> — the account&apos;s security, session and retention settings.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parameters…"
            aria-label="Search account parameters"
            className="w-full rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <button
          type="button"
          onClick={() => setSecOnly((v) => !v)}
          aria-pressed={secOnly}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
            secOnly
              ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          <ShieldCheck className="h-3 w-3" aria-hidden /> Security only
        </button>
      </div>

      {loading && !params && (
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}
        </div>
      )}
      {error && !loading && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/40 p-2 text-[11px] text-red-600 dark:border-red-800 dark:bg-red-900/10 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /><span>{error}</span>
        </div>
      )}
      {params && (
        <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-slate-500">
                <th className="px-2 py-1.5 font-semibold">Parameter</th>
                <th className="px-2 py-1.5 font-semibold">Value</th>
                <th className="px-2 py-1.5 font-semibold">Default</th>
                <th className="px-2 py-1.5 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const sec = SECURITY_PARAM_HINT.test(p.name);
                const custom = isCustomized(p);
                return (
                  <tr key={p.name} className="border-t border-slate-100 dark:border-slate-800/60" title={p.description}>
                    <td className="px-2 py-1 font-mono text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1">
                        {sec && <ShieldCheck className="h-2.5 w-2.5 shrink-0 text-blue-500" aria-label="security-relevant" />}
                        {p.name}
                      </span>
                    </td>
                    <td className={cn('px-2 py-1 font-mono', custom ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400')}>
                      {p.value || '—'}
                    </td>
                    <td className="px-2 py-1 font-mono text-slate-400">{p.default || '—'}</td>
                    <td className="px-2 py-1 text-slate-400">{p.type}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-400">No parameters match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
