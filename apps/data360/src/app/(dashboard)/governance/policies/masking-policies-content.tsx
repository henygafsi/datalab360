'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Input, Select } from 'rizzui';
import { useCanPerform } from '@/hooks/useCanPerform';
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
  getTablePolicies,
  type EnrichedPolicy,
  type GrantedObject,
  type MaskingPolicyDetails,
  MaskingType,
} from '@/app/services/governance/policies';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PolicyCard from './components/PolicyCard';
import { ObjectSelector } from './components/ObjectSelector';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
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

export default function MaskingPoliciesContent({ prefill }: {
  prefill?: {
    name: string;
    maskingType: string;
    /** Optional: table coords from a classify result — seed the apply form. */
    database?: string;
    schema?: string;
    table?: string;
    column?: string;
  } | null;
} = {}) {
  // System 2 Action-RBAC. Create maps to gouvernance:create, apply to
  // gouvernance:apply. Fail-open while the allow-set loads (no flash of disabled).
  const createPerm = useCanPerform('gouvernance', 'create');
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canCreatePolicy = createPerm.allowed || createPerm.loading;
  const canApplyPolicy = applyPerm.allowed || applyPerm.loading;

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<EnrichedPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<MaskingPolicyDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  // Inline form-level errors (replace error toasts).
  const [createError, setCreateError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  // In-flight guard for the create POST (prevents double-submit double-POST).
  const [isCreating, setIsCreating] = useState(false);

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

  // Dry-run / preview state for the Apply flow. The backend has no "dry-run"
  // endpoint, so we inspect the target column's *existing* masking policies
  // first and require explicit confirmation, surfacing any policy that would
  // be replaced. `applyElapsedMs` powers a visible timer during the live call.
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'applying'>('idle');
  const [previewExisting, setPreviewExisting] = useState<{ conflicting: string[] } | null>(null);
  const [applyElapsedMs, setApplyElapsedMs] = useState(0);

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchPolicies = useCallback(() => listPoliciesEnriched('MASKING'), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<EnrichedPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const handleViewDetails = async (policy: EnrichedPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsPanel(true);
    setLoadingDetails(true);
    setPolicyDetails(null);
    setDetailsError(null);

    try {
      const details: MaskingPolicyDetails | null = await getMaskingPolicyDetails(policy.name);
      if (!details) {
        setDetailsError('No details returned for this policy.');
      } else {
        setPolicyDetails(details);
      }
    } catch (error) {
      setDetailsError(formatErrorMessage(error, 'Failed to load policy details'));
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
    if (isCreating) return;
    if (!policyName || !columnType) {
      setCreateError('Please fill in all required fields.');
      return;
    }

    if (maskingType === 'CUSTOM' && !customExpression) {
      setCreateError('Please provide a custom masking expression.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);
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

      await createMaskingPolicy(requestData);

      toast.success('Masking policy created successfully!');
      setShowCreatePanel(false);
      resetCreateForm();
      refetch();
    } catch (error) {
      setCreateError(formatErrorMessage(error, 'Failed to create policy'));
    } finally {
      setIsCreating(false);
    }
  };

  // Step 1 — dry-run preview: read the target's existing masking policies and
  // open the confirm dialog. Mutates nothing.
  const handlePreviewApply = async () => {
    if (!selectedPolicy || !database || !schema || !table || !column) {
      setApplyError('Please select all required fields.');
      return;
    }
    setApplyError(null);
    setPreviewExisting(null);
    setPreviewState('loading');
    try {
      const existing = await getTablePolicies(database, schema, table);
      const masking = existing?.policies?.masking ?? [];
      // Only flag policies already applied to the *same* column.
      const conflicting = masking
        .filter((p) => (p.column ?? '').toUpperCase() === column.toUpperCase())
        .map((p) => p.policy_name)
        .filter(Boolean);
      setPreviewExisting({ conflicting });
      setPreviewState('ready');
    } catch {
      setPreviewExisting({ conflicting: [] });
      setPreviewState('ready');
    }
  };

  // Step 2 — the real, confirmed apply with a visible elapsed timer.
  const handleConfirmApply = async () => {
    if (!selectedPolicy) return;
    setPreviewState('applying');
    setApplyElapsedMs(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setApplyElapsedMs(Date.now() - startedAt), 200);
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
      setShowApplyPanel(false);
      setSelectedPolicy(null);
      resetApplyForm();
      setPreviewState('idle');
      setPreviewExisting(null);
      refetch();
    } catch (error) {
      setApplyError(formatErrorMessage(error, 'Failed to apply policy'));
      setPreviewState('ready'); // keep dialog open to show the error
    } finally {
      clearInterval(timer);
    }
  };

  const cancelPreview = () => {
    if (previewState === 'applying') return;
    setPreviewState('idle');
    setPreviewExisting(null);
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
    setCreateError(null);
  };

  const resetApplyForm = () => {
    setDatabase('');
    setSchema('');
    setTable('');
    setColumn('');
    setApplyError(null);
  };

  // Prefill from external navigate (e.g. "Protect" CTA in the Classification tab).
  // When the parent switches to this tab and passes a prefill:
  //   - always open the create form with the suggested name + masking type
  //   - if table coords were provided, also seed the apply form so the user
  //     does not have to re-select the database/schema/table/column they just classified.
  useEffect(() => {
    if (!prefill) return;
    setPolicyName(prefill.name);
    setMaskingType(prefill.maskingType);
    setCustomExpression('');
    setCreateError(null);
    setShowCreatePanel(true);
    // Seed apply form when the caller provided a known table context.
    if (prefill.database) setDatabase(prefill.database);
    if (prefill.schema) setSchema(prefill.schema);
    if (prefill.table) setTable(prefill.table);
    if (prefill.column) setColumn(prefill.column);
    if (prefill.database || prefill.table) {
      // Clear any stale apply error so the seeded values aren't shadowed by a prior error.
      setApplyError(null);
    }
  }, [prefill]);

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
          onClick={() => { setCreateError(null); setShowCreatePanel(true); }}
          disabled={!canCreatePolicy}
          title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No masking policies found</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Create your first policy to protect sensitive data.
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
                setApplyError(null);
                setShowApplyPanel(true);
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

      {/* Create Policy Panel */}
      <PolicyFormPanel
        isOpen={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        title="Create Masking Policy"
        description="Protect a column type with a dynamic masking expression"
        accentClassName="bg-amber-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreatePanel(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} isLoading={isCreating} disabled={!canCreatePolicy || isCreating} className="bg-amber-600 hover:bg-amber-700">
              Create Policy
            </Button>
          </>
        }
      >
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
        description="Select the column to apply this masking policy to"
        accentClassName="bg-amber-500"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowApplyPanel(false); setSelectedPolicy(null); resetApplyForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handlePreviewApply}
              disabled={!canApplyPolicy || !database || !schema || !table || !column || previewState === 'loading'}
              title={!canApplyPolicy ? 'You lack the "apply" permission on governance. Ask an administrator to grant it.' : undefined}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {previewState === 'loading' ? 'Checking target…' : 'Preview & Apply'}
            </Button>
          </>
        }
      >
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

          {applyError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {applyError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Policy Details Panel */}
      <PolicyFormPanel
        isOpen={showDetailsPanel}
        onClose={() => setShowDetailsPanel(false)}
        title={`Policy Details: ${selectedPolicy?.name ?? ''}`}
        accentClassName="bg-amber-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDetailsPanel(false)}>
              Close
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setShowDetailsPanel(false);
                setApplyError(null);
                setShowApplyPanel(true);
              }}
            >
              Apply to Column
            </Button>
          </>
        }
      >
          {loadingDetails ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : detailsError ? (
            <ErrorDisplay error={detailsError} onRetry={() => selectedPolicy && handleViewDetails(selectedPolicy)} context="general" />
          ) : policyDetails ? (
            (() => {
              const fields = policyDetails.details?.details ?? policyDetails.details ?? policyDetails;
              const signature = fields.signature || policyDetails.signature || '—';
              const returnType = fields.return_type || policyDetails.return_type || '—';
              const body = fields.body || policyDetails.body || '—';
              const dataType = fields.signature?.split(' ')[1] || '—';
              return (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Signature</label>
                    <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">{signature}</code>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Return Type</label>
                    <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">{returnType}</code>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Masking Expression (Body)</label>
                    <pre className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">{body}</pre>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Schema</label>
                      <p className="text-sm">{policyDetails.schema || selectedPolicy?.schema_name || '—'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Type</label>
                      <p className="text-sm">{dataType}</p>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="text-center py-8 text-slate-500">No details available</div>
          )}
      </PolicyFormPanel>

      {/* Dry-run preview + confirm before the real apply */}
      <ConfirmDialog
        open={previewState === 'ready' || previewState === 'applying'}
        title="Apply masking policy?"
        destructive={!!previewExisting && previewExisting.conflicting.length > 0}
        message={
          selectedPolicy
            ? [
                `Policy "${selectedPolicy.name}" will mask values in ` +
                  `${database}.${schema}.${table}.${column}.`,
                previewExisting && previewExisting.conflicting.length > 0
                  ? `Warning: this column already has a masking policy ` +
                    `(${previewExisting.conflicting.join(', ')}). Applying will replace it.`
                  : 'No existing masking policy was found on this column.',
                applyError ? `Error: ${applyError}` : '',
                previewState === 'applying'
                  ? `Applying… ${(applyElapsedMs / 1000).toFixed(1)}s elapsed`
                  : '',
              ].filter(Boolean).join('\n\n')
            : ''
        }
        confirmLabel={previewState === 'applying' ? 'Applying…' : 'Confirm apply'}
        cancelLabel="Back"
        onConfirm={() => { if (previewState !== 'applying') void handleConfirmApply(); }}
        onCancel={cancelPreview}
      />
    </div>
  );
}
