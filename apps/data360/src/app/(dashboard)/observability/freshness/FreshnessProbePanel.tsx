'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Button, Input, Loader, Badge } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiPulseDuotone,
  PiTableDuotone,
  PiStackDuotone,
  PiClockCountdownDuotone,
  PiArrowsClockwiseDuotone,
  PiLightningDuotone,
  PiTreeStructureDuotone,
} from 'react-icons/pi';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LineageDrilldownDrawer from './LineageDrilldownDrawer';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  probePlatformFreshness,
  probeTableFreshness,
  probeSchemaFreshness,
  probeChanges,
  isRouteNotDeployed,
} from '@/app/services/observability';
// Reuses the org-accounts CDC hooks (read/import only — owned by that module).
import {
  getRowTimestampStatus,
  activateRowTimestamps,
} from '@/app/services/org-accounts/hooks';
import { getApiErrorMessage } from '@/lib/api-client';
import { EM_DASH, fmtNum } from '@/app/shared/ui/format';

/**
 * Freshness Probe panel — surfaces the four /observability/probes/* row-timestamp
 * endpoints (METADATA$ROW_LAST_MODIFIED_AT) plus the org-accounts CDC enable/status
 * hook as a single data-steward control. These endpoints existed in the service
 * layer but were only exercised by the api-health smoke test; this panel is their
 * first real user surface.
 *
 * Every lane owns honest async states: per-lane loading, inline empty "—", and a
 * toast carrying the backend message on failure. A 404/501 degrades to an inline
 * "not deployed yet" note rather than a crash. Reads are ungated (GET); the single
 * mutation (activate row timestamps = ALTER TABLE on every table in a DB) is behind
 * a confirm dialog and the backend enforces privilege (a denied click surfaces the
 * 403/422 message verbatim).
 */

// ---- shared shapes (probe responses are Snowflake-loose; pick defensively) -----
interface ProbeRow {
  name: string;
  last_modified?: string | null;
  seconds_ago?: number | null;
  row_count?: number | null;
  bytes?: number | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Pull the freshness fields out of one probe object regardless of key casing. */
function toProbeFields(o: Record<string, unknown>): Omit<ProbeRow, 'name'> {
  const lower: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) lower[k.toLowerCase()] = val;
  return {
    last_modified: str(lower['last_modified']) ?? str(lower['last_modified_at']),
    seconds_ago: num(lower['seconds_ago']),
    row_count: num(lower['row_count']),
    bytes: num(lower['bytes']),
  };
}

/**
 * Normalize any probe payload into rows. Handles the documented platform shape
 * `{ probes: { NAME: {...} } }`, a bare `{ NAME: {...} }` map, an array of objects,
 * and a single-object response (table probe).
 */
function normalizeProbes(payload: unknown, fallbackName = 'result'): ProbeRow[] {
  const root = asRecord(payload);
  const map = asRecord(root['probes'] ?? root['tables'] ?? root['data'] ?? root);

  // Array case
  const arr = root['probes'] ?? root['tables'] ?? root['data'] ?? payload;
  if (Array.isArray(arr)) {
    return arr
      .map((item, i) => {
        const o = asRecord(item);
        const name =
          str(o['table_name'] ?? o['TABLE_NAME']) ??
          str(o['name'] ?? o['NAME']) ??
          `${fallbackName} ${i + 1}`;
        return { name, ...toProbeFields(o) };
      })
      .filter(Boolean);
  }

  // Single-object freshness response (table probe) — no nested map of objects.
  const looksLikeSingle =
    'last_modified' in map ||
    'seconds_ago' in map ||
    'LAST_MODIFIED' in map ||
    'SECONDS_AGO' in map;
  if (looksLikeSingle) {
    const name =
      str(map['table'] ?? map['TABLE'] ?? map['table_name'] ?? map['TABLE_NAME']) ??
      fallbackName;
    return [{ name, ...toProbeFields(map) }];
  }

  // Map-of-objects case (the documented platform shape).
  return Object.entries(map)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([name, v]) => ({ name, ...toProbeFields(asRecord(v)) }));
}

