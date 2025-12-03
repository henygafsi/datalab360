'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiCheckCircle } from 'react-icons/hi2';
import {
  getPasswordPolicies,
  createPasswordPolicy,
  setPasswordPolicyAsDefault,
  deletePasswordPolicy,
  type PasswordPolicy,
} from '@/app/services/gouvernance/policies';

export default function PasswordPoliciesContent() {
  const [policies, setPolicies] = useState<PasswordPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await getPasswordPolicies();
      setPolicies(data || []);
    } catch (error: any) {
      console.error('Error loading password policies:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to load password policies');
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
      toast.error(error.response?.data?.message || error.message || 'Failed to create policy');
    }
  };

  const handleSetAsDefault = async (policy: PasswordPolicy) => {
    if (!confirm(`Set "${policy.policy_name}" as account default password policy?`)) return;

    try {
      await setPasswordPolicyAsDefault(policy.policy_name);
      toast.success('Password policy set as account default');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to set as default');
    }
  };

  const handleDelete = async (policy: PasswordPolicy) => {
    if (!confirm(`Delete password policy "${policy.policy_name}"?`)) return;

    try {
      await deletePasswordPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete policy');
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
          <h2 className="text-2xl font-bold">Password Policies</h2>
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
              className="bg-white dark:bg-slate-800 rounded-lg border p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{policy.policy_name}</h3>
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
                  <p className="text-sm font-semibold">{policy.min_length} chars</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Uppercase</p>
                  <p className="text-sm font-semibold">{policy.min_upper_case_chars} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Numeric</p>
                  <p className="text-sm font-semibold">{policy.min_numeric_chars} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Special</p>
                  <p className="text-sm font-semibold">{policy.min_special_chars} min</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Max Age</p>
                  <p className="text-sm font-semibold">{policy.max_age_days} days</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded">
                  <p className="text-xs text-slate-500">Lockout</p>
                  <p className="text-sm font-semibold">{policy.lockout_time_mins} mins</p>
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
    </div>
  );
}
