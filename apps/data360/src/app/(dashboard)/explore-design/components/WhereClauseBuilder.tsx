'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip } from 'rizzui';
import {
  Filter, Plus, Trash2, Code2, ChevronDown, ChevronRight,
  Copy, Check, GripVertical, ArrowRight, Eye,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL' | 'BETWEEN';
type LogicOperator = 'AND' | 'OR';

interface WhereCondition {
  id: string;
  column: string;
  operator: Operator;
  value: string;
  value2?: string; // For BETWEEN
  logicOperator: LogicOperator;
}

interface WhereClauseBuilderProps {
  columns: Array<{ name: string; type: string }>;
  onChange: (sql: string) => void;
  initialConditions?: WhereCondition[];
  className?: string;
}

// ── Operator Config ────────────────────────────────────────────────────────────

const OPERATORS: Array<{ value: Operator; label: string; needsValue: boolean; needsSecondValue: boolean }> = [
  { value: '=', label: 'equals', needsValue: true, needsSecondValue: false },
  { value: '!=', label: 'not equals', needsValue: true, needsSecondValue: false },
  { value: '>', label: 'greater than', needsValue: true, needsSecondValue: false },
  { value: '<', label: 'less than', needsValue: true, needsSecondValue: false },
  { value: '>=', label: 'greater or equal', needsValue: true, needsSecondValue: false },
  { value: '<=', label: 'less or equal', needsValue: true, needsSecondValue: false },
  { value: 'LIKE', label: 'like', needsValue: true, needsSecondValue: false },
  { value: 'NOT LIKE', label: 'not like', needsValue: true, needsSecondValue: false },
  { value: 'IN', label: 'in', needsValue: true, needsSecondValue: false },
  { value: 'NOT IN', label: 'not in', needsValue: true, needsSecondValue: false },
  { value: 'IS NULL', label: 'is null', needsValue: false, needsSecondValue: false },
  { value: 'IS NOT NULL', label: 'is not null', needsValue: false, needsSecondValue: false },
  { value: 'BETWEEN', label: 'between', needsValue: true, needsSecondValue: true },
];

// ── Build SQL ──────────────────────────────────────────────────────────────────

function buildWhereSQL(conditions: WhereCondition[]): string {
  if (conditions.length === 0) return '';

  return conditions
    .map((cond, idx) => {
      const prefix = idx === 0 ? '' : ` ${cond.logicOperator} `;
      const col = cond.column;

      if (cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL') {
        return `${prefix}${col} ${cond.operator}`;
      }
      if (cond.operator === 'BETWEEN') {
        return `${prefix}${col} BETWEEN '${cond.value}' AND '${cond.value2 || ''}'`;
      }
      if (cond.operator === 'IN' || cond.operator === 'NOT IN') {
        const values = cond.value
          .split(',')
          .map((v) => `'${v.trim()}'`)
          .join(', ');
        return `${prefix}${col} ${cond.operator} (${values})`;
      }
      return `${prefix}${col} ${cond.operator} '${cond.value}'`;
    })
    .join('');
}

// ── Component ──────────────────────────────────────────────────────────────────

const WhereClauseBuilder: React.FC<WhereClauseBuilderProps> = ({
  columns,
  onChange,
  initialConditions = [],
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [conditions, setConditions] = useState<WhereCondition[]>(initialConditions);
  const [copied, setCopied] = useState(false);

  const generatedSql = useMemo(() => buildWhereSQL(conditions), [conditions]);

  // Notify parent on change
  const updateConditions = useCallback(
    (newConditions: WhereCondition[]) => {
      setConditions(newConditions);
      onChange(buildWhereSQL(newConditions));
    },
    [onChange],
  );

  const addCondition = useCallback(() => {
    const newCond: WhereCondition = {
      id: `wc_${Date.now()}`,
      column: columns[0]?.name || '',
      operator: '=',
      value: '',
      logicOperator: 'AND',
    };
    updateConditions([...conditions, newCond]);
  }, [conditions, columns, updateConditions]);

  const removeCondition = useCallback(
    (id: string) => {
      updateConditions(conditions.filter((c) => c.id !== id));
    },
    [conditions, updateConditions],
  );

  const updateCondition = useCallback(
    (id: string, updates: Partial<WhereCondition>) => {
      updateConditions(
        conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
    },
    [conditions, updateConditions],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedSql);
      setCopied(true);
      toast.success('WHERE clause copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [generatedSql]);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <Filter className="h-4 w-4 text-orange-500" />
          WHERE Clause Builder
          {conditions.length > 0 && (
            <Badge size="sm" className="bg-orange-100 text-orange-600 dark:bg-orange-900/30">
              {conditions.length} condition{conditions.length > 1 ? 's' : ''}
            </Badge>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3">
          {/* Conditions */}
          {conditions.length === 0 ? (
            <div className="text-center py-6 text-slate-500 border-2 border-dashed dark:border-slate-700 rounded-lg">
              <Filter className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No conditions. Click "Add Condition" to filter data.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conditions.map((cond, idx) => {
                const opConfig = OPERATORS.find((o) => o.value === cond.operator);

                return (
                  <div key={cond.id} className="flex items-start gap-2">
                    {/* Logic Operator */}
                    {idx > 0 ? (
                      <select
                        value={cond.logicOperator}
                        onChange={(e) => updateCondition(cond.id, { logicOperator: e.target.value as LogicOperator })}
                        className="w-16 text-xs px-2 py-2 border rounded dark:bg-slate-800 dark:border-slate-700 font-medium text-center"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    ) : (
                      <div className="w-16 text-xs px-2 py-2 text-center text-slate-400 font-medium">
                        WHERE
                      </div>
                    )}

                    {/* Column */}
                    <select
                      value={cond.column}
                      onChange={(e) => updateCondition(cond.id, { column: e.target.value })}
                      className="flex-1 text-sm px-2 py-2 border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                    >
                      {columns.map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name} ({col.type})
                        </option>
                      ))}
                    </select>

                    {/* Operator */}
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(cond.id, { operator: e.target.value as Operator })}
                      className="w-32 text-xs px-2 py-2 border rounded dark:bg-slate-800 dark:border-slate-700"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    {/* Value */}
                    {opConfig?.needsValue && (
                      <Input
                        value={cond.value}
                        onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                        placeholder={cond.operator === 'IN' ? 'val1, val2, val3' : 'value'}
                        className="flex-1"
                        size="sm"
                      />
                    )}

                    {/* Second value for BETWEEN */}
                    {opConfig?.needsSecondValue && (
                      <>
                        <span className="text-xs text-slate-400 self-center">and</span>
                        <Input
                          value={cond.value2 || ''}
                          onChange={(e) => updateCondition(cond.id, { value2: e.target.value })}
                          placeholder="value"
                          className="flex-1"
                          size="sm"
                        />
                      </>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => removeCondition(cond.id)}
                      className="p-2 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Button */}
          <Button variant="outline" size="sm" onClick={addCondition} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Condition
          </Button>

          {/* SQL Preview */}
          {conditions.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Code2 className="h-3 w-3" />
                  Generated SQL
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 text-slate-400 hover:text-blue-500 rounded"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-3 overflow-auto">
                <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap">
                  WHERE {generatedSql}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhereClauseBuilder;
