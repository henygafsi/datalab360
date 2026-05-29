'use client';

/**
 * DeployAppWizard — 5-step modal that scaffolds an app and hands off to
 * Snowpark Services / BI Dashboard / Connect for the actual deploy.
 *
 * Steps:
 *   1. App kind        — Streamlit / Container / Chart / Connector
 *   2. Data source     — Workflow output | Explore-Design dataset | Connect feed
 *   3. Describe + gen  — free text + ModelSelector → /cortex/complete
 *   4. Review + sandbox — generated code, reroll, "test in sandbox" (backend gap)
 *   5. Deploy handoff  — deep-link button to the right Snowpark sub-tab
 *
 * Persists state to localStorage on every transition so a refresh keeps the
 * user where they were. Records `AI_CODE_GENERATED` after step 3 and
 * `ARTEFACT_PUBLISHED` once step 5's redirect button is clicked (fire-and-
 * forget — telemetry never blocks the user flow).
 *
 * Matches the shell rhythm of GuidedAiWorkflowWizard.tsx: full-screen
 * backdrop, framer-motion spring entry, AnimatePresence step transitions.
 * Closing is non-destructive (the draft is always persisted + resumable from
 * the Deploy App home) so there is no discard-confirm dialog.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import {
  FALLBACK_MODELS,
  FALLBACK_RECOMMENDATIONS,
  useCortexModels,
} from '@/components/ui/model-selector';
import { addEvent } from '@/app/services/api/projectsApi';
import {
  generateCompletion,
  type LLMModel,
} from '@/app/services/cortex/ml-features';

import AppKindPicker from './AppKindPicker';
import AppSourcePicker from './AppSourcePicker';
import AppCodeReview from './AppCodeReview';
import AppDeployHandoff from './AppDeployHandoff';

/* ──────────────────────────────────────────────────────────────────────────
 * Public types — also imported by page.tsx + DeployAppHome.
 * ────────────────────────────────────────────────────────────────────────── */

export type AppKind = 'streamlit' | 'container' | 'chart' | 'connector';

export type SourceMode = 'workflow' | 'dataset' | 'connector';

export interface SourceSelection {
  mode: SourceMode | null;
  /** Workflow project id when mode='workflow'. */
  workflowId?: string;
  workflowName?: string;
  /** Database/schema/table when mode='dataset' OR resolved from workflow. */
  database?: string;
  schema?: string;
  table?: string;
  /** Connector slug when mode='connector' (backend-gap). */
  connectorId?: string;
}

export interface WizardSnapshot {
  step: 1 | 2 | 3 | 4 | 5;
  kind: AppKind | null;
  appName: string;
  source: SourceSelection;
  prompt: string;
  modelId: string;
  generatedCode: string;
  autoStop: boolean;
  estCredits: number;
  /** Timestamp of last save — used to sort the drafts list. */
  updatedAt: number;
  /** Stable id so resume + drafts can match the same draft over time. */
  draftId: string;
}

export interface AuditEntry {
  ts: number;
  kind: 'kind' | 'source' | 'generate' | 'reroll' | 'sandbox' | 'handoff';
  message: string;
}

