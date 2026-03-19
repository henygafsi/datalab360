'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  CheckCircle2, XCircle, Loader2, RotateCcw, Shield, ArrowLeft,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';

interface VerifyCheckResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
}

export default function StepVerify() {
  const { projectId, database, schemas, results, setResults, goPrev, onClose, cleanupAppliedEvents } = useDeploymentContext();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerifyCheckResult[]>([]);

  // Auto-run post-verify on mount
  useEffect(() => {
    runPostVerify();
  }, []);

  const runPostVerify = useCallback(async () => {
    setIsVerifying(true);
    try {
      const result = await exploreDesignApi.postVerifyDeployment(projectId, {
        database,
        schema_name: schemas[0] || 'PUBLIC',
        deployment_id: results.deploymentId || undefined,
      });
      // Map result to local format
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
          // Treat whole response as verification data
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
      // Not critical — show warning, don't block
      setVerifyResults([{
        check: 'Post-Verification',
        status: 'WARN',
        details: typeof msg === 'string' ? msg : JSON.stringify(msg),
      }]);
    } finally {
      setIsVerifying(false);
    }
  }, [projectId]);

  const deploymentId = results.deploymentId;
  const hasFailures = verifyResults.some(r => r.status === 'FAIL');

  return (
    <div className="p-6 animate-in fade-in duration-200 space-y-6">
      {/* Header */}
      <div className="text-center py-4">
        {isVerifying ? (
          <Loader2 className="h-10 w-10 mx-auto mb-3 text-blue-500 animate-spin" />
        ) : hasFailures ? (
          <XCircle className="h-10 w-10 mx-auto mb-3 text-red-500" />
        ) : (
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
        )}
        <h3 className="text-lg font-semibold">
          {isVerifying ? 'Verifying Deployment...' : hasFailures ? 'Verification Issues' : 'Deployment Verified'}
        </h3>
        {deploymentId && (
          <p className="text-sm text-slate-500 mt-1 font-mono">
            Deployment ID: {deploymentId}
          </p>
        )}
      </div>

      {/* Verification Checks */}
      {verifyResults.length > 0 && (
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-sm">Post-Deployment Checks</span>
          </div>
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
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-3 pt-4">
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
        {onClose && (
          <Button onClick={onClose} className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" /> Done
          </Button>
        )}
      </div>
    </div>
  );
}
