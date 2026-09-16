'use client';

/**
 * StudioWorkflowEditor — ONE workflow, opened in place of the pilot list.
 *
 * AI-first and business-readable BY DEFAULT: the definition reads as the
 * generated phrase — When (event) / If (condition) / Then (steps) /
 * Deliver to (destination) — and the block graph is a REPRESENTATION,
 * folded below, never the starting point. Everything edits the SAME
 * definition the jobs read, through the backend's own `edit_paths`
 * allowlist: name, trigger, condition, window and each step. Edits
 * ACCUMULATE in a buffer and land as ONE patch (the JobEditor
 * discipline: dirty guard on close, refusals rendered in place —
 * EDIT_PATH_NOT_ALLOWED is « not supported yet », never a crash).
 * The natural-language lane (editModel) previews its allowlisted ops
 * before anything is applied; a threshold that was a DECISION stays a
 * decision — re-confirmed through the same contract, never silently
 * overwritten.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  BarChart3,
  Bell,
  Check,
  Database,
  GitBranch,
  type LucideIcon,
  Mail,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  Ticket,
  Workflow,
  X,
} from 'lucide-react';
import {
  editModel,
  getBlocksCatalog,
  getWorkflowRuns,
  getWorkflowVersions,
  patchModel,
  postDecision,
  previewWorkflow,
  stopWorkflow,
  testRunWorkflow,
  type CatalogBlock,
  type ModelPatchOp,
  type WorkflowItem,
  type WorkflowMissing,
  type WorkflowPreview,
  type WorkflowRunsPage,
  type WorkflowTestRun,
  type WorkflowVersions,
} from '@/app/services/studio/studio-api';
import { readFailure } from '@/app/shared/studio/studio-errors';
import StudioEmailAlertPanel from '@/app/shared/studio/StudioEmailAlertPanel';

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return readFailure(detail ?? e).text;
}

/** Name the app area a set of drifted paths belongs to, in the reader's terms. */
function humanScope(paths: string[]): string {
  const set = new Set<string>();
  for (const p of paths) {
    if (/\/report\b/.test(p)) set.add('the report');
    else if (/\/understanding\b/.test(p)) set.add('the understanding');
    else if (/\/model\b/.test(p)) set.add('the model');
    else if (/\/data\b/.test(p)) set.add('the data');
  }
  return [...set].join(' and ') || 'another part of the application';
}

/** A proposed patch op → a business phrase, so the AI preview leads with what
 *  CHANGES, not a raw JSON pointer. Falls back to the pointer's own tail so an
 *  unmapped path is still truthful, never blank. */
function humanOp(op: { op?: string; path?: string }): string {
  const path = String(op.path ?? '');
  const verb =
    op.op === 'remove' ? 'Remove' : op.op === 'add' ? 'Add' : 'Update';
  let what = '';
  if (/\/trigger\b/.test(path)) what = 'when it runs (the trigger)';
  else if (/\/condition\/threshold\b/.test(path)) what = 'the alert threshold';
  else if (/\/condition\b/.test(path)) what = 'the condition (When / If)';
  else if (/\/window\b/.test(path)) what = 'the time window';
  else if (/\/steps\/(\d+)/.test(path)) {
    const n = path.match(/\/steps\/(\d+)/)?.[1];
    what = `step ${n != null ? Number(n) + 1 : ''} (a destination)`.trim();
  } else if (/\/steps\b/.test(path)) what = 'a destination step';
  else if (/\/name\b/.test(path)) what = 'the name';
  else what = path.split('/').filter(Boolean).slice(-1)[0] || 'the workflow';
  return `${verb} ${what}`;
}

/**
 * The workflow refine (editModel WITH automation_id) is scoped to this
 * workflow's edit_paths server-side; when the AI drifts out, the backend
 * refuses with EDIT_OUT_OF_SCOPE and names the offending paths — so a phrase
 * like "with the KPIs in the report" can no longer silently rewrite the
 * report. We translate that refusal into "the AI aimed at the report, not
 * this alert; here is what this chat can change". (An older backend that
 * doesn't scope sends a single out-of-/automation `path` with a raw message
 * like "max 5 kpis per report" — kept as a fallback.)
 */
function refineErrorText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as
    | { error_code?: string; offending_paths?: unknown; path?: unknown }
    | undefined;
  const drifted =
    'This chat only edits the alert itself — when it fires (its schedule), the ' +
    'condition that triggers it (When / If), and where it sends (Then, e-mail ' +
    'included). Try naming one of those — e.g. “send it every hour” or “only ' +
    'when the daily total drops below 100”.';

  if (detail?.error_code === 'EDIT_OUT_OF_SCOPE') {
    const offending = Array.isArray(detail.offending_paths) ? (detail.offending_paths as string[]) : [];
    return `The AI aimed that at ${humanScope(offending)}, not this alert — nothing was changed. ${drifted}`;
  }

  const path = detail?.path;
  if (typeof path === 'string' && path.length > 0 && !path.startsWith('/automation')) {
    return `The AI read that as a change to ${humanScope([path])}, not this alert (${errText(e)}). ${drifted}`;
  }
  return errText(e);
}

function isUnsupportedPath(e: unknown): boolean {
  return JSON.stringify((e as { response?: { data?: unknown } })?.response?.data ?? '').includes(
    'EDIT_PATH_NOT_ALLOWED',
  );
}

/** The step's kind → an icon + a semantic tone, so the canvas reads as a real
 *  workflow (a bell for a notification, an envelope for e-mail, a branch for a
 *  condition) instead of identical boxes. Capability is authoritative; the
 *  block type and the (possibly localized) label are the fallback signal. */
