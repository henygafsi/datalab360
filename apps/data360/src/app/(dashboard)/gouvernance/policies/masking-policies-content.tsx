'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Input, Modal, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getMaskingPolicies,
  getMaskingPolicyDetails,
  createMaskingPolicy,
  applyMaskingPolicy,
  removeMaskingPolicy,
  deleteMaskingPolicy,
  type MaskingPolicy,
  MaskingType,
} from '@/app/services/gouvernance/policies';
import { ObjectSelector } from './components/ObjectSelector';
import { DEFAULTS } from '@/config/database.config';

const MASKING_TYPES = [
  { label: 'Full Masking (****)', value: 'FULL' },
  { label: 'Partial Masking (First 4 chars)', value: 'PARTIAL_FIRST' },
  { label: 'Partial Masking (Last 4 chars)', value: 'PARTIAL_LAST' },
  { label: 'Email Masking (user@*****.com)', value: 'EMAIL' },
  { label: 'Hash (SHA256)', value: 'HASH' },
  { label: 'Custom Expression', value: 'CUSTOM' },
];

export default function MaskingPoliciesContent() {
  const [policies, setPolicies] = useState<MaskingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<MaskingPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state for creating policy
  const [policyName, setPolicyName] = useState('');
  const [columnType, setColumnType] = useState('STRING');
  const [maskingType, setMaskingType] = useState('FULL');
  const [customExpression, setCustomExpression] = useState('');

  // Form state for applying policy
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');
  const [column, setColumn] = useState('');

  // SSE cache invalidation
  const { wasInvalidated } = useCacheInvalidationWatcher([CACHE_KEYS.POLICIES]);
  const mountedRef = useRef(true);

  const loadPolicies = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    try {
      const data = await getMaskingPolicies();
      if (mountedRef.current) {
        setPolicies(Array.isArray(data) ? data : []);
      }
    } catch (error: any) {
      console.error('Error loading masking policies:', error);
      if (mountedRef.current) {
        toast.error(error.response?.data?.message || error.message || 'Failed to load masking policies');
        setPolicies([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadPolicies();
    return () => {
      mountedRef.current = false;
    };
  }, [loadPolicies]);

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !loading) {
      console.log('[SSE] Policies cache invalidated - refreshing masking policies...');
      loadPolicies(true);
    }
  }, [wasInvalidated, loading, loadPolicies]);

  const handleViewDetails = async (policy: MaskingPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setPolicyDetails(null);

    try {
      const details = await getMaskingPolicyDetails(policy.policy_name);
      console.log('Masking policy details:', details);
      setPolicyDetails(details);
    } catch (error: any) {
      console.error('Error loading policy details:', error);
      toast.error('Failed to load policy details');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Helper function to format error messages from API responses
  const formatErrorMessage = (error: any, defaultMessage: string): string => {
    // Handle FastAPI validation errors (422) which return detail as an array
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;

      // If detail is an array of validation errors
      if (Array.isArray(detail)) {
        return detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      }
      // If detail is a string
      else if (typeof detail === 'string') {
        return detail;
      }
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.message) {
      return error.message;
    }

    return defaultMessage;
  };

  const getMaskingExpression = () => {
    if (maskingType === 'CUSTOM') {
      return customExpression;
    }

    const expressions: Record<string, string> = {
      FULL: `'****'`,
      PARTIAL_FIRST: `CONCAT(SUBSTRING(val, 1, 4), '****')`,
      PARTIAL_LAST: `CONCAT('****', SUBSTRING(val, -4))`,
      EMAIL: `CONCAT(SPLIT_PART(val, '@', 1), '@*****.com')`,
      HASH: `SHA2(val, 256)`,
    };

    return expressions[maskingType] || `'****'`;
  };

  const handleCreate = async () => {
    if (!policyName || !columnType) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (maskingType === 'CUSTOM' && !customExpression) {
      toast.error('Please provide a custom masking expression');
      return;
    }

    try {
      await createMaskingPolicy({
        policy_name: policyName,
        data_type: columnType,
        masking_type: maskingType === 'CUSTOM' ? undefined : (maskingType as MaskingType),
        custom_expression: maskingType === 'CUSTOM' ? customExpression : getMaskingExpression(),
        schema: DEFAULTS.GOVERNANCE_FQN,
      });
      toast.success('Masking policy created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      loadPolicies();
    } catch (error: any) {
      console.error('Create masking policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to create policy'));
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy || !database || !schema || !table || !column) {
      toast.error('Please select all required fields');
      return;
    }

    try {
      await applyMaskingPolicy({
        policy_name: selectedPolicy.policy_name,
        database,
        schema,
        table,
        column,
        policy_schema: DEFAULTS.GOVERNANCE_FQN,
      });
      toast.success(`Policy applied to ${database}.${schema}.${table}.${column}`);
      setShowApplyModal(false);
      setSelectedPolicy(null);
      resetApplyForm();
      loadPolicies();
    } catch (error: any) {
      console.error('Apply masking policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to apply policy'));
    }
  };

  const handleDelete = async (policy: MaskingPolicy) => {
    if (!confirm(`Delete masking policy "${policy.policy_name}"?`)) return;

    try {
      await deleteMaskingPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      console.error('Delete masking policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to delete policy'));
    }
  };

  const resetCreateForm = () => {
    setPolicyName('');
    setColumnType('STRING');
    setMaskingType('FULL');
    setCustomExpression('');
  };

  const resetApplyForm = () => {
    setDatabase('');
    setSchema('');
    setTable('');
    setColumn('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Masking Policies</h2>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Protect sensitive data with column-level masking policies
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-amber-600 hover:bg-amber-700"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Policies List */}
      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No masking policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div
              key={policy.policy_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 flex justify-between items-start hover:border-amber-300 transition-colors"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => handleViewDetails(policy)}
              >
                <h3 className="font-semibold text-lg text-amber-600 hover:text-amber-700">
                  {String(policy.policy_name || '')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Type: {String(policy.column_type || policy.data_type || 'N/A')}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  {String(policy.masking_expression || 'Click to view full expression')}
                </p>
                <p className="text-xs text-slate-500 mt-1">Schema: {String(policy.schema || 'N/A')}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedPolicy(policy);
                    setShowApplyModal(true);
                  }}
                >
                  Apply to Column
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  onClick={() => handleDelete(policy)}
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Create Masking Policy</h2>

          <Input
            label="Policy Name"
            placeholder="MASK_SSN"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <Select
            label="Column Data Type"
            value={columnType}
            onChange={(val: any) => {
              const extractedValue = typeof val === 'object' ? val?.value : val;
              setColumnType(extractedValue || 'STRING');
            }}
            options={[
              { label: 'STRING', value: 'STRING' },
              { label: 'VARCHAR', value: 'VARCHAR' },
              { label: 'NUMBER', value: 'NUMBER' },
              { label: 'DATE', value: 'DATE' },
            ]}
          />

          <Select
            label="Masking Type"
            value={maskingType}
            onChange={(val: any) => {
              const extractedValue = typeof val === 'object' ? val?.value : val;
              setMaskingType(extractedValue || 'FULL');
            }}
            options={MASKING_TYPES}
          />

          {maskingType === 'CUSTOM' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Custom Masking Expression
              </label>
              <textarea
                className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                rows={3}
                value={customExpression}
                onChange={(e) => setCustomExpression(e.target.value)}
                placeholder="CASE WHEN current_role() IN ('ADMIN') THEN val ELSE '****' END"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use 'val' as the placeholder for the column value
              </p>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
            <p className="text-xs font-medium mb-1">Preview Expression:</p>
            <code className="text-xs">{getMaskingExpression()}</code>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-amber-600 hover:bg-amber-700">
              Create Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Apply Policy Modal */}
      <Modal isOpen={showApplyModal} onClose={() => setShowApplyModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">
            Apply Policy: {selectedPolicy?.policy_name}
          </h2>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select the column to apply this masking policy to:
          </p>

          <ObjectSelector
            level="database"
            onSelect={(val) => {
              setDatabase(val);
              setSchema('');
              setTable('');
              setColumn('');
            }}
            value={database}
          />

          {database && (
            <ObjectSelector
              level="schema"
              database={database}
              onSelect={(val) => {
                setSchema(val);
                setTable('');
                setColumn('');
              }}
              value={schema}
            />
          )}

          {schema && (
            <ObjectSelector
              level="table"
              database={database}
              schema={schema}
              onSelect={(val) => {
                setTable(val);
                setColumn('');
              }}
              value={table}
            />
          )}

          {table && (
            <ObjectSelector
              level="column"
              database={database}
              schema={schema}
              table={table}
              onSelect={setColumn}
              value={column}
            />
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!database || !schema || !table || !column}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Apply Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Policy Details Modal */}
      <Modal isOpen={showDetailsModal} onClose={() => setShowDetailsModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">
            Policy Details: {selectedPolicy?.policy_name}
          </h2>

          {loadingDetails ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : policyDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Signature
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {policyDetails.details?.signature || policyDetails.signature || 'N/A'}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Return Type
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {policyDetails.details?.return_type || policyDetails.return_type || 'N/A'}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Masking Expression (Body)
                </label>
                <pre className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {policyDetails.details?.body || policyDetails.body || 'N/A'}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Schema
                  </label>
                  <p className="text-sm">{policyDetails.schema || selectedPolicy?.schema || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data Type
                  </label>
                  <p className="text-sm">{selectedPolicy?.data_type || 'N/A'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No details available
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setShowDetailsModal(false);
                setShowApplyModal(true);
              }}
            >
              Apply to Column
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
