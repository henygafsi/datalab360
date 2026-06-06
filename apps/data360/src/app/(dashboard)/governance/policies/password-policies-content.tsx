'use client';

import { useState, useCallback } from 'react';
import { Button, Input } from 'rizzui';
import { useCanPerform } from '@/hooks/useCanPerform';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiCheckCircle } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  listPoliciesEnriched,
  getPasswordPolicyDetails,
  createPasswordPolicy,
  setPasswordPolicyAsDefault,
  deletePasswordPolicy,
  formatPolicyError,
  type EnrichedPolicy,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

interface PasswordPolicyDetails {
  policy_name?: string;
  details?: Record<string, number | string | null | undefined>;
}

export default function PasswordPoliciesContent() {
  // System 2 Action-RBAC: Create → gouvernance:create, Set-as-default → gouvernance:apply.
  // Fail-open while the allow-set loads (no flash of disabled).
  const createPerm = useCanPerform('gouvernance', 'create');
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canCreatePolicy = createPerm.allowed || createPerm.loading;
  const canApplyPolicy = applyPerm.allowed || applyPerm.loading;

  const fetchPolicies = useCallback(() => listPoliciesEnriched('PASSWORD'), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<EnrichedPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<EnrichedPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<PasswordPolicyDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [minLength, setMinLength] = useState('8');
  const [maxLength, setMaxLength] = useState('256');
  const [minUpperCase, setMinUpperCase] = useState('1');
  const [minLowerCase, setMinLowerCase] = useState('1');
  const [minNumeric, setMinNumeric] = useState('1');
  const [minSpecial, setMinSpecial] = useState('1');
  const [maxAgeDays, setMaxAgeDays] = useState('90');
  const [lockoutThreshold, setLockoutThreshold] = useState('5');
  const [expirationDate, setExpirationDate] = useState('');

  const handleViewDetails = async (policy: EnrichedPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsPanel(true);
    setLoadingDetails(true);
    setPolicyDetails(null);
    setDetailsError(null);

    try {
      const details: PasswordPolicyDetails | null = await getPasswordPolicyDetails(policy.name);
      if (!details) {
        setDetailsError('No details returned for this policy.');
      } else {
        setPolicyDetails(details);
      }
    } catch (error) {
      setDetailsError(formatPolicyError(error, 'Failed to load policy details'));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreate = async () => {
    if (!policyName) {
      setCreateError('Please provide a policy name.');
      return;
    }

    setCreateError(null);
    try {
      const requestData = {
        policy_name: policyName,
        min_length: parseInt(minLength),
        max_length: parseInt(maxLength),
        min_upper_case_chars: parseInt(minUpperCase),
        min_lower_case_chars: parseInt(minLowerCase),
        min_numeric_chars: parseInt(minNumeric),
        min_special_chars: parseInt(minSpecial),
        max_age_days: parseInt(maxAgeDays),
        lockout_time_mins: parseInt(lockoutThreshold),
        expiration_date: expirationDate || undefined,
      };

      await createPasswordPolicy(requestData);

      toast.success('Password policy created successfully!');
      setShowCreatePanel(false);
      resetForm();
      refetch();
    } catch (error) {
      setCreateError(formatPolicyError(error, 'Failed to create policy'));
    }
  };

  const handleSetAsDefault = async (policy: EnrichedPolicy) => {
    try {
      await setPasswordPolicyAsDefault(policy.name);
      toast.success('Password policy set as account default');
      refetch();
    } catch (error: any) {
      console.error('Set password policy as default error:', error.response?.data || error);
      toast.error(formatPolicyError(error, 'Failed to set as default'));
    }
  };

  const handleDeletePolicy = async (policy: EnrichedPolicy) => {
    await deletePasswordPolicy(policy.name);
  };

  const resetForm = () => {
    setPolicyName('');
    setMinLength('8');
    setMaxLength('256');
    setMinUpperCase('1');
    setMinLowerCase('1');
    setMinNumeric('1');
    setMinSpecial('1');
    setMaxAgeDays('90');
    setLockoutThreshold('5');
    setExpirationDate('');
    setCreateError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Password Policies</h2>
            {isStale && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Define password complexity and security requirements
          </p>
        </div>
        <Button
          onClick={() => { setCreateError(null); setShowCreatePanel(true); }}
          disabled={!canCreatePolicy}
          title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
          className="bg-red-600 hover:bg-red-700"
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
          No password policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.name}
              policy={policy}
              accentColor="red"
              policyType="password"
              onViewDetails={handleViewDetails}
              onDelete={handleDeletePolicy}
              onRefresh={refetch}
              entityLabel="object(s)"
            >
              {/* Set as Default action */}
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSetAsDefault(policy)}
                  disabled={!canApplyPolicy}
                  title={!canApplyPolicy ? 'You lack the "apply" permission on governance. Ask an administrator to grant it.' : undefined}
                  className="gap-1"
                >
                  <HiCheckCircle className="w-4 h-4" />
                  Set as Default
                </Button>
              </div>
            </PolicyCard>
          ))}
        </div>
      )}

      {/* Create Policy Panel */}
      <PolicyFormPanel
        isOpen={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        title="Create Password Policy"
        description="Set complexity, rotation and lockout requirements"
        accentClassName="bg-red-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreatePanel(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreatePolicy} className="bg-red-600 hover:bg-red-700">Create Policy</Button>
          </>
        }
      >
          <Input
            label="Policy Name"
            placeholder="STRONG_PASSWORD_POLICY"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Minimum Length"
              type="number"
              value={minLength}
              onChange={(e) => setMinLength(e.target.value)}
              min="1"
            />
            <Input
              label="Maximum Length"
              type="number"
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
              min="1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Uppercase Characters"
              type="number"
              value={minUpperCase}
              onChange={(e) => setMinUpperCase(e.target.value)}
              min="0"
            />
            <Input
              label="Min Lowercase Characters"
              type="number"
              value={minLowerCase}
              onChange={(e) => setMinLowerCase(e.target.value)}
              min="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Numeric Characters"
              type="number"
              value={minNumeric}
              onChange={(e) => setMinNumeric(e.target.value)}
              min="0"
            />
            <Input
              label="Min Special Characters"
              type="number"
              value={minSpecial}
              onChange={(e) => setMinSpecial(e.target.value)}
              min="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Max Age (Days)"
              type="number"
              value={maxAgeDays}
              onChange={(e) => setMaxAgeDays(e.target.value)}
              min="1"
            />
            <Input
              label="Lockout Threshold (Minutes)"
              type="number"
              value={lockoutThreshold}
              onChange={(e) => setLockoutThreshold(e.target.value)}
              min="1"
            />
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

          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
            <p className="text-xs text-red-700 dark:text-red-300">
              <strong>Note:</strong> Password policies are account-level and apply to all users.
              Use &quot;Set as Default&quot; after creation to activate.
            </p>
          </div>

          {createError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {createError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Policy Details Panel */}
      <PolicyFormPanel
        isOpen={showDetailsPanel}
        onClose={() => setShowDetailsPanel(false)}
        title={`Policy Details: ${selectedPolicy?.name ?? ''}`}
        accentClassName="bg-red-500"
        footer={<Button variant="outline" onClick={() => setShowDetailsPanel(false)}>Close</Button>}
      >
          {loadingDetails ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : detailsError ? (
            <ErrorDisplay error={detailsError} onRetry={() => selectedPolicy && handleViewDetails(selectedPolicy)} context="general" />
          ) : policyDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Policy Name
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {policyDetails.policy_name || selectedPolicy?.name || '—'}
                </code>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Length</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_LENGTH ??
                     policyDetails.details?.min_length ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Max Length</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MAX_LENGTH ??
                     policyDetails.details?.max_length ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Uppercase</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_UPPER_CASE_CHARS ??
                     policyDetails.details?.min_upper_case_chars ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Lowercase</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_LOWER_CASE_CHARS ??
                     policyDetails.details?.min_lower_case_chars ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Numeric</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_NUMERIC_CHARS ??
                     policyDetails.details?.min_numeric_chars ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Special</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_SPECIAL_CHARS ??
                     policyDetails.details?.min_special_chars ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Max Age</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MAX_AGE_DAYS ??
                     policyDetails.details?.max_age_days ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">days</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Max Retries</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MAX_RETRIES ??
                     policyDetails.details?.max_retries ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">attempts</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Lockout Time</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_LOCKOUT_TIME_MINS ??
                     policyDetails.details?.lockout_time_mins ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">minutes</p>
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
                <p className="text-xs text-red-700 dark:text-red-300">
                  <strong>Note:</strong> This password policy defines complexity requirements for user passwords.
                  The policy is account-wide and affects all users when set as default.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No details available
            </div>
          )}
      </PolicyFormPanel>
    </div>
  );
}
