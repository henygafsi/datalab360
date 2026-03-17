'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
  Database, RefreshCw, Loader2, Table2, Shield,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { postVerifyDeployment } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SchemaMismatch {
  objectType: 'table' | 'column' | 'constraint' | 'index';
  objectName: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface PostVerifyResult {
  status: 'match' | 'drift' | 'error';
  checkedAt: string;
  tablesChecked: number;
  columnsChecked: number;
  mismatches: SchemaMismatch[];
  durationMs: number;
}

interface PostVerifyBannerProps {
  result?: PostVerifyResult | null;
  projectId?: string | null;
  database?: string;
  schemaName?: string;
  deploymentId?: string;
  isLoading?: boolean;
  onRecheck?: () => void;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

const PostVerifyBanner: React.FC<PostVerifyBannerProps> = ({
  result: externalResult,
  projectId,
  database,
  schemaName,
  deploymentId,
  isLoading: externalLoading,
  onRecheck,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [internalResult, setInternalResult] = useState<PostVerifyResult | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const result = externalResult ?? internalResult;
  const isLoading = externalLoading ?? internalLoading;

  const handleVerify = useCallback(async () => {
    if (!projectId || !database || !schemaName) return;
    setInternalLoading(true);
    try {
      const apiResult = await postVerifyDeployment(projectId, {
        database,
        schema_name: schemaName,
        deployment_id: deploymentId,
      });
      setInternalResult({
        status: apiResult.status,
        checkedAt: apiResult.checked_at,
        tablesChecked: apiResult.tables_checked,
        columnsChecked: apiResult.columns_checked,
        mismatches: apiResult.mismatches.map((m) => ({
          objectType: m.object_type,
          objectName: m.object_name,
          expected: m.expected,
          actual: m.actual,
          severity: m.severity,
        })),
        durationMs: apiResult.duration_ms,
      });
      if (apiResult.status === 'match') {
        toast.success('Post-deploy verification passed');
      } else {
        toast.error('Schema drift detected');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Verification failed');
    } finally {
      setInternalLoading(false);
    }
  }, [projectId, database, schemaName, deploymentId]);

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg', className)}>
        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
        <div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Verifying schema...
          </p>
          <p className="text-xs text-blue-500">Comparing expected model vs actual database schema</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const isMatch = result.status === 'match';
  const errorCount = result.mismatches.filter((m) => m.severity === 'error').length;
  const warningCount = result.mismatches.filter((m) => m.severity === 'warning').length;

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden border',
        isMatch
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        className,
      )}
    >
      {/* Banner */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => !isMatch && setIsExpanded(!isExpanded)}
      >
        {isMatch ? (
          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
        ) : result.status === 'drift' ? (
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
        )}

        <div className="flex-1">
          <p className={cn('text-sm font-medium', isMatch ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
            {isMatch
              ? 'Post-Deploy Verification Passed'
              : result.status === 'drift'
                ? 'Schema Drift Detected'
                : 'Verification Error'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {result.tablesChecked} tables, {result.columnsChecked} columns checked
            {' • '}
            {new Date(result.checkedAt).toLocaleTimeString()}
            {' • '}
            {result.durationMs}ms
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isMatch && (
            <>
              {errorCount > 0 && (
                <Badge size="sm" className="bg-red-100 text-red-600">
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge size="sm" className="bg-amber-100 text-amber-600">
                  {warningCount} warning{warningCount > 1 ? 's' : ''}
                </Badge>
              )}
            </>
          )}

          {(onRecheck || projectId) && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (onRecheck) onRecheck();
                else handleVerify();
              }}
              className="gap-1 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              {result ? 'Re-check' : 'Verify'}
            </Button>
          )}

          {!isMatch && (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )
          )}
        </div>
      </div>

      {/* Mismatch Details */}
      {isExpanded && result.mismatches.length > 0 && (
        <div className="border-t border-red-200 dark:border-red-800">
          <div className="px-4 py-2 bg-red-100/50 dark:bg-red-900/30">
            <p className="text-xs font-medium text-red-600">Mismatches found:</p>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900/30">
            {result.mismatches.map((mismatch, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-start gap-3">
                {mismatch.severity === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge size="sm" className="bg-slate-100 text-slate-600 text-[10px] uppercase">
                      {mismatch.objectType}
                    </Badge>
                    <span className="text-sm font-mono font-medium">{mismatch.objectName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Expected:</span>
                    <code className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1 rounded">
                      {mismatch.expected}
                    </code>
                  </div>
                  <div className="flex items-center gap-2 text-xs mt-0.5">
                    <span className="text-slate-500">Actual:</span>
                    <code className="text-red-600 bg-red-50 dark:bg-red-900/20 px-1 rounded">
                      {mismatch.actual}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PostVerifyBanner;
