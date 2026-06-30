'use client';

/**
 * RoleHierarchyPanel — read-only, collapsible role inventory docked on the
 * Roles page (backlog §E item 8 / B2.1).
 *
 * Surfaces GET /command-center/role-hierarchy (SHOW ROLES) — wired only into
 * command-center until now. Per role it exposes audit COUNTS:
 *   • user_count        — users assigned this role
 *   • granted_to_roles  — number of PARENT roles (this role is granted INTO)
 *   • granted_roles     — number of CHILD roles (granted INTO this role)
 * SHOW ROLES exposes those as integer counts, NOT the parent/child role NAMES,
 * so this panel is an honest inventory of counts rather than a drawn edge-graph.
 * To see the real inheritance edges for one role, click it to open the docked
 * Role inspector (SHOW GRANTS TO ROLE). Counts let an admin spot over-broad
 * roles (many users / many children) and dead roles (0 users) at a glance.
 *
 * Honest-state notes:
 *   • getRoleHierarchy() swallows its own errors (→ {data:[]}), so this panel
 *     ships loading + empty only; "unavailable" folds into the empty copy by
 *     design — every existing consumer of this endpoint degrades the same way.
 *   • A count can be a legitimate 0 (the dead/over-broad signal) — we render
 *     null as '—' but ALWAYS render a real 0.
 *   • Display is gated by useCanPerform('gouvernance','view'); a denied caller
 *     never sees the panel. Read-only — no mutating controls, no gating beyond
 *     the view gate.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitBranch,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Users,
  ArrowUp,
  ArrowDown,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import { getRoleHierarchy } from '@/app/services/command-center';
import { useCanPerform } from '@/hooks/useCanPerform';

interface RoleHierarchyRow {
  role_name?: string | null;
  user_count?: number | null;
  granted_to_roles?: number | null; // # parent roles (granted INTO)
  granted_roles?: number | null; // # child roles (granted into this role)
  owner?: string | null;
  comment?: string | null;
}

/** Numbers: keep a real 0, render only null/undefined as '—'. */
const num = (v: number | null | undefined): string =>
  v == null ? '—' : Number(v).toLocaleString();
const txt = (v: string | null | undefined): string =>
  v == null || v === '' ? '—' : v;

export interface RoleHierarchyPanelProps {
  /** Bump to force a refetch (e.g. after a role mutation elsewhere on the page). */
  refreshSignal?: number;
  /** Open the docked Role inspector for a role (the real SHOW GRANTS TO ROLE edges). */
  onInspectRole?: (role: string) => void;
}

/** Small labelled count pill. */
function CountPill({
  icon,
  value,
  label,
  title,
}: {
  icon: React.ReactNode;
  value: number | null | undefined;
  label: string;
  title: string;
}) {
  const zero = value === 0;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums ${
        zero
          ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500'
          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
      }`}
    >
      {icon}
      <span className="font-medium">{num(value)}</span>
      <span className="hidden text-slate-400 sm:inline">{label}</span>
    </span>
  );
}

export default function RoleHierarchyPanel({
  refreshSignal,
  onInspectRole,
}: RoleHierarchyPanelProps) {
  const canView = useCanPerform('gouvernance', 'view');

  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<RoleHierarchyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // getRoleHierarchy() never rejects — it degrades to {data:[]} on any error.
      const res = await getRoleHierarchy();
      setRows((res?.data ?? []) as RoleHierarchyRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const toggleExpand = useCallback((role: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => (r.role_name ?? '').toUpperCase().includes(q));
  }, [rows, filter]);

  // Denied (explicit, post-load) → hide the panel entirely. While the permission
  // set is still loading we keep rendering so the panel never flash-hides.
  if (!canView.loading && !canView.allowed) return null;

  return (
    <div className="rounded-xl border border-muted bg-white dark:bg-gray-800">
      {/* Card header — collapse toggle + count + refresh */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <GitBranch className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            Role hierarchy
          </span>
          {!loading && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {rows.length} role{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void load();
          }}
          disabled={loading}
          title="Refresh role inventory"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {open && (
        <div className="border-t border-muted px-4 py-3">
          {/* Honest framing: these are inheritance COUNTS, not drawn edges. */}
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Per-role inheritance counts (parents · children) and assigned-user
            totals. These are counts, not the named links — click a role to open
            the inspector and see its actual granted roles &amp; object grants.
          </p>

          {/* Filter */}
          <div className="relative mb-3 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter roles…"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
              Loading role inventory…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {rows.length === 0
                ? 'No roles to display — the role inventory is empty or currently unavailable.'
                : `No roles match “${filter.trim()}”.`}
            </div>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {filtered.map((r, i) => {
                const role = r.role_name ?? '';
                const isOpen = role !== '' && expanded.has(role);
                const noUsers = r.user_count === 0;
                return (
                  <li
                    key={`${role || 'role'}-${i}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => role && toggleExpand(role)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                        {txt(role)}
                      </span>
                      {noUsers && (
                        <span className="hidden shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 md:inline">
                          no users
                        </span>
                      )}
                      <span className="flex shrink-0 items-center gap-1">
                        <CountPill
                          icon={<Users className="h-3 w-3 text-slate-400" />}
                          value={r.user_count}
                          label="users"
                          title="Users assigned this role"
                        />
                        <CountPill
                          icon={<ArrowUp className="h-3 w-3 text-slate-400" />}
                          value={r.granted_to_roles}
                          label="parents"
                          title="Number of parent roles (this role is granted into them)"
                        />
                        <CountPill
                          icon={<ArrowDown className="h-3 w-3 text-slate-400" />}
                          value={r.granted_roles}
                          label="children"
                          title="Number of child roles (granted into this role)"
                        />
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 px-2.5 py-2 dark:border-slate-800">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
                          <div className="flex gap-1.5">
                            <dt className="text-slate-400">Owner</dt>
                            <dd className="font-mono text-slate-600 dark:text-slate-300">
                              {txt(r.owner)}
                            </dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt className="text-slate-400">Comment</dt>
                            <dd className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                              {txt(r.comment)}
                            </dd>
                          </div>
                        </dl>
                        {onInspectRole && role && (
                          <button
                            type="button"
                            onClick={() => onInspectRole(role)}
                            className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Inspect grants &amp; hierarchy
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
