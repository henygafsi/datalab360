'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  Beaker, Loader2, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';

interface DryRunResult {
  status: 'success' | 'failed' | 'partial';
  total_actions: number;
  executed: number;
  failed: number;
  errors: string[];
  clone_schema?: string;
}

export default function StepDryRun() {
  const { projectId, results, setResults } = useDeploymentContext();
  const [isRunning, setIsRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  const handleDryRun = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await exploreDesignApi.dryRunDeployment(projectId);
      const drResult: DryRunResult = {
        status: (result as any).status || (result as any).failed === 0 ? 'success' : 'failed',
        total_actions: (result as any).total || 0,
        executed: (result as any).executed || 0,
        failed: (result as any).failed || 0,
        errors: (result as any).errors || [],
        clone_schema: (result as any).clone_schema,
      };
      setDryRunResult(drResult);
      setResults(prev => ({ ...prev, dryRunCompleted: true }));
      if (drResult.failed === 0) {
        toast.success('Dry run completed successfully — all DDL actions passed');
      } else {
        toast.error(`Dry run: ${drResult.failed} action(s) failed`);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Dry run failed';
      toast.error(msg);
      setDryRunResult({
        status: 'failed',
        total_actions: 0,
        executed: 0,
        failed: 0,
        errors: [typeof msg === 'string' ? msg : JSON.stringify(msg)],
      });
    } finally {
      setIsRunning(false);
    }
  }, [projectId, setResults]);

  return (
      <div className="p-6 space-y-6">
      <div className="text-center py-8">
        <Beaker className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <h3 className="text-lg font-semibold mb-1">Dry Run Simulation</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Clone your production schema, execute all DDL actions on the clone, and verify results —
          no changes to production.
        </p>
      </div>

      {/* Run Button */}
      {!dryRunResult && (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleDryRun}
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Running Dry Run...</>
            ) : (
              <><Beaker className="h-5 w-5" /> Start Dry Run</>
            )}
          </Button>
        </div>
      )}

      {/* Results */}
      {dryRunResult && (
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
          <div className={cn(
            'px-4 py-3 flex items-center justify-between',
            dryRunResult.status === 'success'
              ? 'bg-green-50 dark:bg-green-900/20'
              : 'bg-red-50 dark:bg-red-900/20',
          )}>
            <span className="font-medium text-sm flex items-center gap-2">
              {dryRunResult.status === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              Dry Run {dryRunResult.status === 'success' ? 'Passed' : 'Failed'}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-600">Executed: {dryRunResult.executed}</span>
              {dryRunResult.failed > 0 && (
                <span className="text-red-600">Failed: {dryRunResult.failed}</span>
              )}
              <span className="text-slate-500">Total: {dryRunResult.total_actions}</span>
            </div>
          </div>

          {dryRunResult.clone_schema && (
            <div className="px-4 py-2 text-xs text-slate-500 border-b dark:border-slate-700">
              Clone schema: <span className="font-mono">{dryRunResult.clone_schema}</span> (auto-dropped)
            </div>
          )}

          {dryRunResult.errors.length > 0 && (
            <div className="p-4 space-y-2">
              {dryRunResult.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Retry */}
      {dryRunResult && dryRunResult.status !== 'success' && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleDryRun} disabled={isRunning} className="gap-1.5">
            <Beaker className="h-4 w-4" /> Retry Dry Run
          </Button>
        </div>
      )}

      </div>
  );
}
