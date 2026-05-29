'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from 'rizzui';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  X, Eye, Settings, Shield, Beaker, GitBranch, Network, Rocket,
  CheckCircle2, ArrowLeft, ArrowRight, AlertTriangle, Clock, RotateCcw,
} from 'lucide-react';
import { useEventStore } from '../stores/event-store';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import {
  DeploymentProvider,
  useDeploymentContext,
  DEPLOYMENT_STEPS,
  type DeploymentStep,
  type DeploymentConfig,
} from './deployment/DeploymentContext';

// Step components
import StepReview from './deployment/StepReview';
import StepConfigure from './deployment/StepConfigure';
import StepPreChecks from './deployment/StepPreChecks';
import StepDryRun from './deployment/StepDryRun';
import StepSqlDiff from './deployment/StepSqlDiff';
import StepImpact from './deployment/StepImpact';
import StepDeploy from './deployment/StepDeploy';
import StepVerify from './deployment/StepVerify';

// ── Step icon mapping ──
const STEP_ICONS: Record<DeploymentStep, React.ElementType> = {
  review: Eye,
  config: Settings,
  pre_checks: Shield,
  dry_run: Beaker,
  sql_diff: GitBranch,
  impact: Network,
  deploy: Rocket,
  verify: CheckCircle2,
};

// ── Props ──
interface DeploymentValidationProps {
  className?: string;
  onClose?: () => void;
  database?: string;
  schemas?: string[];
  projectId?: string;
}

// ── Helpers ──
const DRAFT_KEY = (projectId: string) => `deployment-wizard-draft:${projectId}`;
const AUTO_CLOSE_MS = 4000;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

/** Human-readable "time ago" for the resume banner / saved indicator. */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/**
 * Wraps every step body and:
 *  - shows a persistent backend-error banner at the top (carries across steps)
 *  - shows an in-progress elapsed-time pill during deploy
 *  - shows a success banner with auto-close countdown on verify
 */
