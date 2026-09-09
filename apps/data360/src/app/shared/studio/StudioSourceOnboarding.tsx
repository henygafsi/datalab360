'use client';

/**
 * StudioSourceOnboarding — /studio/source: the minimalist source journey.
 *
 * Four steps, one question each, like the application journey:
 *   1. Where does your data live?  — the REAL connector catalog
 *      (/studio/sources/catalog), grouped by family, multi-select, honest
 *      statuses (ready / partially ready / to configure / not integrated).
 *   2. Pick the data — databases then tables, MULTI-SELECT everywhere
 *      (user rule); connectors that are not readable yet say so and hand
 *      off to the full Connect Data admin view.
 *   3. What we read — source KPIs from catalog METADATA ONLY (approx rows,
 *      size, last refresh): no row of the user's data is read here. The
 *      rows-to-analyze scope is chosen here — "all rows" is an admin call.
 *   4. Understand & quality — one real /studio/understand run (AI): per
 *      table the key columns, keys, history depth and quality mini-KPIs,
 *      plus the AI's plain-words description — nothing invented, every
 *      number from the analysis, '—' when unknown.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, RotateCw, Search } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import StudioConnectorSetup from '@/app/shared/studio/StudioConnectorSetup';
import StudioRestBuilder from '@/app/shared/studio/StudioRestBuilder';

/** REST/HTTP APIs get the config-form builder (preset → auth → preview →
 *  save → ingest); every other family uses the generic setup steps. */
function isRestConnector(c: { id?: unknown; label?: unknown }): boolean {
  return /rest|http\s*api/i.test(`${String(c.id ?? '')} ${String(c.label ?? '')}`);
}
import {
  getStudioObjects,
  getStudioSources,
  getStudioSourcesCatalog,
  grainText,
  listDrafts,
  understandDirect,
  type CatalogConnector,
  type StudioDraftSummary,
  type StudioObject,
  type StudioSource,
  type StudioUnderstanding,
} from '@/app/services/studio/studio-api';
import {
  attachSources,
  listConnections,
  type AttachResult,
  type ConnectionListItem,
} from '@/app/services/studio/connections';
import { neutralLabel } from '@/app/shared/studio/sources/sources-kit';
import { ConnectorLogo } from '@/app/shared/studio/sources/ConnectorLogo';
import {
  createJourneyDraftRemote,
  newJourneyDraft,
} from '@/app/shared/studio/onboarding/journey';
import { isAdminRole } from '@/config/constants';
import { routes } from '@/config/routes';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';

/* ── plain-words helpers ────────────────────────────────────────────── */

const FAMILY_LABELS: Record<string, string> = {
  warehouse: 'Warehouse & lakehouse',
  database: 'Databases',
  object_storage: 'Files & storage',
  saas_application: 'Applications & SaaS',
  api: 'APIs & code',
  events: 'Event streams',
  media: 'Documents & media',
};

/** The backend preview envelope profiles at most this many objects per
 *  draft (perimeter.objects_per_draft) — say it BEFORE the run, not after. */
const PREVIEW_OBJECT_CAP = 10;

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  available: { label: 'ready', tone: 'text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'partially ready', tone: 'text-amber-600 dark:text-amber-400' },
  to_configure: { label: 'to configure', tone: 'text-slate-500 dark:text-slate-400' },
  not_integrated: { label: 'not integrated yet', tone: 'text-slate-400 dark:text-slate-500' },
};