function stepIcon(blockType?: string, capability?: string, label?: string): {
  Icon: LucideIcon;
  tone: string;
} {
  const cap = (capability ?? '').toLowerCase();
  if (cap.startsWith('notify.email')) return { Icon: Mail, tone: 'text-sky-600 dark:text-sky-400' };
  if (cap.startsWith('notify')) return { Icon: Bell, tone: 'text-amber-600 dark:text-amber-400' };
  if (cap.startsWith('ticket')) return { Icon: Ticket, tone: 'text-violet-600 dark:text-violet-400' };
  const k = `${blockType ?? ''} ${label ?? ''}`.toLowerCase();
  if (/mail|e-mail|courriel/.test(k)) return { Icon: Mail, tone: 'text-sky-600 dark:text-sky-400' };
  if (/notif|alert|inbox|in.?app/.test(k)) return { Icon: Bell, tone: 'text-amber-600 dark:text-amber-400' };
  if (/ticket/.test(k)) return { Icon: Ticket, tone: 'text-violet-600 dark:text-violet-400' };
  if (/condition|branch|filtre|filter|lorsque|quand|\bif\b|\bsi\b/.test(k))
    return { Icon: GitBranch, tone: 'text-fuchsia-600 dark:text-fuchsia-400' };
  if (/rapport|report|kpi|chart|résumé|resume|summary|indicateur/.test(k))
    return { Icon: BarChart3, tone: 'text-emerald-600 dark:text-emerald-400' };
  if (/requ|query|sql|exécut|execut|\brun\b|read|calcul|compute/.test(k))
    return { Icon: Database, tone: 'text-blue-600 dark:text-blue-400' };
  if (/export|livr|deliver|send|envoi|webhook|http/.test(k))
    return { Icon: Send, tone: 'text-teal-600 dark:text-teal-400' };
  return { Icon: Workflow, tone: 'text-slate-500 dark:text-slate-400' };
}

interface StepNodeData {
  n: number;
  label: string;
  blockType?: string;
  capability?: string;
  selected?: boolean;
  [k: string]: unknown;
}

/** A workflow step as a real component: icon + « Step N » + business label,
 *  with source/target handles so the sequence edges connect. */
function StudioStepNode({ data }: NodeProps<StepNodeData>) {
  const { Icon, tone } = stepIcon(data.blockType, data.capability, data.label);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm dark:bg-slate-900 ${
        data.selected
          ? 'border-accent-500 ring-2 ring-accent-500/40'
          : 'border-slate-300 dark:border-slate-700'
      }`}
      style={{ minWidth: 156 }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 ${tone}`}
      >
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Step {data.n}
        </div>
        <div
          title={data.label}
          className="max-w-[160px] truncate text-[13px] font-medium text-slate-800 dark:text-slate-100"
        >
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

const STEP_NODE_TYPES = { studioStep: StudioStepNode };

interface EditPaths {
  name?: string;
  trigger?: string;
  condition?: string;
  window?: string;
  steps?: string[];
}

type StepDef = {
  step_id?: string;
  block_type?: string;
  capability?: string;
  label?: string;
  config?: Record<string, unknown>;
};

/* ── typed per-step params — the config presented BY STEP, not behind a
 *  canvas click. Each known key gets its real control and a business label;
 *  unknown scalars keep a generic input so nothing served is hidden. ── */
type ParamKind = 'text' | 'number' | 'list' | 'select' | 'readonly' | 'predicate';
interface ParamField {
  key: string;
  label: string;
  kind: ParamKind;
  hint?: string;
  options?: string[];
  mono?: boolean;
}

const KNOWN_PARAMS: Record<string, Omit<ParamField, 'key'>> = {
  database: { label: 'database', kind: 'readonly', mono: true },
  schema: { label: 'schema', kind: 'readonly', mono: true },
  table: { label: 'table', kind: 'text', mono: true, hint: 'the object this step reads' },
  chart_ids: { label: 'KPIs / charts it runs', kind: 'list', mono: true, hint: 'comma-separated chart ids from the report' },
  quality_predicate: {
    label: 'condition (SQL predicate)',
    kind: 'predicate',
    mono: true,
    hint: 'rows matching this predicate trigger the workflow',
  },
  max_violations: { label: 'tolerated violations', kind: 'number', hint: '0 = any match fires' },
  key: { label: 'deduplication key', kind: 'list', mono: true, hint: 'one delivery per distinct key' },
  store: { label: 'delivery store', kind: 'readonly', mono: true },
  kind: { label: 'notification kind', kind: 'readonly', mono: true },
  audience: { label: 'audience', kind: 'text', hint: 'who receives it (e.g. PROJECT_READERS)' },
  format: { label: 'file format', kind: 'select', options: ['CSV', 'JSON', 'PARQUET'] },
  path: { label: 'stage path', kind: 'text', mono: true, hint: 'where the file lands' },
};

function paramFieldsOf(cfg: Record<string, unknown>): ParamField[] {
  return Object.keys(cfg).map((key) => {
    const known = KNOWN_PARAMS[key];
    if (known) return { key, ...known };
    const v = cfg[key];
    if (Array.isArray(v)) return { key, label: key.replace(/_/g, ' '), kind: 'list' as ParamKind, mono: true };
    if (typeof v === 'number') return { key, label: key.replace(/_/g, ' '), kind: 'number' as ParamKind };
    if (v != null && typeof v === 'object') return { key, label: key.replace(/_/g, ' '), kind: 'readonly' as ParamKind, mono: true };
    return { key, label: key.replace(/_/g, ' '), kind: 'text' as ParamKind };
  });
}

/** an unresolved server placeholder (« <decided threshold> ») is a state,
 *  not a value the user should edit as text */
function isPlaceholder(v: unknown): boolean {
  return typeof v === 'string' && /^<.*>$/.test(v.trim());
}

/** Inline decision for a missing prerequisite — grounded in its carried
 *  proposal; a confirmed value stays RE-EDITABLE through the same
 *  contract (re-confirmation is idempotent server-side). */
