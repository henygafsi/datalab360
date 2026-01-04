'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Input, Modal, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiCheckCircle } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getSessionPolicies,
  getSessionPolicyDetails,
  createSessionPolicy,
  setSessionPolicyAsDefault,
  deleteSessionPolicy,
  type SessionPolicy,
} from '@/app/services/gouvernance/policies';

export default function SessionPoliciesContent() {
  const [policies, setPolicies] = useState<SessionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<SessionPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [sessionIdleTimeout, setSessionIdleTimeout] = useState('60');
  const [sessionUIIdleTimeout, setSessionUIIdleTimeout] = useState('30');
  const [expirationDate, setExpirationDate] = useState('');

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
      const data = await getSessionPolicies();
      if (mountedRef.current) {
        setPolicies(Array.isArray(data) ? data : []);
      }
    } catch (error: any) {
      console.error('Error loading session policies:', error);
      if (mountedRef.current) {
        toast.error(error.response?.data?.message || error.message || 'Failed to load session policies');
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
      console.log('[SSE] Policies cache invalidated - refreshing session policies...');
      loadPolicies(true);
    }
  }, [wasInvalidated, loading, loadPolicies]);

  const handleViewDetails = async (policy: SessionPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setPolicyDetails(null);

    try {
      const details = await getSessionPolicyDetails(policy.policy_name);
      console.log('Session policy details:', details);
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

    const idleTimeout = parseInt(sessionIdleTimeout);
    const uiIdleTimeout = parseInt(sessionUIIdleTimeout);

    if (idleTimeout < 1 || idleTimeout > 7200) {
      toast.error('Session idle timeout must be between 1 and 7200 minutes');
      return;
    }

    if (uiIdleTimeout < 1 || uiIdleTimeout > 7200) {
      toast.error('UI idle timeout must be between 1 and 7200 minutes');
      return;
    }

    try {
      const requestData = {
        policy_name: policyName,
        session_idle_timeout_mins: idleTimeout,
        session_ui_idle_timeout_mins: uiIdleTimeout,
        expiration_date: expirationDate || undefined,
      };
      console.log('[Session Create] Sending request:', requestData);

      const result = await createSessionPolicy(requestData);
      console.log('[Session Create] Response:', result);

      toast.success('Session policy created successfully!');
      setShowCreateModal(false);
      resetForm();
      loadPolicies();
    } catch (error: any) {
      console.error('Create session policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to create policy'));
    }
  };

  const handleSetAsDefault = async (policy: SessionPolicy) => {
    if (!confirm(`Set "${policy.policy_name}" as account default session policy?`)) return;

    try {
      await setSessionPolicyAsDefault(policy.policy_name);
      toast.success('Session policy set as account default');
      loadPolicies();
    } catch (error: any) {
      console.error('Set session policy as default error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to set as default'));
    }
  };

  const handleDelete = async (policy: SessionPolicy) => {
    if (!confirm(`Delete session policy "${policy.policy_name}"?`)) return;

    try {
      await deleteSessionPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      console.error('Delete session policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to delete policy'));
    }
  };

  const resetForm = () => {
    setPolicyName('');
    setSessionIdleTimeout('60');
    setSessionUIIdleTimeout('30');
    setExpirationDate('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Session Policies</h2>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Configure session timeout and idle behavior
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
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
          No session policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div
              key={policy.policy_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 hover:border-indigo-300 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => handleViewDetails(policy)}
                >
                  <h3 className="font-semibold text-lg text-indigo-600 hover:text-indigo-700">
                    {String(policy.policy_name || '')}
                  </h3>
                  {policy.is_default && (
                    <Badge variant="flat" className="bg-indigo-100 text-indigo-700">
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

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">Session Idle Timeout</p>
                  <p className="text-lg font-semibold">{String(policy.session_idle_timeout_mins || 'N/A')} minutes</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Maximum inactivity before logout
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">UI Idle Timeout</p>
                  <p className="text-lg font-semibold">{String(policy.session_ui_idle_timeout_mins || 'N/A')} minutes</p>
                  <p className="text-xs text-slate-500 mt-1">
                    UI inactivity warning threshold
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Create Session Policy</h2>

          <Input
            label="Policy Name"
            placeholder="DEFAULT_SESSION_POLICY"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <Input
            label="Session Idle Timeout (Minutes)"
            type="number"
            value={sessionIdleTimeout}
            onChange={(e) => setSessionIdleTimeout(e.target.value)}
            min="1"
            max="7200"
            helperText="Maximum idle time before automatic logout (1-7200 mins)"
          />

          <Input
            label="UI Idle Timeout (Minutes)"
            type="number"
            value={sessionUIIdleTimeout}
            onChange={(e) => setSessionUIIdleTimeout(e.target.value)}
            min="1"
            max="7200"
            helperText="UI idle time before displaying warning (1-7200 mins)"
          />

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

          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded space-y-2">
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Session Policy Guidelines:
            </p>
            <ul className="text-xs text-indigo-600 dark:text-indigo-400 space-y-1 list-disc list-inside">
              <li>Session idle timeout: Maximum inactivity before forced logout</li>
              <li>UI idle timeout: Should be less than session idle timeout</li>
              <li>Recommended: UI timeout = 50% of session timeout</li>
              <li>Use &quot;Set as Default&quot; after creation to activate globally</li>
            </ul>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded">
                  <p className="text-xs text-slate-500 mb-1">Session Idle Timeout</p>
                  <p className="text-2xl font-semibold">
                    {policyDetails.details?.SESSION_IDLE_TIMEOUT_MINS ??
                     policyDetails.details?.session_idle_timeout_mins ??
                     selectedPolicy?.session_idle_timeout_mins ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">minutes</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Maximum inactivity before automatic logout
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded">
                  <p className="text-xs text-slate-500 mb-1">UI Idle Timeout</p>
                  <p className="text-2xl font-semibold">
                    {policyDetails.details?.SESSION_UI_IDLE_TIMEOUT_MINS ??
                     policyDetails.details?.session_ui_idle_timeout_mins ??
                     selectedPolicy?.session_ui_idle_timeout_mins ?? 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">minutes</p>
                  <p className="text-xs text-slate-500 mt-2">
                    UI inactivity before warning appears
                  </p>
                </div>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded">
                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                  <strong>Note:</strong> Session idle timeout is the maximum inactivity time before automatic logout.
                  UI idle timeout is when the warning prompt appears.
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
