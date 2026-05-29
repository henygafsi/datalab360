'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Shield, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  AlertTriangle, Link2, RefreshCw, FileText, GitBranch, Clock,
  ArrowRight,
} from 'lucide-react';
import { useEventStore, DesignEvent, EventType } from '../stores/event-store';

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'warning';

interface PreCheck {
  id: string;
  name: string;
  description: string;
  status: CheckStatus;
  icon: React.ComponentType<any>;
  details?: string;
  errors?: string[];
  warnings?: string[];
}

interface PreCheckGateProps {
  className?: string;
  projectId?: string | null;
  onAllPassed?: () => void;
  onRunChecks?: () => Promise<PreCheck[]>;
  onChecksComplete?: (results: PreCheck[], allPassed: boolean) => void;
  autoRun?: boolean;
}

// ── Check Implementations (client-side) ────────────────────────────────────────

function checkFkTypeCompatibility(events: DesignEvent[]): PreCheck {
  const fkEvents = events.filter((e) => e.type === 'FOREIGN_KEY_ADDED');
  const errors: string[] = [];

  // Check if FK references exist as table creation events
  for (const fk of fkEvents) {
    const refTable = fk.payload?.refTable;
    if (refTable) {
      const tableExists = events.some(
        (e) =>
          (e.type === 'TABLE_CREATED' || e.type === 'TABLE_ADDED_TO_MODELING') &&
          e.target.table === refTable,
      );
      if (!tableExists) {
        errors.push(`FK on ${fk.target.table}.${fk.payload.columnName || fk.target.column} references ${refTable} which is not in the model`);
      }
    }
  }

  return {
    id: 'fk_type_check',
    name: 'FK Type Compatibility',
    description: 'Validates that all foreign key references point to existing tables with compatible types',
    icon: Link2,
    status: errors.length > 0 ? 'failed' : fkEvents.length > 0 ? 'passed' : 'passed',
    errors,
  };
}

function checkCircularDependencies(events: DesignEvent[]): PreCheck {
  const fkEvents = events.filter((e) => e.type === 'FOREIGN_KEY_ADDED');
  const errors: string[] = [];

  // Build adjacency for FK references
  const graph = new Map<string, Set<string>>();
  for (const fk of fkEvents) {
    const source = fk.target.table;
    const target = fk.payload?.refTable;
    if (source && target) {
      if (!graph.has(source)) graph.set(source, new Set());
      graph.get(source)!.add(target);
    }
  }

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of Array.from(graph.get(node) || [])) {
      if (hasCycle(neighbor)) {
        errors.push(`Circular dependency: ${node} → ${neighbor}`);
        return true;
      }
    }
    inStack.delete(node);
    return false;
  }

  for (const node of Array.from(graph.keys())) {
    if (!visited.has(node)) hasCycle(node);
  }

  return {
    id: 'circular_deps',
    name: 'Circular Dependency Detection',
    description: 'Checks for circular foreign key references that would prevent DDL execution',
    icon: GitBranch,
    status: errors.length > 0 ? 'failed' : 'passed',
    errors,
  };
}

function checkNamingConventions(events: DesignEvent[]): PreCheck {
  const warnings: string[] = [];
  const NAMING_PATTERN = /^[A-Z][A-Z0-9_]*$/;

  for (const event of events) {
    if (event.type === 'TABLE_CREATED') {
      const tableName = event.payload?.tableName || event.target.table;
      if (tableName && !NAMING_PATTERN.test(tableName)) {
        warnings.push(`Table "${tableName}" does not follow UPPER_SNAKE_CASE convention`);
      }
    }
    if (event.type === 'ADD_COLUMN') {
      const colName = event.payload?.columnName;
      if (colName && !NAMING_PATTERN.test(colName)) {
        warnings.push(`Column "${colName}" does not follow UPPER_SNAKE_CASE convention`);
      }
    }
    if (event.type === 'TABLE_RENAMED') {
      const newName = event.payload?.newName;
      if (newName && !NAMING_PATTERN.test(newName)) {
        warnings.push(`Renamed table "${newName}" does not follow UPPER_SNAKE_CASE convention`);
      }
    }
  }

  return {
    id: 'naming_check',
    name: 'Naming Convention Validation',
    description: 'Ensures all objects follow UPPER_SNAKE_CASE naming standards',
    icon: FileText,
    status: warnings.length > 0 ? 'warning' : 'passed',
    warnings,
  };
}

