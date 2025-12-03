'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiCheckCircle } from 'react-icons/hi2';
import {
  getNetworkPolicies,
  createNetworkPolicy,
  setNetworkPolicyAsDefault,
  deleteNetworkPolicy,
  type NetworkPolicy,
} from '@/app/services/gouvernance/policies';

export default function NetworkPoliciesContent() {
  const [policies, setPolicies] = useState<NetworkPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [allowedIPs, setAllowedIPs] = useState('');
  const [blockedIPs, setBlockedIPs] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await getNetworkPolicies();
      setPolicies(data || []);
    } catch (error: any) {
      console.error('Error loading network policies:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to load network policies');
      setPolicies([]);
    } finally {
      setLoading(false);
    }
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
      await createNetworkPolicy({
        policy_name: policyName,
        allowed_ip_list: allowedIPs,
        blocked_ip_list: blockedIPs,
        comment,
      });
      toast.success('Network policy created successfully!');
      setShowCreateModal(false);
      resetForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create policy');
    }
  };

  const handleSetAsDefault = async (policy: NetworkPolicy) => {
    if (!confirm(`Set "${policy.policy_name}" as account default network policy?`)) return;

    try {
      await setNetworkPolicyAsDefault(policy.policy_name);
      toast.success('Network policy set as account default');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to set as default');
    }
  };

  const handleDelete = async (policy: NetworkPolicy) => {
    if (!confirm(`Delete network policy "${policy.policy_name}"?`)) return;

    try {
      await deleteNetworkPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete policy');
    }
  };

  const resetForm = () => {
    setPolicyName('');
    setAllowedIPs('');
    setBlockedIPs('');
    setComment('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Network Policies</h2>
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
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No network policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div
              key={policy.policy_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{policy.policy_name}</h3>
                    {policy.is_default && (
                      <Badge variant="flat" className="bg-blue-100 text-blue-700">
                        Default
                      </Badge>
                    )}
                  </div>
                  {policy.comment && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {policy.comment}
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
                      {policy.allowed_ip_list}
                    </p>
                  </div>
                )}
                {policy.blocked_ip_list && (
                  <div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Blocked IPs:
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      {policy.blocked_ip_list}
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

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Network policies are account-level and apply globally.
              Use "Set as Default" after creation to activate.
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
    </div>
  );
}
