'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  GitCompare, Copy, Check, ChevronDown, ChevronRight, Eye,
  Columns2, Rows3, AlertTriangle, FileCode,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: { before: number | null; after: number | null };
}

interface SqlDiffViewerProps {
  beforeSql: string;
  afterSql: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

type ViewMode = 'split' | 'unified';

// ── Simple Diff Algorithm (LCS-based) ──────────────────────────────────────────

function computeDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Build LCS table
  const m = beforeLines.length;
  const n = afterLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      stack.push({
        type: 'unchanged',
        content: beforeLines[i - 1],
        lineNumber: { before: i, after: j },
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: 'added',
        content: afterLines[j - 1],
        lineNumber: { before: null, after: j },
      });
      j--;
    } else if (i > 0) {
      stack.push({
        type: 'removed',
        content: beforeLines[i - 1],
        lineNumber: { before: i, after: null },
      });
      i--;
    }
  }

  return stack.reverse();
}

// ── Stat Helpers ───────────────────────────────────────────────────────────────

function getDiffStats(lines: DiffLine[]) {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of lines) {
    if (line.type === 'added') added++;
    else if (line.type === 'removed') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}

// ── Component ──────────────────────────────────────────────────────────────────

const SqlDiffViewer: React.FC<SqlDiffViewerProps> = ({
  beforeSql,
  afterSql,
  beforeLabel = 'Before (Current)',
  afterLabel = 'After (Proposed)',
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [copied, setCopied] = useState(false);

  const diffLines = useMemo(() => computeDiff(beforeSql, afterSql), [beforeSql, afterSql]);
  const stats = useMemo(() => getDiffStats(diffLines), [diffLines]);

  const handleCopyAfter = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(afterSql);
      setCopied(true);
      toast.success('New SQL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [afterSql]);

  const hasChanges = stats.added > 0 || stats.removed > 0;

  if (!hasChanges) {
    return (
      <div className={cn('border dark:border-slate-700 rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Check className="h-4 w-4 text-green-500" />
          No SQL changes detected
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-purple-500" />
          SQL Diff
          <Badge size="sm" className="bg-green-100 text-green-600">+{stats.added}</Badge>
          <Badge size="sm" className="bg-red-100 text-red-600">-{stats.removed}</Badge>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{stats.added + stats.removed} changes</span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center bg-slate-700 rounded p-0.5">
                <button
                  onClick={() => setViewMode('split')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                    viewMode === 'split'
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  <Columns2 className="h-3 w-3" />
                  Split
                </button>
                <button
                  onClick={() => setViewMode('unified')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                    viewMode === 'unified'
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-white',
                  )}
                >
                  <Rows3 className="h-3 w-3" />
                  Unified
                </button>
              </div>
            </div>
            <Tooltip content="Copy new SQL">
              <button
                onClick={handleCopyAfter}
                className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </Tooltip>
          </div>

          {/* Diff Content */}
          {viewMode === 'unified' ? (
            <UnifiedView diffLines={diffLines} />
          ) : (
            <SplitView
              diffLines={diffLines}
              beforeLabel={beforeLabel}
              afterLabel={afterLabel}
            />
          )}

          {/* Footer stats */}
          <div className="px-3 py-2 bg-slate-800 border-t border-slate-700 flex items-center gap-4 text-xs text-slate-400">
            <span className="text-green-400">+{stats.added} added</span>
            <span className="text-red-400">-{stats.removed} removed</span>
            <span>{stats.unchanged} unchanged</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Unified View ───────────────────────────────────────────────────────────────

const UnifiedView: React.FC<{ diffLines: DiffLine[] }> = ({ diffLines }) => (
  <div className="bg-slate-900 overflow-auto max-h-[500px]">
    <pre className="text-sm font-mono leading-relaxed">
      {diffLines.map((line, idx) => (
        <div
          key={idx}
          className={cn(
            'flex px-4 py-0.5',
            line.type === 'added' && 'bg-green-900/30',
            line.type === 'removed' && 'bg-red-900/30',
          )}
        >
          <span className="select-none text-slate-600 w-8 text-right pr-3 flex-shrink-0">
            {line.lineNumber.before ?? ''}
          </span>
          <span className="select-none text-slate-600 w-8 text-right pr-3 flex-shrink-0">
            {line.lineNumber.after ?? ''}
          </span>
          <span
            className={cn(
              'select-none w-4 flex-shrink-0',
              line.type === 'added' && 'text-green-400',
              line.type === 'removed' && 'text-red-400',
            )}
          >
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          <span
            className={cn(
              'flex-1',
              line.type === 'added' && 'text-green-300',
              line.type === 'removed' && 'text-red-300',
              line.type === 'unchanged' && 'text-slate-300',
            )}
          >
            {line.content}
          </span>
        </div>
      ))}
    </pre>
  </div>
);

// ── Split View ─────────────────────────────────────────────────────────────────

const SplitView: React.FC<{
  diffLines: DiffLine[];
  beforeLabel: string;
  afterLabel: string;
}> = ({ diffLines, beforeLabel, afterLabel }) => {
  // Build left/right columns, keeping them aligned
  const pairs = useMemo(() => {
    const result: Array<{
      left: { content: string; type: 'removed' | 'unchanged' | 'empty'; lineNum: number | null };
      right: { content: string; type: 'added' | 'unchanged' | 'empty'; lineNum: number | null };
    }> = [];

    let i = 0;
    while (i < diffLines.length) {
      const line = diffLines[i];

      if (line.type === 'unchanged') {
        result.push({
          left: { content: line.content, type: 'unchanged', lineNum: line.lineNumber.before },
          right: { content: line.content, type: 'unchanged', lineNum: line.lineNumber.after },
        });
        i++;
      } else if (line.type === 'removed') {
        // Check if next is added (replacement)
        const next = diffLines[i + 1];
        if (next && next.type === 'added') {
          result.push({
            left: { content: line.content, type: 'removed', lineNum: line.lineNumber.before },
            right: { content: next.content, type: 'added', lineNum: next.lineNumber.after },
          });
          i += 2;
        } else {
          result.push({
            left: { content: line.content, type: 'removed', lineNum: line.lineNumber.before },
            right: { content: '', type: 'empty', lineNum: null },
          });
          i++;
        }
      } else if (line.type === 'added') {
        result.push({
          left: { content: '', type: 'empty', lineNum: null },
          right: { content: line.content, type: 'added', lineNum: line.lineNumber.after },
        });
        i++;
      } else {
        i++;
      }
    }

    return result;
  }, [diffLines]);

  return (
    <div className="max-h-[500px] overflow-y-auto bg-slate-900">
      {/* Column Headers */}
      <div className="grid grid-cols-2 sticky top-0 z-10 bg-slate-800 border-b border-slate-700">
        <div className="px-3 py-1.5 text-xs font-medium text-red-400 border-r border-slate-700">
          {beforeLabel}
        </div>
        <div className="px-3 py-1.5 text-xs font-medium text-green-400">
          {afterLabel}
        </div>
      </div>

      {/* Rows — each row is a grid so both sides stay vertically aligned */}
      <pre className="text-sm font-mono leading-relaxed">
        {pairs.map((pair, idx) => (
          <div key={idx} className="grid grid-cols-2">
            {/* Left Cell */}
            <div
              className={cn(
                'overflow-x-auto border-r border-slate-700',
                pair.left.type === 'removed' && 'bg-red-900/30',
                pair.left.type === 'empty' && 'bg-slate-900/50',
              )}
            >
              <div className="flex px-2 py-0.5 whitespace-pre min-w-max">
                <span className="select-none text-slate-600 w-8 text-right pr-2 flex-shrink-0">
                  {pair.left.lineNum ?? ''}
                </span>
                <span
                  className={cn(
                    pair.left.type === 'removed' && 'text-red-300',
                    pair.left.type === 'unchanged' && 'text-slate-300',
                    pair.left.type === 'empty' && 'text-transparent',
                  )}
                >
                  {pair.left.content || '\u00A0'}
                </span>
              </div>
            </div>

            {/* Right Cell */}
            <div
              className={cn(
                'overflow-x-auto',
                pair.right.type === 'added' && 'bg-green-900/30',
                pair.right.type === 'empty' && 'bg-slate-900/50',
              )}
            >
              <div className="flex px-2 py-0.5 whitespace-pre min-w-max">
                <span className="select-none text-slate-600 w-8 text-right pr-2 flex-shrink-0">
                  {pair.right.lineNum ?? ''}
                </span>
                <span
                  className={cn(
                    pair.right.type === 'added' && 'text-green-300',
                    pair.right.type === 'unchanged' && 'text-slate-300',
                    pair.right.type === 'empty' && 'text-transparent',
                  )}
                >
                  {pair.right.content || '\u00A0'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </pre>
    </div>
  );
};

export default SqlDiffViewer;