// ---- formatting -----------------------------------------------------------------
function humanizeAgo(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return EM_DASH;
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s ago`;
  const h = Math.floor(seconds / 3600);
  if (h < 24) return `${h}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  const d = Math.floor(seconds / 86400);
  return `${d}d ${Math.floor((seconds % 86400) / 3600)}h ago`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return EM_DASH;
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type Staleness = { color: 'success' | 'warning' | 'danger'; label: string };
function staleness(seconds: number | null | undefined): Staleness {
  if (seconds == null) return { color: 'warning', label: 'Unknown' };
  if (seconds < 3600) return { color: 'success', label: 'Fresh' };
  if (seconds < 86400) return { color: 'warning', label: 'Aging' };
  return { color: 'danger', label: 'Stale' };
}

// ---- reusable result table ------------------------------------------------------
function ProbeTable({
  rows,
  onLineage,
  onDetectChanges,
}: {
  rows: ProbeRow[];
  /** Drill from a probed object into its upstream/downstream lineage. */
  onLineage?: (name: string) => void;
  /** Prefill the "changes since" lane with this object. */
  onDetectChanges?: (name: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => (b.seconds_ago ?? -1) - (a.seconds_ago ?? -1));
  const showActions = Boolean(onLineage || onDetectChanges);
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Object</th>
            <th className="px-3 py-2 font-medium">Last modified</th>
            <th className="px-3 py-2 font-medium">Freshness</th>
            <th className="px-3 py-2 text-right font-medium">Rows</th>
            <th className="px-3 py-2 text-right font-medium">Size</th>
            <th className="px-3 py-2 font-medium">Status</th>
            {showActions ? <th className="px-3 py-2 text-right font-medium">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map((r) => {
            const s = staleness(r.seconds_ago);
            return (
              <tr key={r.name} className="text-slate-700 dark:text-slate-200">
                <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
                <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {r.last_modified ? new Date(r.last_modified).toLocaleString() : EM_DASH}
                </td>
                <td className="px-3 py-2 text-xs">{humanizeAgo(r.seconds_ago)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.row_count == null ? EM_DASH : fmtNum(r.row_count)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatBytes(r.bytes)}</td>
                <td className="px-3 py-2">
                  <Badge color={s.color} variant="flat" size="sm">
                    {s.label}
                  </Badge>
                </td>
                {showActions ? (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {onLineage ? (
                        <Button
                          size="sm"
                          variant="text"
                          className="gap-1 px-2 text-xs text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                          onClick={() => onLineage(r.name)}
                          title="Show upstream / downstream dependencies"
                        >
                          <PiTreeStructureDuotone className="h-3.5 w-3.5" />
                          Lineage
                        </Button>
                      ) : null}
                      {onDetectChanges ? (
                        <Button
                          size="sm"
                          variant="text"
                          className="gap-1 px-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/40"
                          onClick={() => onDetectChanges(r.name)}
                          title="Prefill the change-detection lane with this object"
                        >
                          <PiClockCountdownDuotone className="h-3.5 w-3.5" />
                          Changes
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- section shell --------------------------------------------------------------
function Lane({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function InlineNote({ kind, children }: { kind: 'empty' | 'error' | 'info'; children: ReactNode }) {
  const cls =
    kind === 'error'
      ? 'border-red-100 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400'
      : kind === 'info'
        ? 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400'
        : 'border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400';
  return <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${cls}`}>{children}</div>;
}

// =============================================================================
// MAIN PANEL
// =============================================================================
export default function FreshnessProbePanel() {
  // ---- Lineage drill-down (freshness -> dependencies) ----
  // A probed object's natural next question: what feeds it / what does it break.
  // Reuses /observability/dependencies via the drawer; null = closed.
  const [lineageTarget, setLineageTarget] = useState<string | null>(null);
  // Anchor so the "Changes" per-row action can scroll the change-detection lane
  // into view after prefilling it (see prefillChanges below).
  const changesLaneRef = useRef<HTMLDivElement>(null);

  // ---- Platform metadata (zero-input, auto-loaded) ----
  const [platRows, setPlatRows] = useState<ProbeRow[] | null>(null);
  const [platLoading, setPlatLoading] = useState(false);
  const [platErr, setPlatErr] = useState<string | null>(null);
  const [platNd, setPlatNd] = useState(false);

  const loadPlatform = useCallback(async () => {
    setPlatLoading(true);
    setPlatErr(null);
    setPlatNd(false);
    try {
      const res = await probePlatformFreshness();
      setPlatRows(normalizeProbes(res));
    } catch (err) {
      if (isRouteNotDeployed(err)) setPlatNd(true);
      else setPlatErr(getApiErrorMessage(err));
      setPlatRows(null);
    } finally {
      setPlatLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlatform();
  }, [loadPlatform]);

  // ---- Table probe ----
  const [tbl, setTbl] = useState('');
  const [tblRows, setTblRows] = useState<ProbeRow[] | null>(null);
  const [tblLoading, setTblLoading] = useState(false);

  const probeTable = useCallback(async () => {
    const t = tbl.trim();
    if (!t) {
      toast.error('Enter a fully-qualified table (DB.SCHEMA.TABLE)');
      return;
    }
    setTblLoading(true);
    try {
      const res = await probeTableFreshness(t);
      setTblRows(normalizeProbes(res, t));
    } catch (err) {
      toast.error(isRouteNotDeployed(err) ? 'Freshness probe is not deployed yet.' : getApiErrorMessage(err));
      setTblRows(null);
    } finally {
      setTblLoading(false);
    }
  }, [tbl]);

  // ---- Schema probe ----
  const [schDb, setSchDb] = useState('');
  const [schSchema, setSchSchema] = useState('');
  const [schRows, setSchRows] = useState<ProbeRow[] | null>(null);
  const [schLoading, setSchLoading] = useState(false);

  const probeSchema = useCallback(async () => {
    if (!schDb.trim() || !schSchema.trim()) {
      toast.error('Enter both database and schema');
      return;
    }
    setSchLoading(true);
    try {
      const res = await probeSchemaFreshness(schDb.trim(), schSchema.trim());
      setSchRows(normalizeProbes(res));
    } catch (err) {
      toast.error(isRouteNotDeployed(err) ? 'Schema probe is not deployed yet.' : getApiErrorMessage(err));
      setSchRows(null);
    } finally {
      setSchLoading(false);
    }
  }, [schDb, schSchema]);

  // ---- Changes since ----
  const [chgTbl, setChgTbl] = useState('');
  const [chgSince, setChgSince] = useState('');
  const [chgCount, setChgCount] = useState<number | null>(null);
  const [chgMsg, setChgMsg] = useState<string | null>(null);
  const [chgLoading, setChgLoading] = useState(false);

  const detectChanges = useCallback(async () => {
    if (!chgTbl.trim() || !chgSince) {
      toast.error('Enter a table and a "since" timestamp');
      return;
    }
    setChgLoading(true);
    setChgMsg(null);
    setChgCount(null);
    try {
      // datetime-local → ISO with Z
      const iso = new Date(chgSince).toISOString();
      const res = await probeChanges(chgTbl.trim(), iso);
      const r = asRecord(res);
      const c =
        num(r['changed_rows']) ??
        num(r['changes']) ??
        num(r['count']) ??
        num(r['row_count']);
      setChgCount(c);
      if (c == null) setChgMsg('Probe ran but returned no change count.');
    } catch (err) {
      toast.error(isRouteNotDeployed(err) ? 'Change detection is not deployed yet.' : getApiErrorMessage(err));
    } finally {
      setChgLoading(false);
    }
  }, [chgTbl, chgSince]);

  // Cross-lane prefill: a per-row "Changes" action drops the object into the
  // change-detection lane and scrolls it into view (the user still picks a "since").
  const prefillChanges = useCallback((name: string) => {
    setChgTbl(name);
    changesLaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ---- CDC / row-change tracking (org-accounts hook) ----
  const [cdcDb, setCdcDb] = useState('');
  const [cdcSchema, setCdcSchema] = useState('');
  const [cdcTables, setCdcTables] = useState<RowTimestampTable[] | null>(null);
  const [cdcLoading, setCdcLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);

  // Activate (ALTER TABLE ... SET CHANGE_TRACKING across a DB) is the one mutation
  // on this page; the four probe lanes are reads (ungated). There is no dedicated
  // observability action-registry key for change-tracking yet, so we reuse the
  // module's verified "configure monitoring" admin-tier key (the same one alerts/
  // slo gate with) rather than invent an unverified key — useCanPerform does exact
  // module+action matching with no admin bypass, so a guessed key could mis-block
  // legitimate admins. Fail-open while the allow-set loads (mirrors budget/page).
  // The backend remains the hard guard: a denied click 403/422s and we surface it.
  // TODO(integrator): register an 'activate-change-tracking' action key + tuple.
  const cdcPerm = useCanPerform('observability', 'configure-alerts');
  const canActivate = cdcPerm.allowed || cdcPerm.loading;
  const activateDeniedTitle =
    'You lack the configure permission on observability. Ask an administrator to grant it.';

  const loadCdc = useCallback(async () => {
    if (!cdcDb.trim()) {
      toast.error('Enter a database');
      return;
    }
    setCdcLoading(true);
    try {
      const res = await getRowTimestampStatus(cdcDb.trim(), cdcSchema.trim() || undefined);
      setCdcTables(Array.isArray(res?.tables) ? res.tables : []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
      setCdcTables(null);
    } finally {
      setCdcLoading(false);
    }
  }, [cdcDb, cdcSchema]);

  const doActivate = useCallback(async () => {
    setConfirmActivate(false);
    setActivating(true);
    try {
      const res = await activateRowTimestamps(cdcDb.trim());
      toast.success(
        `Row timestamps activated on ${fmtNum(res?.tables_count ?? 0)} table(s) in ${cdcDb.trim().toUpperCase()}`,
      );
      await loadCdc();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setActivating(false);
    }
  }, [cdcDb, loadCdc]);

  const btn = 'gap-2 bg-indigo-600 text-white hover:bg-indigo-700';

  return (
    <div className="space-y-4">
      {/* Platform metadata */}
      <Lane
        icon={PiPulseDuotone}
        title="Platform metadata freshness"
        description="Row-timestamp probe across all Data360 internal metadata tables. Stalest first."
      >
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={loadPlatform} disabled={platLoading} className={btn}>
            {platLoading ? <Loader size="sm" /> : <PiArrowsClockwiseDuotone className="h-4 w-4" />}
            Re-probe
          </Button>
          {platRows && !platLoading ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {platRows.length} table(s) probed
            </span>
          ) : null}
        </div>
        {platNd ? (
          <InlineNote kind="info">
            The platform freshness probe is not deployed on the connected backend yet.
          </InlineNote>
        ) : platErr ? (
          <InlineNote kind="error">{platErr}</InlineNote>
        ) : platLoading && !platRows ? (
          <div className="mt-4 flex justify-center">
            <Loader />
          </div>
        ) : platRows && platRows.length > 0 ? (
          <ProbeTable rows={platRows} onLineage={setLineageTarget} onDetectChanges={prefillChanges} />
        ) : platRows ? (
          <InlineNote kind="empty">No metadata tables returned a row timestamp.</InlineNote>
        ) : null}
      </Lane>

      {/* Table probe */}
      <Lane
        icon={PiTableDuotone}
        title="Probe a table"
        description="Check when a single table was last modified (METADATA$ROW_LAST_MODIFIED_AT)."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Table to probe (database.schema.table)"
            placeholder="DB.SCHEMA.TABLE"
            value={tbl}
            onChange={(e) => setTbl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && probeTable()}
            className="flex-1"
          />
          <Button onClick={probeTable} disabled={tblLoading} className={btn}>
            {tblLoading ? <Loader size="sm" /> : <PiClockCountdownDuotone className="h-4 w-4" />}
            Probe
          </Button>
        </div>
        {tblRows && tblRows.length > 0 ? (
          <ProbeTable rows={tblRows} onLineage={setLineageTarget} onDetectChanges={prefillChanges} />
        ) : tblRows ? (
          <InlineNote kind="empty">No freshness data returned for this table.</InlineNote>
        ) : null}
      </Lane>

      {/* Schema probe */}
      <Lane
        icon={PiStackDuotone}
        title="Probe a schema"
        description="Row-timestamp freshness for every table in a schema, ranked by staleness."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Database to probe"
            placeholder="Database"
            value={schDb}
            onChange={(e) => setSchDb(e.target.value)}
            className="flex-1"
          />
          <Input
            aria-label="Schema to probe"
            placeholder="Schema"
            value={schSchema}
            onChange={(e) => setSchSchema(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && probeSchema()}
            className="flex-1"
          />
          <Button onClick={probeSchema} disabled={schLoading} className={btn}>
            {schLoading ? <Loader size="sm" /> : <PiStackDuotone className="h-4 w-4" />}
            Probe
          </Button>
        </div>
        {schRows && schRows.length > 0 ? (
          <ProbeTable rows={schRows} onLineage={setLineageTarget} onDetectChanges={prefillChanges} />
        ) : schRows ? (
          <InlineNote kind="empty">No tables returned a row timestamp for this schema.</InlineNote>
        ) : null}
      </Lane>

      {/* Changes since */}
      <div ref={changesLaneRef}>
      <Lane
        icon={PiClockCountdownDuotone}
        title="Detect changes since a timestamp"
        description="Count rows changed since a point in time — drives intelligent / incremental refresh."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Table for change detection (database.schema.table)"
            placeholder="DB.SCHEMA.TABLE"
            value={chgTbl}
            onChange={(e) => setChgTbl(e.target.value)}
            className="flex-1"
          />
          <Input
            aria-label="Detect changes since this date and time"
            type="datetime-local"
            value={chgSince}
            onChange={(e) => setChgSince(e.target.value)}
            className="flex-1"
          />
          <Button onClick={detectChanges} disabled={chgLoading} className={btn}>
            {chgLoading ? <Loader size="sm" /> : <PiClockCountdownDuotone className="h-4 w-4" />}
            Detect
          </Button>
        </div>
        {chgCount != null ? (
          <InlineNote kind={chgCount > 0 ? 'info' : 'empty'}>
            <span className="font-semibold">{fmtNum(chgCount)}</span> row(s) changed since{' '}
            {chgSince ? new Date(chgSince).toLocaleString() : EM_DASH}.
          </InlineNote>
        ) : chgMsg ? (
          <InlineNote kind="empty">{chgMsg}</InlineNote>
        ) : null}
      </Lane>
      </div>

      {/* CDC / row-change tracking */}
      <Lane
        icon={PiLightningDuotone}
        title="Change tracking (CDC)"
        description="Check which tables carry row timestamps, and activate tracking across a database."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Database for change tracking"
            placeholder="Database"
            value={cdcDb}
            onChange={(e) => setCdcDb(e.target.value)}
            className="flex-1"
          />
          <Input
            aria-label="Schema for change tracking (optional)"
            placeholder="Schema (optional)"
            value={cdcSchema}
            onChange={(e) => setCdcSchema(e.target.value)}
            className="flex-1"
          />
          <Button onClick={loadCdc} disabled={cdcLoading} variant="outline" className="gap-2">
            {cdcLoading ? <Loader size="sm" /> : <PiArrowsClockwiseDuotone className="h-4 w-4" />}
            Check status
          </Button>
          <Button
            onClick={() => {
              if (!cdcDb.trim()) {
                toast.error('Enter a database first');
                return;
              }
              setConfirmActivate(true);
            }}
            disabled={activating || !canActivate}
            title={!canActivate ? activateDeniedTitle : undefined}
            className={btn}
          >
            {activating ? <Loader size="sm" /> : <PiLightningDuotone className="h-4 w-4" />}
            Activate
          </Button>
        </div>
        {cdcTables && cdcTables.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Schema</th>
                  <th className="px-3 py-2 font-medium">Table</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Rows</th>
                  <th className="px-3 py-2 font-medium">Last altered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cdcTables.map((t, i) => (
                  <tr
                    key={`${t.TABLE_SCHEMA}.${t.TABLE_NAME}.${i}`}
                    className="text-slate-700 dark:text-slate-200"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{t.TABLE_SCHEMA}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.TABLE_NAME}</td>
                    <td className="px-3 py-2 text-xs">{t.TABLE_TYPE || EM_DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.ROW_COUNT == null ? EM_DASH : fmtNum(t.ROW_COUNT)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {t.LAST_ALTERED ? new Date(t.LAST_ALTERED).toLocaleString() : EM_DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : cdcTables ? (
          <InlineNote kind="empty">No tables found for this database/schema.</InlineNote>
        ) : null}
      </Lane>

      <ConfirmDialog
        open={confirmActivate}
        title="Activate row timestamps?"
        message={`This runs ALTER TABLE ... SET CHANGE_TRACKING across every supported table in ${cdcDb.trim().toUpperCase() || 'the database'}. It requires elevated privileges and may take up to a minute. Continue?`}
        confirmLabel="Activate"
        cancelLabel="Cancel"
        destructive={false}
        onConfirm={doActivate}
        onCancel={() => setConfirmActivate(false)}
      />

      <LineageDrilldownDrawer
        objectName={lineageTarget}
        onClose={() => setLineageTarget(null)}
      />
    </div>
  );
}

// Local mirror of the org-accounts row-timestamp table row (read-only shape).
interface RowTimestampTable {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  TABLE_TYPE: string;
  ROW_COUNT: number;
  LAST_ALTERED: string;
  CREATED: string;
}
