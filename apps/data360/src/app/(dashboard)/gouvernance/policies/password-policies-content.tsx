'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Input, Modal, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiCheckCircle } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getPasswordPolicies,
  getPasswordPolicyDetails,
  createPasswordPolicy,
  setPasswordPolicyAsDefault,
  deletePasswordPolicy,
  type PasswordPolicy,
} from '@/app/services/gouvernance/policies';

export default function PasswordPoliciesContent() {
  const [policies, setPolicies] = useState<PasswordPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PasswordPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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
      const data = await getPasswordPolicies();
      if (mountedRef.current) {
        setPolicies(Array.isArray(data) ? data : []);
      }
    } catch (error: any) {
      console.error('Error loading password policies:', error);
      if (mountedRef.current) {
        toast.error(error.response?.data?.message || error.message || 'Failed to load password policies');
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
      console.log('[SSE] Policies cache invalidated - refreshing password policies...');
      loadPolicies(true);
    }
  }, [wasInvalidated, loading, loadPolicies]);

  const handleViewDetails = async (policy: PasswordPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setPolicyDetails(null);

    try {
      const details = await getPasswordPolicyDetails(policy.policy_name);
      console.log('Password policy details:', details);
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

  const handleCreate = async () => {
    if (!policyName) {
      toast.error('Please provide a policy name');
      return;
    }

    try {
      await createPasswordPolicy({
        policy_name: policyName,
        min_length: parseInt(minLength),
        max_length: parseInt(maxLength),
        min_upper_case_chars: parseInt(minUpperCase),
        min_lower_case_chars: parseInt(minLowerCase),
        min_numeric_chars: parseInt(minNumeric),
        min_special_chars: parseInt(minSpecial),
        max_age_days: parseInt(maxAgeDays),
        lockout_time_mins: parseInt(lockoutThreshold),
      });
      toast.success('Password policy created successfully!');
      setShowCreateModal(false);
      resetForm();
      loadPolicies();
    } catch (error: any) {
      console.error('Create password policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to create policy'));
    }
  };

  const handleSetAsDefault = async (policy: PasswordPolicy) => {
    if (!confirm(`Set "${policy.policy_name}" as account default password policy?`)) return;

    try {
      await setPasswordPolicyAsDefault(policy.policy_name);
      toast.success('Password policy set as account default');
      loadPolicies();
    } catch (error: any) {
      console.error('Set password policy as default error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to set as default'));
    }
  };

  const handleDelete = async (policy: PasswordPolicy) => {
    if (!confirm(`Delete password policy "${policy.policy_name}"?`)) return;

    try {
      await deletePasswordPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      console.error('Delete password policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to delete policy'));
    }
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
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Password Policies</h2>
            {isRefreshing && (
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
          onClick={() => setShowCreateModal(true)}
          className="bg-red-600 hover:bg-red-700"
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
          No password policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div
              key={policy.policy_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 hover:border-red-300 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => handleViewDetails(policy)}
                >
                  <h3 className="font-semibold text-lg text-red-600 hover:text-red-700">
                    {String(policy.policy_name || '')}
                  </h3>
                  {policy.is_default && (
                    <Badge variant="flat" className="bg-red-100 text-red-700">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {!policy.is_default && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetAsDefault(policy)}
                    >
                      <HiCheckCircle className="w-4 h-4 mr-1" />
                      Set as Default
                    </Button>
                  )}
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

              <div className="grid grid-cols-4 gap-3 mt-3">
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Min Length</p>
                  <p className="text-sm font-semibold">{policy.min_length ?? 'N/A'} chars</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Max Length</p>
                  <p className="text-sm font-semibold">{policy.max_length ?? 'N/A'} chars</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Uppercase</p>
                  <p className="text-sm font-semibold">{policy.min_upper_case_chars ?? 'N/A'} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Lowercase</p>
                  <p className="text-sm font-semibold">{policy.min_lower_case_chars ?? 'N/A'} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Numeric</p>
                  <p className="text-sm font-semibold">{policy.min_numeric_chars ?? 'N/A'} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Special</p>
                  <p className="text-sm font-semibold">{policy.min_special_chars ?? 'N/A'} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Max Age</p>
                  <p className="text-sm font-semibold">{policy.max_age_days ?? 'N/A'} days</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Max Retries</p>
                  <p className="text-sm font-semibold">{policy.max_retries ?? 'N/A'} attempts</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Lockout Time</p>
                  <p className="text-sm font-semibold">{policy.lockout_time_mins ?? 'N/A'} mins</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Create Password Policy</h2>

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

          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
            <p className="text-xs text-red-700 dark:text-red-300">
              <strong>Note:</strong> Password policies are account-level and apply to all users.
              Use "Set as Default" after creation to activate.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
              Create Policy
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : policyDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Policy Name
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {policyDetails.policy_name || selectedPolicy?.policy_name || 'N/A'}
                </code>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Length</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_LENGTH ??
                     policyDetails.details?.min_length ??
                     selectedPolicy?.min_length ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Max Length</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MAX_LENGTH ??
                     policyDetails.details?.max_length ??
                     selectedPolicy?.max_length ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Uppercase</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_UPPER_CASE_CHARS ??
                     policyDetails.details?.min_upper_case_chars ??
                     selectedPolicy?.min_upper_case_chars ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Lowercase</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_LOWER_CASE_CHARS ??
                     policyDetails.details?.min_lower_case_chars ??
                     selectedPolicy?.min_lower_case_chars ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Numeric</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_NUMERIC_CHARS ??
                     policyDetails.details?.min_numeric_chars ??
                     selectedPolicy?.min_numeric_chars ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Min Special</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MIN_SPECIAL_CHARS ??
                     policyDetails.details?.min_special_chars ??
                     selectedPolicy?.min_special_chars ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">characters</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Max Age</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MAX_AGE_DAYS ??
                     policyDetails.details?.max_age_days ??
                     selectedPolicy?.max_age_days ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">days</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Max Retries</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_MAX_RETRIES ??
                     policyDetails.details?.max_retries ??
                     selectedPolicy?.max_retries ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500">attempts</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Lockout Time</p>
                  <p className="text-lg font-semibold">
                    {policyDetails.details?.PASSWORD_LOCKOUT_TIME_MINS ??
                     policyDetails.details?.lockout_time_mins ??
                     selectedPolicy?.lockout_time_mins ?? 'N/A'}
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

          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
