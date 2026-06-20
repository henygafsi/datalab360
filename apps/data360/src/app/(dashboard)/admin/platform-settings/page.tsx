'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Loader } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiSlidersHorizontalDuotone,
  PiArrowsClockwise,
  PiWarningCircleBold,
  PiPlusBold,
  PiMagnifyingGlassBold,
  PiXBold,
} from 'react-icons/pi';
import Breadcrumb from '@/components/ui/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import Pager, { usePagination } from '@/components/ui/Pager';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import {
  getPlatformConfig,
  updatePlatformConfigEntry,
  resetPlatformConfig,
  isRouteNotDeployed,
} from '@/app/services/observability';
import type { PlatformConfigEntry } from '@/app/services/observability/types';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';

/** Render a config value (object/array/scalar) as an editable string. */
function valueToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Parse the edited string back to JSON when possible, else keep as string. */
function stringToValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

/** Normalize the various shapes the backend may return into entry rows. */
function normalizeConfig(payload: unknown): PlatformConfigEntry[] {
  if (payload == null) return [];
  const p = payload as Record<string, unknown>;
  const list = p.config ?? p.data ?? payload;
  if (Array.isArray(list)) {
    return list.map((e) => {
      const r = e as Record<string, unknown>;
      return {
        key: String(r.key ?? r.name ?? ''),
        value: r.value ?? r.val ?? null,
        description: (r.description as string | undefined) ?? null,
        category: (r.category as string | undefined) ?? null,
        updated_at: (r.updated_at as string | undefined) ?? null,
        updated_by: (r.updated_by as string | undefined) ?? null,
      };
    });
  }
  // Flat dict { key: value, ... }
  if (list && typeof list === 'object') {
    return Object.entries(list as Record<string, unknown>).map(([key, value]) => ({
      key,
      value,
    }));
  }
  return [];
}

