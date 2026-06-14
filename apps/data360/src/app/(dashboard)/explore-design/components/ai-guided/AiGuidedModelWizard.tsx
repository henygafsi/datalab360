'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ArrowLeft, ArrowRight, Plug, ScanLine, Sparkles, ShieldCheck,
  CheckCircle2, Rocket,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { addEvent as addProjectEvent } from '@/app/services/api/projectsApi';
import { getApiErrorMessage } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useEventStore } from '../../stores/event-store';
import StepConnectSource from './StepConnectSource';
import StepDetectSchema from './StepDetectSchema';
import StepAiSampleData from './StepAiSampleData';
import StepValidatePlan from './StepValidatePlan';
import StepApprovePlan from './StepApprovePlan';
import {
  assemblePlan,
  buildModelEvents,
  buildApprovalDetails,
  type DetectedModel,
} from './ai-guided-strategy';
import type { TableRef, IngestionMode, PreDeployChecksResult } from '@/app/services/api/types';

// ── Persona — drives detail density (superadmin/QA see full DDL, admin streamlined) ──
export type WizardPersona = 'superadmin' | 'admin' | 'qa';

interface AiGuidedModelWizardProps {
  projectId: string;
  persona: WizardPersona;
  onClose: () => void;
  /** Called after approval so the host page can open the deployment wizard. */
  onApproved: () => void;
  /**
   * Optional plain-English description of the model the user wants, seeded
   * from the UnifiedProjectWizard's AI step. Shown as a contextual banner
   * above the Connect step so the intent stays visible while the user picks
   * source tables — they don't have to re-type it.
   */
  initialDescription?: string;
  /**
   * Optional source tables to pre-select in the Connect step, seeded from the
   * Account-overview scan deep-link (?intent=model&from=scan). Lets the wizard
   * open with the AI-suggested sources already chosen, so the user can advance
   * straight to detection instead of re-picking them. Read once on mount.
   */
  initialSelectedTables?: TableRef[];
}

interface WizardStep {
  key: string;
  label: string;
  icon: React.ElementType;
}
const STEPS: WizardStep[] = [
  { key: 'connect', label: 'Connect', icon: Plug },
  { key: 'detect', label: 'Detect', icon: ScanLine },
  { key: 'sample', label: 'AI Sample', icon: Sparkles },
  { key: 'validate', label: 'Validate', icon: ShieldCheck },
  { key: 'approve', label: 'Approve', icon: CheckCircle2 },
];

const draftKey = (projectId: string) => `ai-guided-wizard:${projectId}`;

// What we persist to localStorage so the user can resume.
interface PersistedDraft {
  stepIndex: number;
  selectedTables: TableRef[];
  detectedModel: DetectedModel | null;
  ingestionModes: Record<string, IngestionMode>;
  savedAt: number;
}

