'use client';

import { useState, useCallback } from 'react';
import { Button, Input, Modal, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiCheckCircle } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getNetworkPolicies,
  getNetworkPolicyDetails,
  createNetworkPolicy,
  setNetworkPolicyAsDefault,
  deleteNetworkPolicy,
  type NetworkPolicy,
} from '@/app/services/governance/policies';
export default function NetworkPoliciesContent() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<NetworkPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [allowedIPs, setAllowedIPs] = useState('');
  const [blockedIPs, setBlockedIPs] = useState('');
  const [comment, setComment] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchPolicies = useCallback(() => getNetworkPolicies().then(data => Array.isArray(data) ? data : []), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<NetworkPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const handleViewDetails = async (policy: NetworkPolicy) => {
    setSelectedPolicy(policy);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setPolicyDetails(null);

    try {
      const details = await getNetworkPolicyDetails(policy.policy_name);
      // console.log('Network policy details:', details);
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

    if (!allowedIPs && !blockedIPs) {
      toast.error('Please specify at least one allowed or blocked IP range');
      return;
    }

    try {
      const requestData = {
        policy_name: policyName,
        allowed_ip_list: allowedIPs.trim() || undefined,
        blocked_ip_list: blockedIPs.trim() || undefined,
        comment: comment.trim() || undefined,
        expiration_date: expirationDate || undefined,
      };
      // console.log('[Network Create] Sending request:', requestData);

      const result = await createNetworkPolicy(requestData);
      // console.log('[Network Create] Response:', result);

      toast.success('Network policy created successfully!');
      setShowCreateModal(false);
      resetForm();
      refetch();
    } catch (error: any) {
      console.error('[Network Create] Error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to create policy'));
    }
  };

  const handleSetAsDefault = async (policy: NetworkPolicy) => {
    if (!confirm(`Set "${policy.policy_name}" as account default network policy?`)) return;

    try {
      await setNetworkPolicyAsDefault(policy.policy_name);
      toast.success('Network policy set as account default');
      refetch();
    } catch (error: any) {
      console.error('Set network policy as default error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to set as default'));
    }
  };

  const handleDelete = async (policy: NetworkPolicy) => {
    if (!confirm(`Delete network policy "${policy.policy_name}"?`)) return;

    try {
      await deleteNetworkPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      refetch();
    } catch (error: any) {
      console.error('Delete network policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to delete policy'));
    }
  };

  const resetForm = () => {
    setPolicyName('');
    setAllowedIPs('');
    setBlockedIPs('');
    setComment('');
    setExpirationDate('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Network Policies</h2>
            {isStale && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Control access based on IP addresses and network locations
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700"
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
          No network policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div
              key={policy.policy_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => handleViewDetails(policy)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg text-blue-600 hover:text-blue-700">
                      {String(policy.policy_name || '')}
                    </h3>
                    {policy.is_default && (
                      <Badge variant="flat" className="bg-blue-100 text-blue-700">
                        Default
                      </Badge>
                    )}
                  </div>
                  {policy.comment && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {String(policy.comment)}
                    </p>
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

              <div className="grid grid-cols-2 gap-4 mt-3">
                {policy.allowed_ip_list && (
                  <div>
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                      Allowed IPs:
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      {String(policy.allowed_ip_list)}
                    </p>
                  </div>
                )}
                {policy.blocked_ip_list && (
                  <div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Blocked IPs:
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      {String(policy.blocked_ip_list)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Create Network Policy</h2>

          <Input
            label="Policy Name"
            placeholder="OFFICE_NETWORK_POLICY"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Allowed IP List
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={3}
              value={allowedIPs}
              onChange={(e) => setAllowedIPs(e.target.value)}
              placeholder="192.168.1.0/24, 10.0.0.0/8"
            />
            <p className="text-xs text-slate-500 mt-1">
              Comma-separated list of allowed IP addresses or CIDR ranges
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Blocked IP List (Optional)
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={3}
              value={blockedIPs}
              onChange={(e) => setBlockedIPs(e.target.value)}
              placeholder="203.0.113.0/24"
            />
            <p className="text-xs text-slate-500 mt-1">
              Comma-separated list of blocked IP addresses or CIDR ranges
            </p>
          </div>

          <Input
            label="Comment (Optional)"
            placeholder="Office network access policy"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
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

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Network policies are account-level and apply globally.
              Use &quot;Set as Default&quot; after creation to activate.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
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

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Allowed IP List
                </label>
                <pre className="block bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap text-green-700 dark:text-green-300">
                  {policyDetails.details?.allowed_ip_list || policyDetails.allowed_ip_list || selectedPolicy?.allowed_ip_list || 'None'}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Blocked IP List
                </label>
                <pre className="block bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap text-red-700 dark:text-red-300">
                  {policyDetails.details?.blocked_ip_list || policyDetails.blocked_ip_list || selectedPolicy?.blocked_ip_list || 'None'}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Comment
                </label>
                <p className="text-sm">{policyDetails.details?.comment || policyDetails.comment || selectedPolicy?.comment || 'No comment'}</p>
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