function MissingDecision({
  draftId,
  m,
  onDone,
}: {
  draftId: string;
  m: WorkflowMissing;
  onDone: () => void;
}) {
  const kind = String((m.proposal as { kind?: string } | null)?.kind ?? '');
  const [days, setDays] = useState('30');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const did = m.decision_id;
  if (!did) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">{m.how_to_complete}</span>;
  }
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const value =
        kind === 'sla_days'
          ? {
              days: Number(days),
              from_field: (m.proposal as { from_field?: string } | null)?.from_field,
              kind,
            }
          : text.includes(',')
            ? { open_values: text.split(',').map((v) => v.trim()).filter(Boolean) }
            : { text: text.trim() };
      await postDecision(draftId, { decision_id: did, status: 'confirmed', value });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {kind === 'sla_days' ? (
        <>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-label={`Days for ${m.decision_id}`}
            className="h-7 w-16 rounded border border-slate-200 bg-white px-1.5 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            days after {(m.proposal as { from_field?: string } | null)?.from_field ?? '—'}
          </span>
        </>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="value(s), comma-separated"
          aria-label={`Value for ${m.decision_id}`}
          className="h-7 w-44 rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        />
      )}
      <button
        type="button"
        disabled={busy || (kind !== 'sla_days' && !text.trim())}
        onClick={() => void send()}
        className="rounded-md bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
      >
        Confirm
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </span>
  );
}

const SECTIONS = ['definition', 'steps', 'runs'] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABEL: Record<Section, string> = {
  definition: 'Definition',
  steps: 'Steps',
  runs: 'Runs & history',
};

/* ── the block palette (categorized by family, paginated on demand) ────
 * Replaces the flat capped grid of every block. The catalogue is already
 * in hand, so blocks are grouped by their family into collapsible
 * categories, each with a one-line count and a paginated grid — no long
 * list, and opening a category or turning a page fetches nothing.        */

const BLOCK_FAMILY_LABEL: Record<string, string> = {
  ingestion: 'Ingestion',
  transform: 'Transform',
  python_ml: 'Python & ML',
  delivery: 'Delivery',
  control: 'Control & flow',
};
const BLOCK_FAMILY_ORDER = ['ingestion', 'transform', 'python_ml', 'delivery', 'control'];
const BLOCK_PAGE = 9;

function blockFamilyLabel(f?: string): string {
  return BLOCK_FAMILY_LABEL[f ?? ''] ?? (f ?? 'Other').replace(/_/g, ' ');
}

