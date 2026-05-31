'use client';

/**
 * CustomBlockFactoryModal
 *
 * 4-step wizard for creating a project-scoped custom ETL block.
 *
 *   Step 1 — Identity  (slug, label, description, category, icon)
 *   Step 2 — Ports     (inputs, has_output, output schema hint)
 *   Step 3 — Params    (typed key/value schema for the block config)
 *   Step 4 — Body      (SQL or Python, with sandbox test for SQL)
 *
 * On save, the wizard fires an AI_BLOCK_CREATED event on the project so the
 * block becomes audit-trail evidence (superadmin requirement) and shows up in
 * the palette's "Custom (this project)" section on the next refresh.
 *
 * QA gate: "Save block" is disabled until either the SQL sandbox test passes
 * OR the user explicitly opts out via a soft-confirm. Python has no sandbox
 * yet — surfaced as a Backend Gap card.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Code2,
  Database,
  GripVertical,
  Layers,
  Loader2,
  Plug,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { runAdHocSQL } from '@/app/services/workflow';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import {
  saveCustomBlock,
  validateBlockName,
  validateParamName,
  type CustomBlockLanguage,
  type CustomBlockParam,
  type CustomBlockParamType,
  type CustomBlockPorts,
} from './custom-blocks-store';
import {
  buildScaffold,
  defaultPortsForCategory,
  type CustomBlockCategory,
} from './custom-block-defaults';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface CustomBlockFactoryModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string | null | undefined;
  onCreated?: () => void;
}

interface WizardState {
  // Step 1
  name: string;
  label: string;
  description: string;
  category: CustomBlockCategory;
  icon_name: string;
  // Step 2
  inputs: 0 | 1 | 2 | 3;
  hasOutput: boolean;
  outputSchemaHint: string;
  // Step 3
  params: CustomBlockParam[];
  // Step 4
  language: CustomBlockLanguage;
  body: string;
  testPassed: boolean;
}

const CATEGORIES: { value: CustomBlockCategory; label: string; description: string }[] = [
  { value: 'transform', label: 'Transform', description: 'Operate on upstream rows' },
  { value: 'source', label: 'Source', description: 'Entry point — no input port' },
  { value: 'destination', label: 'Destination', description: 'Terminal node — no output' },
  { value: 'ai', label: 'AI Function', description: 'LLM / Cortex inline call' },
  { value: 'ml', label: 'ML Training', description: 'Train or score a model' },
];

const PARAM_TYPES: CustomBlockParamType[] = ['string', 'number', 'boolean', 'array', 'object'];

const STEP_LABELS = ['Identity', 'Ports', 'Params', 'Body'] as const;

const SAFE_ICON_NAMES = [
  // Reasonable curated subset; falls back to full search.
  'Sparkles', 'Database', 'Filter', 'GitMerge', 'BarChart3', 'Code2', 'Brain',
  'Zap', 'Cloud', 'FileDown', 'Hash', 'Calendar', 'Calculator', 'Wand2',
  'Layers', 'Search', 'Cog', 'Shield', 'Beaker', 'Plug', 'CircleDot',
];

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

interface LucideExport {
  [key: string]: unknown;
}

function isLikelyIconName(name: string): boolean {
  if (!/^[A-Z]/.test(name)) return false;
  if (name === 'Icon') return false;
  if (name === 'LucideIcon') return false;
  if (name.startsWith('Lucide')) return false;
  if (name === 'createLucideIcon') return false;
  if (name === 'IconNode') return false;
  return true;
}

const ALL_ICON_NAMES: string[] = (() => {
  const exports = LucideIcons as LucideExport;
  return Object.keys(exports)
    .filter(isLikelyIconName)
    .filter((k) => {
      const v = exports[k];
      return typeof v === 'function' || (typeof v === 'object' && v !== null);
    })
    .sort();
})();

function resolveIcon(name: string): LucideIcon {
  const exports = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
  return exports[name] || Sparkles;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const INITIAL_STATE: WizardState = {
  name: '',
  label: '',
  description: '',
  category: 'transform',
  icon_name: 'Sparkles',
  inputs: 1,
  hasOutput: true,
  outputSchemaHint: '',
  params: [],
  language: 'sql',
  body: '',
  testPassed: false,
};

const CustomBlockFactoryModal: React.FC<CustomBlockFactoryModalProps> = ({
  open,
  onOpenChange,
  projectId,
  onCreated,
}) => {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [showSkipTestConfirm, setShowSkipTestConfirm] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(0);
      setState(INITIAL_STATE);
      setSaving(false);
      setShowSkipTestConfirm(false);
    }
  }, [open]);

  // ---- Validation per step ------------------------------------------------
  const nameError = useMemo(() => validateBlockName(state.name), [state.name]);
  const labelError = useMemo(() => {
    if (!state.label.trim()) return 'Label is required';
    if (state.label.length > 60) return 'Max 60 characters';
    return null;
  }, [state.label]);
  const descError = useMemo(() => {
    if (state.description.length > 200) return 'Max 200 characters';
    return null;
  }, [state.description]);

  const step1Valid = !nameError && !labelError && !descError;

  const paramErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    const seen = new Set<string>();
    state.params.forEach((p, idx) => {
      const e = validateParamName(p.name);
      if (e) errors[idx] = e;
      else if (seen.has(p.name)) errors[idx] = 'Duplicate name';
      else seen.add(p.name);
    });
    return errors;
  }, [state.params]);
  const step3Valid = Object.keys(paramErrors).length === 0;

  const step4Valid = state.body.trim().length > 0;
  const canSave =
    step1Valid && step3Valid && step4Valid && (state.testPassed || state.language === 'python');

  // ---- Auto-derive scaffold when entering step 4 --------------------------
  const regenerateScaffold = useCallback(() => {
    const next = buildScaffold({
      language: state.language,
      category: state.category,
      blockName: state.name || 'my_block',
      description: state.description,
      params: state.params,
    });
    setState((s) => ({ ...s, body: next, testPassed: false }));
  }, [state.language, state.category, state.name, state.description, state.params]);

  // ---- Step navigation ----------------------------------------------------
  const goNext = useCallback(() => {
    if (step === 0 && !step1Valid) return;
    if (step === 2 && !step3Valid) return;
    setStep((s) => (Math.min(3, s + 1) as 0 | 1 | 2 | 3));
    // Seed body when entering step 4 if empty
    if (step === 2 && !state.body.trim()) {
      setTimeout(() => regenerateScaffold(), 0);
    }
  }, [step, step1Valid, step3Valid, state.body, regenerateScaffold]);

  const goBack = useCallback(() => {
    setStep((s) => (Math.max(0, s - 1) as 0 | 1 | 2 | 3));
  }, []);

  // ---- Persist ------------------------------------------------------------
  const persist = useCallback(async () => {
    if (!projectId) {
      toast.error('No active project — open a project before saving a custom block.');
      return;
    }
    if (!canSave) return;
    setSaving(true);
    const ports: CustomBlockPorts = {
      inputs: state.inputs,
      hasOutput: state.hasOutput,
      outputSchemaHint: state.outputSchemaHint || undefined,
    };
    try {
      await saveCustomBlock(projectId, {
        name: state.name,
        label: state.label,
        description: state.description,
        category: state.category,
        icon_name: state.icon_name,
        ports,
        params: state.params,
        language: state.language,
        body: state.body,
      });
      toast.success(`Saved custom block: ${state.label}`);
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save custom block';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [
    projectId,
    canSave,
    state.name,
    state.label,
    state.description,
    state.category,
    state.icon_name,
    state.inputs,
    state.hasOutput,
    state.outputSchemaHint,
    state.params,
    state.language,
    state.body,
    onCreated,
    onOpenChange,
  ]);

  // ---- Render -------------------------------------------------------------
  const PreviewIcon = resolveIcon(state.icon_name);

  return (
    <>
      <Dialog open={open && !showSkipTestConfirm} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl bg-white dark:bg-slate-900 p-0">
          {/* Header */}
          <DialogHeader className="border-b border-slate-200 dark:border-slate-700 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500">
                <Wand2 className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-slate-900 dark:text-white">
                  Create custom block
                </DialogTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Scoped to this project. Saved as an audit event ({STEP_LABELS[step]} — step {step + 1}/4).
                </p>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close wizard"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            {/* Step indicator */}
            <nav aria-label="Wizard steps" className="mt-4">
              <ol className="flex items-center gap-2">
                {STEP_LABELS.map((label, idx) => {
                  const active = idx === step;
                  const done = idx < step;
                  return (
                    <li key={label} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                          done && 'bg-purple-600 text-white',
                          active && 'bg-fuchsia-100 text-fuchsia-700 ring-2 ring-fuchsia-400 dark:bg-fuchsia-900/40 dark:text-fuchsia-200',
                          !active && !done && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400',
                        )}
                      >
                        {label}
                      </span>
                      {idx < STEP_LABELS.length - 1 && (
                        <span className="h-px w-6 bg-slate-200 dark:bg-slate-700" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </DialogHeader>

          {/* Body */}
          <div className="px-6 py-5 min-h-[420px] max-h-[60vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  <StepIdentity
                    state={state}
                    setState={setState}
                    nameError={nameError}
                    labelError={labelError}
                    descError={descError}
                    PreviewIcon={PreviewIcon}
                  />
                </motion.div>
              )}
              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  <StepPorts state={state} setState={setState} />
                </motion.div>
              )}
              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  <StepParams state={state} setState={setState} errors={paramErrors} />
                </motion.div>
              )}
              {step === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  <StepBody
                    state={state}
                    setState={setState}
                    onRegenerateScaffold={regenerateScaffold}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-b-lg">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || saving}
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md',
                'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
                'disabled:opacity-40 disabled:pointer-events-none',
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={(step === 0 && !step1Valid) || (step === 2 && !step3Valid)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-md',
                  'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white',
                  'hover:from-purple-700 hover:to-fuchsia-700',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {!state.testPassed && state.language === 'sql' && (
                  <button
                    type="button"
                    onClick={() => setShowSkipTestConfirm(true)}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline px-2 py-1"
                  >
                    Save without test
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void persist()}
                  disabled={!canSave || saving}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-md',
                    'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white',
                    'hover:from-purple-700 hover:to-fuchsia-700',
                    'disabled:opacity-50 disabled:pointer-events-none',
                  )}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save block
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showSkipTestConfirm}
        onOpenChange={setShowSkipTestConfirm}
        title="Save without running the sandbox?"
        body={
          <span>
            The SQL sandbox is the QA safety net — saving without it means this block ships
            untested. The custom block will still be audited as an event on this project.
          </span>
        }
        confirmLabel="Save anyway"
        variant="warning"
        onConfirm={async () => {
          setShowSkipTestConfirm(false);
          // Bypass the testPassed gate for this one save.
          setState((s) => ({ ...s, testPassed: true }));
          // Defer one tick so React flushes the state before persist reads it.
          await new Promise((r) => setTimeout(r, 0));
          await persist();
        }}
      />
    </>
  );
};

