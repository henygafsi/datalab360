'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  CheckCircle2, XCircle, Loader2, RotateCcw, Shield, Clock,
  GitBranch, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import { DeploymentUnavailableNote } from '../DeploymentUnavailableNote';

interface VerifyCheckResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
}

/** Visual config for the final deployment outcome banner. */
const OUTCOME_CONFIG = {
  deployed: {
    icon: CheckCircle2,
    iconClass: 'text-green-500',
    title: 'Deployment Succeeded',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'deployed',
  },
  failed: {
    icon: XCircle,
    iconClass: 'text-red-500',
    title: 'Deployment Failed',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'failed',
  },
  pending_approval: {
    icon: Clock,
    iconClass: 'text-amber-500',
    title: 'Submitted — Pending Approval',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    label: 'pending approval',
  },
} as const;

export default function StepVerify() {
  const {
    projectId, database, schemas, results, goPrev, onClose, cleanupAppliedEvents,
  } = useDeploymentContext();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerifyCheckResult[]>([]);

  const runPostVerify = useCallback(async () => {
    setIsVerifying(true);
    try {
      const result = await exploreDesignApi.postVerifyDeployment(projectId, {
        database,
        schema_name: schemas[0] || 'PUBLIC',
        deployment_id: results.deploymentId || undefined,
      });
      const checks: VerifyCheckResult[] = [];
      if (result && typeof result === 'object') {
        const r = result as any;
        if (r.checks) {
          checks.push(...r.checks.map((c: any) => ({
            check: c.check || c.name || 'Check',
            status: c.status || 'PASS',
            details: c.details ? (typeof c.details === 'string' ? c.details : JSON.stringify(c.details)) : '',
          })));
        } else {
          checks.push({
            check: 'Schema Verification',
            status: r.verified || r.status === 'success' ? 'PASS' : 'FAIL',
            details: r.message || r.summary || 'Verification complete',
          });
        }
      }
      setVerifyResults(checks);
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Post-verification unavailable';
      setVerifyResults([{
        check: 'Post-Verification',
        status: 'WARN',
        details: typeof msg === 'string' ? msg : JSON.stringify(msg),
      }]);
    } finally {
      setIsVerifying(false);
    }
  }, [projectId, database, schemas, results.deploymentId]);

  // Auto-run post-verify on mount
  useEffect(() => {
    runPostVerify();
  }, [runPostVerify]);

  const { deploymentId, deploymentOutcome, deployedVersion, versionsUnavailable, backendError } = results;
  const hasFailures = verifyResults.some(r => r.status === 'FAIL');

  // Resolve the final outcome — fall back to inference if StepDeploy didn't set it.
  const outcome: keyof typeof OUTCOME_CONFIG =
    deploymentOutcome ?? (backendError ? 'failed' : 'deployed');
  const outcomeCfg = OUTCOME_CONFIG[outcome];
  const OutcomeIcon = outcomeCfg.icon;

  /** Navigate the user to the Versions tab in the Project Context panel. */
  const goToVersionsTab = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('explore-design:open-context-tab', { detail: { tab: 'versions' } }),
      );
    }
    onClose?.();
  }, [onClose]);

  return (
    <div className="p-6 animate-in fade-in duration-200 space-y-5">
      {/* ── Outcome banner ── */}
      <div className="text-center py-3">
        <OutcomeIcon className={cn('h-11 w-11 mx-auto mb-2', outcomeCfg.iconClass)} />
        <h3 className="text-lg font-semibold">{outcomeCfg.title}</h3>
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <Badge size="sm" className={cn('text-[10px]', outcomeCfg.badge)}>
            {outcomeCfg.label}
          </Badge>
        </div>
      </div>

      {/* ── Outcome summary card ── */}
      <div className="border dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700 text-sm">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">Deployment ID</span>
          <span className="font-mono text-slate-800 dark:text-slate-200">
            {deploymentId || '—'}
          </span>
        </div>
        <div className="px-4 py-2.5 flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">Final status</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {outcomeCfg.label}
          </span>
        </div>
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-slate-500 dark:text-slate-400 shrink-0">Schema version</span>
          {deployedVersion ? (
            <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
              <GitBranch className="h-3.5 w-3.5 text-blue-500" />
              {deployedVersion.version_name || `V${deployedVersion.version_number}`}
            </span>
          ) : versionsUnavailable ? (
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs text-right">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              May have been created — read-back endpoint unavailable
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">—</span>
          )}
        </div>
      </div>

      {/* ── Backend failure (friendly error, not a silent close) ── */}
      {outcome === 'failed' && backendError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              The deployment did not complete
            </p>
          </div>
          <p className="mt-1 text-[12px] text-red-600 dark:text-red-400 break-words">
            {backendError}
          </p>
          <p className="mt-1 text-[11px] text-red-500 dark:text-red-400/80">
            Go Back to review and retry — your changes have not been lost.
          </p>
        </div>
      )}

      {/* ── Versions read-back unavailable — honest backend gap ── */}
      {versionsUnavailable && outcome !== 'failed' && (
        <DeploymentUnavailableNote
          title="Could not confirm the new schema version"
          description="The deployment was recorded, but the version read-back endpoint failed — so the created version cannot be displayed here."
          endpoints={[
            { endpoint: 'GET /explore-design/{projectId}/versions', status: 'currently 400' },
            { endpoint: 'GET /explore-design/schema_versions/{projectId}', status: 'currently 404' },
          ]}
        />
      )}

      {/* ── Post-deployment verification checks ── */}
      <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">Post-Deployment Checks</span>
          {isVerifying && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin ml-auto" />}
          {!isVerifying && hasFailures && (
            <span className="ml-auto text-[11px] text-red-500 font-medium">Issues found</span>
          )}
        </div>
        {verifyResults.length > 0 ? (
          <div className="divide-y dark:divide-slate-700">
            {verifyResults.map((check, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {check.status === 'PASS' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : check.status === 'FAIL' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Shield className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">{check.check}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 max-w-[300px] text-right truncate">{check.details}</span>
                  <Badge size="sm" className={cn(
                    'text-[10px]',
                    check.status === 'PASS' ? 'bg-green-100 text-green-600' :
                    check.status === 'FAIL' ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-600',
                  )}>
                    {check.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            {isVerifying ? 'Running verification…' : 'No verification checks returned.'}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Button variant="outline" onClick={goPrev} className="gap-1.5">
          <RotateCcw className="h-4 w-4" /> Back
        </Button>
        <Button variant="outline" onClick={runPostVerify} disabled={isVerifying} className="gap-1.5">
          <RotateCcw className="h-4 w-4" /> Re-verify
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            cleanupAppliedEvents();
            toast.success('Applied events cleaned up');
          }}
          className="gap-1.5"
        >
          Clean Up Events
        </Button>
        <Button onClick={goToVersionsTab} className="gap-1.5">
          View in Versions <ArrowRight className="h-4 w-4" />
        </Button>
        {onClose && (
          <Button variant="outline" onClick={onClose} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Done
          </Button>
        )}
      </div>
    </div>
  );
}
