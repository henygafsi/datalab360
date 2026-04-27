'use client';

import { useState } from 'react';
import { Button, Input, Badge, Tooltip } from 'rizzui';
import { Filter, Plus, X, Loader2, Globe, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createFilter, deleteFilter } from '@/app/services/api/biDashboardApi';
import type { DashboardFilter, FilterScope } from '@/app/services/api/types';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';

const OPERATORS = [
  '=', '!=', '>', '>=', '<', '<=',
  'IN', 'NOT IN', 'LIKE', 'NOT LIKE',
  'IS NULL', 'IS NOT NULL',
];

const NULL_OPS = new Set(['IS NULL', 'IS NOT NULL']);
const LIST_OPS = new Set(['IN', 'NOT IN']);
const COLUMN_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface FilterBarProps {
  projectId: string;
  pageId: string | null;
  filters: DashboardFilter[];
  onFiltersChange: (filters: DashboardFilter[]) => void;
}

export default function FilterBar({
  projectId,
  pageId,
  filters,
  onFiltersChange,
}: FilterBarProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [column, setColumn] = useState('');
  const [operator, setOperator] = useState('=');
  const [defaultValue, setDefaultValue] = useState('');
  const [scope, setScope] = useState<FilterScope>('page');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Show filters relevant to current page: global + page-scoped
  const visibleFilters = filters.filter(
    (f) => f.scope === 'global' || f.page_id === pageId
  );

 const handleAdd = async () => {
    const trimmedColumn = column.trim();
    if (!trimmedColumn) { toast.error('Column is required'); return; }
    if (!COLUMN_PATTERN.test(trimmedColumn)) {
      toast.error('Column must start with a letter or _ and contain only letters, digits, _');
      return;
    }

    let valueToSend: string | undefined;
    if (NULL_OPS.has(operator)) {
      valueToSend = undefined;
    } else if (LIST_OPS.has(operator)) {
      const items = defaultValue.split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) {
        toast.error(`${operator} requires at least one value`);
        return;
      }
      // default_value persists as Optional[str] on the backend; stringify the
      // list so it round-trips and let the chart-build path parse it back.
      valueToSend = JSON.stringify(items);
    } else {
      valueToSend = defaultValue.trim() || undefined;
    }

    setLoading(true);
    try {
      const filter = await createFilter(projectId, {
        column: trimmedColumn,
        operator,
        default_value: valueToSend,
        page_id: scope === 'page' ? pageId : null,
        scope,
      });
      onFiltersChange([...filters, filter]);
      resetForm();
      toast.success('Filter added');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  
  const handleOperatorChange = (next: string) => {
    setOperator(next);
    if (NULL_OPS.has(next)) setDefaultValue('');
  };

  const handleDelete = async (filterId: string) => {
    setDeletingId(filterId);
    try {
      await deleteFilter(projectId, filterId);
      onFiltersChange(filters.filter((f) => f.filter_id !== filterId));
      toast.success('Filter removed');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setColumn('');
    setOperator('=');
    setDefaultValue('');
    setScope('page');
    setShowAddForm(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Filter className="h-3.5 w-3.5" />
        Filters
      </div>

      {/* Active Filters */}
      {visibleFilters.map((filter) => (
        <div
          key={filter.filter_id}
          className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md text-xs"
        >
          <Tooltip content={filter.scope === 'global' ? 'Global filter' : 'Page filter'}>
            {filter.scope === 'global' ? (
              <Globe className="h-3 w-3 text-amber-500 flex-shrink-0" />
            ) : (
              <FileText className="h-3 w-3 text-blue-500 flex-shrink-0" />
            )}
          </Tooltip>
          <span className="font-medium text-slate-700 dark:text-slate-300">{filter.column}</span>
          <span className="text-slate-400">{filter.operator}</span>
          {filter.default_value != null && (
            <span className="text-slate-600 dark:text-slate-400">{String(filter.default_value)}</span>
          )}
          <button
            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
            onClick={() => handleDelete(filter.filter_id)}
            disabled={deletingId === filter.filter_id}
          >
            {deletingId === filter.filter_id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        </div>
      ))}

      {/* Add Filter */}
      {showAddForm ? (
        <div className="flex items-center gap-1.5">
          <Input
            size="sm"
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            placeholder="Column"
            className="w-24 h-7 text-xs"
          />
          <select
            className="h-7 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-1"
            value={operator}
            onChange={(e) => handleOperatorChange(e.target.value)}
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          {!NULL_OPS.has(operator) && (
          <Input
            size="sm"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder={LIST_OPS.has(operator) ? 'a, b, c' : 'Value'}
            className="w-20 h-7 text-xs"
          />
          )}
          <select
            className="h-7 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs px-1"
            value={scope}
            onChange={(e) => setScope(e.target.value as FilterScope)}
          >
            <option value="page">Page</option>
            <option value="global">Global</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
          <button onClick={resetForm} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
            <X className="h-3 w-3 text-slate-400" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Filter
        </button>
      )}

      {visibleFilters.length === 0 && !showAddForm && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">No active filters</span>
      )}
    </div>
  );
}