const AiGuidedModelWizard: React.FC<AiGuidedModelWizardProps> = ({
  projectId,
  persona,
  onClose,
  onApproved,
  initialDescription,
  initialSelectedTables,
}) => {
  const { addEvent } = useEventStore(projectId);
  const fullDetail = persona === 'superadmin' || persona === 'qa';

  const [stepIndex, setStepIndex] = useState(0);
  // Seeded once on mount from the scan deep-link suggestion (if any). The
  // wizard is conditionally mounted per-open, so this re-seeds correctly each
  // time it opens; the resume-draft prompt can still override it on accept.
  const [selectedTables, setSelectedTables] = useState<TableRef[]>(initialSelectedTables ?? []);
  const [detectedModel, setDetectedModel] = useState<DetectedModel | null>(null);
  const [ingestionModes, setIngestionModes] = useState<Record<string, IngestionMode>>({});
  const [preChecks, setPreChecks] = useState<PreDeployChecksResult | null>(null);
  const [approving, setApproving] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<PersistedDraft | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);

  // ── Resume from localStorage ──
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedDraft;
      const fresh = Date.now() - (parsed.savedAt ?? 0) < 86_400_000;
      if (fresh && parsed.stepIndex > 0) setResumeOffer(parsed);
    } catch {
      // bad JSON — ignore
    }
  }, [projectId]);

  // ── Persist on every meaningful change ──
  useEffect(() => {
    try {
      const draft: PersistedDraft = {
        stepIndex,
        selectedTables,
        detectedModel,
        ingestionModes,
        savedAt: Date.now(),
      };
      window.localStorage.setItem(draftKey(projectId), JSON.stringify(draft));
    } catch {
      // storage full / blocked — skip
    }
  }, [projectId, stepIndex, selectedTables, detectedModel, ingestionModes]);

  // ── Focus management — move focus to the step heading on step change ──
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex]);

  // ── Esc to close ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey(projectId));
    } catch {
      // ignore
    }
  }, [projectId]);

  const acceptResume = useCallback(() => {
    if (!resumeOffer) return;
    setStepIndex(resumeOffer.stepIndex);
    setSelectedTables(resumeOffer.selectedTables);
    setDetectedModel(resumeOffer.detectedModel);
    setIngestionModes(resumeOffer.ingestionModes);
    setResumeOffer(null);
  }, [resumeOffer]);

  // ── Step gating ──
  const canAdvance = useMemo(() => {
    switch (STEPS[stepIndex].key) {
      case 'connect':
        return selectedTables.length > 0;
      case 'detect':
        return !!detectedModel && detectedModel.tables.some((t) =>
          t.columns.some((c) => c.accepted),
        );
      default:
        return true;
    }
  }, [stepIndex, selectedTables, detectedModel]);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);
  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  // ── Approve: emit model events into the store + persist an audit event ──
  const handleApprove = useCallback(async () => {
    if (!detectedModel) return;
    setApproving(true);
    try {
      // 1. Emit model events into event-store.ts so the canvas renders the model.
      const drafts = buildModelEvents(detectedModel, projectId);
      drafts.forEach((d) => addEvent(d));

      // 2. Persist the plan-approval to the project audit log.
      const plan = assemblePlan(detectedModel, ingestionModes);
      try {
        await addProjectEvent(projectId, {
          module_name: 'EXPLORE_DESIGN',
          // AI_MODEL_PLAN_APPROVED is a free string at the API type level; we
          // tag it as a subtype of AI_TEMPLATE_APPLIED (a known event_type) so
          // backends that whitelist event_type still accept it.
          event_type: 'AI_TEMPLATE_APPLIED',
          event_subtype: 'AI_MODEL_PLAN_APPROVED',
          status: 'applied',
          details: buildApprovalDetails(plan),
          entity_type: 'ai_model_plan',
        });
      } catch (auditErr) {
        // Audit-log failure shouldn't block the user — the model events are
        // already in the store. Warn quietly.
        console.warn('[AiGuidedWizard] Failed to persist approval event:', auditErr);
      }

      clearDraft();
      toast.success(
        `Model approved — ${plan.tables.length} table${plan.tables.length > 1 ? 's' : ''} added to the canvas`,
      );
      onApproved();
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to approve plan');
    } finally {
      setApproving(false);
    }
  }, [detectedModel, projectId, ingestionModes, addEvent, clearDraft, onApproved]);

  const currentKey = STEPS[stepIndex].key;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="AI-guided modeling wizard"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-purple-50 to-fuchsia-50 px-5 py-3 dark:border-slate-700 dark:from-purple-950/30 dark:to-fuchsia-950/30">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                AI-Guided Modeling
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {persona} view
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close wizard"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resume-draft prompt — soft-tier confirm shown over the wizard. */}
        <ConfirmDialog
          open={resumeOffer !== null}
          onOpenChange={(open) => {
            // Closing without choosing = discard the draft (avoid a stuck prompt).
            if (!open && resumeOffer) {
              clearDraft();
              setResumeOffer(null);
            }
          }}
          title="Resume where you left off?"
          body={
            resumeOffer ? (
              <span>
                You have an unfinished AI-guided model from{' '}
                <span className="font-medium">
                  {new Date(resumeOffer.savedAt).toLocaleString()}
                </span>{' '}
                — {resumeOffer.selectedTables.length} table
                {resumeOffer.selectedTables.length === 1 ? '' : 's'} selected,
                stopped at step {resumeOffer.stepIndex + 1} of {STEPS.length}.
                Resume it, or start fresh?
              </span>
            ) : null
          }
          confirmLabel="Resume draft"
          cancelLabel="Start fresh"
          onConfirm={acceptResume}
          onCancel={() => {
            clearDraft();
            setResumeOffer(null);
          }}
        />

        {/* Stepper */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === stepIndex;
            const isDone = idx < stepIndex;
            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div
                    className={cn(
                      'h-px min-w-[12px] max-w-[32px] flex-1',
                      isDone ? 'bg-purple-500' : 'bg-slate-200 dark:bg-slate-700',
                    )}
                  />
                )}
                <div
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium',
                    isActive
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                      : isDone
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-slate-400',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                      isActive
                        ? 'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white'
                        : isDone
                          ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/50'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
                    )}
                  >
                    {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step body */}
        <div className="flex-1 overflow-y-auto">
          {/* visually-hidden focus target for a11y step announcement */}
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="sr-only"
          >
            Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex].label}
          </h3>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {currentKey === 'connect' && initialDescription?.trim() && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-800 dark:border-fuchsia-800/50 dark:bg-fuchsia-900/20 dark:text-fuchsia-200">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">You asked for: </span>
                    {initialDescription.trim()}
                  </span>
                </div>
              )}
              {currentKey === 'connect' && (
                <StepConnectSource
                  projectId={projectId}
                  selectedTables={selectedTables}
                  onTablesChange={(t) => {
                    setSelectedTables(t);
                    // table set changed — invalidate any prior detection
                    setDetectedModel(null);
                  }}
                />
              )}
              {currentKey === 'detect' && (
                <StepDetectSchema
                  projectId={projectId}
                  selectedTables={selectedTables}
                  detectedModel={detectedModel}
                  onModelChange={setDetectedModel}
                />
              )}
              {currentKey === 'sample' && (
                <StepAiSampleData projectId={projectId} detectedModel={detectedModel} />
              )}
              {currentKey === 'validate' && (
                <StepValidatePlan
                  projectId={projectId}
                  detectedModel={detectedModel}
                  ingestionModes={ingestionModes}
                  preChecks={preChecks}
                  onPreChecksChange={setPreChecks}
                  fullDetail={fullDetail}
                />
              )}
              {currentKey === 'approve' && (
                <StepApprovePlan
                  detectedModel={detectedModel}
                  ingestionModes={ingestionModes}
                  preChecks={preChecks}
                  fullDetail={fullDetail}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            onClick={goPrev}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {currentKey === 'approve' ? 'Back to refine' : 'Back'}
          </button>

          {currentKey !== 'approve' ? (
            <button
              onClick={goNext}
              disabled={!canAdvance}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm',
                canAdvance
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700'
                  : 'cursor-not-allowed bg-slate-300 dark:bg-slate-700',
              )}
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-purple-700 hover:to-fuchsia-700 disabled:opacity-60"
            >
              <Rocket className="h-3.5 w-3.5" />
              {approving ? 'Approving…' : 'Approve & continue to deployment'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AiGuidedModelWizard;