function fmtCount(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

function fmtBytes(n?: number | null): string {
  if (n == null) return '—';
  if (n === 0) return '0 KB';
  // a 500-byte table is « 1 KB », never a fake « 0 KB »
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dbName(source: StudioSource): string {
  return source.label || source.id.replace(/^sf:db:/, '');
}

function errDetail(e: unknown): string {
  if (e && typeof e === 'object') {
    const detail = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object') {
      const d = detail as { message?: string; next_step?: string };
      if (d.message) return [d.message, d.next_step].filter(Boolean).join(' ');
    }
    const msg = (e as { message?: string }).message;
    if (msg) return msg;
  }
  return 'The analysis did not answer.';
}

/** The guided add journey, in the lifecycle order the product promises:
 *  connection (reuse or create) → configure & test → pick objects →
 *  what we read (before reading anything) → understand & attach. */
const STEPS = [
  'Connection',
  'Configure & test',
  'Pick objects',
  'What we read',
  'Understand & attach',
];

/* ── the wizard rail (numbered, like the app journey) ───────────────── */

function StepRail({ step }: { step: number }) {
  return (
    <ol className="space-y-2.5" aria-label="Source journey progress">
      {STEPS.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'upcoming';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                state === 'done'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : state === 'current'
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
              }`}
            >
              {state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={`text-xs ${
                state === 'current'
                  ? 'font-medium text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── main component ─────────────────────────────────────────────────── */

type Analysis =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; u: StudioUnderstanding }
  | { kind: 'error'; message: string };

export default function StudioSourceOnboarding() {
  const router = useRouter();
  const { role } = useAuth();
  useTrackEvent();
  const admin = isAdminRole(role);

  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState<CatalogConnector[] | null>(null);
  const [warehouses, setWarehouses] = useState<StudioSource[] | null>(null);
  const [selConnectors, setSelConnectors] = useState<string[]>([]);
  /** the account's reusable connections (one registry — never re-created
   *  per application; sf:session is the warehouse toggle below) */
  const [conns, setConns] = useState<ConnectionListItem[] | null>(null);
  const [reusedConns, setReusedConns] = useState<string[]>([]);
  /** which picked connector has its setup panel open, by label */
  const [setupFor, setSetupFor] = useState<string | null>(null);
  const [famFilter, setFamFilter] = useState<string | null>(null);
  const [useWarehouse, setUseWarehouse] = useState(false);
  /** attach target: a NEW application (default) or an existing one */
  const [apps, setApps] = useState<StudioDraftSummary[] | null>(null);
  const [attachTo, setAttachTo] = useState<string>('');
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachResult, setAttachResult] = useState<AttachResult | null>(null);
  const [selDbs, setSelDbs] = useState<string[]>([]);
  /** the FULL discovery envelope per database — truncated/note are part of
   *  the answer, a bounded list must never present itself as complete */
  const [objectsByDb, setObjectsByDb] = useState<
    Record<string, { objects: StudioObject[]; truncated?: boolean; note?: string | null }>
  >({});
  const [creatingApp, setCreatingApp] = useState(false);
  const [selObjects, setSelObjects] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState<'sample' | 'all'>('sample');
  const [analysis, setAnalysis] = useState<Analysis>({ kind: 'idle' });
  /* per-table column drill (KPI-first results, detail on demand) */
  const [openCols, setOpenCols] = useState<string | null>(null);
  // Backend draft scoping this journey's free-preview envelope (created lazily).
  const [srcDraftId, setSrcDraftId] = useState<string | null>(null);

  useEffect(() => {
    void getStudioSourcesCatalog().then(setCatalog).catch(() => setCatalog([]));
    void getStudioSources().then(setWarehouses).catch(() => setWarehouses([]));
    void listConnections({ limit: 50 })
      .then((p) => setConns(p.items))
      .catch(() => setConns([]));
    void listDrafts('application').then(setApps).catch(() => setApps([]));
  }, []);

  /* families → connectors (real catalog, honest statuses) */
  const families = useMemo(() => {
    const groups = new Map<string, CatalogConnector[]>();
    for (const c of catalog ?? []) {
      const fam = String(c.family ?? 'api');
      if (!groups.has(fam)) groups.set(fam, []);
      groups.get(fam)!.push(c);
    }
    return [...groups.entries()];
  }, [catalog]);

  const toggleConnector = (label: string) =>
    setSelConnectors((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );

  const toggleDb = (name: string) => {
    setSelDbs((prev) => {
      const next = prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name];
      if (!prev.includes(name) && !objectsByDb[name]) {
        void getStudioObjects(name)
          .then((r) => setObjectsByDb((o) => ({ ...o, [name]: r })))
          .catch(() => setObjectsByDb((o) => ({ ...o, [name]: { objects: [] } })));
      }
      return next;
    });
    setAnalysis({ kind: 'idle' }); // derived from the old selection
  };

  const toggleObject = (fqn: string) => {
    setSelObjects((prev) =>
      prev.includes(fqn) ? prev.filter((f) => f !== fqn) : [...prev, fqn],
    );
    setAnalysis({ kind: 'idle' });
  };

  const pickedObjects: StudioObject[] = useMemo(
    () =>
      selDbs
        .flatMap((db) => objectsByDb[db]?.objects ?? [])
        .filter((o) => selObjects.includes(o.fqn)),
    [objectsByDb, selDbs, selObjects],
  );

  const selectedConnectorItems = (catalog ?? []).filter((c) =>
    selConnectors.includes(String(c.label)),
  );

  /** a reused connection lands (or already landed) its loads in warehouse
   *  tables — the object pick must open even without the warehouse toggle */
  const showDbPick = useWarehouse || reusedConns.length > 0;

  const canContinue =
    step === 0
      ? useWarehouse || selConnectors.length > 0 || reusedConns.length > 0
      : step === 2
        ? !showDbPick || pickedObjects.length > 0
        : true;

  const analyze = useCallback(async () => {
    if (pickedObjects.length === 0 || analysis.kind === 'running') return;
    setAnalysis({ kind: 'running' });
    const scopeNote =
      scope === 'all'
        ? 'Analysis scope: all rows (production totals) — chosen by an account admin.'
        : 'Analysis scope: sample within the free preview envelope.';
    try {
      // No draft yet ⇒ understand AUTO-CREATES it in the same call
      // (auto_draft) — one round-trip less on the click the user watches.
      const u = await understandDirect({
        need: 'Describe these sources for a business reader: key columns, keys, how deep the history goes, and quality risks.',
        objects: pickedObjects.map((o) => ({ fqn: o.fqn })),
        use_ai: true,
        draft_id: srcDraftId ?? undefined,
        context: { notes: scopeNote },
      });
      if (!srcDraftId && u.draft?.draft_id) setSrcDraftId(u.draft.draft_id);
      setAnalysis({ kind: 'done', u });
    } catch (e) {
      setAnalysis({ kind: 'error', message: errDetail(e) });
    }
  }, [analysis.kind, pickedObjects, scope, srcDraftId]);

  /** The journey contract wants connection ids, not bare names: bare names
   *  orphan the picks (the Understanding step filters on the sf:db: prefix
   *  — see SourcesStep). The object's connection is derived from its OWN
   *  database, never from the schema. */
  const journeySources = useCallback(
    () => ({
      connectionIds: selDbs.map((db) => `sf:db:${db}`),
      objects: pickedObjects.map((o) => ({
        connectionId: `sf:db:${o.fqn.split('.')[0] ?? ''}`,
        name: o.fqn,
      })),
    }),
    [pickedObjects, selDbs],
  );

  /** Hand the analyzed selection to the application journey (resumable).
   *  createJourneyDraftRemote returns null on failure instead of throwing —
   *  navigating anyway would silently lose the analyzed selection. */
  const createApp = useCallback(async () => {
    if (creatingApp) return;
    setCreatingApp(true);
    setAttachError(null);
    try {
      const draft = newJourneyDraft({ step: 'understanding' });
      draft.sources = journeySources();
      const created = await createJourneyDraftRemote(draft);
      if (!created) {
        setAttachError('The application draft could not be created — nothing was saved. Try again.');
        return;
      }
      router.push(routes.studio);
    } finally {
      setCreatingApp(false);
    }
  }, [creatingApp, journeySources, router]);

  /** Attach the selection to an EXISTING application through the
   *  versioned attach route: nothing published, existing attachments and
   *  understanding untouched (kept + marked stale), and the SERVER's
   *  answer (added / already attached / prepared / to activate) is what
   *  the reader sees — never a summary we invented. */
  const attachToExisting = useCallback(async () => {
    if (!attachTo) return;
    setAttaching(attachTo);
    setAttachError(null);
    setAttachResult(null);
    const r = await attachSources(attachTo, {
      objects: pickedObjects.map((o) => ({
        fqn: o.fqn,
        connection_id: 'sf:session',
        kind: 'table',
      })),
    });
    setAttaching(null);
    if (r.ok) {
      setAttachResult(r.value);
    } else {
      setAttachError(
        [r.refusal.code, r.refusal.message].filter(Boolean).join(' — ') || 'The attach was refused.',
      );
    }
  }, [attachTo, pickedObjects]);

  const u = analysis.kind === 'done' ? analysis.u : null;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PlainQuestionHeader
        question={
          step === 0
            ? 'Which connection brings this data?'
            : step === 1
              ? 'Configure & test'
              : step === 2
                ? 'Pick the objects'
                : step === 3
                  ? 'What we read — before reading anything'
                  : 'Understand & attach'
        }
        detail={
          step === 0
            ? 'Reuse an authorised connection, or create a new one — several at once is fine. Your data is read, never written.'
            : step === 1
              ? 'Each new connection is set up and tested here with bounded checks — nothing is written to your systems.'
              : step === 2
                ? 'Choose the databases and tables — your selection survives search and filtering.'
                : step === 3
                  ? 'These figures come from the catalog only: no row of your data has been read.'
                  : 'One real analysis run within the free envelope — then attach the result to an application.'
        }
        backHref={routes.studio}
        backLabel="Studio"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[180px,1fr]">
        <div className="hidden lg:block">
          <StepRail step={step} />
        </div>

        <div className="min-w-0 space-y-4">
          {/* ── step 1 : connection — reuse first, create second ─────── */}
          {step === 0 && (
            <div className="space-y-3">
              {(conns ?? []).filter((r) => r.connection_id !== 'sf:session').length > 0 && (
                <section className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Reuse an authorised connection
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(conns ?? [])
                      .filter((r) => r.connection_id !== 'sf:session' && r.permissions?.use !== false)
                      .map((r) => {
                        const id = r.connection_id;
                        const active = reusedConns.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setReusedConns((prev) =>
                                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                              )
                            }
                            title={
                            r.last_test?.at
                              ? 'Its loads land in warehouse tables — pick them at the next steps.'
                              : 'Never synced yet — its tables appear once its loads have run.'
                          }
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                              active
                                ? 'border-accent-500 ring-1 ring-accent-500'
                                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
                            }`}
                          >
                            <ConnectorLogo
                              label={String(r.type ?? '')}
                              connectorId={String(r.type ?? '')}
                              className="h-4 w-4"
                            />
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {neutralLabel(r.name) || id}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {(r.type ?? '').replace(/_/g, ' ')}
                              {' · '}
                              {r.last_test?.at ? `tested · ${r.last_test.overall}` : 'never tested'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </section>
              )}
              {/* one viewport, no stacked sections: connected + filters + grid */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={useWarehouse}
                  onClick={() => setUseWarehouse((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    useWarehouse
                      ? 'border-accent-500 ring-1 ring-accent-500'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                    Your data warehouse
                  </span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {warehouses == null ? 'reading…' : `${warehouses.length} databases · ready`}
                  </span>
                </button>
                <span className="text-xs text-slate-400 dark:text-slate-500">or bring in</span>
                {catalog != null &&
                  families.map(([family, connectors]) => {
                    const active = famFilter === family;
                    return (
                      <button
                        key={family}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setFamFilter(active ? null : family)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                          active
                            ? 'border-accent-500 bg-accent-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {FAMILY_LABELS[family] ?? family.replace(/_/g, ' ')} · {connectors.length}
                      </button>
                    );
                  })}
              </div>

              {catalog == null ? (
                <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
              ) : (
                <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                    {families
                      .filter(([family]) => !famFilter || family === famFilter)
                      .flatMap(([, connectors]) => connectors)
                      .map((c) => {
                        const label = String(c.label ?? '');
                        const status = STATUS_LABELS[String(c.status)] ?? STATUS_LABELS.to_configure;
                        const dead = c.status === 'not_integrated';
                        const active = selConnectors.includes(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={active}
                            aria-disabled={dead}
                            onClick={() => !dead && toggleConnector(label)}
                            title={dead ? 'This connector is not integrated yet.' : label}
                            className={`flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                              dead
                                ? 'cursor-not-allowed border-slate-100 opacity-55 dark:border-slate-800/60'
                                : active
                                  ? 'border-accent-500 ring-1 ring-accent-500'
                                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
                            }`}
                          >
                            <ConnectorLogo
                              label={label}
                              connectorId={String(c.id ?? c.connector_id ?? '')}
                              family={String(c.family ?? '')}
                              className="h-4 w-4"
                            />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                              {label}
                            </span>
                            <span className={`shrink-0 text-xs ${status.tone}`}>{status.label}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── step 2 : configure & test the NEW connections ───────── */}
          {step === 1 && (
            <div className="space-y-4">
              {selectedConnectorItems.length === 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nothing to configure — reused connections keep their configuration as it is.
                  </p>
                  {(conns ?? [])
                    .filter((r) => reusedConns.includes(r.connection_id))
                    .map((r) => (
                      <p key={r.connection_id} className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {neutralLabel(r.name) || r.connection_id}
                        </span>
                        {' — '}
                        {r.last_test?.at
                          ? `last test: ${r.last_test.overall}`
                          : 'never tested — its tables appear once its loads have run; run them from the connection sheet on the Sources page'}
                        .
                      </p>
                    ))}
                </div>
              ) : (
                <section className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Connectors you picked
                  </p>
                  {selectedConnectorItems.map((c) => {
                    const status = STATUS_LABELS[String(c.status)] ?? STATUS_LABELS.to_configure;
                    const open = setupFor === String(c.label);
                    return (
                      <div key={String(c.label)} className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            {String(c.label)}
                          </span>
                          <span className={`text-xs ${status.tone}`}>{status.label}</span>
                          {/* The setup happens HERE — the Studio no longer sends
                              the reader to the legacy admin page. Same steps,
                              same service functions, one source of truth. */}
                          <button
                            type="button"
                            onClick={() => setSetupFor(open ? null : String(c.label))}
                            className="rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
                          >
                            {open ? 'Close the setup' : 'Set it up here'}
                          </button>
                        </div>
                        {open &&
                          (isRestConnector(c) ? (
                            <StudioRestBuilder onClose={() => setSetupFor(null)} />
                          ) : (
                            <StudioConnectorSetup
                              connector={c as never}
                              onClose={() => setSetupFor(null)}
                              onConnected={() =>
                                void getStudioSourcesCatalog().then(setCatalog).catch(() => undefined)
                              }
                            />
                          ))}
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    A connector becomes readable here once its setup is finished — nothing is
                    simulated meanwhile. A test is bounded and writes nothing.
                  </p>
                </section>
              )}
            </div>
          )}

          {/* ── step 3 : databases + tables (multi-select) ──────────── */}
          {step === 2 && (
            <div className="space-y-4">
              {!showDbPick && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  A newly configured connector&apos;s tables become pickable once its setup and
                  first load are finished (previous step). To pick tables that are already
                  readable, enable « Your data warehouse » at the Connection step.
                </p>
              )}
              {showDbPick && (
                <>
                  <div className="flex flex-wrap gap-1.5" aria-label="Databases">
                    {(warehouses ?? []).map((w) => {
                      const name = dbName(w);
                      const active = selDbs.includes(name);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleDb(name)}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                            active
                              ? 'border-accent-500 bg-accent-600 text-white'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>

                  {selDbs.length > 0 && (
                    <div className="space-y-2">
                      <div className="relative w-full sm:w-72">
                        <Search
                          aria-hidden
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          placeholder="Filter tables…"
                          aria-label="Filter tables"
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        />
                      </div>
                      <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                        {selDbs.map((db) => {
                          const entry = objectsByDb[db];
                          const objs = entry?.objects;
                          const q = filter.trim().toLowerCase();
                          const shown = (objs ?? []).filter(
                            (o) => !q || o.fqn.toLowerCase().includes(q),
                          );
                          return (
                            <div key={db}>
                              <p className="px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                {db}{' '}
                                {objs
                                  ? `· ${objs.length}${entry?.truncated ? '+' : ''} table(s)${entry?.truncated ? ' — list bounded by the server' : ''}`
                                  : '· reading…'}
                              </p>
                              {entry?.note && (
                                <p className="px-1 text-xs text-slate-400 dark:text-slate-500">{entry.note}</p>
                              )}
                              {shown.length > 200 && (
                                <p className="px-1 text-xs text-amber-700 dark:text-amber-400">
                                  200 of {shown.length} shown — filter to narrow; your selection
                                  survives the filter.
                                </p>
                              )}
                              {shown.slice(0, 200).map((o) => (
                                <label
                                  key={o.fqn}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selObjects.includes(o.fqn)}
                                    onChange={() => toggleObject(o.fqn)}
                                    className="h-3.5 w-3.5 accent-accent-600"
                                  />
                                  <span className="min-w-0 truncate">{o.schema}.{o.table}</span>
                                  <span className="ml-auto shrink-0 tabular-nums text-xs text-slate-400">
                                    {fmtCount(o.approx_row_count)} rows
                                  </span>
                                </label>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {selObjects.length} table(s) selected — pick as many as you need.
                      </p>
                    </div>
                  )}
                </>
              )}

            </div>
          )}

          {/* ── step 4 : source KPIs, metadata only ─────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              {pickedObjects.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No readable table selected yet — go back one step to pick tables, or finish a
                  connector setup first.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="min-w-full bg-white text-xs dark:bg-slate-900">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          {['Table', 'Rows (approx.)', 'Size', 'Last refresh'].map((h) => (
                            <th
                              key={h}
                              scope="col"
                              className="whitespace-nowrap px-2.5 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pickedObjects.map((o) => (
                          <tr key={o.fqn}>
                            <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                              {o.schema}.{o.table}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-slate-700 dark:text-slate-300">
                              {fmtCount(o.approx_row_count)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-slate-700 dark:text-slate-300">
                              {fmtBytes(o.bytes)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                              {fmtDate(o.last_altered)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Catalog metadata only — no row of your data has been read at this step.
                  </p>

                  {/* rows-to-analyze — an admin decision, honest about scope */}
                  <fieldset className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Rows to analyze
                    </legend>
                    <div className="space-y-1.5 text-xs">
                      <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
                        <input
                          type="radio"
                          name="scope"
                          checked={scope === 'sample'}
                          onChange={() => setScope('sample')}
                          className="accent-accent-600"
                        />
                        A sample first — free preview envelope, fastest
                      </label>
                      <label
                        className={`flex items-center gap-2 ${
                          admin
                            ? 'cursor-pointer text-slate-700 dark:text-slate-200'
                            : 'cursor-not-allowed text-slate-400 dark:text-slate-500'
                        }`}
                        title={
                          admin
                            ? undefined
                            : 'Analyzing all rows is an account-admin decision.'
                        }
                      >
                        <input
                          type="radio"
                          name="scope"
                          disabled={!admin}
                          checked={scope === 'all'}
                          onChange={() => setScope('all')}
                          className="accent-accent-600"
                        />
                        All rows — production totals{admin ? '' : ' (account admin only)'}
                      </label>
                    </div>
                  </fieldset>
                </>
              )}
            </div>
          )}

          {/* ── step 5 : understand & attach ────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3">
              {analysis.kind !== 'done' && (
                <>
                  <button
                    type="button"
                    onClick={() => void analyze()}
                    disabled={
                      pickedObjects.length === 0 ||
                      pickedObjects.length > PREVIEW_OBJECT_CAP ||
                      analysis.kind === 'running'
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analysis.kind === 'running' && (
                      <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    )}
                    Analyze {pickedObjects.length} table(s)
                  </button>
                  {pickedObjects.length > PREVIEW_OBJECT_CAP && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      The free preview analyzes up to {PREVIEW_OBJECT_CAP} tables per
                      application — unselect {pickedObjects.length - PREVIEW_OBJECT_CAP} to run
                      now, or activate with credits for the full selection.
                    </p>
                  )}
                </>
              )}
              {analysis.kind === 'error' && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {analysis.message}
                </p>
              )}

              {u && (
                <div className="space-y-3">
                  {u.partial && (u.skipped?.length ?? 0) > 0 && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                      {u.skipped!.length} table(s) kept metadata only — the profiling budget ran
                      out. Re-analyze with fewer tables for full key checks.
                    </p>
                  )}
                  {/* the AI's plain-words read of the whole selection */}
                  {u.ai?.status === 'ok' && u.ai.summary && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {u.ai.summary}
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        AI reading of your selection — every figure below comes from the
                        analysis itself.
                      </p>
                    </div>
                  )}

                  {/* the whole selection, in standardized KPIs first */}
                  {(() => {
                    const ents = u.entities ?? [];
                    const allFields = ents.flatMap((e) => e.fields ?? []);
                    const keysOk = ents.filter((e) =>
                      (e.candidate_keys ?? []).some((k) => k.status === 'validated'),
                    ).length;
                    const withTime = ents.filter((e) =>
                      (e.fields ?? []).some((f) => f.role === 'time'),
                    ).length;
                    const nullable = allFields.filter((f) => f.nullable).length;
                    const kpi = (label: string, value: string) => (
                      <div key={label} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
                      </div>
                    );
                    return (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {kpi('Tables', String(ents.length))}
                        {kpi('Columns', String(allFields.length))}
                        {kpi('Keys confirmed', `${keysOk}/${ents.length}`)}
                        {kpi('With history', `${withTime}/${ents.length}`)}
                        {kpi('Nullable columns', String(nullable))}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
                    {(u.entities ?? []).map((e) => {
                      const fields = e.fields ?? [];
                      const keyCols = fields.filter((f) => f.role === 'identifier');
                      const timeCols = fields.filter((f) => f.role === 'time');
                      const measures = fields.filter((f) => f.role === 'measure');
                      const nullable = fields.filter((f) => f.nullable).length;
                      const keys = (e.candidate_keys ?? []).map((k) => ({
                        cols: (k.columns ?? []).join('+'),
                        ok: k.status === 'validated',
                      }));
                      const g = grainText(e.grain);
                      const grainSentence = g
                        ? /^one row/i.test(g)
                          ? `${g.charAt(0).toUpperCase()}${g.slice(1)}. `
                          : `One row = one ${g}. `
                        : '';
                      return (
                        <div
                          key={e.entity_id}
                          className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {e.name}
                            </p>
                            <span className="shrink-0 tabular-nums text-xs text-slate-400 dark:text-slate-500">
                              {fmtCount(e.approx_row_count ?? (e as { row_count_approx?: number }).row_count_approx)} rows
                            </span>
                          </div>
                          <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">
                            {e.source_fqn.split('.').slice(-2).join('.')}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {grainSentence}
                            {fields.length} column(s) — {keyCols.length} key,{' '}
                            {measures.length} measure(s), {timeCols.length} time.
                          </p>
                          {e.description && (
                            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                              {e.description}
                              {e.description_source === 'ai' && (
                                <span className="ml-1 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                  ai
                                </span>
                              )}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {keyCols.slice(0, 4).map((f) => (
                              <span
                                key={f.name}
                                className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              >
                                {f.name}
                              </span>
                            ))}
                            {keys.map((k) => (
                              <span
                                key={k.cols}
                                className={`rounded-full px-1.5 py-0.5 text-xs ${
                                  k.ok
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                }`}
                                title={k.ok ? 'Key validated on the data' : 'Key hypothesis — not confirmed yet'}
                              >
                                key {k.cols} {k.ok ? '✓' : '?'}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            History:{' '}
                            {timeCols.length > 0
                              ? `by ${timeCols.map((f) => f.name).join(', ')}`
                              : 'no time column — snapshot only'}
                            {' · '}Quality: {nullable === 0 ? 'no' : nullable} nullable column(s)
                            {keys.some((k) => !k.ok) ? ' · a key still to confirm' : ''}
                          </p>
                          {fields.length > 0 && (
                            <>
                              <button
                                type="button"
                                aria-expanded={openCols === e.entity_id}
                                onClick={() =>
                                  setOpenCols((o) => (o === e.entity_id ? null : e.entity_id))
                                }
                                className="mt-1.5 text-xs text-accent-600 hover:underline dark:text-accent-400"
                              >
                                {openCols === e.entity_id
                                  ? 'Hide the columns'
                                  : `See the ${fields.length} columns`}
                              </button>
                              {openCols === e.entity_id && (
                                <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        <th className="px-2 py-1 font-medium">Column</th>
                                        <th className="px-2 py-1 font-medium">Type</th>
                                        <th className="px-2 py-1 font-medium">Role</th>
                                        <th className="px-2 py-1 font-medium">Nullable</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                      {fields.map((f) => (
                                        <tr key={f.name}>
                                          <td className="px-2 py-0.5 font-mono text-slate-700 dark:text-slate-300">
                                            {f.name}
                                          </td>
                                          <td className="px-2 py-0.5 text-slate-500 dark:text-slate-400">
                                            {f.type ?? '—'}
                                          </td>
                                          <td className="px-2 py-0.5 text-slate-500 dark:text-slate-400">
                                            {f.role ?? '—'}
                                          </td>
                                          <td className="px-2 py-0.5 text-slate-500 dark:text-slate-400">
                                            {f.nullable == null ? '—' : f.nullable ? 'yes' : 'no'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {(u.ai?.open_questions as string[] | undefined)?.length ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <p className="font-medium text-slate-600 dark:text-slate-300">
                        The AI would ask you:
                      </p>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                        {(u.ai!.open_questions as string[]).slice(0, 4).map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* ── summary & attach: say precisely what is added, what
                      is prepared, and what is NOT active yet ──────────── */}
                  <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      What this adds
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13px] text-slate-700 dark:text-slate-200">
                      <li>
                        <span className="font-medium">Added</span> — {pickedObjects.length} object(s)
                        from {selDbs.length} database(s)
                        {selDbs.length > 0 ? ` (${selDbs.join(', ')})` : ''}, read through your
                        warehouse session.
                      </li>
                      {reusedConns.length > 0 && (
                        <li>
                          <span className="font-medium">Reused</span> — {reusedConns.length}{' '}
                          connection(s), untouched; the picked tables above are where their loads
                          land. The reuse itself is not recorded on the application yet.
                        </li>
                      )}
                      <li>
                        <span className="font-medium">Prepared</span> — the understanding above (
                        {(u.entities ?? []).length} table(s) analyzed
                        {u.partial ? ', partially: the free envelope stopped the rest' : ''}).
                      </li>
                      <li>
                        <span className="font-medium">Not active yet</span> — no model is published,
                        no permanent job or schedule is created; activation stays an explicit step
                        inside the application.
                      </li>
                    </ul>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      <button
                        type="button"
                        disabled={creatingApp}
                        onClick={() => void createApp()}
                        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        {creatingApp ? 'Creating…' : 'Create a new application from this data'}
                      </button>
                      {(apps ?? []).length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                          or attach to
                          <select
                            value={attachTo}
                            onChange={(e) => setAttachTo(e.target.value)}
                            aria-label="Existing application to attach these sources to"
                            className="h-8 max-w-56 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            <option value="">an existing application…</option>
                            {(apps ?? []).map((d) => (
                              <option key={d.draft_id} value={d.draft_id}>
                                {d.display_name || d.title || d.draft_id}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!attachTo || attaching != null}
                            onClick={() => void attachToExisting()}
                            className="rounded-lg border border-accent-500 px-3 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
                          >
                            {attaching ? 'Attaching…' : 'Attach'}
                          </button>
                        </span>
                      )}
                      <QuietAction label="Re-analyze" icon={RotateCw} onClick={() => void analyze()} />
                    </div>
                    {attachError && (
                      <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                        {attachError}
                      </p>
                    )}
                    {attachResult && (
                      <div role="status" className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                        <p>
                          Attached: {(attachResult.added ?? []).length} added
                          {(attachResult.already_attached ?? []).length > 0 &&
                            `, ${(attachResult.already_attached ?? []).length} already attached`}
                          . Published: model {attachResult.published?.model ? 'yes' : 'no'}, jobs{' '}
                          {attachResult.published?.jobs ? 'yes' : 'no'} — activation stays an
                          explicit step.
                        </p>
                        {(attachResult.to_activate ?? []).length > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Still to activate:{' '}
                            {(attachResult.to_activate ?? [])
                              .map((t) => `${t.step}${t.why ? ` (${t.why})` : ''}`)
                              .join(' · ')}
                          </p>
                        )}
                        {attachTo && (
                          <button
                            type="button"
                            onClick={() => router.push(routes.studioApp(attachTo))}
                            className="mt-1 text-xs text-accent-600 hover:underline dark:text-accent-400"
                          >
                            Open the application
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}

          {/* ── wizard footer ───────────────────────────────────────── */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => step > 0 && setStep(step - 1)}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </button>
            <div className="flex items-center gap-3">
              {!canContinue && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {step === 0 ? 'Reuse or pick at least one connection' : 'Pick at least one table'}
                </span>
              )}
              {step < STEPS.length - 1 && (
                <button
                  type="button"
                  onClick={() => canContinue && setStep(step + 1)}
                  disabled={!canContinue}
                  className="rounded-lg bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Your data is read, never written. Only your model is kept.
          </p>
        </div>
      </div>
    </div>
  );
}
