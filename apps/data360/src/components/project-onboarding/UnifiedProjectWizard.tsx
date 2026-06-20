'use client';

/**
 * UnifiedProjectWizard — the single, unified project-creation flow for both
 * the Workflow and Explore & Design modules.
 *
 * Replaces three fragmented creation UIs (InlineProjectWizard,
 * ProjectSelector's create tab, WorkflowProjectGate's create form) and makes
 * the manual / AI / template choice EXPLICIT instead of implicit.
 *
 * Steps:
 *   1. Identity   — name (validated), description, tags.
 *   2. Fork       — Build manually / Guide me with AI / Start from a template.
 *   3. Detail     — conditional: AI description textarea, or template gallery
 *                   (manual skips straight to create).
 *
 * On the final action the project is created via the right API, a
 * `build:<mode>` tag is appended for governance, and `onCreated` fires with
 * the build mode + any AI description / template id the host needs to
 * continue the flow.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Hammer,
  Loader2,
  Sparkles,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { createExploreProject } from '@/app/services/api/exploreDesignApi';
import * as workflowApi from '@/app/services/api/workflowApi';
import { getApiErrorMessage } from '@/lib/api-client';
import ManualAiTemplateFork, { type BuildMode } from './ManualAiTemplateFork';
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from './workflow-templates';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UnifiedProjectWizardResult {
  projectId: string;
  projectName: string;
  buildMode: BuildMode;
  templateId?: string;
  aiDescription?: string;
}

export interface UnifiedProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drives terminology, the template set, and which create API is called. */
  module: 'workflow' | 'explore-design';
  onCreated: (result: UnifiedProjectWizardResult) => void;
}

type Step = 1 | 2 | 3;

const NAME_MAX = 80;
const NAME_MIN = 3;

/** Explore-design template gallery — the DWH template + two model templates. */
interface ExploreTemplate {
  id: string;
  title: string;
  description: string;
  preview: string[];
}

const EXPLORE_TEMPLATES: ExploreTemplate[] = [
  {
    id: 'dwh_template',
    title: 'Data warehouse starter',
    description:
      'A proven star-schema scaffold — fact + dimension tables, ready to map.',
    preview: ['fact', 'dim_date', 'dim_customer', 'dim_product'],
  },
  {
    id: 'customer_model',
    title: 'Customer analytics model',
    description:
      'Customer-centric model with order facts and a behaviour dimension.',
    preview: ['fact_orders', 'dim_customer', 'dim_segment'],
  },
  {
    id: 'event_model',
    title: 'Event tracking model',
    description: 'Event-stream model for product analytics and funnels.',
    preview: ['fact_events', 'dim_user', 'dim_session'],
  },
];