export default CustomBlockFactoryModal;

// ===========================================================================
// Step 1 — Identity
// ===========================================================================

interface StepIdentityProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  nameError: string | null;
  labelError: string | null;
  descError: string | null;
  PreviewIcon: LucideIcon;
}

const StepIdentity: React.FC<StepIdentityProps> = ({
  state,
  setState,
  nameError,
  labelError,
  descError,
  PreviewIcon,
}) => {
  const [iconSearch, setIconSearch] = useState('');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    const pool = q ? ALL_ICON_NAMES : SAFE_ICON_NAMES;
    const filtered = q ? pool.filter((n) => n.toLowerCase().includes(q)) : pool;
    return filtered.slice(0, 48);
  }, [iconSearch]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      {/* Form */}
      <div className="space-y-4">
        <div>
          <label htmlFor="cb-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Name (slug)
          </label>
          <input
            id="cb-name"
            type="text"
            value={state.name}
            maxLength={40}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value.toLowerCase() }))}
            placeholder="my_custom_block"
            className={cn(
              'w-full px-3 py-1.5 rounded-md text-sm font-mono',
              'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
              'border focus:outline-none focus:ring-2',
              nameError
                ? 'border-red-300 focus:ring-red-400'
                : 'border-slate-200 dark:border-slate-700 focus:ring-fuchsia-400',
            )}
          />
          <p className={cn('text-[11px] mt-1', nameError ? 'text-red-600' : 'text-slate-400')}>
            {nameError || 'lowercase, underscores, max 40 chars — used as the block type'}
          </p>
        </div>

        <div>
          <label htmlFor="cb-label" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Display label
          </label>
          <input
            id="cb-label"
            type="text"
            value={state.label}
            maxLength={60}
            onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
            placeholder="My Custom Block"
            className={cn(
              'w-full px-3 py-1.5 rounded-md text-sm',
              'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
              'border focus:outline-none focus:ring-2',
              labelError
                ? 'border-red-300 focus:ring-red-400'
                : 'border-slate-200 dark:border-slate-700 focus:ring-fuchsia-400',
            )}
          />
          <p className={cn('text-[11px] mt-1', labelError ? 'text-red-600' : 'text-slate-400')}>
            {labelError || `${state.label.length}/60 — shown in the palette`}
          </p>
        </div>

        <div>
          <label htmlFor="cb-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description
          </label>
          <textarea
            id="cb-desc"
            value={state.description}
            maxLength={200}
            rows={2}
            onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
            placeholder="One-line summary of what this block does."
            className={cn(
              'w-full px-3 py-1.5 rounded-md text-sm resize-none',
              'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
              'border focus:outline-none focus:ring-2',
              descError
                ? 'border-red-300 focus:ring-red-400'
                : 'border-slate-200 dark:border-slate-700 focus:ring-fuchsia-400',
            )}
          />
          <p className={cn('text-[11px] mt-1', descError ? 'text-red-600' : 'text-slate-400')}>
            {descError || `${state.description.length}/200`}
          </p>
        </div>

        <div>
          <label htmlFor="cb-cat" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Category
          </label>
          <select
            id="cb-cat"
            value={state.category}
            onChange={(e) => {
              const nextCat = e.target.value as CustomBlockCategory;
              const nextPorts = defaultPortsForCategory(nextCat);
              setState((s) => ({
                ...s,
                category: nextCat,
                inputs: nextPorts.inputs,
                hasOutput: nextPorts.hasOutput,
              }));
            }}
            className={cn(
              'w-full px-3 py-1.5 rounded-md text-sm',
              'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
              'border border-slate-200 dark:border-slate-700',
              'focus:outline-none focus:ring-2 focus:ring-fuchsia-400',
            )}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} — {c.description}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Icon
          </label>
          <button
            type="button"
            onClick={() => setIconPickerOpen((o) => !o)}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-sm',
              'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
              'border border-slate-200 dark:border-slate-700',
              'hover:border-fuchsia-400',
            )}
          >
            <span className="flex items-center gap-2">
              <PreviewIcon className="h-4 w-4 text-fuchsia-500" />
              <span className="font-mono text-xs">{state.icon_name}</span>
            </span>
            {iconPickerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {iconPickerOpen && (
            <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 p-2">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Search icons..."
                  className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                />
              </div>
              <div className="grid grid-cols-12 gap-1 max-h-32 overflow-y-auto">
                {filteredIcons.map((name) => {
                  const Icon = resolveIcon(name);
                  const isSelected = name === state.icon_name;
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => {
                        setState((s) => ({ ...s, icon_name: name }));
                        setIconPickerOpen(false);
                      }}
                      className={cn(
                        'flex items-center justify-center h-7 w-7 rounded-md hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/30',
                        isSelected && 'bg-fuchsia-100 dark:bg-fuchsia-900/40 ring-1 ring-fuchsia-400',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-slate-700 dark:text-slate-200" />
                    </button>
                  );
                })}
                {filteredIcons.length === 0 && (
                  <div className="col-span-12 text-center text-[11px] text-slate-400 py-2">No matches</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live preview card */}
      <div>
        <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500 mb-2">
          Palette preview
        </p>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 bg-white dark:bg-slate-800 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-8 rounded-full bg-fuchsia-500 opacity-60" />
            <div className="p-1.5 rounded-md bg-fuchsia-50 dark:bg-fuchsia-900/30">
              <PreviewIcon className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[13px] text-slate-800 dark:text-slate-100 leading-tight truncate">
                {state.label || 'My Custom Block'}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5">
                {state.description || 'One-line description'}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-md bg-fuchsia-50 dark:bg-fuchsia-900/20 border border-fuchsia-100 dark:border-fuchsia-900/30 p-2.5">
          <p className="text-[11px] text-fuchsia-700 dark:text-fuchsia-200 leading-relaxed">
            <strong>Audit:</strong> when saved, this block becomes an event on the current project.
            Superadmins can trace name, body, params, and the user that created it.
          </p>
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// Step 2 — Ports
// ===========================================================================

interface StepPortsProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}

const StepPorts: React.FC<StepPortsProps> = ({ state, setState }) => {
  const isSource = state.category === 'source';
  const isDestination = state.category === 'destination';
  const inputOptions: { value: 0 | 1 | 2 | 3; label: string; sub: string }[] = [
    { value: 0, label: '0 inputs', sub: 'Source-style — read from elsewhere' },
    { value: 1, label: '1 input', sub: 'Single upstream block' },
    { value: 2, label: '2 inputs', sub: 'Join-style (left + right)' },
    { value: 3, label: '3+ inputs', sub: 'Union-style (multi-source)' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
          <Plug className="h-4 w-4 text-fuchsia-500" />
          Inputs
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {inputOptions.map((opt) => {
            const disabled = isSource && opt.value !== 0;
            const selected = state.inputs === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setState((s) => ({ ...s, inputs: opt.value }))}
                className={cn(
                  'text-left p-3 rounded-md border transition-colors',
                  selected
                    ? 'border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/20 ring-1 ring-fuchsia-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300',
                  disabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-2">
                  <CircleDot
                    className={cn(
                      'h-4 w-4',
                      selected ? 'text-fuchsia-500' : 'text-slate-400',
                    )}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{opt.label}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 ml-6">{opt.sub}</p>
              </button>
            );
          })}
        </div>
        {isSource && (
          <p className="text-[11px] text-slate-400 mt-2">
            Sources have no input ports — locked to 0.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-fuchsia-500" />
          Output port
        </h4>
        <label
          className={cn(
            'flex items-center gap-3 p-3 rounded-md border cursor-pointer',
            'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
            isDestination && 'opacity-50 cursor-not-allowed',
          )}
        >
          <input
            type="checkbox"
            checked={state.hasOutput}
            disabled={isDestination}
            onChange={(e) => setState((s) => ({ ...s, hasOutput: e.target.checked }))}
            className="h-4 w-4 rounded text-fuchsia-600 focus:ring-fuchsia-400"
          />
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
              Has output
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Downstream blocks can read from this block.
              {isDestination && ' Destinations always have no output port.'}
            </div>
          </div>
        </label>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
          <Database className="h-4 w-4 text-fuchsia-500" />
          Output schema hint <span className="font-normal text-slate-400 text-xs">(optional)</span>
        </h4>
        <textarea
          value={state.outputSchemaHint}
          onChange={(e) => setState((s) => ({ ...s, outputSchemaHint: e.target.value }))}
          rows={3}
          placeholder={'e.g.\norder_id (string)\ncustomer_id (string)\nrevenue (number)'}
          disabled={!state.hasOutput}
          className={cn(
            'w-full px-3 py-2 rounded-md text-xs font-mono resize-none',
            'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
            'border border-slate-200 dark:border-slate-700',
            'focus:outline-none focus:ring-2 focus:ring-fuchsia-400',
            !state.hasOutput && 'opacity-40',
          )}
        />
        <p className="text-[11px] text-slate-400 mt-1">
          Free text — describes the columns downstream blocks will see. Used by the big-picture popover later.
        </p>
      </div>
    </div>
  );
};

// ===========================================================================
// Step 3 — Params
// ===========================================================================

interface StepParamsProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  errors: Record<number, string>;
}

const StepParams: React.FC<StepParamsProps> = ({ state, setState, errors }) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const updateParam = (idx: number, patch: Partial<CustomBlockParam>) => {
    setState((s) => ({
      ...s,
      params: s.params.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const removeParam = (idx: number) => {
    setState((s) => ({ ...s, params: s.params.filter((_, i) => i !== idx) }));
  };

  const addParam = () => {
    setState((s) => ({
      ...s,
      params: [
        ...s.params,
        {
          name: `param_${s.params.length + 1}`,
          type: 'string',
          required: false,
          default: '',
          description: '',
        },
      ],
    }));
  };

  const onDrop = (targetIdx: number) => {
    if (dragIndex === null || dragIndex === targetIdx) return;
    setState((s) => {
      const next = [...s.params];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIdx, 0, moved);
      return { ...s, params: next };
    });
    setDragIndex(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Declare the params your block exposes in the config sidebar. Names must be unique and snake_case.
        </p>
        <button
          type="button"
          onClick={addParam}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md',
            'bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200',
            'dark:bg-fuchsia-900/40 dark:text-fuchsia-200 dark:hover:bg-fuchsia-900/60',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add param
        </button>
      </div>

      {state.params.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No params yet. Many blocks (e.g. simple SELECT) work without any — but adding one or two
            makes your block reusable across runs.
          </p>
        </div>
      )}

      {state.params.map((p, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => setDragIndex(idx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(idx)}
          className={cn(
            'rounded-md border p-3 bg-white dark:bg-slate-800',
            errors[idx]
              ? 'border-red-300 dark:border-red-900/50'
              : 'border-slate-200 dark:border-slate-700',
          )}
        >
          <div className="flex items-start gap-2">
            <GripVertical className="h-4 w-4 mt-1.5 text-slate-300 cursor-grab" />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_120px_110px] gap-2">
              <div>
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) => updateParam(idx, { name: e.target.value.toLowerCase() })}
                  placeholder="param_name"
                  className={cn(
                    'w-full px-2 py-1 rounded-md text-xs font-mono',
                    'bg-white dark:bg-slate-900 text-slate-900 dark:text-white',
                    'border focus:outline-none focus:ring-1 focus:ring-fuchsia-400',
                    errors[idx] ? 'border-red-300' : 'border-slate-200 dark:border-slate-700',
                  )}
                />
                {errors[idx] && (
                  <p className="text-[10px] text-red-600 mt-0.5">{errors[idx]}</p>
                )}
              </div>
              <select
                value={p.type}
                onChange={(e) => updateParam(idx, { type: e.target.value as CustomBlockParamType })}
                className="px-2 py-1 rounded-md text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
              >
                {PARAM_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => updateParam(idx, { required: e.target.checked })}
                  className="h-3.5 w-3.5 rounded text-fuchsia-600 focus:ring-fuchsia-400"
                />
                Required
              </label>
            </div>
            <button
              type="button"
              onClick={() => removeParam(idx)}
              className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
              aria-label={`Remove param ${p.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
            <input
              type="text"
              value={String(p.default ?? '')}
              onChange={(e) => updateParam(idx, { default: e.target.value })}
              placeholder="Default value (optional)"
              className="px-2 py-1 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
            />
            <input
              type="text"
              value={p.description || ''}
              onChange={(e) => updateParam(idx, { description: e.target.value })}
              placeholder="Description (optional)"
              className="px-2 py-1 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ===========================================================================
// Step 4 — Body
// ===========================================================================

interface StepBodyProps {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  onRegenerateScaffold: () => void;
}

interface SqlTestResult {
  ok: boolean;
  rows?: Record<string, unknown>[];
  columns?: string[];
  error?: string;
}

const StepBody: React.FC<StepBodyProps> = ({ state, setState, onRegenerateScaffold }) => {
  const [aiBusy, setAiBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<SqlTestResult | null>(null);

  const isPython = state.language === 'python';

  const runAi = useCallback(async () => {
    setAiBusy(true);
    try {
      const prompt = buildAiPrompt(state);
      const out = await generateCompletion({ prompt, model: 'mistral-large2' });
      const code = stripCodeFence(out.response || '');
      setState((s) => ({ ...s, body: code || s.body, testPassed: false }));
      toast.success('AI scaffold inserted — review before testing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI generation failed';
      toast.error(message);
    } finally {
      setAiBusy(false);
    }
  }, [state, setState]);

  const runSandbox = useCallback(async () => {
    if (isPython) {
      toast.error('Python sandbox unavailable — Backend Gap.');
      return;
    }
    setTestBusy(true);
    setTestResult(null);
    try {
      const sql = wrapSqlForSandbox(state.body);
      const result = await runAdHocSQL({ sql });
      const rows = Array.isArray(result?.data) ? result.data : [];
      const cols = Array.isArray(result?.columns) ? result.columns : Object.keys(rows[0] || {});
      setTestResult({ ok: true, rows: rows.slice(0, 10) as Record<string, unknown>[], columns: cols });
      setState((s) => ({ ...s, testPassed: true }));
      toast.success('Sandbox run succeeded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sandbox failed';
      setTestResult({ ok: false, error: message });
      setState((s) => ({ ...s, testPassed: false }));
    } finally {
      setTestBusy(false);
    }
  }, [isPython, state.body, setState]);

  return (
    <div className="space-y-3">
      {/* Language picker */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Language</span>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            checked={state.language === 'sql'}
            onChange={() => setState((s) => ({ ...s, language: 'sql', testPassed: false }))}
            className="text-fuchsia-600 focus:ring-fuchsia-400"
          />
          SQL
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            checked={state.language === 'python'}
            onChange={() => setState((s) => ({ ...s, language: 'python', testPassed: false }))}
            className="text-fuchsia-600 focus:ring-fuchsia-400"
          />
          Python
        </label>
        <button
          type="button"
          onClick={onRegenerateScaffold}
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <Code2 className="h-3.5 w-3.5" />
          Reset to scaffold
        </button>
        <button
          type="button"
          onClick={() => void runAi()}
          disabled={aiBusy}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white disabled:opacity-50"
        >
          {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generate with AI
        </button>
        <button
          type="button"
          onClick={() => void runSandbox()}
          disabled={testBusy || isPython}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {testBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Beaker className="h-3.5 w-3.5" />}
          Test in sandbox
        </button>
      </div>

      {/* Code editor with line-number gutter */}
      <CodeEditor
        value={state.body}
        onChange={(v) => setState((s) => ({ ...s, body: v, testPassed: false }))}
        language={state.language}
      />

      {/* Python sandbox gap */}
      {isPython && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-200">Backend Gap — Python sandbox</p>
          <p className="text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
            No <code className="font-mono">/workflow/run-python</code> sandbox is wired into the wizard yet.
            Python blocks can be saved without a test run (the QA gate falls through for Python).
          </p>
        </div>
      )}

      {/* Test result */}
      {testResult && testResult.ok && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 p-2">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            <Check className="h-3.5 w-3.5" />
            Sandbox passed — {testResult.rows?.length ?? 0} row{(testResult.rows?.length ?? 0) === 1 ? '' : 's'} (max 10 shown)
          </div>
          <div className="overflow-x-auto rounded border border-emerald-100 dark:border-emerald-900/40 bg-white dark:bg-slate-900 max-h-48">
            <table className="w-full text-[11px]">
              <thead className="bg-emerald-50 dark:bg-emerald-900/30">
                <tr>
                  {(testResult.columns || []).map((c) => (
                    <th key={c} className="px-2 py-1 text-left font-semibold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(testResult.rows || []).map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    {(testResult.columns || []).map((c) => (
                      <td key={c} className="px-2 py-1 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {formatCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {testResult && !testResult.ok && (
        <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-2.5 text-xs text-red-800 dark:text-red-200">
          <p className="font-semibold mb-1">Sandbox failed</p>
          <p className="font-mono whitespace-pre-wrap break-all">{testResult.error}</p>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mini helpers
// ---------------------------------------------------------------------------

function buildAiPrompt(state: WizardState): string {
  const paramSpec = state.params.length
    ? state.params
        .map((p) => `- ${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description || ''}`)
        .join('\n')
    : '(no params)';
  const langWord = state.language === 'sql' ? 'Snowflake SQL' : 'Snowpark Python';
  return [
    `You are writing a custom ETL block body in ${langWord}.`,
    `Block name: ${state.name}`,
    `Category: ${state.category}`,
    `Description: ${state.description || '(none)'}`,
    `Params:\n${paramSpec}`,
    state.language === 'sql'
      ? 'For non-source blocks, read upstream rows from a CTE called `input`. Return at most 100 rows. Use plain SQL — no shell escapes.'
      : 'Define `def run(session, input_df, params)` returning `output_df` (a Snowpark DataFrame).',
    'Reply with only the code body, no markdown fences, no commentary.',
  ].join('\n');
}

function stripCodeFence(s: string): string {
  return s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
}

function wrapSqlForSandbox(sql: string): string {
  // If the body already declares its own CTE called `input`, run it as-is.
  // Otherwise, wrap it in a no-op CTE so references to `input` won't crash
  // when the user tests a transform-style block out of context.
  const trimmed = sql.trim().replace(/;\s*$/, '');
  if (/\bwith\s+input\s+as\b/i.test(trimmed)) return trimmed;
  if (/\bfrom\s+input\b/i.test(trimmed)) {
    return `WITH input AS (SELECT 1 AS DUMMY_COL)\n${trimmed}`;
  }
  return trimmed;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// CodeEditor — textarea + CSS-only line-number gutter
// ---------------------------------------------------------------------------

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  language: CustomBlockLanguage;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language }) => {
  const lines = useMemo(() => value.split('\n'), [value]);

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
          {language === 'sql' ? 'Snowflake SQL' : 'Snowpark Python'}
        </span>
        <span className="text-[10px] text-slate-400">{lines.length} lines</span>
      </div>
      <div className="flex font-mono text-xs">
        <pre
          aria-hidden="true"
          className="select-none px-2 py-2 text-right text-slate-400 dark:text-slate-600 bg-slate-100/60 dark:bg-slate-900/60 border-r border-slate-200 dark:border-slate-800 leading-5 min-w-[2.5rem]"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={Math.max(10, lines.length)}
          className={cn(
            'flex-1 resize-none p-2 leading-5 outline-none bg-transparent',
            'text-slate-900 dark:text-slate-100',
            'placeholder:text-slate-400',
          )}
          placeholder="-- Your block body here..."
        />
      </div>
    </div>
  );
};