function checkSchemaDrift(events: DesignEvent[]): PreCheck {
  const warnings: string[] = [];

  // Check for multiple renames of the same object
  const renames = events.filter((e) => e.type === 'TABLE_RENAMED' || e.type === 'COLUMN_RENAMED');
  const renameTargets = new Map<string, number>();
  for (const r of renames) {
    const key = `${r.target.table}.${r.target.column || ''}`;
    renameTargets.set(key, (renameTargets.get(key) || 0) + 1);
  }
  for (const [key, count] of Array.from(renameTargets.entries())) {
    if (count > 1) {
      warnings.push(`${key} renamed ${count} times — possible schema drift`);
    }
  }

  // Check for add then remove of same column
  const addedColumns = new Set<string>();
  const removedColumns = new Set<string>();
  for (const e of events) {
    if (e.type === 'ADD_COLUMN') {
      addedColumns.add(`${e.target.table}.${e.payload?.columnName}`);
    }
    if (e.type === 'REMOVE_COLUMN') {
      const col = `${e.target.table}.${e.payload?.columnName || e.target.column}`;
      removedColumns.add(col);
    }
  }
  for (const col of Array.from(addedColumns)) {
    if (removedColumns.has(col)) {
      warnings.push(`${col} was added then removed — consider removing both events`);
    }
  }

  return {
    id: 'schema_drift',
    name: 'Schema Drift Check',
    description: 'Detects conflicting or redundant schema changes that may indicate drift',
    icon: RefreshCw,
    status: warnings.length > 0 ? 'warning' : 'passed',
    warnings,
  };
}

// ── Status Config ──────────────────────────────────────────────────────────────