const AI_EXAMPLES: Record<UnifiedProjectWizardProps['module'], string[]> = {
  workflow: [
    'Read orders from Snowflake, compute daily revenue per store, write a KPI table.',
    'Score customer reviews for sentiment and flag the negative ones.',
    'Join clickstream with users, rank sessions, keep the top events.',
  ],
  'explore-design': [
    'Model a star schema for retail sales with date, store and product dimensions.',
    'Build a customer 360 model joining CRM, orders and support tickets.',
    'Design an event-tracking model for product funnel analysis.',
  ],
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UnifiedProjectWizard({
  open,
  onOpenChange,
  module,
  onCreated,
}: UnifiedProjectWizardProps) {
  const isWorkflow = module === 'workflow';
  const moduleNoun = isWorkflow ? 'workflow' : 'data model';
  const moduleLabel = isWorkflow ? 'Workflow' : 'Explore & Design';

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null);
  const [aiDescription, setAiDescription] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setName('');
    setDescription('');
    setTagInput('');
    setTags([]);
    setBuildMode(null);
    setAiDescription('');
    setTemplateId(null);
    setSubmitting(false);
  }, []);

  const isDirty =
    name.trim().length > 0 ||
    description.trim().length > 0 ||
    tags.length > 0 ||
    buildMode !== null;

  const trimmedName = name.trim();
  const nameError =
    trimmedName.length > 0 && trimmedName.length < NAME_MIN
      ? `At least ${NAME_MIN} characters.`
      : trimmedName.length > NAME_MAX
        ? `Keep it under ${NAME_MAX} characters.`
        : '';
  const nameValid =
    trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;

  // Step 2 (fork) is the final step for manual mode.
  const isLastStep = step === 3 || (step === 2 && buildMode === 'manual');

  const canContinue = useMemo(() => {
    if (step === 1) return nameValid;
    if (step === 2) return buildMode !== null;
    if (step === 3) {
      if (buildMode === 'ai') return aiDescription.trim().length >= 10;
      if (buildMode === 'template') return templateId !== null;
    }
    return true;
  }, [step, nameValid, buildMode, aiDescription, templateId]);

  /* ----- navigation ----- */

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (isDirty) {
      setShowDiscard(true);
      return;
    }
    onOpenChange(false);
  }, [submitting, isDirty, onOpenChange]);

  const confirmDiscard = useCallback(() => {
    setShowDiscard(false);
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  // Close on Escape — keyboard parity, works regardless of focus position.
  // Suppressed while the discard confirmation is open so Esc dismisses that
  // first rather than the whole wizard.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showDiscard) requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, showDiscard, requestClose]);

  const goNext = useCallback(() => {
    if (!canContinue) return;
    if (step === 2 && buildMode === 'manual') {
      void handleCreate();
      return;
    }
    if (step === 3) {
      void handleCreate();
      return;
    }
    setStep((s) => (s + 1) as Step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canContinue, step, buildMode]);

  const goBack = useCallback(() => {
    if (step === 1) {
      requestClose();
      return;
    }
    setStep((s) => (s - 1) as Step);
  }, [step, requestClose]);

  /* ----- tags ----- */

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t) || tags.length >= 8) {
      setTagInput('');
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput('');
  }, [tagInput, tags]);

  /* ----- create ----- */

  const handleCreate = useCallback(async () => {
    if (submitting || !nameValid || !buildMode) return;
    setSubmitting(true);

    // Governance: every project records HOW it was built.
    const buildTag = `build:${buildMode}`;
    const allTags = Array.from(new Set([...tags, buildTag]));

    try {
      let projectId: string | undefined;

      if (isWorkflow) {
        const res = await workflowApi.createWorkflow({
          project_name: trimmedName,
          description: description.trim() || undefined,
          tags: allTags,
          steps: [],
        });
        projectId = res.project_id;
      } else {
        const res: unknown = await createExploreProject({
          project_name: trimmedName,
          description: description.trim() || undefined,
          tags: allTags,
        });
        const created = (res as { data?: Record<string, unknown> }).data ?? res;
        projectId =
          (created as { project_id?: string }).project_id ??
          (
            (created as { project?: { project_id?: string } }).project ?? {}
          ).project_id;
      }

      if (!projectId) {
        throw new Error('Server did not return a project id');
      }

      toast.success(`${moduleLabel} project "${trimmedName}" created`);
      onCreated({
        projectId,
        projectName: trimmedName,
        buildMode,
        templateId:
          buildMode === 'template' && templateId ? templateId : undefined,
        aiDescription:
          buildMode === 'ai' ? aiDescription.trim() : undefined,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Could not create project');
      setSubmitting(false);
    }
  }, [
    submitting,
    nameValid,
    buildMode,
    tags,
    isWorkflow,
    trimmedName,
    description,
    moduleLabel,
    templateId,
    aiDescription,
    onCreated,
    reset,
    onOpenChange,
  ]);

  /* ----- render ----- */

  const stepTitles: Record<Step, string> = {
    1: 'Name your project',
    2: 'How do you want to build it?',
    3:
      buildMode === 'ai'
        ? `Describe the ${moduleNoun}`
        : 'Pick a template',
  };

  return (
    <>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <motion.aside
            role="dialog"
            aria-modal="false"
            aria-label={`New ${moduleLabel} project`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            // Right-docked, backdrop-less drawer — NO full-bleed scrim, the page
            // behind stays interactive. Closes via the X / Cancel buttons or Escape.
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
          {/* Header */}
          <div className="relative flex items-start justify-between gap-3 border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-700">
            <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-blue-400/15 to-indigo-500/15 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                <Hammer className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                  New {moduleLabel} project
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {stepTitles[step]}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              disabled={submitting}
              className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Progress dots */}
          <div
            className="flex items-center gap-2 border-b border-slate-100 px-6 py-3 dark:border-slate-800"
            aria-hidden="true"
          >
            {([1, 2, 3] as Step[]).map((s) => {
              const skipped = s === 3 && buildMode === 'manual';
              return (
                <div key={s} className="flex flex-1 items-center gap-2">
                  <div
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors',
                      s < step &&
                        'border-emerald-500 bg-emerald-500 text-white',
                      s === step &&
                        'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
                      s > step &&
                        'border-slate-300 text-slate-400 dark:border-slate-600',
                      skipped && 'opacity-40',
                    )}
                  >
                    {s < step ? <Check className="h-3.5 w-3.5" /> : s}
                  </div>
                  {s < 3 && (
                    <div
                      className={cn(
                        'h-px flex-1',
                        s < step
                          ? 'bg-emerald-400'
                          : 'bg-slate-200 dark:bg-slate-700',
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div className="min-h-[280px] flex-1 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                aria-current="step"
              >
                {/* ── Step 1 — Identity ─────────────────────────────── */}
                {step === 1 && (
                  <div className="grid gap-4">
                    <div>
                      <label
                        htmlFor="upw-name"
                        className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Project name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="upw-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={
                          isWorkflow
                            ? 'e.g. Daily sales rollup'
                            : 'e.g. Retail customer 360'
                        }
                        autoFocus
                        maxLength={NAME_MAX + 10}
                        aria-invalid={!!nameError}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 dark:bg-slate-800 dark:text-white',
                          nameError
                            ? 'border-red-300 focus:ring-red-200 dark:border-red-700'
                            : 'border-slate-200 focus:border-blue-400 focus:ring-blue-200 dark:border-slate-700',
                        )}
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-red-500">
                          {nameError}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          this will be a {moduleNoun} project
                        </span>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="upw-desc"
                        className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Description{' '}
                        <span className="font-normal text-slate-400">
                          (optional)
                        </span>
                      </label>
                      <textarea
                        id="upw-desc"
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={`Short summary of what this ${moduleNoun} does.`}
                        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="upw-tag"
                        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        <TagIcon className="h-3.5 w-3.5" />
                        Tags{' '}
                        <span className="font-normal text-slate-400">
                          (optional)
                        </span>
                      </label>
                      {tags.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            >
                              {t}
                              <button
                                type="button"
                                aria-label={`Remove tag ${t}`}
                                onClick={() =>
                                  setTags((prev) =>
                                    prev.filter((x) => x !== t),
                                  )
                                }
                                className="text-blue-400 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        id="upw-tag"
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                        onBlur={addTag}
                        placeholder="Type a tag and press Enter"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                )}

                {/* ── Step 2 — Fork ─────────────────────────────────── */}
                {step === 2 && (
                  <div>
                    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                      Pick how you want to start. You can change this later
                      from the project header.
                    </p>
                    <ManualAiTemplateFork
                      value={buildMode}
                      onChange={setBuildMode}
                      descriptions={
                        isWorkflow
                          ? undefined
                          : {
                              manual:
                                'Start with a blank modeling canvas. Full control.',
                              ai: 'Describe your data model, AI scaffolds the schema.',
                              template:
                                'Begin from the DWH starter or a model template.',
                            }
                      }
                    />
                  </div>
                )}

                {/* ── Step 3 — Detail (AI) ──────────────────────────── */}
                {step === 3 && buildMode === 'ai' && (
                  <div className="grid gap-3">
                    <label
                      htmlFor="upw-ai"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Describe the {moduleNoun} you want
                    </label>
                    <textarea
                      id="upw-ai"
                      rows={4}
                      autoFocus
                      value={aiDescription}
                      onChange={(e) => setAiDescription(e.target.value)}
                      placeholder={`Describe the ${moduleNoun} in plain English…`}
                      className="w-full resize-none rounded-lg border border-fuchsia-200 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200 dark:border-fuchsia-800 dark:bg-slate-800 dark:text-white"
                    />
                    <p className="text-[11px] text-slate-400">
                      {aiDescription.trim().length < 10
                        ? 'Add a bit more detail — at least 10 characters.'
                        : 'Looks good. The AI wizard opens with this pre-filled.'}
                    </p>
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Examples — click to use one:
                      </p>
                      <div className="grid gap-1.5">
                        {AI_EXAMPLES[module].map((ex) => (
                          <button
                            key={ex}
                            type="button"
                            onClick={() => setAiDescription(ex)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-left text-xs text-slate-600 transition-colors hover:border-fuchsia-300 hover:bg-fuchsia-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-fuchsia-900/20"
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 3 — Detail (template) ────────────────────── */}
                {step === 3 && buildMode === 'template' && (
                  <div
                    role="radiogroup"
                    aria-label="Choose a template"
                    className="grid gap-2.5 sm:grid-cols-2"
                  >
                    {(isWorkflow
                      ? WORKFLOW_TEMPLATES
                      : EXPLORE_TEMPLATES
                    ).map((tpl: WorkflowTemplate | ExploreTemplate) => {
                      const selected = templateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setTemplateId(tpl.id)}
                          className={cn(
                            'flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                            selected
                              ? 'border-blue-300 bg-blue-50 shadow-sm dark:border-blue-700/60 dark:bg-blue-900/20'
                              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50',
                          )}
                        >
                          <span
                            className={cn(
                              'text-sm font-semibold',
                              selected
                                ? 'text-blue-700 dark:text-blue-200'
                                : 'text-slate-800 dark:text-slate-100',
                            )}
                          >
                            {tpl.title}
                          </span>
                          <span className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {tpl.description}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {tpl.preview.map((p, i) => (
                              <span
                                key={`${tpl.id}-${p}-${i}`}
                                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                              >
                                {p}
                              </span>
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5 dark:border-slate-700">
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {step === 1 ? (
                'Cancel'
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" /> Back
                </>
              )}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canContinue || submitting}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50',
                buildMode === 'ai'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                </>
              ) : isLastStep ? (
                <>
                  {buildMode === 'ai' ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {buildMode === 'ai'
                    ? 'Create & open AI wizard'
                    : 'Create project'}
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
          </motion.aside>,
          document.body,
        )}

      {/* Discard confirmation — soft tier */}
      <ConfirmDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        variant="warning"
        title="Discard new project?"
        body="Your project name, description and choices will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={confirmDiscard}
      />
    </>
  );
}
