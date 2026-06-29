'use client';

/**
 * ApiCatalogPanel — Administrator → "API Catalog" tab.
 *
 * Displays EVERY backend endpoint (from the live OpenAPI, 912 paths) with the
 * frontend file(s) that call it and a coverage tier, plus an optional live
 * status probe. Regenerate the backing data with:
 *   node scripts/gen-endpoint-file-map.mjs
 *
 * Design rules honoured: real data only (no mocks), '—' instead of fake zeros,
 * docked/inline (no floating popups), searchable + bulk action.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import {
  Search, CircleCheck, CircleSlash, CircleDot, Loader2, Play, FileCode2, ChevronRight,
} from 'lucide-react';
import catalog from '../../admin/api-health/data/endpoint-file-map.json';

type Coverage = 'exact' | 'parent' | 'none';
interface EndpointRow {
  path: string;
  methods: string[];
  module: string;
  coverage: Coverage;
  wired: boolean;
  files: string[];
}
type ProbeState = 'idle' | 'running' | number; // number = HTTP status

const COVERAGE_META: Record<Coverage, { label: string; cls: string; Icon: typeof CircleCheck }> = {
  exact: { label: 'Wired', cls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10', Icon: CircleCheck },
  parent: { label: 'Parent', cls: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10', Icon: CircleDot },
  none: { label: 'Unwired', cls: 'text-slate-500 bg-slate-100 dark:bg-slate-700/40', Icon: CircleSlash },
};

const METHOD_CLS: Record<string, string> = {
  GET: 'text-sky-700 bg-sky-50 dark:bg-sky-500/10',
  POST: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10',
  PUT: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10',
  PATCH: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10',
  DELETE: 'text-rose-700 bg-rose-50 dark:bg-rose-500/10',
};

const ENDPOINTS = (catalog.endpoints as EndpointRow[]) || [];

/** Only parameterless GETs are safe to probe blindly (no fake-param 404 noise). */
function isProbable(e: EndpointRow): boolean {
  return e.methods.includes('GET') && !e.path.includes('{');
}

export default function ApiCatalogPanel() {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | Coverage>('all');
  const [probes, setProbes] = useState<Record<string, ProbeState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const modules = useMemo(
    () => [...new Set(ENDPOINTS.map((e) => e.module))].sort(),
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ENDPOINTS.filter((e) => {
      if (moduleFilter !== 'all' && e.module !== moduleFilter) return false;
      if (coverageFilter !== 'all' && e.coverage !== coverageFilter) return false;
      if (!q) return true;
      return (
        e.path.toLowerCase().includes(q) ||
        e.files.some((f) => f.toLowerCase().includes(q)) ||
        e.methods.some((m) => m.toLowerCase().includes(q))
      );
    });
  }, [search, moduleFilter, coverageFilter]);

  const probeOne = useCallback(async (e: EndpointRow) => {
    if (!isProbable(e)) return;
    setProbes((p) => ({ ...p, [e.path]: 'running' }));
    try {
      const res = await apiClient.get(e.path, { validateStatus: () => true });
      setProbes((p) => ({ ...p, [e.path]: res.status }));
    } catch {
      setProbes((p) => ({ ...p, [e.path]: 0 }));
    }
  }, []);

  const probeVisible = useCallback(async () => {
    setBulkRunning(true);
    const targets = filtered.filter(isProbable).slice(0, 60); // cap to keep it snappy
    // Small concurrency to avoid hammering the dev server.
    const pool = 6;
    for (let i = 0; i < targets.length; i += pool) {
      await Promise.all(targets.slice(i, i + pool).map(probeOne));
    }
    setBulkRunning(false);
  }, [filtered, probeOne]);

  const stats = useMemo(() => {
    const exact = ENDPOINTS.filter((e) => e.coverage === 'exact').length;
    const parent = ENDPOINTS.filter((e) => e.coverage === 'parent').length;
    const none = ENDPOINTS.filter((e) => e.coverage === 'none').length;
    return { exact, parent, none, total: ENDPOINTS.length };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header + KPI strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">API Catalog</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All {stats.total} backend endpoints with the frontend files that call them. Source: live OpenAPI.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <Kpi label="Wired" value={stats.exact} cls="text-emerald-600" />
          <Kpi label="Parent" value={stats.parent} cls="text-amber-600" />
          <Kpi label="Unwired" value={stats.none} cls="text-slate-500" />
          <button
            type="button"
            onClick={probeVisible}
            disabled={bulkRunning}
            className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Probe visible GETs
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search path, method or file…"
            className="w-full rounded-lg border border-slate-200 bg-white/70 py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white/70 py-1.5 px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
        >
          <option value="all">All modules ({modules.length})</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={coverageFilter}
          onChange={(e) => setCoverageFilter(e.target.value as 'all' | Coverage)}
          className="rounded-lg border border-slate-200 bg-white/70 py-1.5 px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
        >
          <option value="all">All coverage</option>
          <option value="exact">Wired</option>
          <option value="parent">Parent</option>
          <option value="none">Unwired</option>
        </select>
        <span className="text-[11px] text-slate-400">{filtered.length} shown</span>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Endpoint</th>
              <th className="px-3 py-2 font-medium">Coverage</th>
              <th className="px-3 py-2 font-medium">Frontend file</th>
              <th className="px-3 py-2 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 400).map((e) => {
              const cov = COVERAGE_META[e.coverage];
              const probe = probes[e.path];
              return (
                <tr key={e.path} className="border-t border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex gap-1">
                      {e.methods.map((m) => (
                        <span key={m} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', METHOD_CLS[m] || 'text-slate-600 bg-slate-100')}>{m}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">{e.path}</td>
                  <td className="px-3 py-1.5">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', cov.cls)}>
                      <cov.Icon className="h-3 w-3" /> {cov.label}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {e.files.length > 0 ? (
                      <span className="inline-flex items-center gap-1" title={e.files.join('\n')}>
                        <FileCode2 className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[260px]">{e.files[0].replace('apps/data360/src/', '')}</span>
                        {e.files.length > 1 && <span className="text-slate-400">+{e.files.length - 1}</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {probe === 'running' ? (
                      <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-slate-400" />
                    ) : typeof probe === 'number' ? (
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', probe >= 200 && probe < 300 ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10' : probe >= 500 || probe === 0 ? 'text-rose-700 bg-rose-50 dark:bg-rose-500/10' : 'text-amber-700 bg-amber-50 dark:bg-amber-500/10')}>
                        {probe === 0 ? 'ERR' : probe}
                      </span>
                    ) : isProbable(e) ? (
                      <button type="button" onClick={() => probeOne(e)} className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                        Probe <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 400 && (
          <div className="border-t border-slate-100 px-3 py-2 text-center text-[11px] text-slate-400 dark:border-slate-800">
            Showing first 400 of {filtered.length} — refine the search to see more.
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800/60">
      <span className={cn('font-semibold', cls)}>{value}</span>
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
    </span>
  );
}
