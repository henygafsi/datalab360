'use client';

import { useState, useCallback } from 'react';
import { Button, Input } from 'rizzui';
import { useCanPerform } from '@/hooks/useCanPerform';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  listPoliciesEnriched,
  createAggregationPolicy,
  applyAggregationPolicy,
  removeAggregationPolicy,
  deleteAggregationPolicy,
  formatPolicyError,
  type EnrichedPolicy,
  type GrantedObject,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';
import { ObjectSelector } from './components/ObjectSelector';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { DEFAULTS } from '@/config/database.config';

export default function AggregationPoliciesContent() {
  // System 2 Action-RBAC: Create → gouvernance:create, Apply → gouvernance:apply.
  // Fail-open while the allow-set loads (no flash of disabled).
  const createPerm = useCanPerform('gouvernance', 'create');
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canCreatePolicy = createPerm.allowed || createPerm.loading;
  const canApplyPolicy = applyPerm.allowed || applyPerm.loading;

  const fetchPolicies = useCallback(() => listPoliciesEnriched('AGGREGATION'), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<EnrichedPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<EnrichedPolicy | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Form state for creating policy
  const [policyName, setPolicyName] = useState('');
  const [aggregationConstraint, setAggregationConstraint] = useState(
    "CASE WHEN COUNT(*) < 5 THEN NULL ELSE COUNT(*) END"
  );
  const [expirationDate, setExpirationDate] = useState('');

  // Form state for applying policy
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');

  const handleCreate = async () => {
    if (!policyName || !aggregationConstraint) {
      setCreateError('Please fill in all required fields.');
      return;
    }

    setCreateError(null);
    try {
      const requestData = {
        policy_name: policyName,
        aggregation_constraint: aggregationConstraint,
        database: DEFAULTS.DATABASE,
        schema: DEFAULTS.SCHEMA,
        expiration_date: expirationDate || undefined,
      };

      await createAggregationPolicy(requestData);
      toast.success('Aggregation policy created successfully!');
      setShowCreatePanel(false);
      resetCreateForm();
      refetch();
    } catch (error) {
      setCreateError(formatPolicyError(error, 'Failed to create policy'));
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy || !database || !schema || !table) {
      setApplyError('Please select all required fields.');
      return;
    }

    setApplyError(null);
    try {
      await applyAggregationPolicy({
        policy_name: selectedPolicy.name,
        database,
        schema,
        table,
      });
      toast.success(`Policy applied to ${database}.${schema}.${table}`);
      setShowApplyPanel(false);
      setSelectedPolicy(null);
      resetApplyForm();
      refetch();
    } catch (error) {
      setApplyError(formatPolicyError(error, 'Failed to apply policy'));
    }
  };

  const handleRevokeObject = async (_policy: EnrichedPolicy, obj: GrantedObject) => {
    await removeAggregationPolicy(obj.database, obj.schema, obj.object_name);
  };

  const handleDeletePolicy = async (policy: EnrichedPolicy) => {
    await deleteAggregationPolicy(policy.name);
  };

  const resetCreateForm = () => {
    setPolicyName('');
    setAggregationConstraint("CASE WHEN COUNT(*) < 5 THEN NULL ELSE COUNT(*) END");
    setExpirationDate('');
    setCreateError(null);
  };

  const resetApplyForm = () => {
    setDatabase('');
    setSchema('');
    setTable('');
    setApplyError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Aggregation Policies</h2>
            {isStale && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Control how data can be aggregated to prevent small group identification
          </p>
        </div>
        <Button
          onClick={() => { setCreateError(null); setShowCreatePanel(true); }}
          disabled={!canCreatePolicy}
          title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Policies List */}
      {loading ? (
        <TableSkeleton rows={4} columns={3} showHeader={false} />
      ) : error ? (
        <ErrorDisplay error={error.message} onRetry={() => refetch()} context="general" />
      ) : !policies || policies.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No aggregation policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.name}
              policy={policy}
              accentColor="cyan"
              policyType="aggregation"
              onApply={(p) => {
                setSelectedPolicy(p);
                setApplyError(null);
                setShowApplyPanel(true);
              }}
              onDelete={handleDeletePolicy}
              onRevokeObject={handleRevokeObject}
              onRefresh={refetch}
              applyLabel="Apply to Table"
              entityLabel="table(s)"
            />
          ))}
        </div>
      )}

      {/* Create Policy Panel */}
      <PolicyFormPanel
        isOpen={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        title="Create Aggregation Policy"
        description="Enforce a minimum group size to prevent small-group identification"
        accentClassName="bg-cyan-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreatePanel(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreatePolicy} className="bg-cyan-600 hover:bg-cyan-700">Create Policy</Button>
          </>
        }
      >
          <Input
            label="Policy Name"
            placeholder="MIN_COUNT_5"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Aggregation Constraint (SQL Expression)
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={4}
              value={aggregationConstraint}
              onChange={(e) => setAggregationConstraint(e.target.value)}
              placeholder="AGGREGATION_CONSTRAINT(MIN_GROUP_SIZE => 5)"
            />
            <p className="text-xs text-slate-500 mt-1">
              Body of an AGGREGATION_CONSTRAINT expression. Use the built-in
              <code className="mx-1 px-1 bg-slate-100 dark:bg-slate-700 rounded">AGGREGATION_CONSTRAINT(MIN_GROUP_SIZE =&gt; N)</code>
              to enforce minimum group size, or
              <code className="mx-1 px-1 bg-slate-100 dark:bg-slate-700 rounded">NO_AGGREGATION_CONSTRAINT()</code>
              to allow, optionally wrapped in a CASE expression.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Expiration Date</label>
            <Input
              type="datetime-local"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional. Defaults to 7 days from creation if not specified.
            </p>
          </div>

          {createError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {createError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Apply Policy Panel */}
      <PolicyFormPanel
        isOpen={showApplyPanel}
        onClose={() => { setShowApplyPanel(false); setSelectedPolicy(null); resetApplyForm(); }}
        title={`Apply Policy: ${selectedPolicy?.name ?? ''}`}
        description="Select the table to apply this aggregation policy to"
        accentClassName="bg-cyan-500"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowApplyPanel(false); setSelectedPolicy(null); resetApplyForm(); }}>Cancel</Button>
            <Button onClick={handleApply} disabled={!canApplyPolicy || !database || !schema || !table} title={!canApplyPolicy ? 'You lack the "apply" permission on governance. Ask an administrator to grant it.' : undefined} className="bg-cyan-600 hover:bg-cyan-700">Apply Policy</Button>
          </>
        }
      >
          <ObjectSelector
            level="database"
            onSelect={(val) => {
              setDatabase(val);
              setSchema('');
              setTable('');
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
              }}
              value={schema}
            />
          )}

          {schema && (
            <ObjectSelector
              level="table"
              database={database}
              schema={schema}
              onSelect={setTable}
              value={table}
            />
          )}

          {applyError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {applyError}
            </p>
          )}
      </PolicyFormPanel>
    </div>
  );
}