export default function PlatformSettingsPage() {
  const [entries, setEntries] = useState<PlatformConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Mutating-action gate (shared key used across this admin surface).
  const canApply = useCanPerform('gouvernance', 'apply');
  const writeBlocked = !canApply.allowed && !canApply.loading;

  // Debounced search + category filter (over the loaded entries).
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [search]);

  // New-entry rail (inline create).
  const { isOpen, open, close } = useActionPanel<'create'>();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotDeployed(false);
    try {
      const res = await getPlatformConfig();
      const rows = normalizeConfig(res);
      setEntries(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.key, valueToString(r.value)])));
    } catch (err) {
      if (isRouteNotDeployed(err)) {
        setNotDeployed(true);
      } else {
        setError(getApiErrorMessage(err));
      }
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveRow = useCallback(
    async (entry: PlatformConfigEntry) => {
      const raw = drafts[entry.key] ?? valueToString(entry.value);
      setSavingKey(entry.key);
      try {
        await updatePlatformConfigEntry(entry.key, stringToValue(raw), {
          description: entry.description ?? undefined,
          category: entry.category ?? undefined,
        });
        toast.success(`Saved ${entry.key}`);
        await load();
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      } finally {
        setSavingKey(null);
      }
    },
    [drafts, load],
  );

  const createEntry = useCallback(async () => {
    if (!newKey.trim()) {
      toast.error('Key is required');
      return;
    }
    setCreating(true);
    try {
      await updatePlatformConfigEntry(newKey.trim(), stringToValue(newValue), {
        description: newDescription.trim() || undefined,
      });
      toast.success(`Created ${newKey.trim()}`);
      setNewKey('');
      setNewValue('');
      setNewDescription('');
      close();
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [newKey, newValue, newDescription, close, load]);

  const doReset = useCallback(async () => {
    setConfirmReset(false);
    setResetting(true);
    try {
      await resetPlatformConfig();
      toast.success('Platform configuration reset to defaults');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setResetting(false);
    }
  }, [load]);

  // Distinct categories for the filter chips (only when more than one exists).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.category) set.add(e.category);
    return [...set].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (!debounced) return true;
      return (
        e.key.toLowerCase().includes(debounced) ||
        valueToString(e.value).toLowerCase().includes(debounced) ||
        (e.description ?? '').toLowerCase().includes(debounced)
      );
    });
  }, [entries, categoryFilter, debounced]);
  const page = usePagination(filtered, 12);

  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Admin', href: '/admin/data360-config' },
          { label: 'Platform Settings', href: '/admin/platform-settings' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PiSlidersHorizontalDuotone className="h-6 w-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Platform Settings</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => open('create')}
            disabled={writeBlocked}
            title={writeBlocked ? 'You do not have permission to create platform settings.' : undefined}
            className="gap-1 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <PiPlusBold className="h-3.5 w-3.5" /> New setting
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1">
            {loading ? <Loader variant="spinner" size="sm" /> : <PiArrowsClockwise className="h-3.5 w-3.5" />}
            Reload
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={resetting || loading || writeBlocked}
            title={writeBlocked ? 'You do not have permission to reset platform settings.' : undefined}
          >
            {resetting ? 'Resetting…' : 'Reset to defaults'}
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Edit platform configuration entries inline. Values are parsed as JSON when valid (numbers, booleans,
        objects), otherwise stored as plain text. Backed by <code>/api/data360/platform-config</code>.
      </p>

      {/* Inline reset confirm (no blocking modal) */}
      {confirmReset && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
            <PiWarningCircleBold className="mt-0.5 h-4 w-4 shrink-0" />
            Reset all platform configuration entries to their defaults? This is destructive and cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={doReset} disabled={resetting} className="bg-red-600 text-white hover:bg-red-700">
              {resetting ? 'Resetting…' : 'Reset to defaults'}
            </Button>
          </div>
        </div>
      )}

      {/* Search + category filter chips (only meaningful once there are entries) */}
      {!loading && !notDeployed && !error && entries.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <PiMagnifyingGlassBold className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              placeholder="Search key, value or description…"
              className="w-64 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-7 text-xs text-gray-700 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <PiXBold className="h-3 w-3" />
              </button>
            )}
          </div>
          {categories.length > 1 &&
            categories.map((c) => {
              const active = categoryFilter === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(active ? null : c)}
                  className={
                    active
                      ? 'rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white'
                      : 'rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                  }
                >
                  {c}
                </button>
              );
            })}
          <span className="ml-auto text-[11px] font-medium text-gray-400">
            {filtered.length} of {entries.length}
          </span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : notDeployed ? (
        <EmptyState
          icon={PiWarningCircleBold}
          title="Platform settings are not available yet"
          description="The configuration API is not deployed on the connected backend. It will appear here once /api/data360/platform-config is exposed."
        />
      ) : error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
          <PiWarningCircleBold className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={PiSlidersHorizontalDuotone}
          title="No configuration entries"
          description='Use "New setting" to create the first platform configuration entry.'
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PiMagnifyingGlassBold}
          title="No entries match your filter"
          description="Adjust the search term or clear the category filter to see more."
        />
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {page.slice.map((e) => {
                const draft = drafts[e.key] ?? valueToString(e.value);
                const dirty = draft !== valueToString(e.value);
                return (
                  <tr
                    key={e.key}
                    className="border-b border-gray-100 align-top hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-medium text-gray-900 dark:text-white">
                      {e.key}
                      {e.description && (
                        <div className="mt-0.5 font-sans text-[11px] font-normal text-gray-400">{e.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft}
                        onChange={(ev) => setDrafts((d) => ({ ...d, [e.key]: ev.target.value }))}
                        className="w-full min-w-[200px] font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{e.category ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {e.updated_at ? e.updated_at.replace('T', ' ').split('.')[0] : '—'}
                      {e.updated_by ? <div className="text-[11px]">{e.updated_by}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant={dirty ? 'solid' : 'outline'}
                        className={dirty ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''}
                        disabled={!dirty || savingKey === e.key || writeBlocked}
                        title={writeBlocked ? 'You do not have permission to edit platform settings.' : undefined}
                        onClick={() => saveRow(e)}
                      >
                        {savingKey === e.key ? '…' : 'Save'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="px-3 pb-2">
            <Pager
              page={page.page}
              pageCount={page.pageCount}
              total={page.total}
              from={page.from}
              to={page.to}
              onPage={page.setPage}
              unit="settings"
            />
          </div>
        </div>
      )}

      <ActionRail
        isOpen={isOpen}
        onClose={close}
        title="New platform setting"
        description="Values are parsed as JSON when valid, else stored as text."
        accentClassName="bg-indigo-500"
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={createEntry}
              disabled={creating || writeBlocked}
              title={writeBlocked ? 'You do not have permission to create platform settings.' : undefined}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Key" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. credit_rate_usd" />
          <Input label="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder='e.g. 3.0 or {"enabled":true}' className="font-mono" />
          <Input label="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          {newKey.trim() && (
            <Badge size="sm" className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              PUT /api/data360/platform-config/{newKey.trim()}
            </Badge>
          )}
        </div>
      </ActionRail>
    </div>
  );
}
