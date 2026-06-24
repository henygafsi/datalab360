'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Loader } from 'rizzui';
import {
  PiArrowUpDuotone,
  PiArrowDownDuotone,
  PiTreeStructureDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import { ActionRail } from '@/app/shared/action-rail';
import { getObjectDependencies, isRouteNotDeployed } from '@/app/services/observability';
import { getApiErrorMessage } from '@/lib/api-client';
import { EM_DASH } from '@/app/shared/ui/format';

/**
 * Freshness -> Lineage drill-down.
 *
 * Given an object the user just probed for freshness, this drawer answers the two
 * questions a data-role power user asks next about a stale table:
 *   - "What feeds it?"        -> upstream  (direction=upstream)
 *   - "What does it break?"   -> downstream (direction=downstream)
 *
 * Both sides come from the existing /observability/dependencies endpoint (already
 * in the observability service). No new backend route. Honest async states: a
 * single loader while both calls run, inline "—" empties per side, an inline error
 * carrying the backend message, and a graceful "not deployed yet" for 404/501.
 */

interface DepRow {
  referencing_object_name?: string;
  REFERENCING_OBJECT_NAME?: string;
  referencing_object_domain?: string;
  REFERENCING_OBJECT_DOMAIN?: string;
  referenced_object_name?: string;
  REFERENCED_OBJECT_NAME?: string;
  referenced_object_domain?: string;
  REFERENCED_OBJECT_DOMAIN?: string;
}

interface DepNode {
  name: string;
  domain: string;
}

/** Pull the relevant counterpart object out of a dependency row, casing-agnostic. */
function pickNode(row: DepRow, side: 'referencing' | 'referenced'): DepNode {
  if (side === 'referencing') {
    return {
      name: row.referencing_object_name ?? row.REFERENCING_OBJECT_NAME ?? EM_DASH,
      domain: row.referencing_object_domain ?? row.REFERENCING_OBJECT_DOMAIN ?? EM_DASH,
    };
  }
  return {
    name: row.referenced_object_name ?? row.REFERENCED_OBJECT_NAME ?? EM_DASH,
    domain: row.referenced_object_domain ?? row.REFERENCED_OBJECT_DOMAIN ?? EM_DASH,
  };
}

/** Dependency payloads are Snowflake-loose: array, {dependencies:[…]}, or {data:[…]}. */
function extractDeps(result: unknown): DepRow[] {
  if (Array.isArray(result)) return result as DepRow[];
  const r = (result ?? {}) as Record<string, unknown>;
  const raw = r.dependencies ?? r.data ?? [];
  return Array.isArray(raw) ? (raw as DepRow[]) : [];
}

/** De-duplicate counterpart nodes by name so repeated column-level edges collapse. */
function toNodes(rows: DepRow[], side: 'referencing' | 'referenced'): DepNode[] {
  const seen = new Set<string>();
  const out: DepNode[] = [];
  for (const row of rows) {
    const node = pickNode(row, side);
    if (node.name === EM_DASH || seen.has(node.name)) continue;
    seen.add(node.name);
    out.push(node);
  }
  return out;
}

function DepSection({
  icon: Icon,
  title,
  hint,
  nodes,
}: {
  icon: typeof PiArrowUpDuotone;
  title: string;
  hint: string;
  nodes: DepNode[] | null;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {nodes ? (
          <Badge size="sm" variant="flat" color="primary">
            {nodes.length}
          </Badge>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      {nodes == null ? null : nodes.length === 0 ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          No {title.toLowerCase()} found in the selected window.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {nodes.map((n) => (
            <li
              key={n.name}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
            >
              <span className="truncate font-mono">{n.name}</span>
              <Badge
                size="sm"
                variant="flat"
                className="shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                {n.domain}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function LineageDrilldownDrawer({
  objectName,
  onClose,
}: {
  /** FQN (or bare name) just probed; null closes the drawer. */
  objectName: string | null;
  onClose: () => void;
}) {
  const [upstream, setUpstream] = useState<DepNode[] | null>(null);
  const [downstream, setDownstream] = useState<DepNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);

  const load = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    setNotDeployed(false);
    setUpstream(null);
    setDownstream(null);
    try {
      const [up, down] = await Promise.all([
        getObjectDependencies({ object_name: name, direction: 'upstream', days: 30 }),
        getObjectDependencies({ object_name: name, direction: 'downstream', days: 30 }),
      ]);
      // upstream call -> this object references X -> the upstream object is `referenced`.
      setUpstream(toNodes(extractDeps(up), 'referenced'));
      // downstream call -> X references this object -> the downstream object is `referencing`.
      setDownstream(toNodes(extractDeps(down), 'referencing'));
    } catch (err) {
      if (isRouteNotDeployed(err)) setNotDeployed(true);
      else setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (objectName) load(objectName);
  }, [objectName, load]);

  return (
    <ActionRail
      isOpen={!!objectName}
      onClose={onClose}
      title="Lineage drill-down"
      description={objectName ?? undefined}
      accentClassName="bg-indigo-500"
    >
      {notDeployed ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400">
          <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Object dependencies are not deployed on the connected backend yet
            (/observability/dependencies).
          </span>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
          <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10">
          <Loader />
        </div>
      ) : (
        <div className="space-y-5">
          <DepSection
            icon={PiArrowUpDuotone}
            title="Upstream"
            hint="Objects that feed this one. If any are stale, this object's freshness is suspect."
            nodes={upstream}
          />
          <DepSection
            icon={PiArrowDownDuotone}
            title="Downstream"
            hint="Objects that depend on this one. Staleness here cascades to these consumers."
            nodes={downstream}
          />
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <a
              href="/observability/dependencies"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <PiTreeStructureDuotone className="h-4 w-4" />
              Open full Dependencies view
            </a>
          </div>
        </div>
      )}
    </ActionRail>
  );
}
