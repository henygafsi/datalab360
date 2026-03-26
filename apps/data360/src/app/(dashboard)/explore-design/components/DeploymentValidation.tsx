'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from 'rizzui';
import {
  X, Eye, Settings, Shield, Beaker, GitBranch, Network, Rocket,
  CheckCircle2, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { useEventStore } from '../stores/event-store';
import { useSession } from 'next-auth/react';

import {
  DeploymentProvider,
  useDeploymentContext,
  DEPLOYMENT_STEPS,
  type DeploymentStep,
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

// ── Inner content (consumes context) ──
function DeploymentContent() {
  const { currentStep, setCurrentStep, goNext, goPrev, isDeploying } = useDeploymentContext();

  const stepIndex = DEPLOYMENT_STEPS.findIndex(s => s.key === currentStep);
  const showGlobalNav = !['deploy', 'verify'].includes(currentStep);
  const nextLabel = DEPLOYMENT_STEPS[stepIndex + 1]?.label;
  const prevLabel = DEPLOYMENT_STEPS[stepIndex - 1]?.label;

  return (
    <div className="flex flex-col h-full">
      {/* ── Stepper Header ── */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {DEPLOYMENT_STEPS.map((step, idx) => {
            const Icon = STEP_ICONS[step.key];
            const isActive = idx === stepIndex;
            const isCompleted = idx < stepIndex;
            const isClickable = idx <= stepIndex && !isDeploying;

            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div
                    className={cn(
                      'h-px flex-1 min-w-[16px] max-w-[40px] transition-colors',
                      isCompleted ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700',
                    )}
                  />
                )}
                <button
                  onClick={() => isClickable && setCurrentStep(step.key)}
                  disabled={!isClickable}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800'
                      : isCompleted
                      ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer'
                      : 'text-slate-400 dark:text-slate-500 cursor-default',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all',
                      isActive
                        ? 'bg-blue-500 text-white'
                        : isCompleted
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400',
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Step Content + Sticky Nav ── */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
        {currentStep === 'review' && <StepReview />}
        {currentStep === 'config' && <StepConfigure />}
        {currentStep === 'pre_checks' && <StepPreChecks />}
        {currentStep === 'dry_run' && <StepDryRun />}
        {currentStep === 'sql_diff' && <StepSqlDiff />}
        {currentStep === 'impact' && <StepImpact />}
        {currentStep === 'deploy' && <StepDeploy />}
        {currentStep === 'verify' && <StepVerify />}

        {/* Navigation — sticky inside scroll container */}
        {showGlobalNav && (
          <div className="sticky bottom-0 flex items-center justify-between px-6 py-3 border-t dark:border-slate-700 bg-white dark:bg-slate-900 z-10">
            {stepIndex > 0 ? (
              <Button variant="outline" size="sm" onClick={goPrev} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                {prevLabel}
              </Button>
            ) : (
              <div />
            )}
            {stepIndex < DEPLOYMENT_STEPS.length - 1 && (
              <Button
                size="sm"
                onClick={goNext}
                className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                {nextLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
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
    const first = events.find(e => e.target?.database);
    return first?.target?.database || 'PROD_DB';
  }, [database, events]);

  const resolvedSchemas = useMemo(() => {
    if (schemas && schemas.length > 0) return schemas;
    const set = new Set<string>();
    events.forEach(e => {
      if (e.target?.schema) set.add(e.target.schema);
    });
    return set.size > 0 ? Array.from(set) : ['PUBLIC'];
  }, [schemas, events]);

  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 shadow-lg overflow-hidden',
        className,
      )}
    >
      <DeploymentProvider
        projectId={projectId}
        database={resolvedDatabase}
        schemas={resolvedSchemas}
        currentUser={currentUser}
        events={events}
        pendingEvents={pendingEvents}
        updateEventStatus={updateEventStatus}
        cleanupAppliedEvents={cleanupAppliedEvents}
        onClose={onClose}
      >
        <DeploymentContent />
      </DeploymentProvider>
    </div>
  );
}
