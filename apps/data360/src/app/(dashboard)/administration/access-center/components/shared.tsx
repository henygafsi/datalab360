'use client';

/**
 * Shared atoms + permission-model helpers for the Access Control Center (G9).
 *
 * The permission model is a TRI-STATE per (module:page:tab:action) coordinate:
 *   - explicit ALLOW  → an `access_level:'ALLOW'` row is stored for the role
 *   - inherit         → NO row stored (absent from the map) → falls through to
 *                       the role's default / fail-open resolution at runtime
 *   - explicit DENY   → an `access_level:'DENY'` row is stored for the role
 *
 * IMPORTANT (honesty): the enforced runtime gate (`require_action`) reads an
 * ALLOW-set; a stored DENY row may or may not be honoured at the gate depending
 * on backend build. We therefore label states by WHAT IS STORED ("explicit
 * allow / inherit / explicit deny"), never by asserted runtime effect, and we
 * round-trip both ALLOW and DENY rows verbatim through the role-permissions PUT.
 */
import { type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { RolePermission } from '@/app/services/governance/fetch_roles';
import type { EndpointUsageRow } from '@/app/services/admin-visibility';
import type { ModuleActivityRow } from '@/app/services/administration/entitlements';

// ── Module key-space bridge (frontend action-registry ↔ backend governance) ───
//
// The action-registry (UI taxonomy: `connect`, `explore_design`, `bi_reporting`,
// `analytics`, `cortex`, `org_accounts`, `data_products`, `chat`, …) and the
// entitlements / governance-posture feeds (backend feature_registry taxonomy:
// `projects`, `catalog`, `command_center`, `recommendations`, `administration`,
// …) are DIFFERENT key-spaces. Four keys match exactly (`gouvernance`,
// `data_quality`, `workflow`, `observability`); the rest do not. This is a
// best-effort, explicitly-labelled correspondence so the inline entitlement /
// posture chips populate for the surfaces that clearly map to the same governable
// area. Anything without a confident mapping falls through to the registry key
// (→ no backend match → honest "—"). The inspector always renders the REAL
// feature labels/descriptions, so a slight mismatch is visible, never hidden.
const BACKEND_MODULE_ALIAS: Record<string, string> = {
  explore_design: 'projects', // Explore & Design is where projects/models are built
  data_products: 'catalog', // Data Products surface = catalog objects (catalog_360)
  org_accounts: 'command_center', // Account / org overview = command center
};

/** Map a frontend registry module key to its backend governance key. */
export function backendModuleKey(regKey: string): string {
  return BACKEND_MODULE_ALIAS[regKey] ?? regKey;
}

/** Derive the compact usage shape from a posture activity row (best-effort). */
export function usageFromActivity(row: ModuleActivityRow | null | undefined): ModuleUsage | undefined {
  if (!row) return undefined;
  return {
    requests: row.requests ?? 0,
    errors: row.failed ?? 0,
    distinctUsers: row.distinct_users ?? 0,
    lastSeen: row.last_activity_at ?? null,
  };
}

// ── Permission tri-state model ───────────────────────────────────────────────

export type PermLevel = 'allow' | 'deny';
/** Map of `module:page:tab:action` → stored level. Absent key = inherit. */
export type PermMap = Map<string, PermLevel>;

/**
 * Display-only cell state. EXTENDS the stored {@link PermLevel} with `'default'`
 * — the fail-open runtime decision the backend returns (`source:'default'`) for a
 * coordinate NOT covered by the role's matrix. It is allowed *only because the
 * gate fails open*, not because of an intentional grant, so it must render
 * distinctly from an explicit ALLOW. This state appears ONLY in the read-only
 * "Test user" (effective) view; it MUST NEVER enter a {@link PermMap}, the cycle
 * editor, or the role-permissions PUT (that would persist a fake grant row).
 */
export type CellState = PermLevel | 'default';
/** Display map for the read-only effective ("Test user") view. */
export type DisplayMap = Map<string, CellState>;

export const keyOf = (m: string, p: string, t: string, a: string) =>
  `${m}:${p}:${t}:${a}`;

/** Build the tri-state map from a role's stored rows (both ALLOW and DENY). */
export function buildPermMap(perms: RolePermission[]): PermMap {
  const map: PermMap = new Map();
  for (const p of perms) {
    const lvl = String(p.access_level || 'ALLOW').toUpperCase();
    map.set(
      keyOf(p.module, p.page, p.tab ?? '*', p.action),
      lvl === 'DENY' ? 'deny' : 'allow',
    );
  }
  return map;
}

/** Serialize the tri-state map back to the wholesale-replace payload. */
export function permMapToPermissions(map: PermMap): RolePermission[] {
  return [...map.entries()].map(([k, lvl]) => {
    const [module, page, tab, action] = k.split(':');
    return {
      module,
      page,
      tab,
      action,
      access_level: lvl === 'deny' ? ('DENY' as const) : ('ALLOW' as const),
    };
  });
}

/** True when the two maps differ (dirty check). */
export function mapsDiffer(a: PermMap, b: PermMap): boolean {
  if (a.size !== b.size) return true;
  for (const [k, v] of a) if (b.get(k) !== v) return true;
  return false;
}

/** Cycle a single cell: inherit → allow → deny → inherit. */
export function cycleLevel(cur: PermLevel | undefined): PermLevel | undefined {
  if (cur === undefined) return 'allow';
  if (cur === 'allow') return 'deny';
  return undefined;
}

// ── Usage attribution (best-effort, honest "—" when absent) ──────────────────

export interface ModuleUsage {
  requests: number;
  errors: number;
  distinctUsers: number;
  lastSeen: string | null;
}

/** Aggregate per-route endpoint-usage rows into a per-module rollup. */
export function usageByModule(rows: EndpointUsageRow[]): Map<string, ModuleUsage> {
  const m = new Map<string, ModuleUsage>();
  for (const r of rows) {
    const key = (r.module ?? '').trim();
    if (!key) continue;
    const cur = m.get(key) ?? { requests: 0, errors: 0, distinctUsers: 0, lastSeen: null };
    cur.requests += r.count ?? 0;
    cur.errors += r.errors ?? 0;
    cur.distinctUsers = Math.max(cur.distinctUsers, r.distinct_users ?? 0);
    if (r.last_seen && (!cur.lastSeen || r.last_seen > cur.lastSeen)) cur.lastSeen = r.last_seen;
    m.set(key, cur);
  }
  return m;
}

// ── Tiny shared UI atoms ─────────────────────────────────────────────────────

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-6 text-xs text-slate-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="flex-1">
        <span className="break-words">{message}</span>
        {onRetry && (
          <>
            {' '}
            <button type="button" className="underline" onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Quiet "not available" chip — the honest placeholder for a missing feed. */
export function NA({ title }: { title?: string }) {
  return (
    <span className="text-[10px] text-slate-400 dark:text-slate-500" title={title}>
      —
    </span>
  );
}

export function Chip({
  children,
  tone = 'slate',
  title,
}: {
  children: ReactNode;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky';
  title?: string;
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