function BlockCategory({
  family,
  items,
  onPick,
  query,
  defaultOpen,
}: {
  family: string;
  items: CatalogBlock[];
  onPick: (b: CatalogBlock) => void;
  query: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((b) => (b.label ?? b.block_type).toLowerCase().includes(q) || b.block_type.toLowerCase().includes(q))
    : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / BLOCK_PAGE));
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(0);
  }, [page, pageCount]);
  const shown = filtered.slice(page * BLOCK_PAGE, (page + 1) * BLOCK_PAGE);
  const isOpen = open || q.length > 0;

  if (q && filtered.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-slate-800/60"
      >
        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{blockFamilyLabel(family)}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {items.length} block{items.length === 1 ? '' : 's'}
        </span>
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <div className="border-t border-slate-100 p-2 dark:border-slate-800">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((b) => (
              <li key={b.block_type}>
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  title={b.description || b.label || b.block_type}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1 text-left text-xs hover:border-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:hover:border-slate-600"
                >
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{b.label ?? b.block_type}</span>
                </button>
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700"
              >
                Previous
              </button>
              <span className="tabular-nums">page {page + 1} of {pageCount}</span>
              <button
                type="button"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BlockPalette({ catalog, onPick }: { catalog: CatalogBlock[]; onPick: (b: CatalogBlock) => void }) {
  const [query, setQuery] = useState('');
  const usable = useMemo(
    () =>
      catalog.filter(
        (b) => (b.editable_in?.workflows?.length ?? 0) > 0 || b.availability?.status === 'available',
      ),
    [catalog],
  );
  const byFamily = useMemo(() => {
    const map = new Map<string, CatalogBlock[]>();
    for (const b of usable) {
      const f = b.family ?? 'other';
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(b);
    }
    const present = [...map.keys()];
    const order = [
      ...BLOCK_FAMILY_ORDER.filter((f) => present.includes(f)),
      ...present.filter((f) => !BLOCK_FAMILY_ORDER.includes(f)),
    ];
    return order.map((f) => [f, map.get(f)!] as const);
  }, [usable]);

  if (usable.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">No block is available for a workflow step here.</p>;
  }

  return (
    <div className="space-y-1.5">
      <label className="relative block">
        <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search blocks"
          aria-label="Search blocks"
          className="h-7 w-full rounded-lg border border-slate-200 bg-white pl-6 pr-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </label>
      {byFamily.map(([family, items], i) => (
        <BlockCategory
          key={family}
          family={family}
          items={items}
          onPick={onPick}
          query={query}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}

export default function StudioWorkflowEditor({
  draftId,
  workflow,
  triggerChoices,
  onClose,
  onChanged,
  onOpenActivation,
}: {
  draftId: string;
  workflow: WorkflowItem;
  triggerChoices: string[];
  onClose: () => void;
  onChanged: () => void;
  onOpenActivation?: () => void;
}) {
  const w = workflow;
  const aid = w.automation_id;
  const ep = (w.edit_paths ?? {}) as EditPaths;
  const steps = useMemo(() => (w.steps ?? []) as StepDef[], [w.steps]);
  const condition = (w.condition ?? null) as {
    chart_id?: string;
    measure?: string;
    aggregator?: string;
    operator?: string;
    threshold?: number | null;
  } | null;
  const windowDef = (w.window ?? null) as { days?: number; limit?: number } | null;

  /** the VISUAL FLOW leads (user directive) — the editor opens on Steps,
   *  except when a decision is missing: then Definition, where that decision
   *  is taken, is the honest landing. */
  const [section, setSection] = useState<Section>(() =>
    (w.prerequisites?.data?.missing?.length ?? 0) +
      (w.prerequisites?.destination?.missing?.length ?? 0) >
    0
      ? 'definition'
      : 'steps',
  );
  /** the buffered change — path → op; ONE patch on Save */
  const [buffer, setBuffer] = useState<Record<string, ModelPatchOp>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [testRun, setTestRun] = useState<WorkflowTestRun | null>(null);
  const [history, setHistory] = useState<{ runs: WorkflowRunsPage; versions: WorkflowVersions } | null>(null);
  /** the canvas selection — click a block, configure it beside */
  const [selStep, setSelStep] = useState<number | null>(null);
  /** e-mail delivery is folded unless already configured — opening it is what
   *  reads the capability (never on mount) */
  const [emailOpen, setEmailOpen] = useState<boolean>(Boolean(w.email?.configured));
  /* AI lane */
  const [aiText, setAiText] = useState('');
  const [aiState, setAiState] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'preview'; ops: ModelPatchOp[]; summary?: string }
    | { kind: 'questions'; questions: string[] }
  >({ kind: 'idle' });
  /* palette */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogBlock[] | 'loading' | null>(null);
  const [pickedBlock, setPickedBlock] = useState<CatalogBlock | null>(null);
  const [blockCfg, setBlockCfg] = useState<Record<string, string>>({});

  const isDirty = Object.keys(buffer).length > 0;

  const stage = useCallback((path: string | undefined, value: unknown, what: string) => {
    if (!path) return;
    setBuffer((b) => ({ ...b, [path]: { op: 'set', path, value } as ModelPatchOp }));
    setError(null);
    void what;
  }, []);

  const save = useCallback(async () => {
    const ops = Object.values(buffer);
    if (ops.length === 0 || busy) return;
    setBusy('save');
    setError(null);
    setUnsupported(null);
    try {
      await patchModel(draftId, ops, true, `edit workflow ${w.name ?? aid}`);
      setBuffer({});
      onChanged();
    } catch (e) {
      if (isUnsupportedPath(e)) setUnsupported('Part of this change is not supported by this backend version yet — nothing was applied.');
      else setError(errText(e));
    } finally {
      setBusy(null);
    }
  }, [aid, buffer, busy, draftId, onChanged, w.name]);

  const close = useCallback(() => {
    if (isDirty && !window.confirm('Unsaved workflow edits — leave and lose them?')) return;
    onClose();
  }, [isDirty, onClose]);

  const runAi = useCallback(async () => {
    const text = aiText.trim();
    if (!text || aiState.kind === 'running') return;
    setAiState({ kind: 'running' });
    setError(null);
    try {
      // automation_id SCOPES the edit to this workflow — the backend bounds
      // the AI to its edit_paths, so the instruction no longer needs to carry
      // the workflow name to stay on target.
      const r = await editModel(draftId, text, undefined, undefined, aid);
      const ops = (r.ops ?? []) as ModelPatchOp[];
      const questions = (r as { questions?: string[] }).questions ?? [];
      if (questions.length > 0) setAiState({ kind: 'questions', questions });
      else if (ops.length > 0) {
        // The scoped edit may drop parts that aimed outside the alert; say so
        // rather than silently applying only some of what was asked.
        const dropped = (r as { dropped_out_of_scope?: string[] }).dropped_out_of_scope ?? [];
        const base = (r as { summary?: string }).summary;
        const summary =
          dropped.length > 0
            ? `${base ? `${base} ` : ''}(${dropped.length} part${
                dropped.length > 1 ? 's' : ''
              } of your request aimed outside this alert and ${
                dropped.length > 1 ? 'were' : 'was'
              } left out.)`
            : base;
        setAiState({ kind: 'preview', ops, summary });
      } else {
        setAiState({ kind: 'idle' });
        setError('The AI proposed no change for that instruction.');
      }
    } catch (e) {
      setAiState({ kind: 'idle' });
      setError(refineErrorText(e));
    }
  }, [aiState.kind, aiText, aid, draftId]);

  const applyAi = useCallback(async () => {
    if (aiState.kind !== 'preview' || busy) return;
    setBusy('ai-apply');
    setError(null);
    try {
      await patchModel(draftId, aiState.ops, true, `AI edit of workflow ${aid}: ${aiText.trim()}`);
      setAiState({ kind: 'idle' });
      setAiText('');
      onChanged();
    } catch (e) {
      if (isUnsupportedPath(e)) setUnsupported('The proposed change touches a path this backend does not allow yet.');
      else setError(errText(e));
    } finally {
      setBusy(null);
    }
  }, [aiState, aiText, aid, busy, draftId, onChanged]);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
    if (catalog == null) {
      setCatalog('loading');
      void getBlocksCatalog()
        .then((r) => setCatalog(r.blocks))
        .catch(() => setCatalog([]));
    }
  }, [catalog]);

  const loadHistory = useCallback(async () => {
    try {
      const [runs, versions] = await Promise.all([
        getWorkflowRuns(draftId, aid),
        getWorkflowVersions(draftId, aid).catch(() => ({ events: [] }) as WorkflowVersions),
      ]);
      setHistory({ runs, versions });
    } catch (e) {
      setError(errText(e));
    }
  }, [aid, draftId]);

  useEffect(() => {
    if (section === 'runs' && history == null) void loadHistory();
  }, [history, loadHistory, section]);

  const act = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(key);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errText(e));
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  /* staged values override the definition for display */
  const staged = <T,>(path: string | undefined, current: T): T =>
    path && buffer[path] ? ((buffer[path] as { value?: unknown }).value as T) : current;

  const stepsBasePath = useMemo(() => {
    const p = ep.steps?.[0];
    return p ? p.replace(/\/\d+$/, '') : null;
  }, [ep.steps]);

  /* the canvas — the SAME definition as block components (legacy-builder
     style): backend positions when the graph carries them, a simple flow
     otherwise; edges follow the sequence */
  const graphMeta = (w.graph?.nodes ?? []) as Array<Record<string, unknown>>;
  const flowNodes: Node[] = useMemo(
    () =>
      steps.map((s, i) => {
        const gn = graphMeta[i] as { position?: { x?: number; y?: number } } | undefined;
        const step = s as StepDef;
        return {
          id: String(i),
          type: 'studioStep',
          position:
            gn?.position?.x != null && gn?.position?.y != null
              ? { x: gn.position.x, y: gn.position.y }
              : { x: i * 240, y: (i % 2) * 90 },
          data: {
            n: i + 1,
            label: String(step.label ?? step.block_type ?? 'step'),
            blockType: step.block_type,
            capability: step.capability,
            selected: selStep === i,
          },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, selStep],
  );
  const flowEdges: Edge[] = useMemo(
    () =>
      steps.slice(1).map((_, i) => ({
        id: `e${i}`,
        source: String(i),
        target: String(i + 1),
      })),
    [steps],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      {/* ── header: name (renamable through its edit path), state, save ── */}
      <div className="flex flex-wrap items-center gap-2">
        {ep.name ? (
          <input
            value={staged(ep.name, w.name ?? aid)}
            onChange={(e) => stage(ep.name, e.target.value, 'name')}
            aria-label="Workflow name"
            className="h-8 w-72 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        ) : (
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{w.name ?? aid}</h3>
        )}
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {w.state ?? 'proposed'}
        </span>
        {w.job_id && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="One definition — its trigger IS the job's trigger">
            job {w.job_id}
          </span>
        )}
        {w.definition_version?.revision != null && (
          <span className="text-xs text-slate-400 dark:text-slate-500">rev {w.definition_version.revision}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void save()}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {busy === 'save' ? 'Saving…' : `Save ${Object.keys(buffer).length} change(s)`}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Close the workflow editor"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* section rail */}
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Workflow editor sections">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            onClick={() => setSection(s)}
            className={`rounded-md px-2.5 py-0.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              section === s
                ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {SECTION_LABEL[s]}
          </button>
        ))}
      </div>

      {/* ── DEFINITION — the phrase, each segment editable in place ────── */}
      {section === 'definition' && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-slate-200 p-3 text-[13px] dark:border-slate-800">
            <dl className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">When</dt>
                <dd className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">{w.phrase?.event ?? '—'}</dd>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  trigger
                  <select
                    value={staged(ep.trigger ?? w.trigger_path, {
                      cron_choice: w.trigger?.cron_choice ?? null,
                    })?.cron_choice ?? 'manual'}
                    disabled={!(ep.trigger ?? w.trigger_path)}
                    aria-label="Workflow trigger"
                    onChange={(e) =>
                      stage(
                        ep.trigger ?? w.trigger_path,
                        { cron_choice: e.target.value === 'manual' ? null : e.target.value },
                        'trigger',
                      )
                    }
                    className="h-7 rounded border border-slate-200 bg-white px-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {triggerChoices.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">If</dt>
                <dd className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                  {w.phrase?.condition ?? (condition ? `${condition.measure ?? ''} ${condition.operator ?? ''} ${condition.threshold ?? '—'}` : 'always')}
                </dd>
                {condition && ep.condition && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <select
                      value={staged(ep.condition, condition)?.operator ?? condition.operator ?? '<'}
                      aria-label="Condition operator"
                      onChange={(e) =>
                        stage(ep.condition, { ...staged(ep.condition, condition), operator: e.target.value }, 'operator')
                      }
                      className="h-7 rounded border border-slate-200 bg-white px-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {['<', '<=', '>', '>=', '==', '!='].map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={String(staged(ep.condition, condition)?.threshold ?? '')}
                      placeholder="threshold"
                      aria-label="Condition threshold"
                      onChange={(e) =>
                        stage(
                          ep.condition,
                          { ...staged(ep.condition, condition), threshold: e.target.value === '' ? null : Number(e.target.value) },
                          'threshold',
                        )
                      }
                      className="h-7 w-24 rounded border border-slate-200 bg-white px-1.5 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    />
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Then</dt>
                <dd className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                  {w.phrase?.action ?? '—'} → {w.phrase?.destination ?? '—'}
                  {w.phrase?.expected_result && (
                    <span className="text-slate-400 dark:text-slate-500"> — {w.phrase.expected_result}</span>
                  )}
                </dd>
                {windowDef && ep.window && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    window
                    <input
                      type="number"
                      min={1}
                      value={String(staged(ep.window, windowDef)?.days ?? '')}
                      aria-label="Window in days"
                      onChange={(e) =>
                        stage(ep.window, { ...staged(ep.window, windowDef), days: Number(e.target.value) || 1 }, 'window')
                      }
                      className="h-7 w-16 rounded border border-slate-200 bg-white px-1.5 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    />
                    day(s)
                  </span>
                )}
              </div>
            </dl>
            {(() => {
              const missing = [
                ...(w.prerequisites?.data?.missing ?? []),
                ...(w.prerequisites?.destination?.missing ?? []),
              ];
              if (missing.length === 0) return null;
              return (
                <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {missing.map((m, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="text-amber-700 dark:text-amber-400">{m.what}</span>
                      <span className="text-slate-400 dark:text-slate-500">{m.why}</span>
                      <MissingDecision draftId={draftId} m={m} onDone={onChanged} />
                    </li>
                  ))}
                </ul>
              );
            })()}
            {w.schedule && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Schedule: {(w.schedule as { active?: boolean }).active ? 'running' : 'not active'}
                {(w.schedule as { note?: string }).note ? ` — ${(w.schedule as { note?: string }).note}` : ''}
                {onOpenActivation && !(w.schedule as { active?: boolean }).active && (
                  <>
                    {' '}
                    <button type="button" onClick={onOpenActivation} className="text-accent-700 hover:underline dark:text-accent-400">
                      open the activation panel
                    </button>
                  </>
                )}
              </p>
            )}

            {/* Deliver by e-mail — FOLDED by default: a reader who doesn't
                want e-mail isn't shown a setup card under every workflow, and
                the capability is read only when they open it (the same
                never-on-mount discipline as the filter values). A workflow
                that already has e-mail configured opens expanded. */}
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              {emailOpen ? (
                <StudioEmailAlertPanel
                  draftId={draftId}
                  automationId={aid}
                  initialEmail={w.email}
                  onConfigured={onChanged}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEmailOpen(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-accent-700 hover:underline dark:text-accent-400"
                >
                  <Mail aria-hidden className="h-4 w-4" />
                  {w.email?.configured ? 'E-mail delivery — configured · edit' : 'Deliver by e-mail…'}
                </button>
              )}
            </div>
          </div>

          {/* the NL lane — same definition, previewed ops, never silent */}
          <div className="rounded-lg border border-accent-200 p-3 dark:border-accent-900/50">
            <label className="flex items-center gap-2">
              <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-accent-500" />
              <input
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void runAi()}
                placeholder="Describe the change — e.g. « alert when stock cover drops under 5 days, weekly »"
                aria-label="Describe the workflow change"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <button
                type="button"
                disabled={aiState.kind === 'running' || !aiText.trim()}
                onClick={() => void runAi()}
                className="shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                {aiState.kind === 'running' ? 'Thinking…' : 'Propose'}
              </button>
            </label>
            {aiState.kind === 'preview' && (
              <div className="mt-2 text-[13px]" role="status">
                <p className="text-slate-700 dark:text-slate-200">
                  {aiState.summary ?? 'The AI proposes these allowlisted changes:'}
                </p>
                {/* lead with the business change, not the JSON pointer; the raw
                    ops stay one click away for anyone who wants them */}
                <ul className="mt-1 space-y-0.5">
                  {aiState.ops.map((op, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
                      {humanOp(op as { op?: string; path?: string })}
                    </li>
                  ))}
                </ul>
                {aiState.ops.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-slate-300">
                      What changes, technically
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {aiState.ops.map((op, i) => (
                        <li key={i} className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {(op as { op?: string }).op} {(op as { path?: string }).path}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void applyAi()}
                    className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiState({ kind: 'idle' })}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
            {aiState.kind === 'questions' && (
              <div className="mt-2 text-[13px]" role="status">
                <p className="text-slate-700 dark:text-slate-200">The AI needs your word first:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600 dark:text-slate-300">
                  {aiState.questions.slice(0, 4).map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* simulate + test on the row of truth */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void act('preview', async () => setPreview(await previewWorkflow(draftId, aid)))
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              {busy === 'preview' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
              Simulate on history
            </button>
            <button
              type="button"
              disabled={busy != null || w.activable?.ok === false}
              title={w.activable?.ok === false ? (w.activable?.reason ?? 'blocked by a decision') : 'Sandbox delivery with proofs'}
              onClick={() =>
                void act('test', async () => {
                  setTestRun(await testRunWorkflowSafe(draftId, aid));
                  onChanged();
                })
              }
              className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy === 'test' ? <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> : <Play aria-hidden className="h-3 w-3" />}
              Test-run (sandbox)
            </button>
            {w.state !== 'stopped' && (
              <button
                type="button"
                disabled={busy != null}
                onClick={() =>
                  void act('stop', async () => {
                    await stopWorkflow(draftId, aid, 'stopped from the editor');
                    onChanged();
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
              >
                <Square aria-hidden className="h-3 w-3" />
                Stop
              </button>
            )}
          </div>
          {preview && (
            <p className="text-[13px] text-slate-600 dark:text-slate-300" role="status">
              {preview.status === 'not_computable'
                ? `Not computable yet — ${(preview.missing ?? []).map((m) => m.what).join('; ')}. No query ran.`
                : `${preview.count ?? '—'} expected triggering(s)${preview.deduplicated ? ` · ${preview.deduplicated} deduplicated` : ''} · no side effects.`}
            </p>
          )}
          {testRun && (
            <p className="text-[13px] text-slate-600 dark:text-slate-300" role="status">
              Delivered {testRun.results?.delivered_new ?? '—'} (before {testRun.results?.deliveries_before ?? '—'} → after {testRun.results?.deliveries_after ?? '—'}) ·{' '}
              <span className="font-mono text-xs">{testRun.evidence?.deliveries_table}</span>
              {testRun.evidence?.is_test_data ? ' · test data' : ''}
            </p>
          )}
          {/* the deduced NEXT step at the success moment — a green test on an
              inactive schedule would otherwise end in silence, and the chain
              propose → review → test → activate stalls right where it worked */}
          {testRun && onOpenActivation && !(w.schedule as { active?: boolean } | undefined)?.active && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The test delivered — this workflow&rsquo;s schedule starts once the application is
              activated.{' '}
              <button
                type="button"
                onClick={onOpenActivation}
                className="text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
              >
                Open the activation panel
              </button>
            </p>
          )}
        </div>
      )}

      {/* ── STEPS — the interactive canvas, legacy-builder style: block
          components on a flow, click a node to configure it beside; the
          palette stays a grid of ready-to-pick components ─────────────── */}
      {section === 'steps' && (
        <div className="mt-3 space-y-2">
          {steps.length === 0 ? (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              This workflow carries no explicit steps — its action is derived from the phrase.
            </p>
          ) : (
            <>
              {/* the visual pipeline stays as the compact overview — clicking a
                  block highlights its card in the rail below */}
              <div className="h-56 rounded-lg border border-slate-200 dark:border-slate-800">
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  nodeTypes={STEP_NODE_TYPES}
                  onNodeClick={(_, n) => setSelStep(Number(n.id))}
                  fitView
                  proOptions={{ hideAttribution: true }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  zoomOnScroll={false}
                  preventScrolling={false}
                >
                  <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>

              {/* ── the STEP RAIL — every step is a card with its params
                  visible and editable IN PLACE (no hunting behind a click);
                  arrays and typed fields render as what they are ────────── */}
              <ol className="space-y-0">
                {steps.map((s0, i) => {
                  const path = ep.steps?.[i];
                  const stagedStep = staged(path, s0);
                  const cfg = (stagedStep?.config ?? {}) as Record<string, unknown>;
                  const { Icon, tone } = stepIcon(s0.block_type, s0.capability, s0.label);
                  const meta = graphMeta[i] as { status?: string; executable?: boolean } | undefined;
                  const isNotify = String(s0.capability ?? '').startsWith('notify');
                  const fields = paramFieldsOf(cfg);
                  const setCfg = (k: string, v: unknown) =>
                    stage(path, { ...stagedStep, config: { ...cfg, [k]: v } }, `step ${i}`);
                  return (
                    <li key={s0.step_id ?? i} className="relative">
                      {i > 0 && (
                        <div className="ml-6 h-3 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
                      )}
                      <section
                        className={`rounded-xl border bg-white p-3 dark:bg-slate-900 ${
                          selStep === i
                            ? 'border-accent-500 ring-1 ring-accent-500/40'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 ${tone}`}
                          >
                            <Icon aria-hidden className="h-4 w-4" />
                          </span>
                          <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                            {i + 1}
                          </span>
                          <span className="min-w-0 truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">
                            {stagedStep?.label ?? s0.label ?? s0.block_type ?? `step ${i + 1}`}
                          </span>
                          {s0.block_type && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {s0.block_type.replace(/_/g, ' ')}
                            </span>
                          )}
                          {meta?.status && meta.status !== 'available' && (
                            <span className="rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {meta.status.replace(/_/g, ' ')}
                            </span>
                          )}
                          {path && stepsBasePath && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = steps.filter((_, j) => j !== i);
                                setBuffer((b) => ({
                                  ...b,
                                  [stepsBasePath]: { op: 'set', path: stepsBasePath, value: next } as ModelPatchOp,
                                }));
                                setSelStep(null);
                              }}
                              className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-red-400"
                              title="Removes this step from the staged sequence — nothing changes before Save"
                            >
                              remove
                            </button>
                          )}
                        </div>

                        {/* params, BY STEP — typed controls, nothing hidden */}
                        {fields.length > 0 && (
                          <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                            {fields.map((f) => {
                              const raw = cfg[f.key];
                              const editable = Boolean(path) && f.kind !== 'readonly';
                              if (f.kind === 'predicate' && isPlaceholder(raw)) {
                                return (
                                  <div key={f.key} className="sm:col-span-2 lg:col-span-3">
                                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">{f.label}</span>
                                    <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                      {String(raw).replace(/[<>]/g, '')} — filled at save from the decision on the
                                      Definition tab; the AI never invents it.
                                    </p>
                                  </div>
                                );
                              }
                              if (f.kind === 'select') {
                                const cur = String(raw ?? f.options?.[0] ?? '');
                                return (
                                  <label key={f.key} className="block">
                                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">{f.label}</span>
                                    <select
                                      value={cur}
                                      disabled={!editable}
                                      onChange={(e) => setCfg(f.key, e.target.value)}
                                      className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                    >
                                      {(f.options ?? []).map((o) => (
                                        <option key={o} value={o}>{o}</option>
                                      ))}
                                    </select>
                                  </label>
                                );
                              }
                              if (f.kind === 'readonly') {
                                return (
                                  <div key={f.key} className="min-w-0">
                                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">{f.label}</span>
                                    <p className={`truncate text-xs text-slate-600 dark:text-slate-300 ${f.mono ? 'font-mono' : ''}`} title={String(raw ?? '')}>
                                      {Array.isArray(raw) ? raw.join(', ') : typeof raw === 'object' && raw != null ? JSON.stringify(raw) : String(raw ?? '—')}
                                    </p>
                                  </div>
                                );
                              }
                              const value =
                                f.kind === 'list' && Array.isArray(raw)
                                  ? raw.join(', ')
                                  : String(raw ?? '');
                              const wide = f.kind === 'predicate' || f.key === 'chart_ids';
                              return (
                                <label key={f.key} className={`block ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`} title={f.hint}>
                                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                                    {f.label}
                                    {f.hint && <span className="ml-1 text-slate-300 dark:text-slate-600">· {f.hint}</span>}
                                  </span>
                                  <input
                                    value={value}
                                    disabled={!editable}
                                    type={f.kind === 'number' ? 'number' : 'text'}
                                    onChange={(e) =>
                                      setCfg(
                                        f.key,
                                        f.kind === 'number'
                                          ? Number(e.target.value)
                                          : f.kind === 'list'
                                            ? e.target.value.split(',').map((x) => x.trim()).filter(Boolean)
                                            : e.target.value,
                                      )
                                    }
                                    className={`h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${f.mono ? 'font-mono' : ''}`}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {!path && (
                          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">read-only in this version</p>
                        )}

                        {/* ── the DESTINATION space, deep and honest — on the
                            notify step only: where this workflow can deliver,
                            each channel with its REAL status ─────────────── */}
                        {isNotify && (
                          <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Where it delivers
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {(w.destinations ?? []).map((d) => (
                                <span
                                  key={d.capability}
                                  title={d.test_destination ? `Test goes to ${d.test_destination}` : undefined}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                >
                                  <Check aria-hidden className="h-3 w-3" />
                                  {d.label ?? d.capability}
                                </span>
                              ))}
                              {(w.not_available ?? []).map((d) =>
                                d.status === 'to_configure' ? (
                                  <button
                                    key={d.capability}
                                    type="button"
                                    onClick={() => setEmailOpen(true)}
                                    title="Configurable — opens the e-mail delivery panel below"
                                    className="inline-flex items-center gap-1 rounded-full border border-sky-300/70 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-950/30"
                                  >
                                    <Mail aria-hidden className="h-3 w-3" />
                                    {d.label ?? d.capability} — configure…
                                  </button>
                                ) : (
                                  <span
                                    key={d.capability}
                                    title="Not integrated on this account — shown so the possibility space is honest, never as activable"
                                    className="inline-flex cursor-not-allowed items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                                  >
                                    {d.label ?? d.capability} — not integrated
                                  </span>
                                ),
                              )}
                            </div>
                            {stepsBasePath && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-slate-400 dark:text-slate-500">also deliver as</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next: StepDef = {
                                      step_id: `s_${Math.abs(Date.now() % 1_000_000)}`,
                                      block_type: 'export',
                                      capability: 'workflow.export_file',
                                      label: 'Export the result file',
                                      config: { format: 'CSV' },
                                    };
                                    setBuffer((b) => ({
                                      ...b,
                                      [stepsBasePath]: { op: 'set', path: stepsBasePath, value: [...steps, next] } as ModelPatchOp,
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                                  title="Appends an export step (CSV/JSON/PARQUET to a stage file) — staged, nothing changes before Save"
                                >
                                  <Send aria-hidden className="h-3 w-3" /> a stage file
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next: StepDef = {
                                      step_id: `s_${Math.abs(Date.now() % 1_000_000)}`,
                                      block_type: 'destination',
                                      capability: 'workflow.destination',
                                      label: 'Write the result table',
                                      config: {},
                                    };
                                    setBuffer((b) => ({
                                      ...b,
                                      [stepsBasePath]: { op: 'set', path: stepsBasePath, value: [...steps, next] } as ModelPatchOp,
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                                  title="Appends a write-a-table step — staged, nothing changes before Save"
                                >
                                  <Database aria-hidden className="h-3 w-3" /> a table
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {/* palette — the catalogue's real blocks, a grid of ready-to-pick
              components (family said on every card, honest availability) */}
          {stepsBasePath && (
            <div>
              <button
                type="button"
                onClick={() => (paletteOpen ? setPaletteOpen(false) : openPalette())}
                aria-expanded={paletteOpen}
                className="rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
              >
                {paletteOpen ? 'Close the palette' : 'Add a step…'}
              </button>
              {paletteOpen && (
                <div className="mt-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                  {catalog === 'loading' || catalog == null ? (
                    <div role="status" className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="sr-only">Reading the block catalogue…</span>
                    </div>
                  ) : pickedBlock ? (
                    <div className="text-[13px]">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{pickedBlock.label ?? pickedBlock.block_type}</p>
                      {pickedBlock.description && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{pickedBlock.description}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {(pickedBlock.config_schema ?? []).slice(0, 8).map((f) => (
                          <label key={f.name} className="block">
                            <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                              {f.name.replace(/_/g, ' ')}
                              {f.required ? ' *' : ''}
                            </span>
                            <input
                              value={blockCfg[f.name] ?? String(f.default ?? '')}
                              placeholder={f.description}
                              onChange={(e) => setBlockCfg((c) => ({ ...c, [f.name]: e.target.value }))}
                              className="h-7 w-44 rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const next: StepDef = {
                              step_id: `s_${Math.abs(Date.now() % 1_000_000)}`,
                              block_type: pickedBlock.block_type,
                              label: pickedBlock.label ?? pickedBlock.block_type,
                              config: Object.fromEntries(
                                Object.entries(blockCfg).filter(([, v]) => v !== ''),
                              ),
                            };
                            setBuffer((b) => ({
                              ...b,
                              [stepsBasePath]: {
                                op: 'set',
                                path: stepsBasePath,
                                value: [...steps, next],
                              } as ModelPatchOp,
                            }));
                            setPickedBlock(null);
                            setBlockCfg({});
                            setPaletteOpen(false);
                          }}
                          className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700"
                        >
                          Stage the step
                        </button>
                        <button type="button" onClick={() => setPickedBlock(null)} className="rounded px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
                          Back
                        </button>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Nothing changes before Save; a refused path renders as an answer.</span>
                      </div>
                    </div>
                  ) : (
                    <BlockPalette catalog={catalog} onPick={setPickedBlock} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RUNS & HISTORY ─────────────────────────────────────────────── */}
      {section === 'runs' && (
        <div className="mt-3">
          {history == null ? (
            <div role="status" className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
              <span className="sr-only">Reading the history…</span>
            </div>
          ) : (
            <div className="space-y-2 text-[13px]">
              {history.runs.items.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">
                  No execution recorded.
                  {history.runs.scheduled?.available === false ? ` ${history.runs.scheduled.reason}.` : ''}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      <tr>
                        <th className="px-2 py-1 font-medium">Kind</th>
                        <th className="px-2 py-1 font-medium">Result</th>
                        <th className="px-2 py-1 font-medium">Delivered</th>
                        <th className="px-2 py-1 font-medium">When</th>
                        <th className="px-2 py-1 font-medium">Version</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {history.runs.items.map((r, i) => (
                        <tr key={r.run_id ?? i}>
                          <td className="whitespace-nowrap px-2 py-1">{r.kind === 'test' ? 'test run' : (r.kind ?? '—')}</td>
                          <td className="whitespace-nowrap px-2 py-1">{r.status ?? '—'}</td>
                          <td className="whitespace-nowrap px-2 py-1 tabular-nums">{r.delivered ?? '—'}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                            {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400">{r.version ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(history.versions.events.length ?? 0) > 0 && (
                <div className="border-t border-slate-100 pt-1.5 dark:border-slate-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Definition history</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {history.versions.events.slice(0, 8).map((ev, i) => (
                      <li key={i} className="text-slate-600 dark:text-slate-300">
                        {ev.at ? new Date(ev.at).toLocaleString() : '—'} · {ev.summary ?? ev.kind ?? 'change'}
                        {ev.by ? ` · by ${ev.by}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {unsupported && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">{unsupported}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}

/** testRunWorkflow with its service signature kept at arm's length. */
async function testRunWorkflowSafe(draftId: string, aid: string): Promise<WorkflowTestRun> {
  return testRunWorkflow(draftId, aid);
}
