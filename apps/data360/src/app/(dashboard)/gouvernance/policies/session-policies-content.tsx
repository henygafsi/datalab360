'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiCheckCircle } from 'react-icons/hi2';
import {
  getSessionPolicies,
  createSessionPolicy,
  setSessionPolicyAsDefault,
  deleteSessionPolicy,
  type SessionPolicy,
} from '@/app/services/gouvernance/policies';

export default function SessionPoliciesContent() {
  const [policies, setPolicies] = useState<SessionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [sessionIdleTimeout, setSessionIdleTimeout] = useState('60');
  const [sessionUIIdleTimeout, setSessionUIIdleTimeout] = useState('30');

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await getSessionPolicies();
      setPolicies(data || []);
    } catch (error: any) {
      console.error('Error loading session policies:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to load session policies');
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
      await createSessionPolicy({
        policy_name: policyName,
        session_idle_timeout_mins: idleTimeout,
        session_ui_idle_timeout_mins: uiIdleTimeout,
      });
      toast.success('Session policy created successfully!');
      setShowCreateModal(false);
      resetForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create policy');
    }
  };

  const handleSetAsDefault = async (policy: SessionPolicy) => {
    if (!confirm(`Set "${policy.policy_name}" as account default session policy?`)) return;

    try {
      await setSessionPolicyAsDefault(policy.policy_name);
      toast.success('Session policy set as account default');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to set as default');
    }
  };

  const handleDelete = async (policy: SessionPolicy) => {
    if (!confirm(`Delete session policy "${policy.policy_name}"?`)) return;

    try {
      await deleteSessionPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete policy');
    }
  };

  const resetForm = () => {
    setPolicyName('');
    setSessionIdleTimeout('60');
    setSessionUIIdleTimeout('30');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Session Policies</h2>
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
              className="bg-white dark:bg-slate-800 rounded-lg border p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{policy.policy_name}</h3>
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
                  <p className="text-lg font-semibold">{policy.session_idle_timeout_mins} minutes</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Maximum inactivity before logout
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
                  <p className="text-xs text-slate-500 mb-1">UI Idle Timeout</p>
                  <p className="text-lg font-semibold">{policy.session_ui_idle_timeout_mins} minutes</p>
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

          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded space-y-2">
            <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Session Policy Guidelines:
            </p>
            <ul className="text-xs text-indigo-600 dark:text-indigo-400 space-y-1 list-disc list-inside">
              <li>Session idle timeout: Maximum inactivity before forced logout</li>
              <li>UI idle timeout: Should be less than session idle timeout</li>
              <li>Recommended: UI timeout = 50% of session timeout</li>
              <li>Use "Set as Default" after creation to activate globally</li>
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
    </div>
  );
}
