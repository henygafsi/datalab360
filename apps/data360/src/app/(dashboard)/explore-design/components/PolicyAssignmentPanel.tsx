'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Tooltip, Modal, Select, Input, Text } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Shield, Lock, Tag, Eye, Users, X, Plus, ChevronDown, ChevronRight,
  Database, Table2, Columns3, RefreshCw, Check, AlertTriangle, Trash2,
  Info, Settings, Layers, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import { useEventStore } from '../stores/event-store';

// Import existing policy services
import {
  getMaskingPolicies,
  getRLSPolicies,
  getTags,
  getAggregationPolicies,
  applyMaskingPolicy,
  applyRLSPolicy,
  applyTag,
  applyAggregationPolicy,
  removeMaskingPolicy,
  removeRLSPolicy,
  removeTag,
  removeAggregationPolicy,
  getTablePolicies,
  replaceMaskingPolicy,
  replaceRLSPolicy,
  MaskingPolicy,
  RLSPolicy,
  Tag as TagType,
  AggregationPolicy,
  MaskingType,
  TablePoliciesResponse,
  ObjectPolicy,
} from '@/app/services/gouvernance/policies';

// Policy types that can be applied
type PolicyCategory = 'masking' | 'rls' | 'tags' | 'aggregation';

// Applied policy info
interface AppliedPolicy {
  type: PolicyCategory;
  name: string;
  target: string; // column name for masking/tags, table for RLS/aggregation
  details?: string;
}

interface PolicyAssignmentPanelProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  onPolicyApplied?: (policy: AppliedPolicy) => void;
  onClose?: () => void;
  className?: string;
  isTemplateTable?: boolean;
  projectId?: string | null;
}

// Policy Category Tab
const PolicyTab: React.FC<{
  category: PolicyCategory;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  count?: number;
}> = ({ category, label, icon: Icon, active, onClick, count }) => (
  <button
    className={cn(
      'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
      active
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
    )}
    onClick={onClick}
  >
    <Icon className="h-4 w-4" />
    {label}
    {count !== undefined && count > 0 && (
      <Badge className="ml-1 bg-blue-500 text-white text-xs">{count}</Badge>
    )}
  </button>
);

