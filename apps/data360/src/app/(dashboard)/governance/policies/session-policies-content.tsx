'use client';

import { useState, useCallback } from 'react';
import { Button, Input, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiCheckCircle } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  listPoliciesEnriched,
  getSessionPolicyDetails,
  createSessionPolicy,
  setSessionPolicyAsDefault,
  deleteSessionPolicy,
  formatPolicyError,
  type EnrichedPolicy,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';

export default function SessionPoliciesContent() {
  const fetchPolicies = useCallback(() => listPoliciesEnriched('SESSION'), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<EnrichedPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<EnrichedPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [sessionIdleTimeout, setSessionIdleTimeout] = useState('60');
  const [sessionUIIdleTimeout, setSessionUIIdleTimeout] = useState('30');
  const [expirationDate, setExpirationDate] = useState('');

  const handleViewDetails = async (policy: EnrichedPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setPolicyDetails(null);

    try {
      const details = await getSessionPolicyDetails(policy.name);
      setPolicyDetails(details);
    } catch (error: any) {
      console.error('Error loading policy details:', error);
      toast.error('Failed to load policy details');
    } finally {
      setLoadingDetails(false);
    }
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

      await createSessionPolicy(requestData);

      toast.success('Session policy created successfully!');
      setShowCreateModal(false);
      resetForm();
      refetch();
    } catch (error: any) {
      console.error('Create session policy error:', error.response?.data || error);
      toast.error(formatPolicyError(error, 'Failed to create policy'));
    }
  };

  const handleSetAsDefault = async (policy: EnrichedPolicy) => {
    try {
      await setSessionPolicyAsDefault(policy.name);
      toast.success('Session policy set as account default');
      refetch();
    } catch (error: any) {
      console.error('Set session policy as default error:', error.response?.data || error);
      toast.error(formatPolicyError(error, 'Failed to set as default'));
    }
  };

  const handleDeletePolicy = async (policy: EnrichedPolicy) => {
    await deleteSessionPolicy(policy.name);
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
            {isStale && (
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
      ) : !policies || policies.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No session policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <PolicyCard
              key={policy.name}
              policy={policy}
              accentColor="indigo"
              policyType="session"
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
            Policy Details: {selectedPolicy?.name}
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
                  {policyDetails.policy_name || selectedPolicy?.name || 'N/A'}
                </code>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded">
                  <p className="text-xs text-slate-500 mb-1">Session Idle Timeout</p>
                  <p className="text-2xl font-semibold">
                    {policyDetails.details?.SESSION_IDLE_TIMEOUT_MINS ??
                     policyDetails.details?.session_idle_timeout_mins ?? 'N/A'}
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
                     policyDetails.details?.session_ui_idle_timeout_mins ?? 'N/A'}
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
