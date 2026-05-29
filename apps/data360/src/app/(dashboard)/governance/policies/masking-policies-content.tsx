'use client';

import { useState, useCallback } from 'react';
import { Button, Input, Modal, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  listPoliciesEnriched,
  formatPolicyError,
  getMaskingPolicyDetails,
  createMaskingPolicy,
  applyMaskingPolicy,
  removeMaskingPolicy,
  deleteMaskingPolicy,
  type EnrichedPolicy,
  type GrantedObject,
  MaskingType,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';
import { ObjectSelector } from './components/ObjectSelector';
import { DEFAULTS } from '@/config/database.config';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

const MASKING_TYPES = [
  { label: 'Full Masking (****)', value: 'FULL' },
  { label: 'Partial Masking (First 4 chars)', value: 'PARTIAL_FIRST' },
  { label: 'Partial Masking (Last 4 chars)', value: 'PARTIAL_LAST' },
  { label: 'Email Masking (user@*****.com)', value: 'EMAIL' },
  { label: 'Hash (SHA256)', value: 'HASH' },
  { label: 'Custom Expression', value: 'CUSTOM' },
];

export default function MaskingPoliciesContent() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<EnrichedPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state for creating policy
  const [policyName, setPolicyName] = useState('');
  const [columnType, setColumnType] = useState('STRING');
  const [maskingType, setMaskingType] = useState('FULL');
  const [customExpression, setCustomExpression] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Form state for applying policy
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');
  const [column, setColumn] = useState('');

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchPolicies = useCallback(() => listPoliciesEnriched('MASKING'), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<EnrichedPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const handleViewDetails = async (policy: EnrichedPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setPolicyDetails(null);

    try {
      const details = await getMaskingPolicyDetails(policy.name);
      setPolicyDetails(details);
    } catch (error: any) {
      console.error('Error loading policy details:', error);
      toast.error('Failed to load policy details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const formatErrorMessage = formatPolicyError;

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
      const requestData = {
        policy_name: policyName,
        data_type: columnType,
        masking_type: maskingType as MaskingType | string, // Required field per backend spec
        custom_expression: maskingType === 'CUSTOM' ? customExpression : getMaskingExpression(),
        database: DEFAULTS.DATABASE,
        schema: DEFAULTS.SCHEMA,
        expiration_date: expirationDate || undefined,
      };
      // console.log('[Masking Create] Sending request:', requestData);

      const result = await createMaskingPolicy(requestData);
      // console.log('[Masking Create] Response:', result);

      toast.success('Masking policy created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      refetch();
    } catch (error: any) {
      console.error('[Masking Create] Error:', error.response?.data || error);
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
        policy_name: selectedPolicy.name,
        database,
        schema,
        table,
        column,
        policy_schema: DEFAULTS.SCHEMA,
      });
      toast.success(`Policy applied to ${database}.${schema}.${table}.${column}`);
      setShowApplyModal(false);
      setSelectedPolicy(null);
      resetApplyForm();
      refetch();
    } catch (error: any) {
      console.error('Apply masking policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to apply policy'));
    }
  };

  const handleRevokeObject = async (_policy: EnrichedPolicy, obj: GrantedObject) => {
    await removeMaskingPolicy(obj.database, obj.schema, obj.object_name, obj.column!);
  };

  const handleDeletePolicy = async (policy: EnrichedPolicy) => {
    await deleteMaskingPolicy(policy.name);
  };

  const resetCreateForm = () => {
    setPolicyName('');
    setColumnType('STRING');
    setMaskingType('FULL');
    setCustomExpression('');
    setExpirationDate('');
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
            {isStale && (
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
        <div className="space-y-4">
          <TableSkeleton rows={4} columns={3} showHeader={false} />
        </div>
      ) : error ? (
        <ErrorDisplay error={error.message} onRetry={() => refetch()} context="general" />
      ) : !policies || policies.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <svg className="h-10 w-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Aucune politique de masquage trouvée</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Créez votre première politique pour protéger les données sensibles.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.name}
              policy={policy}
              accentColor="amber"
              policyType="masking"
              onViewDetails={handleViewDetails}
              onApply={(p) => {
                setSelectedPolicy(p);
                setShowApplyModal(true);
              }}
              onDelete={handleDeletePolicy}
              onRevokeObject={handleRevokeObject}
              onRefresh={refetch}
              applyLabel="Apply to Column"
              entityLabel="column(s)"
            />
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

          <div>
            <label className="block text-sm font-medium mb-2">
              Expiration Date
            </label>
            <Input
              type="datetime-local"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional. Defaults to 7 days from creation if not specified.
            </p>
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
            Apply Policy: {selectedPolicy?.name}
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
            Policy Details: {selectedPolicy?.name}
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
                  {policyDetails.details.details.signature || policyDetails.signature || 'N/A'}
                  {console.log('details', policyDetails.details.details.signature) /* Debugging line */}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Return Type
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {policyDetails.details.details.return_type || policyDetails.return_type || 'N/A'}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Masking Expression (Body)
                </label>
                <pre className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                  {policyDetails.details.details.body || policyDetails.body || 'N/A'}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Schema
                  </label>
                  <p className="text-sm">{policyDetails.schema || selectedPolicy?.schema_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Data Type
                  </label>
                  <p className="text-sm">{policyDetails?.details?.details?.signature?.split(' ')[1] || 'N/A'}</p>
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