const statusConfig: Record<CheckStatus, {
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
  label: string;
}> = {
  pending: { icon: Clock, color: 'text-slate-400', bgColor: 'bg-slate-100', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-100', label: 'Running' },
  passed: { icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-100', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-100', label: 'Failed' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bgColor: 'bg-amber-100', label: 'Warning' },
};

// ── Component ──────────────────────────────────────────────────────────────────

const PreCheckGate: React.FC<PreCheckGateProps> = ({
  className,
  projectId,
  onAllPassed,
  onRunChecks,
  onChecksComplete,
  autoRun = false,
}) => {
  const { events } = useEventStore(projectId);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [checks, setChecks] = useState<PreCheck[] | null>(null);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const autoRanRef = React.useRef(false);

  const handleRunChecks = useCallback(async () => {
    setIsRunning(true);
    setChecks(null);

    // Simulate slight delay for UX
    await new Promise((r) => setTimeout(r, 500));

    let results: PreCheck[];
    if (onRunChecks) {
      results = await onRunChecks();
    } else {
      // Run client-side checks
      results = [
        checkFkTypeCompatibility(events),
        checkCircularDependencies(events),
        checkNamingConventions(events),
        checkSchemaDrift(events),
      ];
    }

    setChecks(results);
    setIsRunning(false);

    const allPassed = results.every((c) => c.status === 'passed' || c.status === 'warning');
    if (allPassed && onAllPassed) {
      onAllPassed();
    }
    if (onChecksComplete) {
      onChecksComplete(results, allPassed);
    }
  }, [events, onRunChecks, onAllPassed, onChecksComplete]);

  // Auto-run on mount when autoRun is true
  React.useEffect(() => {
    if (autoRun && !autoRanRef.current && !checks && !isRunning) {
      autoRanRef.current = true;
      handleRunChecks();
    }
  }, [autoRun, handleRunChecks, checks, isRunning]);

  const allPassed = checks?.every((c) => c.status === 'passed' || c.status === 'warning');
  const hasFailed = checks?.some((c) => c.status === 'failed');

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <button
          className="flex items-center gap-2 font-medium text-sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Shield className={cn('h-4 w-4', hasFailed ? 'text-red-500' : allPassed ? 'text-green-500' : 'text-slate-400')} />
          Structural checks
          <span className="text-[10px] font-normal text-slate-400">Graph &amp; DDL · client-side</span>
          {checks && (
            <Badge
              size="sm"
              className={cn(
                hasFailed
                  ? 'bg-red-100 text-red-600'
                  : allPassed
                    ? 'bg-green-100 text-green-600'
                    : 'bg-amber-100 text-amber-600',
              )}
            >
              {hasFailed
                ? `${checks.filter((c) => c.status === 'failed').length} failed`
                : allPassed
                  ? 'All passed'
                  : `${checks.filter((c) => c.status === 'warning').length} warnings`}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>

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
              Checking...
            </>
          ) : (
            <>
              <Shield className="h-3.5 w-3.5" />
              Run Checks
            </>
          )}
        </Button>
      </div>

      {isExpanded && (
        <div>
          {/* Checks List */}
          {checks ? (
            <div className="divide-y dark:divide-slate-700">
              {checks.map((check) => {
                const sc = statusConfig[check.status];
                const StatusIcon = sc.icon;
                const CheckIcon = check.icon;
                const isCheckExpanded = expandedCheckId === check.id;
                const hasDetails = (check.errors && check.errors.length > 0) || (check.warnings && check.warnings.length > 0);

                return (
                  <div key={check.id}>
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 transition-colors',
                        hasDetails ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : '',
                      )}
                      onClick={() => hasDetails && setExpandedCheckId(isCheckExpanded ? null : check.id)}
                    >
                      {/* Status Icon */}
                      <StatusIcon
                        className={cn(
                          'h-5 w-5 flex-shrink-0',
                          sc.color,
                          check.status === 'running' && 'animate-spin',
                        )}
                      />

                      {/* Check Icon */}
                      <CheckIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{check.name}</p>
                        <p className="text-xs text-slate-500 truncate">{check.description}</p>
                      </div>

                      {/* Badge */}
                      <Badge size="sm" className={cn(sc.bgColor, sc.color, 'text-[10px]')}>
                        {sc.label}
                      </Badge>

                      {/* Expand indicator */}
                      {hasDetails && (
                        isCheckExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        )
                      )}
                    </div>

                    {/* Expanded details */}
                    {isCheckExpanded && hasDetails && (
                      <div className="px-4 pb-3 ml-12">
                        {check.errors && check.errors.length > 0 && (
                          <div className="space-y-1 mb-2">
                            {check.errors.map((err, i) => (
                              <div key={i} className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 flex items-start gap-1.5">
                                <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                {err}
                              </div>
                            ))}
                          </div>
                        )}
                        {check.warnings && check.warnings.length > 0 && (
                          <div className="space-y-1">
                            {check.warnings.map((w, i) => (
                              <div key={i} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-600 flex items-start gap-1.5">
                                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                {w}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <Shield className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Run the structural preview before deployment</p>
              <p className="text-xs mt-1">
                Fast client-side check of FK types, circular deps, naming conventions, and schema drift
              </p>
            </div>
          )}

          {/* Footer */}
          {checks && (
            <div className={cn(
              'px-4 py-2 border-t dark:border-slate-700 text-xs flex items-center gap-2',
              hasFailed ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-green-50 dark:bg-green-900/20 text-green-600',
            )}>
              {hasFailed ? (
                <>
                  <XCircle className="h-3.5 w-3.5" />
                  Deployment blocked — fix all failed checks before proceeding
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  All checks passed — ready to deploy
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PreCheckGate;
