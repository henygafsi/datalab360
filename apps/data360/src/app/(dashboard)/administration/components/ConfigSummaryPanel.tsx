'use client';

/**
 * ConfigSummaryPanel — read-only inline view of platform configuration for the
 * Administration hub's "Config & Settings" tab, so the tab shows the actual
 * config state instead of only links. Full CRUD stays on /admin/platform-settings.
 *
 * GET /api/data360/platform-config (same feed as Platform Settings).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  getPlatformConfig,
  type PlatformConfigEntry,
} from '@/app/services/observability';

function shortValue(value: unknown): string {
  if (value == null) return '—';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

export default function ConfigSummaryPanel() {
  const [entries, setEntries] = useState<PlatformConfigEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPlatformConfig();
      // Live envelope is {configs, total, categories}; the typed contract said
      // {config} — accept both so the panel doesn't report "0 entries" against
      // a provisioned store.
      const raw = res as unknown as {
        config?: PlatformConfigEntry[];
        configs?: PlatformConfigEntry[] | Record<string, PlatformConfigEntry[]>;
      };
      // The live envelope ships `configs` as a DICT keyed by category
      // ({ ai: [...], cache: [...], ... }), not a flat array — feeding that
      // straight to `.forEach` threw and blanked the whole Config tab. Accept
      // all three shapes: flat `configs` array, dict-by-category, or `config`.
      let list: PlatformConfigEntry[] = [];
      if (Array.isArray(raw.configs)) {
        list = raw.configs;
      } else if (raw.configs && typeof raw.configs === 'object') {
        list = Object.values(raw.configs).flat();
      } else if (Array.isArray(raw.config)) {
        list = raw.config;
      }
      setEntries(list);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, PlatformConfigEntry[]>();
    (entries ?? []).forEach((e) => {
      const cat = e.category || 'general';
      const list = groups.get(cat) ?? [];
      list.push(e);
      groups.set(cat, list);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Settings2 className="h-4 w-4 text-[hsl(var(--primary))]" />
            Current platform configuration
          </h2>
          <p className="text-[11px] text-slate-400">
            {entries ? `${entries.length} entries · read-only — edit in Platform Settings` : 'Read-only summary'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Could not load platform configuration
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {!loading && !error && (entries?.length ?? 0) === 0 && (
        <div className="p-6">
          <EmptyState
            icon={Settings2}
            compact
            title="No configuration entries"
            description="Platform settings have not been provisioned on this environment yet."
          />
        </div>
      )}

      {!loading && !error && (entries?.length ?? 0) > 0 && (
        <div className="scrollbar-thin max-h-[420px] overflow-auto">
          {byCategory.map(([category, list]) => (
            <div key={category}>
              <p className="sticky top-0 border-y border-slate-100 bg-slate-50/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 first:border-t-0 dark:border-slate-800 dark:bg-slate-900/95">
                {category} · {list.length}
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {list.map((e) => (
                  <div key={e.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {e.key}
                      </p>
                      {e.description ? (
                        <p className="truncate text-[10px] text-slate-400">{e.description}</p>
                      ) : null}
                    </div>
                    <span
                      className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      title={shortValue(e.value)}
                    >
                      {shortValue(e.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