interface Props {
  open: boolean;
  initialKind: AppKind | null;
  resumeSnapshot: WizardSnapshot | null;
  onClose: () => void;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Constants — localStorage keys + step metadata.
 * ────────────────────────────────────────────────────────────────────────── */

export const LS_KEY_WIZARD = 'data360.deploy-app.wizard-state';
export const LS_KEY_DRAFTS = 'data360.deploy-app.drafts';

const STEPS: { id: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { id: 1, label: 'App kind' },
  { id: 2, label: 'Data source' },
  { id: 3, label: 'Describe & generate' },
  { id: 4, label: 'Review & sandbox' },
  { id: 5, label: 'Deploy' },
];

const HANDOFF_SUB_BY_KIND: Record<AppKind, string> = {
  streamlit: 'streamlit',
  container: 'services',
  chart: 'chart',
  connector: 'connector',
};

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function newDraftId(): string {
  return `da_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function emptySnapshot(initialKind: AppKind | null): WizardSnapshot {
  return {
    step: initialKind ? 2 : 1,
    kind: initialKind,
    appName: '',
    source: { mode: null },
    prompt: '',
    modelId: '',
    generatedCode: '',
    autoStop: true,
    estCredits: 0,
    updatedAt: Date.now(),
    draftId: newDraftId(),
  };
}

function readDrafts(): WizardSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY_DRAFTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WizardSnapshot[]) : [];
  } catch {
    return [];
  }
}

function writeDrafts(list: WizardSnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY_DRAFTS, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* quota — ignore */
  }
}

function upsertDraft(snap: WizardSnapshot): void {
  const list = readDrafts();
  const idx = list.findIndex((d) => d.draftId === snap.draftId);
  const next = idx >= 0 ? list.slice() : [snap, ...list];
  if (idx >= 0) next[idx] = snap;
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  writeDrafts(next);
}

function persistWizard(snap: WizardSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY_WIZARD, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

function clearWizard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LS_KEY_WIZARD);
  } catch {
    /* ignore */
  }
}

/** Fire-and-forget audit event. Never throws; never blocks the UI. */
function fireAuditEvent(
  eventType: 'AI_CODE_GENERATED' | 'ARTEFACT_PUBLISHED',
  details: Record<string, unknown>,
): void {
  try {
    const projectId =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('data360.currentProjectId') ||
          window.localStorage.getItem('currentProjectId') ||
          ''
        : '';
    if (!projectId) {
      // No project context — drop telemetry silently.
      console.warn(
        '[deploy-app] no currentProjectId in localStorage; skipping audit event',
        eventType,
      );
      return;
    }
    void addEvent(projectId, {
      module_name: 'deploy-app',
      event_type: eventType,
      status: 'applied',
      details,
    }).catch((err: unknown) => {
      console.warn('[deploy-app] addEvent failed', eventType, err);
    });
  } catch (err) {
    console.warn('[deploy-app] fireAuditEvent threw', err);
  }
}

/** Build a per-kind prompt template that injects the source schema. */
function buildCodePrompt(
  kind: AppKind,
  userPrompt: string,
  source: SourceSelection,
): string {
  const schemaLine =
    source.database && source.schema && source.table
      ? `Source table: ${source.database}.${source.schema}.${source.table}`
      : 'Source: (none provided)';

  const userBlock = userPrompt.slice(0, 600);

  switch (kind) {
    case 'streamlit':
      return `Generate a single-file Streamlit Snowflake app (max 60 lines, no markdown).
${schemaLine}
The script must:
- import streamlit as st
- read from the source table via the active Snowflake session
- render the visual described below
Goal: ${userBlock}`;
    case 'container':
      return `Generate a minimal Dockerfile + Python entrypoint (max 60 lines, no markdown).
${schemaLine}
Output the Dockerfile first, then "---" and the entrypoint code.
Goal: ${userBlock}`;
    case 'chart':
      return `Generate an ECharts option object as a single JSON literal (no markdown, no functions).
${schemaLine}
The chart must visualise the goal below. Output ONLY the JSON.
Goal: ${userBlock}`;
    case 'connector':
      return `Generate a Python connector stub (max 50 lines, no markdown).
${schemaLine}
Implement a class Connector with connect(), fetch_schema(), fetch_rows().
Goal: ${userBlock}`;
    default:
      return userBlock;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export default function DeployAppWizard({
  open,
  initialKind,
  resumeSnapshot,
  onClose,
}: Props) {
  const { models, recommendations } = useCortexModels();
  const safeModels = models.length > 0 ? models : FALLBACK_MODELS;
  const safeRecs =
    recommendations && Object.keys(recommendations).length > 0
      ? recommendations
      : FALLBACK_RECOMMENDATIONS;

  const [snap, setSnap] = useState<WizardSnapshot>(() =>
    resumeSnapshot ?? emptySnapshot(initialKind),
  );
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // When the modal re-opens with a different intent, reset state.
  useEffect(() => {
    if (!open) return;
    if (resumeSnapshot) {
      setSnap(resumeSnapshot);
      setAudit([]);
      return;
    }
    setSnap((prev) => {
      // If the modal was previously closed and we now have a fresh kind, reset.
      if (initialKind && prev.kind !== initialKind) {
        return emptySnapshot(initialKind);
      }
      // Otherwise honour any in-progress state.
      return prev.draftId ? prev : emptySnapshot(initialKind);
    });
    setAudit([]);
  }, [open, initialKind, resumeSnapshot]);

  // Default the model to the "code" recommendation once models load.
  useEffect(() => {
    setSnap((prev) => {
      if (prev.modelId) return prev;
      const target = safeRecs.code || safeModels[0]?.id || '';
      if (!target) return prev;
      return { ...prev, modelId: target, updatedAt: Date.now() };
    });
  }, [safeModels, safeRecs]);

  // Persist snapshot on every change while open.
  useEffect(() => {
    if (!open) return;
    persistWizard(snap);
    upsertDraft(snap);
  }, [open, snap]);

  // Focus the wizard body on step change for screen readers.
  useEffect(() => {
    bodyRef.current?.focus();
  }, [snap.step]);

  /* ── State setters ──────────────────────────────────────────────── */

  const update = useCallback(
    <K extends keyof WizardSnapshot>(key: K, value: WizardSnapshot[K]) => {
      setSnap((prev) => ({ ...prev, [key]: value, updatedAt: Date.now() }));
    },
    [],
  );

  const updateSource = useCallback((patch: Partial<SourceSelection>) => {
    setSnap((prev) => ({
      ...prev,
      source: { ...prev.source, ...patch },
      updatedAt: Date.now(),
    }));
  }, []);

  const pushAudit = useCallback(
    (kind: AuditEntry['kind'], message: string) => {
      setAudit((prev) => [
        ...prev,
        { ts: Date.now(), kind, message },
      ]);
    },
    [],
  );

  const setStep = useCallback((step: WizardSnapshot['step']) => {
    setSnap((prev) => ({ ...prev, step, updatedAt: Date.now() }));
  }, []);

  /* ── Navigation gates ───────────────────────────────────────────── */

  const canAdvance = useMemo(() => {
    switch (snap.step) {
      case 1:
        return !!snap.kind;
      case 2: {
        if (snap.source.mode === 'workflow') return !!snap.source.workflowId;
        if (snap.source.mode === 'dataset')
          return !!snap.source.database && !!snap.source.schema && !!snap.source.table;
        // Connector mode is backend-gap → blocked.
        return false;
      }
      case 3:
        return snap.prompt.trim().length > 0 && snap.generatedCode.length > 0;
      case 4:
        return snap.generatedCode.length > 0;
      case 5:
        return true;
      default:
        return false;
    }
  }, [snap]);

  /* ── AI generation (steps 3 + 4) ─────────────────────────────────── */

  const runGenerate = useCallback(
    async (isReroll: boolean) => {
      if (!snap.kind) {
        setGenError('Pick an app kind first.');
        return;
      }
      if (!snap.prompt.trim()) {
        setGenError('Describe what your app should do.');
        return;
      }
      setGenError(null);
      setBusy(true);
      const tid = toast.loading(isReroll ? 'Re-rolling…' : 'Generating code…');
      try {
        const fullPrompt = buildCodePrompt(snap.kind, snap.prompt, snap.source);
        // The Cortex catalog can return arbitrary model ids; cast through
        // the union to satisfy the legacy CompletionRequest type without
        // dropping the broader catalog selection.
        const modelArg = (snap.modelId || safeRecs.code || 'mistral-7b') as LLMModel;
        const out = await generateCompletion({
          prompt: fullPrompt,
          model: modelArg,
        });
        const code = (out.response || '').trim();
        if (!code) {
          throw new Error('Cortex returned an empty response.');
        }
        setSnap((prev) => ({
          ...prev,
          generatedCode: code,
          updatedAt: Date.now(),
        }));
        pushAudit(
          isReroll ? 'reroll' : 'generate',
          `${isReroll ? 'Re-rolled' : 'Generated'} ${snap.kind} code with ${out.model}`,
        );
        fireAuditEvent('AI_CODE_GENERATED', {
          app_kind: snap.kind,
          model: out.model,
          reroll: isReroll,
        });
        toast.success(isReroll ? 'New version ready' : 'Code generated', {
          id: tid,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        setGenError(msg);
        toast.dismiss(tid);
      } finally {
        setBusy(false);
      }
    },
    [snap.kind, snap.prompt, snap.source, snap.modelId, safeRecs.code, pushAudit],
  );

  /* ── Handoff (step 5) ────────────────────────────────────────────── */

  const buildHandoffUrl = useCallback((): string => {
    const kind = snap.kind || 'streamlit';
    const sub = HANDOFF_SUB_BY_KIND[kind];

    const baseByKind: Record<AppKind, string> = {
      streamlit: '/intelligent',
      container: '/intelligent',
      chart: '/bi-dashboard',
      connector: '/data-source-connection',
    };

    const config = {
      appName: snap.appName || `app-${snap.draftId}`,
      kind,
      source: snap.source,
      prompt: snap.prompt,
      autoStop: snap.autoStop,
      code: snap.generatedCode.slice(0, 4000),
      draftId: snap.draftId,
    };

    let prefill = '';
    try {
      prefill = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(config)))));
    } catch {
      prefill = '';
    }

    if (kind === 'streamlit' || kind === 'container') {
      return `${baseByKind[kind]}?tab=snowpark-services&sub=${sub}&prefill=${prefill}`;
    }
    return `${baseByKind[kind]}?prefill=${prefill}`;
  }, [snap]);

  const recordHandoff = useCallback(() => {
    pushAudit('handoff', `Opened ${snap.kind} target with prefilled config`);
    fireAuditEvent('ARTEFACT_PUBLISHED', {
      app_kind: snap.kind,
      app_name: snap.appName,
      auto_stop: snap.autoStop,
      source: snap.source,
    });
  }, [snap.kind, snap.appName, snap.autoStop, snap.source, pushAudit]);

  /* ── Modal exit ──────────────────────────────────────────────────── */

  const handleRequestClose = useCallback(() => {
    // Closing is non-destructive: every change is already persisted to the
    // drafts list (upsertDraft) and resumable from the Deploy App home, so we
    // clear only the resume-in-place snapshot and close — no confirm needed.
    clearWizard();
    onClose();
  }, [onClose]);

  /* ── Render ──────────────────────────────────────────────────────── */

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-slate-900/50 backdrop-blur-sm"
        onClick={handleRequestClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Deploy App wizard"
          className="m-auto flex h-[min(900px,95vh)] w-[min(1100px,95vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          {/* Top bar ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30">
                <Rocket className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Deploy App
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Scaffold an app, then hand off to Snowpark Services
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ol className="hidden items-center gap-1.5 md:flex" aria-label="Wizard progress">
                {STEPS.map((s, idx) => {
                  const active = s.id === snap.step;
                  const done = s.id < snap.step;
                  return (
                    <li
                      key={s.id}
                      aria-current={active ? 'step' : undefined}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                          done
                            ? 'bg-emerald-500 text-white'
                            : active
                              ? 'bg-cyan-600 text-white ring-2 ring-cyan-200 dark:ring-cyan-900/60'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                        )}
                      >
                        {done ? <Check className="h-3 w-3" /> : s.id}
                      </span>
                      <span
                        className={cn(
                          'hidden text-[11px] font-medium lg:inline',
                          active
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-400',
                        )}
                      >
                        {s.label}
                      </span>
                      {idx < STEPS.length - 1 && (
                        <span className="mx-0.5 h-px w-3 bg-slate-300 dark:bg-slate-600" />
                      )}
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label="Close wizard"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body ─────────────────────────────────────────────────── */}
          <div
            ref={bodyRef}
            tabIndex={-1}
            className="relative flex-1 overflow-y-auto focus:outline-none"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={snap.step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="px-8 py-6"
              >
                {snap.step === 1 && (
                  <AppKindPicker
                    value={snap.kind}
                    appName={snap.appName}
                    onAppNameChange={(v) => update('appName', v)}
                    onChange={(k) => {
                      update('kind', k);
                      pushAudit('kind', `Picked kind: ${k}`);
                    }}
                  />
                )}
                {snap.step === 2 && (
                  <AppSourcePicker
                    value={snap.source}
                    onChange={(patch) => {
                      updateSource(patch);
                      pushAudit('source', `Updated source: ${JSON.stringify(patch)}`);
                    }}
                  />
                )}
                {snap.step === 3 && (
                  <Step3Describe
                    snap={snap}
                    models={safeModels}
                    recsCode={safeRecs.code}
                    error={genError}
                    onPromptChange={(v) => {
                      update('prompt', v);
                      if (genError) setGenError(null);
                    }}
                    onModelChange={(v) => update('modelId', v)}
                    onGenerate={() => void runGenerate(false)}
                    busy={busy}
                  />
                )}
                {snap.step === 4 && (
                  <AppCodeReview
                    snap={snap}
                    models={safeModels}
                    error={genError}
                    onModelChange={(v) => update('modelId', v)}
                    onReroll={() => void runGenerate(true)}
                    onToggleAutoStop={(v) => update('autoStop', v)}
                    onEstimateCredits={(v) => update('estCredits', v)}
                    busy={busy}
                  />
                )}
                {snap.step === 5 && (
                  <AppDeployHandoff
                    snap={snap}
                    audit={audit}
                    buildUrl={buildHandoffUrl}
                    onHandoff={recordHandoff}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 dark:border-slate-700 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={() => {
                if (snap.step > 1) setStep((snap.step - 1) as WizardSnapshot['step']);
              }}
              disabled={snap.step === 1 || busy}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                snap.step === 1 || busy
                  ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                  : 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800',
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3 w-3 text-cyan-500" />
              Step {snap.step} of {STEPS.length}
            </div>
            <button
              type="button"
              onClick={() => {
                if (snap.step < 5 && canAdvance) {
                  setStep((snap.step + 1) as WizardSnapshot['step']);
                }
              }}
              disabled={!canAdvance || snap.step === 5 || busy}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                canAdvance && snap.step < 5 && !busy
                  ? 'bg-cyan-600 text-white shadow-sm hover:bg-cyan-700'
                  : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
              )}
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Step 3 — inline because it's small and tightly bound to the wizard state.
 * ────────────────────────────────────────────────────────────────────────── */

interface Step3Props {
  snap: WizardSnapshot;
  models: { id: string; label?: string }[];
  recsCode?: string;
  error: string | null;
  onPromptChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onGenerate: () => void;
  busy: boolean;
}

function Step3Describe({
  snap,
  models,
  recsCode,
  error,
  onPromptChange,
  onModelChange,
  onGenerate,
  busy,
}: Step3Props) {
  const selected = snap.modelId || recsCode || models[0]?.id || '';
  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Describe your app
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          One sentence is enough. Cortex will draft the code grounded on the source schema you picked.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <label
          htmlFor="deploy-app-prompt"
          className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          What should the app do?
        </label>
        <textarea
          id="deploy-app-prompt"
          value={snap.prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={4}
          placeholder="Show last 30 days of sales by region with a top-5 product table beside the chart."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-cyan-900/40"
        />

        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="deploy-app-model"
            className="text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Model
          </label>
          <select
            id="deploy-app-model"
            value={selected}
            onChange={(e) => onModelChange(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy || !snap.prompt.trim()}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              busy || !snap.prompt.trim()
                ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md hover:from-purple-700 hover:to-fuchsia-700',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {snap.generatedCode ? 'Re-generate' : 'Generate code'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {snap.generatedCode && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Preview
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(snap.generatedCode);
                  toast.success('Copied to clipboard');
                }
              }}
              className="text-[11px] text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Copy
            </button>
          </div>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 dark:bg-slate-950">
            {snap.generatedCode}
          </pre>
        </div>
      )}
    </div>
  );
}