// Masking Policy Section
const MaskingPolicySection: React.FC<{
  table: TableItem;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  onApply: (policy: AppliedPolicy) => void;
  isTemplateTable?: boolean;
  projectId?: string | null;
}> = ({ table, columns, selectedColumn, onApply, isTemplateTable, projectId }) => {
  const { addEvent } = useEventStore(projectId);
  const [policies, setPolicies] = useState<MaskingPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [targetColumn, setTargetColumn] = useState<string>(selectedColumn || '');
  const [applying, setApplying] = useState(false);

  // Track existing policies on the table
  const [tablePolicies, setTablePolicies] = useState<TablePoliciesResponse | null>(null);
  const [loadingTablePolicies, setLoadingTablePolicies] = useState(false);

  useEffect(() => {
    loadPolicies();
    if (!isTemplateTable) {
      loadTablePolicies();
    }
  }, []);

  useEffect(() => {
    if (selectedColumn) {
      setTargetColumn(selectedColumn);
    }
  }, [selectedColumn]);

  // Reload table policies when table changes (skip for template tables)
  useEffect(() => {
    if (table && !isTemplateTable) {
      loadTablePolicies();
    }
  }, [table.database, table.schema, table.table]);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getMaskingPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load masking policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTablePolicies = async () => {
    if (!table || isTemplateTable) return;
    setLoadingTablePolicies(true);
    try {
      const data = await getTablePolicies(table.database, table.schema, table.table);
      setTablePolicies(data);
    } catch (error) {
      console.error('Failed to load table policies:', error);
      setTablePolicies(null);
    } finally {
      setLoadingTablePolicies(false);
    }
  };

  // Check if selected column already has a masking policy
  const getExistingPolicyForColumn = (columnName: string): ObjectPolicy | null => {
    if (!tablePolicies?.policies?.masking) return null;
    return tablePolicies.policies.masking.find(p => p.column === columnName) || null;
  };

  const existingPolicy = targetColumn ? getExistingPolicyForColumn(targetColumn) : null;

  // State for inline error display and replace confirmation
  const [formError, setFormError] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{ policyName: string; column: string } | null>(null);

  const handleApply = async () => {
    if (!selectedPolicy || !targetColumn) {
      setFormError('Please select a policy and column');
      return;
    }

    setFormError(null);
    setApplying(true);

    // Always add as an event — actual apply happens at deploy time
    addEvent({
      type: 'MASKING_POLICY_APPLIED',
      projectId: projectId || undefined,
      target: {
        database: table.database,
        schema: table.schema,
        table: table.table,
        column: targetColumn,
      },
      payload: {
        policyName: selectedPolicy,
        policyDatabase: 'CP_DATA360',
        policySchema: 'GOUVERNANCE',
        columns: [targetColumn],
      },
    });
    toast.success(`Masking policy "${selectedPolicy}" queued for ${targetColumn} (will apply on deploy)`);
    onApply({
      type: 'masking',
      name: selectedPolicy,
      target: targetColumn,
    });
    setSelectedPolicy('');
    setApplying(false);

    // Legacy: direct backend call (kept for reference, no longer used)
    if (false) {
    try {
      // Check if column already has a masking policy
      if (existingPolicy) {
        // Use replace endpoint
        await replaceMaskingPolicy({
          new_policy_name: selectedPolicy,
          database: table.database,
          schema: table.schema,
          table: table.table,
          column: targetColumn,
        });
      } else {
        // Use apply endpoint
        await applyMaskingPolicy({
          policy_name: selectedPolicy,
          database: table.database,
          schema: table.schema,
          table: table.table,
          column: targetColumn,
        });
        toast.success(`Masking policy "${selectedPolicy}" applied to ${targetColumn}`);
      }

      onApply({
        type: 'masking',
        name: selectedPolicy,
        target: targetColumn,
      });
      setSelectedPolicy('');
      // Reload table policies to update the UI
      loadTablePolicies();
    } catch (error: any) {
      // Extract error detail from backend response - handle nested detail structure
      let errorDetail = '';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        // Handle string detail or nested object with detail property
        if (typeof detail === 'string') {
          errorDetail = detail;
        } else if (typeof detail === 'object' && detail.detail) {
          errorDetail = detail.detail;
        } else {
          errorDetail = JSON.stringify(detail);
        }
      } else if (error.response?.data?.message) {
        errorDetail = error.response.data.message;
      } else if (error.message) {
        errorDetail = error.message;
      }

      console.error('Apply/Replace masking policy error:', error.response?.data || error);

      // Check if error indicates policy already exists on column
      // Backend returns: "Specified column already attached to another masking policy"
      if (errorDetail.includes('already attached') ||
          errorDetail.includes('already has') ||
          errorDetail.includes('policy already exists') ||
          errorDetail.includes('masking policy set') ||
          errorDetail.includes('cannot be attached to multiple')) {
        // Show replace confirmation dialog
        setPendingReplace({ policyName: selectedPolicy, column: targetColumn });
        setShowReplaceConfirm(true);
      } else {
        // Show error inline in the form (the actual backend error message)
        setFormError(errorDetail || 'Failed to apply masking policy');
      }
    } finally {
      setApplying(false);
    }
    } // end if (false) — legacy direct backend call
  };

  const handleConfirmReplace = async () => {
    if (!pendingReplace) return;

    setShowReplaceConfirm(false);
    setFormError(null);
    setApplying(true);

    try {
      await replaceMaskingPolicy({
        new_policy_name: pendingReplace.policyName,
        database: table.database,
        schema: table.schema,
        table: table.table,
        column: pendingReplace.column,
      });
      toast.success(`Replaced masking policy on ${pendingReplace.column} with "${pendingReplace.policyName}"`);

      onApply({
        type: 'masking',
        name: pendingReplace.policyName,
        target: pendingReplace.column,
      });
      setSelectedPolicy('');
      loadTablePolicies();
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail || error.response?.data?.message || error.message || '';
      console.error('Replace masking policy error:', error.response?.data || error);
      setFormError(errorDetail || 'Failed to replace masking policy');
    } finally {
      setApplying(false);
      setPendingReplace(null);
    }
  };

  const sensitiveColumns = columns.filter(c => c.isSensitive);

  // Get columns that already have masking policies
  const columnsWithPolicies = tablePolicies?.policies?.masking?.map(p => p.column) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Masking Policy
        </Text>
        <Button
          variant="text"
          size="sm"
          onClick={() => { loadPolicies(); loadTablePolicies(); }}
          className="gap-1"
        >
          <RefreshCw className={cn('h-3 w-3', (loading || loadingTablePolicies) && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Show existing masking policies on this table */}
      {tablePolicies && tablePolicies.policies.masking.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
            <Info className="h-4 w-4" />
            <span className="text-sm font-medium">Existing Masking Policies</span>
          </div>
          <div className="space-y-1">
            {tablePolicies.policies.masking.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-blue-600 dark:text-blue-300">
                  <strong>{p.column}</strong>: {p.policy_name}
                </span>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300 text-xs">
                  Active
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-detected sensitive columns */}
      {sensitiveColumns.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Sensitive Columns Detected</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {sensitiveColumns.map(col => (
              <button
                key={col.name}
                className={cn(
                  'px-2 py-1 text-xs rounded-full transition-colors',
                  targetColumn === col.name
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-200',
                  columnsWithPolicies.includes(col.name) && 'ring-2 ring-blue-400'
                )}
                onClick={() => setTargetColumn(col.name)}
              >
                {col.name}
                {columnsWithPolicies.includes(col.name) && ' ✓'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Policy selector */}
      <div className="space-y-3">
        <Select
          label="Select Masking Policy"
          options={policies.map(p => ({
            label: `${p.policy_name} (${p.data_type || 'TEXT'})`,
            value: p.policy_name,
          }))}
          value={selectedPolicy}
          onChange={(val: any) => setSelectedPolicy(typeof val === 'object' ? val?.value : val)}
          placeholder={loading ? 'Loading policies...' : 'Choose a policy'}
          disabled={loading}
        />

        <Select
          label="Target Column"
          options={columns.map(c => {
            const hasPolicy = columnsWithPolicies.includes(c.name);
            const policyName = tablePolicies?.policies?.masking?.find(p => p.column === c.name)?.policy_name;
            return {
              label: hasPolicy
                ? `${c.name} (${c.dataType || 'unknown'}) - Policy: ${policyName}`
                : `${c.name} (${c.dataType || 'unknown'})`,
              value: c.name,
            };
          })}
          value={targetColumn}
          onChange={(val: any) => setTargetColumn(typeof val === 'object' ? val?.value : val)}
          placeholder="Select column to mask"
        />

        {/* Show warning if replacing existing policy */}
        {existingPolicy && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">
                Column <strong>{targetColumn}</strong> already has policy <strong>{existingPolicy.policy_name}</strong>.
                Clicking below will <strong>replace</strong> it.
              </span>
            </div>
          </div>
        )}

        {/* Inline error display */}
        {formError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{formError}</span>
            </div>
          </div>
        )}

        <Button
          className={cn(
            'w-full gap-2',
            existingPolicy && 'bg-amber-500 hover:bg-amber-600'
          )}
          onClick={handleApply}
          disabled={!selectedPolicy || !targetColumn || applying}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {existingPolicy ? 'Replace Masking Policy' : 'Apply Masking Policy'}
        </Button>
      </div>

      {/* Available policies list */}
      <div className="mt-4">
        <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Available Policies ({policies.length})
        </Text>
        <div className="max-h-48 overflow-auto space-y-1">
          {policies.map(policy => (
            <div
              key={policy.policy_name}
              className={cn(
                'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors',
                selectedPolicy === policy.policy_name
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
              onClick={() => setSelectedPolicy(policy.policy_name)}
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{policy.policy_name}</span>
              </div>
              <Badge className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                {policy.data_type}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Replace Confirmation Modal */}
      <Modal isOpen={showReplaceConfirm} onClose={() => setShowReplaceConfirm(false)}>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold">Policy Already Exists</h2>
          </div>

          <p className="text-slate-600 dark:text-slate-400">
            This column already has a masking policy applied. Do you want to replace it?
          </p>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm">
              <strong>Column:</strong> {pendingReplace?.column}<br />
              <strong>New Policy:</strong> {pendingReplace?.policyName}
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowReplaceConfirm(false);
                setPendingReplace(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              onClick={handleConfirmReplace}
              disabled={applying}
            >
              {applying ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Yes, Replace Policy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// RLS Policy Section
const RLSPolicySection: React.FC<{
  table: TableItem;
  columns: ColumnInfo[];
  onApply: (policy: AppliedPolicy) => void;
  isTemplateTable?: boolean;
  projectId?: string | null;
}> = ({ table, columns, onApply, isTemplateTable, projectId }) => {
  const { addEvent } = useEventStore(projectId);
  const [policies, setPolicies] = useState<RLSPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [applying, setApplying] = useState(false);

  // Track existing policies on the table
  const [tablePolicies, setTablePolicies] = useState<TablePoliciesResponse | null>(null);
  const [loadingTablePolicies, setLoadingTablePolicies] = useState(false);

  useEffect(() => {
    loadPolicies();
    if (!isTemplateTable) {
      loadTablePolicies();
    }
  }, []);

  // Reload when table changes (skip for template tables)
  useEffect(() => {
    if (table && !isTemplateTable) {
      loadTablePolicies();
    }
  }, [table.database, table.schema, table.table]);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getRLSPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load RLS policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTablePolicies = async () => {
    if (!table || isTemplateTable) return;
    setLoadingTablePolicies(true);
    try {
      const data = await getTablePolicies(table.database, table.schema, table.table);
      setTablePolicies(data);
    } catch (error) {
      console.error('Failed to load table policies:', error);
      setTablePolicies(null);
    } finally {
      setLoadingTablePolicies(false);
    }
  };

  // Check if table already has an RLS policy
  const existingRLSPolicy = tablePolicies?.policies?.row_access?.[0] || null;

  // State for inline error display and replace confirmation
  const [formError, setFormError] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{ policyName: string; column: string } | null>(null);

  const handleApply = async () => {
    if (!selectedPolicy || !filterColumn) {
      setFormError('Please select a policy and filter column');
      return;
    }

    setFormError(null);
    setApplying(true);

    // Template tables: fire local event instead of calling backend
    if (isTemplateTable) {
      addEvent({
        type: 'RLS_POLICY_APPLIED',
        projectId: projectId || undefined,
        target: {
          database: table.database,
          schema: table.schema,
          table: table.table,
        },
        payload: {
          policyName: selectedPolicy,
          policyColumn: filterColumn,
        },
      });
      toast.success(`RLS policy "${selectedPolicy}" queued for ${table.table} (will apply on deploy)`);
      onApply({
        type: 'rls',
        name: selectedPolicy,
        target: table.table,
        details: `Filter column: ${filterColumn}`,
      });
      setSelectedPolicy('');
      setFilterColumn('');
      setApplying(false);
      return;
    }

    try {
      // Check if table already has an RLS policy (from getTablePolicies)
      if (existingRLSPolicy) {
        // Use replace endpoint directly
        await replaceRLSPolicy({
          new_policy_name: selectedPolicy,
          database: table.database,
          schema: table.schema,
          table: table.table,
          policy_column: filterColumn,
        });
        toast.success(`Replaced RLS policy on ${table.table}: "${existingRLSPolicy.policy_name}" → "${selectedPolicy}"`);
      } else {
        // Try apply endpoint
        await applyRLSPolicy({
          policy_name: selectedPolicy,
          table_name: table.table,
          database: table.database,
          schema: table.schema,
          policy_column: filterColumn,
        });
        toast.success(`RLS policy "${selectedPolicy}" applied to ${table.table}`);
      }

      onApply({
        type: 'rls',
        name: selectedPolicy,
        target: table.table,
        details: `Filter column: ${filterColumn}`,
      });
      setSelectedPolicy('');
      setFilterColumn('');
      loadTablePolicies();
    } catch (error: any) {
      // Extract error detail from backend response - handle nested detail structure
      let errorDetail = '';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        // Handle string detail or nested object with detail property
        if (typeof detail === 'string') {
          errorDetail = detail;
        } else if (typeof detail === 'object' && detail.detail) {
          errorDetail = detail.detail;
        } else {
          errorDetail = JSON.stringify(detail);
        }
      } else if (error.response?.data?.message) {
        errorDetail = error.response.data.message;
      } else if (error.message) {
        errorDetail = error.message;
      }

      console.error('Apply RLS policy error:', error.response?.data || error);

      // Check if error indicates policy already exists
      // Backend returns: "Only one ROW_ACCESS_POLICY is allowed at a time"
      if (errorDetail.includes('Only one ROW_ACCESS_POLICY is allowed') ||
          errorDetail.includes('already has') ||
          errorDetail.includes('policy already exists') ||
          errorDetail.includes('ROW_ACCESS_POLICY')) {
        // Show replace confirmation dialog
        setPendingReplace({ policyName: selectedPolicy, column: filterColumn });
        setShowReplaceConfirm(true);
      } else {
        // Show error inline in the form (the actual backend error message)
        setFormError(errorDetail || 'Failed to apply RLS policy');
      }
    } finally {
      setApplying(false);
    }
  };

  const handleConfirmReplace = async () => {
    if (!pendingReplace) return;

    setShowReplaceConfirm(false);
    setFormError(null);
    setApplying(true);

    try {
      await replaceRLSPolicy({
        new_policy_name: pendingReplace.policyName,
        database: table.database,
        schema: table.schema,
        table: table.table,
        policy_column: pendingReplace.column,
      });
      toast.success(`Replaced RLS policy on ${table.table} with "${pendingReplace.policyName}"`);

      onApply({
        type: 'rls',
        name: pendingReplace.policyName,
        target: table.table,
        details: `Filter column: ${pendingReplace.column}`,
      });
      setSelectedPolicy('');
      setFilterColumn('');
      loadTablePolicies();
    } catch (error: any) {
      const errorDetail = error.response?.data?.detail || error.response?.data?.message || error.message || '';
      console.error('Replace RLS policy error:', error.response?.data || error);
      setFormError(errorDetail || 'Failed to replace RLS policy');
    } finally {
      setApplying(false);
      setPendingReplace(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Row-Level Security (RLS)
        </Text>
        <Button
          variant="text"
          size="sm"
          onClick={() => { loadPolicies(); loadTablePolicies(); }}
          className="gap-1"
        >
          <RefreshCw className={cn('h-3 w-3', (loading || loadingTablePolicies) && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Show existing RLS policy on this table */}
      {existingRLSPolicy && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
            <Info className="h-4 w-4" />
            <span className="text-sm font-medium">Existing RLS Policy</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-blue-600 dark:text-blue-300">
              <strong>{existingRLSPolicy.policy_name}</strong>
              {existingRLSPolicy.column && ` on column ${existingRLSPolicy.column}`}
            </span>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-300 text-xs">
              Active
            </Badge>
          </div>
        </div>
      )}

      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-400 mb-1">
          <Info className="h-4 w-4" />
          <span className="text-sm font-medium">About RLS Policies</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Row-Level Security restricts which rows users can access based on their role or attributes.
        </p>
      </div>

      <div className="space-y-3">
        <Select
          label="Select RLS Policy"
          options={policies.map(p => ({
            label: p.policy_name,
            value: p.policy_name,
          }))}
          value={selectedPolicy}
          onChange={(val: any) => setSelectedPolicy(typeof val === 'object' ? val?.value : val)}
          placeholder={loading ? 'Loading policies...' : 'Choose a policy'}
          disabled={loading}
        />

        <Select
          label="Filter Column"
          options={columns.map(c => ({
            label: `${c.name} (${c.dataType || 'unknown'})`,
            value: c.name,
          }))}
          value={filterColumn}
          onChange={(val: any) => setFilterColumn(typeof val === 'object' ? val?.value : val)}
          placeholder="Column to filter on"
        />

        {/* Show warning if replacing existing policy */}
        {existingRLSPolicy && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">
                Table already has RLS policy <strong>{existingRLSPolicy.policy_name}</strong>.
                Clicking below will <strong>replace</strong> it.
              </span>
            </div>
          </div>
        )}

        {/* Inline error display */}
        {formError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{formError}</span>
            </div>
          </div>
        )}

        <Button
          className={cn(
            'w-full gap-2',
            existingRLSPolicy && 'bg-amber-500 hover:bg-amber-600'
          )}
          onClick={handleApply}
          disabled={!selectedPolicy || !filterColumn || applying}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {existingRLSPolicy ? 'Replace RLS Policy' : 'Apply RLS Policy'}
        </Button>
      </div>

      {/* Policy details */}
      {selectedPolicy && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Text className="text-xs font-medium text-slate-500 mb-2">Policy Expression</Text>
          <code className="text-xs text-slate-700 dark:text-slate-300 block whitespace-pre-wrap">
            {policies.find(p => p.policy_name === selectedPolicy)?.expression || 'N/A'}
          </code>
        </div>
      )}

      {/* Replace Confirmation Modal */}
      <Modal isOpen={showReplaceConfirm} onClose={() => setShowReplaceConfirm(false)}>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold">Policy Already Exists</h2>
          </div>

          <p className="text-slate-600 dark:text-slate-400">
            This table already has an RLS policy applied. Only one RLS policy is allowed per table.
          </p>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm">
              <strong>New Policy:</strong> {pendingReplace?.policyName}<br />
              <strong>Filter Column:</strong> {pendingReplace?.column}
            </p>
          </div>

          <p className="text-sm text-slate-500">
            Do you want to replace the existing policy with the new one?
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowReplaceConfirm(false);
                setPendingReplace(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              onClick={handleConfirmReplace}
              disabled={applying}
            >
              {applying ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Yes, Replace Policy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Tags Section
const TagsSection: React.FC<{
  table: TableItem;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  onApply: (policy: AppliedPolicy) => void;
  isTemplateTable?: boolean;
  projectId?: string | null;
}> = ({ table, columns, selectedColumn, onApply, isTemplateTable, projectId }) => {
  const { addEvent } = useEventStore(projectId);
  const [tags, setTags] = useState<TagType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [tagValue, setTagValue] = useState<string>('');
  const [objectType, setObjectType] = useState<'table' | 'column'>('table');
  const [targetColumn, setTargetColumn] = useState<string>(selectedColumn || '');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    if (selectedColumn) {
      setTargetColumn(selectedColumn);
      setObjectType('column');
    }
  }, [selectedColumn]);

  const loadTags = async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedTag || !tagValue) {
      toast.error('Please select a tag and enter a value');
      return;
    }

    if (objectType === 'column' && !targetColumn) {
      toast.error('Please select a target column');
      return;
    }

    setApplying(true);

    // Template tables: fire local event instead of calling backend
    if (isTemplateTable) {
      addEvent({
        type: 'TAG_APPLIED',
        projectId: projectId || undefined,
        target: {
          database: table.database,
          schema: table.schema,
          table: table.table,
          column: objectType === 'column' ? targetColumn : undefined,
        },
        payload: {
          tagName: selectedTag,
          tagValue: tagValue,
          objectType: objectType.toUpperCase(),
        },
      });
      toast.success(`Tag "${selectedTag}" queued (will apply on deploy)`);
      onApply({
        type: 'tags',
        name: selectedTag,
        target: objectType === 'column' ? targetColumn : table.table,
        details: `Value: ${tagValue}`,
      });
      setSelectedTag('');
      setTagValue('');
      setApplying(false);
      return;
    }

    try {
      await applyTag({
        tag_name: selectedTag,
        tag_value: tagValue,
        object_type: objectType.toUpperCase(),
        database: table.database,
        schema: table.schema,
        table: table.table,
        column: objectType === 'column' ? targetColumn : undefined,
      });
      toast.success(`Tag "${selectedTag}" applied`);
      onApply({
        type: 'tags',
        name: selectedTag,
        target: objectType === 'column' ? targetColumn : table.table,
        details: `Value: ${tagValue}`,
      });
      setSelectedTag('');
      setTagValue('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply tag');
    } finally {
      setApplying(false);
    }
  };

  const selectedTagDetails = tags.find(t => t.tag_name === selectedTag);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Classification Tags
        </Text>
        <Button variant="text" size="sm" onClick={loadTags} className="gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Object type selector */}
      <div className="flex gap-2">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors',
            objectType === 'table'
              ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
          onClick={() => setObjectType('table')}
        >
          <Table2 className="h-4 w-4" />
          Table
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors',
            objectType === 'column'
              ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
          onClick={() => setObjectType('column')}
        >
          <Columns3 className="h-4 w-4" />
          Column
        </button>
      </div>

      <div className="space-y-3">
        <Select
          label="Select Tag"
          options={tags.map(t => ({
            label: t.tag_name,
            value: t.tag_name,
          }))}
          value={selectedTag}
          onChange={(val: any) => {
            const tagName = typeof val === 'object' ? val?.value : val;
            setSelectedTag(tagName);
            setTagValue('');
          }}
          placeholder={loading ? 'Loading tags...' : 'Choose a tag'}
          disabled={loading}
        />

        {selectedTagDetails?.allowed_values ? (
          <Select
            label="Tag Value"
            options={selectedTagDetails.allowed_values.split(',').map(v => ({
              label: v.trim(),
              value: v.trim(),
            }))}
            value={tagValue}
            onChange={(val: any) => setTagValue(typeof val === 'object' ? val?.value : val)}
            placeholder="Select allowed value"
          />
        ) : (
          <Input
            label="Tag Value"
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
            placeholder="Enter tag value"
          />
        )}

        {objectType === 'column' && (
          <Select
            label="Target Column"
            options={columns.map(c => ({
              label: `${c.name} (${c.dataType || 'unknown'})`,
              value: c.name,
            }))}
            value={targetColumn}
            onChange={(val: any) => setTargetColumn(typeof val === 'object' ? val?.value : val)}
            placeholder="Select column"
          />
        )}

        <Button
          className="w-full gap-2"
          onClick={handleApply}
          disabled={!selectedTag || !tagValue || applying || (objectType === 'column' && !targetColumn)}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Tag className="h-4 w-4" />
          )}
          Apply Tag
        </Button>
      </div>

      {/* Common sensitivity tags */}
      <div>
        <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Quick Apply - Sensitivity Tags
        </Text>
        <div className="flex flex-wrap gap-2">
          {['PII', 'PHI', 'PCI', 'CONFIDENTIAL', 'PUBLIC'].map(level => (
            <button
              key={level}
              className="px-3 py-1 text-xs rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => {
                setSelectedTag('SENSITIVITY');
                setTagValue(level);
              }}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Aggregation Policy Section
const AggregationPolicySection: React.FC<{
  table: TableItem;
  onApply: (policy: AppliedPolicy) => void;
  isTemplateTable?: boolean;
  projectId?: string | null;
}> = ({ table, onApply, isTemplateTable, projectId }) => {
  const { addEvent } = useEventStore(projectId);
  const [policies, setPolicies] = useState<AggregationPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getAggregationPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load aggregation policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy) {
      toast.error('Please select a policy');
      return;
    }

    setApplying(true);

    // Template tables: fire local event instead of calling backend
    if (isTemplateTable) {
      addEvent({
        type: 'AGGREGATION_POLICY_APPLIED',
        projectId: projectId || undefined,
        target: {
          database: table.database,
          schema: table.schema,
          table: table.table,
        },
        payload: {
          policyName: selectedPolicy,
        },
      });
      toast.success(`Aggregation policy "${selectedPolicy}" queued for ${table.table} (will apply on deploy)`);
      onApply({
        type: 'aggregation',
        name: selectedPolicy,
        target: table.table,
      });
      setSelectedPolicy('');
      setApplying(false);
      return;
    }

    try {
      await applyAggregationPolicy({
        policy_name: selectedPolicy,
        database: table.database,
        schema: table.schema,
        table: table.table,
      });
      toast.success(`Aggregation policy "${selectedPolicy}" applied to ${table.table}`);
      onApply({
        type: 'aggregation',
        name: selectedPolicy,
        target: table.table,
      });
      setSelectedPolicy('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply aggregation policy');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Aggregation Policy
        </Text>
        <Button variant="text" size="sm" onClick={loadPolicies} className="gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
        <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-1">
          <Info className="h-4 w-4" />
          <span className="text-sm font-medium">About Aggregation Policies</span>
        </div>
        <p className="text-xs text-purple-600 dark:text-purple-300">
          Aggregation policies enforce minimum group sizes to prevent individual record identification.
        </p>
      </div>

      <div className="space-y-3">
        <Select
          label="Select Aggregation Policy"
          options={policies.map(p => ({
            label: p.policy_name,
            value: p.policy_name,
          }))}
          value={selectedPolicy}
          onChange={(val: any) => setSelectedPolicy(typeof val === 'object' ? val?.value : val)}
          placeholder={loading ? 'Loading policies...' : 'Choose a policy'}
          disabled={loading}
        />

        <Button
          className="w-full gap-2"
          onClick={handleApply}
          disabled={!selectedPolicy || applying}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Layers className="h-4 w-4" />
          )}
          Apply Aggregation Policy
        </Button>
      </div>

      {/* Policy constraint preview */}
      {selectedPolicy && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Text className="text-xs font-medium text-slate-500 mb-2">Constraint</Text>
          <code className="text-xs text-slate-700 dark:text-slate-300 block whitespace-pre-wrap">
            {policies.find(p => p.policy_name === selectedPolicy)?.aggregation_constraint || 'N/A'}
          </code>
        </div>
      )}
    </div>
  );
};

// Main Panel Component
const PolicyAssignmentPanel: React.FC<PolicyAssignmentPanelProps> = ({
  table,
  columns,
  selectedColumn,
  onPolicyApplied,
  onClose,
  className,
  isTemplateTable,
  projectId,
}) => {
  const [activeTab, setActiveTab] = useState<PolicyCategory>('masking');
  const [appliedPolicies, setAppliedPolicies] = useState<AppliedPolicy[]>([]);

  if (!table) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <Shield className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <Text className="text-slate-500">Select a table to configure policies</Text>
      </div>
    );
  }

  const handlePolicyApplied = (policy: AppliedPolicy) => {
    setAppliedPolicies(prev => [...prev, policy]);
    onPolicyApplied?.(policy);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          <div>
            <Text className="font-medium">{table.table}</Text>
            <Text className="text-xs text-slate-500">{table.database}.{table.schema}</Text>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b dark:border-slate-700 flex gap-1 overflow-x-auto">
        <PolicyTab
          category="masking"
          label="Masking"
          icon={Lock}
          active={activeTab === 'masking'}
          onClick={() => setActiveTab('masking')}
        />
        <PolicyTab
          category="rls"
          label="RLS"
          icon={Eye}
          active={activeTab === 'rls'}
          onClick={() => setActiveTab('rls')}
        />
        <PolicyTab
          category="tags"
          label="Tags"
          icon={Tag}
          active={activeTab === 'tags'}
          onClick={() => setActiveTab('tags')}
        />
        <PolicyTab
          category="aggregation"
          label="Aggregation"
          icon={Layers}
          active={activeTab === 'aggregation'}
          onClick={() => setActiveTab('aggregation')}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'masking' && (
          <MaskingPolicySection
            table={table}
            columns={columns}
            selectedColumn={selectedColumn}
            onApply={handlePolicyApplied}
            isTemplateTable={isTemplateTable}
            projectId={projectId}
          />
        )}
        {activeTab === 'rls' && (
          <RLSPolicySection
            table={table}
            columns={columns}
            onApply={handlePolicyApplied}
            isTemplateTable={isTemplateTable}
            projectId={projectId}
          />
        )}
        {activeTab === 'tags' && (
          <TagsSection
            table={table}
            columns={columns}
            selectedColumn={selectedColumn}
            onApply={handlePolicyApplied}
            isTemplateTable={isTemplateTable}
            projectId={projectId}
          />
        )}
        {activeTab === 'aggregation' && (
          <AggregationPolicySection
            table={table}
            onApply={handlePolicyApplied}
            isTemplateTable={isTemplateTable}
            projectId={projectId}
          />
        )}
      </div>

      {/* Applied policies summary */}
      {appliedPolicies.length > 0 && (
        <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Applied in this session
          </Text>
          <div className="space-y-1 max-h-32 overflow-auto">
            {appliedPolicies.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <Check className="h-3 w-3 text-green-500" />
                <span className="font-medium">{p.name}</span>
                <span className="text-slate-400">→</span>
                <span>{p.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PolicyAssignmentPanel;