function StepFrame({ children }: { children: React.ReactNode }) {
  const {
    currentStep,
    results,
    isDeploying,
    onClose,
  } = useDeploymentContext();

  // Elapsed-time ticker — runs only while a deploy is in flight.
  const [, force] = useState(0);
  const deployStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isDeploying && deployStartRef.current === null) {
      deployStartRef.current = Date.now();
    }
    if (!isDeploying) {
      deployStartRef.current = null;
    }
  }, [isDeploying]);
  useEffect(() => {
    if (!isDeploying) return;
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [isDeploying]);

  // Auto-close countdown on verify-success — gives the user 4s to read the
  // confirmation, then closes the modal. They can cancel by clicking the
  // modal body (focus event), or "Stay open" button.
  // Only auto-close when the deployment actually succeeded. A failed deploy
  // (deploymentOutcome === 'failed') must keep the popup open so the user
  // sees the failure outcome + backend error — never close silently.
  const verifyOk =
    currentStep === 'verify' &&
    results.deploymentOutcome !== 'failed' &&
    !results.backendError &&
    results.postVerifyResult &&
    (results.postVerifyResult as { status?: string }).status !== 'FAILED';
  const [autoCloseRemaining, setAutoCloseRemaining] = useState<number | null>(null);
  const [autoCloseCancelled, setAutoCloseCancelled] = useState(false);
  useEffect(() => {
    if (!verifyOk || autoCloseCancelled || !onClose) {
      setAutoCloseRemaining(null);
      return;
    }
    setAutoCloseRemaining(Math.ceil(AUTO_CLOSE_MS / 1000));
    const tick = window.setInterval(() => {
      setAutoCloseRemaining((s) => (s !== null && s > 0 ? s - 1 : 0));
    }, 1000);
    const fire = window.setTimeout(() => {
      onClose?.();
      toast.success('Deployment complete', { id: 'deploy-success' });
    }, AUTO_CLOSE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(fire);
    };
  }, [verifyOk, autoCloseCancelled, onClose]);

  const elapsed = deployStartRef.current ? Date.now() - deployStartRef.current : 0;

  return (
    <div className="relative">
      {/* Persistent error banner — visible on every step once an error has
          occurred. The product owner asked for errors to be "saved and shown
          in each step of the popup deployment". */}
      <AnimatePresence>
        {results.backendError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-red-200 bg-gradient-to-r from-red-50 to-rose-50 dark:border-red-900/40 dark:from-red-950/40 dark:to-rose-950/30"
          >
            <div className="flex items-start gap-3 px-6 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-red-800 dark:text-red-200">
                  Error from previous step
                </p>
                <p className="mt-0.5 truncate text-xs text-red-700 dark:text-red-300" title={results.backendError}>
                  {results.backendError}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Elapsed-time pill while deploying */}
      <AnimatePresence>
        {isDeploying && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="border-b border-blue-200 bg-blue-50/70 px-6 py-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200"
          >
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 animate-pulse" />
              <span className="font-semibold">Deploying…</span>
              <span className="tabular-nums">{formatElapsed(elapsed)}</span>
              <span className="opacity-60">
                · You can close this window — we'll keep going in the background and notify you when done.
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-close banner on verify success */}
      <AnimatePresence>
        {verifyOk && autoCloseRemaining !== null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center justify-between gap-3 border-b border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-2 text-xs text-green-800 dark:border-green-900/40 dark:from-green-950/40 dark:to-emerald-950/30 dark:text-green-200"
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Deployment verified — closing in{' '}
              <span className="tabular-nums font-semibold">
                {autoCloseRemaining}s
              </span>
            </span>
            <button
              onClick={() => setAutoCloseCancelled(true)}
              className="rounded-md border border-green-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-green-800 transition-colors hover:bg-white dark:border-green-700 dark:bg-green-900/40 dark:text-green-100 dark:hover:bg-green-900/60"
            >
              Stay open
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  );
}

// ── Inner content (consumes context) ──
function DeploymentContent() {
  const {
    currentStep,
    setCurrentStep,
    goNext,
    goPrev,
    isDeploying,
    results,
    config,
    projectId,
  } = useDeploymentContext();

  const stepIndex = DEPLOYMENT_STEPS.findIndex((s) => s.key === currentStep);
  const showGlobalNav = !['deploy', 'verify'].includes(currentStep);
  const nextLabel = DEPLOYMENT_STEPS[stepIndex + 1]?.label;
  const prevLabel = DEPLOYMENT_STEPS[stepIndex - 1]?.label;

  // Pre-check gating: if we're sitting on the pre_checks step AND there's a
  // pre-check result that's NOT all-passed, block the Next button. Product
  // owner explicitly asked: "If there are errors in pre checks, do not
  // allow deployment." User must re-run checks (the inner step has a Run
  // Checks button) before they can proceed.
  const preChecksBlocked =
    currentStep === 'pre_checks' &&
    results.preChecksResult !== null &&
    !results.preChecksAllPassed;

  // Draft persistence — save the current step + config to localStorage every
  // time they change. On open, the wizard restores the last step (see
  // DeploymentValidation effect below) so the user can close & resume.
  //
  // IMPORTANT: we do NOT persist while still on the 'review' step. Otherwise
  // the very first render (which always starts at 'review' before the user
  // resumes) would overwrite a real saved draft with step:'review' — and the
  // resume-side filter hides 'review' drafts, so the user would think draft
  // persistence is broken. Once past review, every change is saved.
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!projectId || projectId === 'default') return;
    if (currentStep === 'review') return;
    // Don't keep a draft alive once the deploy reached a terminal outcome.
    if (results.deploymentOutcome === 'deployed') return;
    try {
      const savedAt = Date.now();
      const payload = JSON.stringify({ step: currentStep, config, savedAt });
      window.localStorage.setItem(DRAFT_KEY(projectId), payload);
      setDraftSavedAt(savedAt);
    } catch {
      // localStorage may be full or blocked — silently skip.
    }
  }, [projectId, currentStep, config, results.deploymentOutcome]);

  // Clear the draft once the deployment has succeeded — even if the user
  // leaves the modal open. A completed deploy should never resurface as a
  // resume offer next session.
  useEffect(() => {
    if (results.deploymentOutcome !== 'deployed') return;
    if (!projectId || projectId === 'default') return;
    try {
      window.localStorage.removeItem(DRAFT_KEY(projectId));
    } catch {
      // ignore
    }
    setDraftSavedAt(null);
  }, [results.deploymentOutcome, projectId]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Stepper Header with sliding gradient indicator ── */}
      <div className="border-b border-slate-200 bg-white/70 px-6 py-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70">
        <LayoutGroup id="deployment-stepper">
          <div className="flex items-center gap-1 overflow-x-auto">
            {DEPLOYMENT_STEPS.map((step, idx) => {
              const Icon = STEP_ICONS[step.key];
              const isActive = idx === stepIndex;
              const isCompleted = idx < stepIndex;
              const isClickable = idx <= stepIndex && !isDeploying;
              // Has this step recorded an error? (carries across steps)
              const stepHadError =
                step.key === 'pre_checks' &&
                results.preChecksResult !== null &&
                !results.preChecksAllPassed;

              return (
                <React.Fragment key={step.key}>
                  {idx > 0 && (
                    <motion.div
                      animate={{
                        backgroundColor: isCompleted ? '#3b82f6' : '#e2e8f0',
                      }}
                      transition={{ duration: 0.3 }}
                      className="h-px min-w-[16px] max-w-[40px] flex-1 dark:!bg-slate-700"
                    />
                  )}
                  <motion.button
                    whileHover={isClickable ? { y: -1 } : undefined}
                    whileTap={isClickable ? { scale: 0.96 } : undefined}
                    onClick={() => isClickable && setCurrentStep(step.key)}
                    disabled={!isClickable}
                    aria-current={isActive ? 'step' : undefined}
                    aria-disabled={!isClickable}
                    title={
                      isActive
                        ? `Current step: ${step.label}`
                        : isCompleted
                          ? `Click to revisit ${step.label}`
                          : `${step.label} — not reached yet`
                    }
                    aria-label={
                      isActive
                        ? `Current step: ${step.label}`
                        : isCompleted
                          ? `Revisit completed step: ${step.label}`
                          : `Upcoming step: ${step.label}`
                    }
                    className={cn(
                      'relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                      isClickable && !isActive && 'cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/60',
                      !isClickable && 'cursor-not-allowed',
                      isActive
                        ? 'text-blue-700 dark:text-blue-300'
                        : isCompleted
                          ? 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                          : 'text-slate-400 dark:text-slate-500',
                      stepHadError && !isActive && 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="stepper-active-bg"
                        className="absolute inset-0 rounded-lg bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:ring-blue-800"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <div
                      className={cn(
                        'relative flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                        isActive
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/30'
                          : isCompleted
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                            : stepHadError
                              ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
                      )}
                    >
                      {stepHadError && !isActive ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : isCompleted ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Icon className="h-3 w-3" />
                      )}
                    </div>
                    <span className="relative hidden sm:inline">{step.label}</span>
                  </motion.button>
                </React.Fragment>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {/* ── Step Content (wrapped in StepFrame for cross-step banners) ── */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
        <StepFrame>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {currentStep === 'review' && <StepReview />}
              {currentStep === 'config' && <StepConfigure />}
              {currentStep === 'pre_checks' && <StepPreChecks />}
              {currentStep === 'dry_run' && <StepDryRun />}
              {currentStep === 'sql_diff' && <StepSqlDiff />}
              {currentStep === 'impact' && <StepImpact />}
              {currentStep === 'deploy' && <StepDeploy />}
              {currentStep === 'verify' && <StepVerify />}
            </motion.div>
          </AnimatePresence>
        </StepFrame>

        {/* Sticky bottom nav */}
        {showGlobalNav && (
          <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              {stepIndex > 0 ? (
                <motion.div whileHover={{ x: -2 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" size="sm" onClick={goPrev} className="gap-1.5">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {prevLabel}
                  </Button>
                </motion.div>
              ) : (
                <div />
              )}
              {/* Draft-saved indicator — tells the user their progress is
                  persisted and survives closing the window. */}
              {draftSavedAt !== null && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500"
                  title={`Your progress is saved locally — close and resume any time within 24h. Last saved ${formatRelative(draftSavedAt)}.`}
                >
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Progress saved · step {stepIndex + 1} of {DEPLOYMENT_STEPS.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Inline hint when blocked, so the user understands WHY Next is greyed */}
              {preChecksBlocked && (
                <motion.span
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Fix pre-check errors before continuing
                </motion.span>
              )}
              {stepIndex < DEPLOYMENT_STEPS.length - 1 && (
                <motion.div
                  whileHover={!preChecksBlocked ? { scale: 1.03 } : undefined}
                  whileTap={!preChecksBlocked ? { scale: 0.97 } : undefined}
                >
                  <Button
                    size="sm"
                    onClick={goNext}
                    disabled={preChecksBlocked}
                    className={cn(
                      'group relative gap-1.5 overflow-hidden text-white shadow-md',
                      preChecksBlocked
                        ? 'bg-slate-300 text-slate-500 shadow-none dark:bg-slate-700 dark:text-slate-400'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700',
                    )}
                  >
                    {!preChecksBlocked && (
                      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    )}
                    {nextLabel}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ──
export default function DeploymentValidation({
  className,
  onClose,
  database,
  schemas,
  projectId: rawProjectId,
}: DeploymentValidationProps) {
  const { data: session } = useSession();
  const currentUser = session?.user?.name || session?.user?.email || 'unknown';

  const projectId = rawProjectId || 'default';
  const { events, pendingEvents, updateEventStatus, cleanupAppliedEvents } =
    useEventStore(projectId);

  const resolvedDatabase = useMemo(() => {
    if (database) return database;
    const first = events.find((e) => e.target?.database);
    return first?.target?.database || 'PROD_DB';
  }, [database, events]);

  const resolvedSchemas = useMemo(() => {
    if (schemas && schemas.length > 0) return schemas;
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.target?.schema) set.add(e.target.schema);
    });
    return set.size > 0 ? Array.from(set) : ['PUBLIC'];
  }, [schemas, events]);

  // ── Draft resume ──
  // On mount, look for a saved draft for this project and offer to resume.
  // The draft was saved on every step/config change by the inner component.
  const [resumeOffer, setResumeOffer] = useState<{
    step: DeploymentStep;
    config: DeploymentConfig;
    savedAt: number;
  } | null>(null);
  const [resumeAccepted, setResumeAccepted] = useState(false);
  useEffect(() => {
    if (projectId === 'default') return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        step?: DeploymentStep;
        config?: DeploymentConfig;
        savedAt?: number;
      };
      // Only offer to resume if there's something meaningful (not just review)
      // and the draft is < 24h old.
      const fresh = Date.now() - (parsed.savedAt ?? 0) < 86_400_000;
      const meaningful = parsed.step && parsed.step !== 'review';
      if (fresh && meaningful && parsed.step && parsed.config) {
        setResumeOffer({
          step: parsed.step,
          config: parsed.config,
          savedAt: parsed.savedAt ?? Date.now(),
        });
      }
    } catch {
      // Ignored — bad JSON, no draft.
    }
  }, [projectId]);

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY(projectId));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      {/* Resume-draft banner — prominent card shown when an in-progress
          deployment draft was found for this project. */}
      <AnimatePresence>
        {resumeOffer && !resumeAccepted && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-3.5 dark:border-amber-900/40 dark:from-amber-950/40 dark:to-orange-950/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                  <RotateCcw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    Resume your in-progress deployment?
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                    Saved {formatRelative(resumeOffer.savedAt)} at the{' '}
                    <span className="font-semibold">
                      {DEPLOYMENT_STEPS.find((s) => s.key === resumeOffer.step)?.label ?? resumeOffer.step}
                    </span>{' '}
                    step. Pick up where you left off, or start fresh.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    // Start over — wipe the draft, begin a clean wizard.
                    clearDraft();
                    setResumeOffer(null);
                  }}
                  className="rounded-md border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-white dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                >
                  Start over
                </button>
                <button
                  onClick={() => setResumeAccepted(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:from-amber-600 hover:to-orange-600"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resume
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeploymentProvider
        projectId={projectId}
        database={resolvedDatabase}
        schemas={resolvedSchemas}
        currentUser={currentUser}
        events={events}
        pendingEvents={pendingEvents}
        updateEventStatus={updateEventStatus}
        cleanupAppliedEvents={cleanupAppliedEvents}
        onClose={() => {
          // Closing the modal (X button) is abandonment — the exact case
          // draft persistence exists for. We deliberately KEEP the draft so
          // the user can reopen and resume. Drafts are cleared only on:
          //  - successful deploy (effect on deploymentOutcome === 'deployed')
          //  - "Start over" / "Discard" in the resume banner
          onClose?.();
        }}
        initialStep={resumeAccepted && resumeOffer ? resumeOffer.step : undefined}
        initialConfig={resumeAccepted && resumeOffer ? resumeOffer.config : undefined}
      >
        <DeploymentContent />
      </DeploymentProvider>
    </div>
  );
}
