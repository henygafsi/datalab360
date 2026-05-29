'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { preDeployChecks } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { PreDeployChecksResult, PreDeployCheckItem } from '@/app/services/api/types';

interface PreDeployChecksPanelProps {
  projectId: string;
  warehouse?: string;
  onChecksComplete?: (result: PreDeployChecksResult) => void;
  className?: string;
}

const statusConfig: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
  FAIL: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  WARN: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
};

const checkLabels: Record<string, string> = {
  warehouse_availability: 'Warehouse Availability',
  fk_type_compatibility: 'FK Type Compatibility',
  circular_dependency: 'Circular Dependencies',
  naming_convention: 'Naming Conventions',
  schema_drift: 'Schema Drift',
};

const PreDeployChecksPanel: React.FC<PreDeployChecksPanelProps> = ({
  projectId,
  warehouse,
  onChecksComplete,
  className,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PreDeployChecksResult | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  const handleRunChecks = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await preDeployChecks(projectId, { warehouse });
      setResult(res);
      onChecksComplete?.(res);
      if (res.all_passed) {
        toast.success('All pre-deploy checks passed');
      } else {
        const failCount = res.checks.filter((c) => c.status === 'FAIL').length;
        toast.error(`${failCount} check${failCount > 1 ? 's' : ''} failed`);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Pre-deploy checks failed');
    } finally {
      setIsRunning(false);
    }
  }, [projectId, warehouse, onChecksComplete]);

  const toggleCheck = (check: string) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      next.has(check) ? next.delete(check) : next.add(check);
      return next;
    });
  };

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <span className="font-medium text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-500" />
          Pre-deployment checks
          <span className="text-[10px] font-normal text-slate-400">Warehouse · authoritative</span>
          {result && (
            <Badge
              size="sm"
              className={cn(
                result.all_passed
                  ? 'bg-green-100 text-green-600'
                  : 'bg-red-100 text-red-600',
              )}
            >
              {result.all_passed ? 'All Passed' : 'Issues Found'}
            </Badge>
          )}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunChecks}
          disabled={isRunning}
          className="gap-1.5"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5" />
              Run Checks
            </>
          )}
        </Button>
      </div>

      {result && (
        <div className="divide-y dark:divide-slate-700">
          {result.checks.map((check) => {
            const cfg = statusConfig[check.status] || statusConfig.WARN;
            const StatusIcon = cfg.icon;
            const label = checkLabels[check.check] || check.check;
            const isOpen = expandedChecks.has(check.check);

            return (
              <div key={check.check}>
                <button
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  onClick={() => toggleCheck(check.check)}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <StatusIcon className={cn('h-4 w-4', cfg.color)} />
                    {label}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge size="sm" className={cn(cfg.bg, cfg.color, 'text-xs')}>
                      {check.status}
                    </Badge>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 pl-10">
                    <pre className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded p-2 overflow-auto">
                      {JSON.stringify(check.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PreDeployChecksPanel;
