'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { rlsPolicySchema, type RLSPolicyFormValues } from '@/validators/rls-policy.schema';
import { Button, Badge, Input, Select } from 'rizzui';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import {
  HiOutlineLockClosed,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCircleStack,
  HiOutlineUserGroup,
  HiOutlinePlay,
} from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  listPoliciesEnriched,
  createRLSPolicy,
  applyRLSPolicy,
  removeRLSPolicy,
  deleteRLSPolicy,
  getColumns,
  formatPolicyError,
  type EnrichedPolicy,
  type GrantedObject,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { DEFAULTS } from '@/config/database.config';
// Modern Card Component
const ModernCard = ({ children, className = '', ...props }: { children: React.ReactNode; className?: string }) => {
  return (
    <div
      className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default function RLSPoliciesContent() {
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<EnrichedPolicy | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  // Feedback message for screen readers (aria-live)
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // react-hook-form for Create RLS Policy
  const {
    register: registerCreate,
    handleSubmit: handleCreateSubmit,
    formState: { errors: createErrors },
    reset: resetCreateForm,
    setValue: setCreateValue,
    watch: watchCreate,
  } = useForm<RLSPolicyFormValues>({
    resolver: zodResolver(rlsPolicySchema),
    defaultValues: {
      policy_name: '',
      signature: '',
      expression: '',
      description: '',
      expiration_date: '',
    },
  });

  const [formData, setFormData] = useState({
    policy_name: '',
    signature: '',
    expression: '',
    schema: DEFAULTS.GOVERNANCE_FQN,
    description: '',
    database: '',
    table_name: '',
    filter_expression: '',
    expiration_date: '',
  });

  const [applyForm, setApplyForm] = useState({
    database: '',
    schema: '',
    table_name: '',
    policy_column: '',
  });

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchPolicies = useCallback(() => listPoliciesEnriched('ROW_ACCESS'), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<EnrichedPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  useEffect(() => {
    loadDatabases();
  }, []);

  useEffect(() => {
    if (formData.database) {
      loadSchemas(formData.database);
    }
  }, [formData.database]);

  useEffect(() => {
    if (formData.database && formData.schema) {
      loadTables(formData.database, formData.schema);
    }
  }, [formData.database, formData.schema]);

  // Load schemas for Apply modal when database changes
  useEffect(() => {
    if (applyForm.database) {
      loadSchemas(applyForm.database);
    }
  }, [applyForm.database]);

  // Load tables for Apply modal when database/schema changes
  useEffect(() => {
    if (applyForm.database && applyForm.schema) {
      loadTables(applyForm.database, applyForm.schema);
    }
  }, [applyForm.database, applyForm.schema]);

  const loadDatabases = async () => {
    try {
      const dbs = await getDatabases();
      setDatabases(dbs || []);
    } catch (error) {
      console.error('Error loading databases:', error);
    }
  };

  const loadSchemas = async (database: string) => {
    try {
      const schs = await getSchemas(database);
      setSchemas(schs || []);
    } catch (error) {
      console.error('Error loading schemas:', error);
    }
  };

  const loadTables = async (database: string, schema: string) => {
    try {
      const tbls = await getTablesTarget(database, schema);
      setTables(tbls || []);
    } catch (error) {
      console.error('Error loading tables:', error);
    }
  };

  const formatErrorMessage = formatPolicyError;

  const onCreateSubmit = async (data: RLSPolicyFormValues) => {
    setFeedbackMessage(null);
    try {
      const requestData = {
        policy_name: data.policy_name.trim().toUpperCase(),
        signature: data.signature.trim(),
        expression: data.expression.trim(),
        database: DEFAULTS.DATABASE,
        schema: DEFAULTS.SCHEMA,
        description: data.description?.trim(),
        expiration_date: data.expiration_date || undefined,
      };

      await createRLSPolicy(requestData);

      const msg = `RLS Policy "${requestData.policy_name}" created successfully`;
      toast.success(msg);
      setFeedbackMessage({ type: 'success', text: msg });
      setShowCreatePanel(false);
      resetCreateForm();
      resetForm();
      refetch();
    } catch (error) {
      const errMsg = formatErrorMessage(error, 'Failed to create RLS policy');
      setFeedbackMessage({ type: 'error', text: errMsg });
    }
  };

  // Legacy handler kept for backward compatibility - now delegates to react-hook-form
  const handleCreate = () => {
    handleCreateSubmit(onCreateSubmit)();
  };

  const handleApply = async () => {
    if (!selectedPolicy) return;

    // Validate all required fields
    if (!applyForm.database || !applyForm.schema || !applyForm.table_name || !applyForm.policy_column) {
      setApplyError('Please fill in all required fields: Database, Schema, Table, and Policy Column.');
      return;
    }

    setApplyError(null);
    try {
      await applyRLSPolicy({
        policy_name: selectedPolicy.name,
        table_name: applyForm.table_name,
        database: applyForm.database,
        schema: applyForm.schema,
        policy_column: applyForm.policy_column,
        policy_schema: DEFAULTS.SCHEMA,
      });
      const applyMsg = `RLS Policy applied to ${applyForm.database}.${applyForm.schema}.${applyForm.table_name}`;
      toast.success(applyMsg);
      setFeedbackMessage({ type: 'success', text: applyMsg });
      setShowApplyPanel(false);
      setSelectedPolicy(null);
      resetApplyForm();
      refetch();
    } catch (error) {
      const applyErrMsg = formatErrorMessage(error, 'Failed to apply RLS policy');
      setApplyError(applyErrMsg);
      setFeedbackMessage({ type: 'error', text: applyErrMsg });
    }
  };

  const handleRevokeObject = async (policy: EnrichedPolicy, obj: GrantedObject) => {
    await removeRLSPolicy(obj.object_name, obj.database, obj.schema);
  };

  const handleDeletePolicy = async (policy: EnrichedPolicy) => {
    await deleteRLSPolicy(policy.name);
  };

  const resetForm = () => {
    setFormData({
      policy_name: '',
      signature: '',
      expression: '',
      schema: DEFAULTS.GOVERNANCE_FQN,
      description: '',
      database: '',
      table_name: '',
      filter_expression: '',
      expiration_date: '',
    });
  };

  const resetApplyForm = () => {
    setApplyForm({
      database: '',
      schema: '',
      table_name: '',
      policy_column: '',
    });
    setColumns([]); // Clear columns when resetting form
    setApplyError(null);
  };

  // EnrichedPolicy carries no active/inactive state, so surface real signals
  // from the data instead of always-zero placeholders.
  const stats = {
    total: policies?.length || 0,
    grantedObjects: policies?.reduce((sum, p) => sum + (p?.granted_objects_count || 0), 0) || 0,
    grantedRoles: new Set(policies?.flatMap(p => p?.granted_roles || [])).size || 0,
  };

  return (
    <div className="space-y-6">
      {/* Action Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowCreatePanel(true)}
          className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/30"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create RLS Policy
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" aria-live="polite" aria-atomic="true">
        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Policies</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center">
              <HiOutlineLockClosed className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Granted Objects</p>
              <p className="text-3xl font-bold text-green-600">{stats.grantedObjects}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 flex items-center justify-center">
              <HiOutlineCircleStack className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Granted Roles</p>
              <p className="text-3xl font-bold text-slate-600">{stats.grantedRoles}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
              <HiOutlineUserGroup className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
        </ModernCard>
      </div>

      {/* Policies List */}
      <ModernCard className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">RLS Policies</h2>
            {isStale && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
            {policies?.length ?? 0} policies
          </Badge>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading RLS policies...</p>
          </div>
        ) : error ? (
          <ErrorDisplay error={error.message} onRetry={() => refetch()} context="general" />
        ) : !policies || policies.length === 0 ? (
          <div className="text-center py-12">
            <HiOutlineLockClosed className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">No RLS policies created yet</p>
            <Button onClick={() => setShowCreatePanel(true)} className="mt-4">
              Create your first policy
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map((policy, idx) => (
              <PolicyCard
                key={idx}
                policy={policy}
                accentColor="purple"
                policyType="row-access"
                onApply={() => {
                  setSelectedPolicy(policy);
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
      </ModernCard>

      {/* Feedback region for screen readers */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {feedbackMessage?.text}
      </div>

      {/* Create Panel */}
      <PolicyFormPanel
        isOpen={showCreatePanel}
        onClose={() => { setShowCreatePanel(false); resetCreateForm(); resetForm(); }}
        title="Create RLS Policy"
        description="Define a row-level security filter"
        accentClassName="bg-purple-500"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => { setShowCreatePanel(false); resetCreateForm(); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" form="rls-create-form" className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white">
              Create Policy
            </Button>
          </>
        }
      >
        <form id="rls-create-form" onSubmit={handleCreateSubmit(onCreateSubmit)} noValidate className="space-y-6">
          {/* Inline validation errors for screen readers */}
          {Object.keys(createErrors).length > 0 && (
            <div aria-live="assertive" role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                {Object.values(createErrors).map((err, i) => (
                  <li key={i}>{err?.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="rls-policy-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Policy Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="rls-policy-name"
                {...registerCreate('policy_name')}
                placeholder="e.g., RESTRICT_BY_REGION"
                aria-invalid={!!createErrors.policy_name}
                aria-describedby={createErrors.policy_name ? 'rls-policy-name-error' : undefined}
              />
              {createErrors.policy_name && (
                <p id="rls-policy-name-error" className="mt-1 text-xs text-red-500" role="alert">
                  {createErrors.policy_name.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="rls-signature" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Signature <span className="text-red-500">*</span>
              </label>
              <Input
                id="rls-signature"
                {...registerCreate('signature')}
                placeholder="e.g., (val VARCHAR)"
                className="font-mono"
                aria-invalid={!!createErrors.signature}
                aria-describedby={createErrors.signature ? 'rls-signature-error' : 'rls-signature-hint'}
              />
              {createErrors.signature ? (
                <p id="rls-signature-error" className="mt-1 text-xs text-red-500" role="alert">
                  {createErrors.signature.message}
                </p>
              ) : (
                <p id="rls-signature-hint" className="mt-1 text-xs text-slate-500">
                  Function signature defining the input parameter type (e.g., (val VARCHAR), (user_id NUMBER))
                </p>
              )}
            </div>

            <div>
              <label htmlFor="rls-expression" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Expression <span className="text-red-500">*</span>
              </label>
              <textarea
                id="rls-expression"
                {...registerCreate('expression')}
                placeholder="e.g., CURRENT_ROLE() IN ('ADMIN', 'MANAGER') OR val = CURRENT_USER()"
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm"
                aria-invalid={!!createErrors.expression}
                aria-describedby={createErrors.expression ? 'rls-expression-error' : 'rls-expression-hint'}
              />
              {createErrors.expression ? (
                <p id="rls-expression-error" className="mt-1 text-xs text-red-500" role="alert">
                  {createErrors.expression.message}
                </p>
              ) : (
                <p id="rls-expression-hint" className="mt-2 text-xs text-slate-500">
                  Boolean SQL expression that determines row access. Use context functions like CURRENT_ROLE(), CURRENT_USER()
                </p>
              )}
            </div>

            <div>
              <label htmlFor="rls-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
              <Input
                id="rls-description"
                {...registerCreate('description')}
                placeholder="Optional description"
              />
            </div>

            <div>
              <label htmlFor="rls-expiration" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Expiration Date
              </label>
              <Input
                id="rls-expiration"
                type="datetime-local"
                {...registerCreate('expiration_date')}
              />
              <p className="mt-1 text-xs text-slate-500">
                Optional. Defaults to 7 days from creation if not specified.
              </p>
            </div>
          </div>

        </form>
      </PolicyFormPanel>

      {/* Apply Panel */}
      <PolicyFormPanel
        isOpen={showApplyPanel}
        onClose={() => { setShowApplyPanel(false); setSelectedPolicy(null); resetApplyForm(); }}
        title="Apply RLS Policy"
        description={selectedPolicy ? `Apply "${selectedPolicy.name}" to a table` : undefined}
        accentClassName="bg-green-500"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowApplyPanel(false); setSelectedPolicy(null); resetApplyForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!applyForm.database || !applyForm.schema || !applyForm.table_name || !applyForm.policy_column}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
            >
              Apply Policy
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Database <span className="text-red-500">*</span>
                </label>
                <Select
                  value={applyForm.database}
                  onChange={(value: any) => {
                    const dbValue = typeof value === 'object' ? value?.value : value;
                    setApplyForm({ ...applyForm, database: dbValue || '', schema: '', table_name: '', policy_column: '' });
                    setColumns([]); // Clear columns when database changes
                  }}
                  options={[
                    { label: 'Select Database', value: '' },
                    ...(databases || []).map(db => ({ label: db, value: db }))
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Schema <span className="text-red-500">*</span>
                </label>
                <Select
                  value={applyForm.schema}
                  onChange={(value: any) => {
                    const schValue = typeof value === 'object' ? value?.value : value;
                    setApplyForm({ ...applyForm, schema: schValue || '', table_name: '', policy_column: '' });
                    setColumns([]); // Clear columns when schema changes
                  }}
                  disabled={!applyForm.database}
                  options={[
                    { label: 'Select Schema', value: '' },
                    ...(schemas || []).map(sch => ({ label: sch, value: sch }))
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Table <span className="text-red-500">*</span>
                </label>
                <Select
                  value={applyForm.table_name}
                  onChange={async (value: any) => {
                    const tblValue = typeof value === 'object' ? value?.value : value;
                    setApplyForm({ ...applyForm, table_name: tblValue || '', policy_column: '' });
                    setColumns([]);
                    // Fetch columns when table is selected
                    if (tblValue && applyForm.database && applyForm.schema) {
                      setLoadingColumns(true);
                      try {
                        const cols = await getColumns(applyForm.database, applyForm.schema, tblValue);
                        setColumns(cols);
                      } catch (error) {
                        console.error('Failed to load columns:', error);
                        toast.error('Failed to load columns');
                      } finally {
                        setLoadingColumns(false);
                      }
                    }
                  }}
                  disabled={!applyForm.schema}
                  options={[
                    { label: 'Select Table', value: '' },
                    ...(tables || []).map(tbl => ({ label: tbl, value: tbl }))
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Policy Column <span className="text-red-500">*</span>
              </label>
              <Select
                value={applyForm.policy_column}
                onChange={(value: any) => {
                  const colValue = typeof value === 'object' ? value?.value : value;
                  setApplyForm({ ...applyForm, policy_column: colValue || '' });
                }}
                disabled={!applyForm.table_name || loadingColumns}
                options={[
                  { label: loadingColumns ? 'Loading columns...' : 'Select Column', value: '' },
                  ...(columns || []).map(col => ({ label: col, value: col }))
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">
                The column name that will be passed to the policy function signature
              </p>
            </div>

            {applyError && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
                {applyError}
              </p>
            )}
          </div>
      </PolicyFormPanel>
    </div>
  );
}
