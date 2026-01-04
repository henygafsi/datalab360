'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlineShieldCheck, HiOutlineXMark } from 'react-icons/hi2';
import { PolicyGrant } from './table';
import { getRoles } from '@/app/services/gouvernance/fetch_roles';
import { assignPolicyToRoles } from '@/app/services/gouvernance/policies';

interface AssignPolicyModalProps {
  policy: PolicyGrant | null;
  onClose: () => void;
  onSuccess: () => void;
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  rls: 'Row-Level Security',
  masking: 'Data Masking',
  cls: 'Column-Level Security',
  network: 'Network Policy',
  aggregation: 'Aggregation Policy',
  authentication: 'Authentication Policy',
  join: 'Join Policy',
  packages: 'Packages Policy',
  password: 'Password Policy',
  privacy: 'Privacy Policy',
  projection: 'Projection Policy',
  session: 'Session Policy',
  storage: 'Storage Lifecycle',
};

export default function AssignPolicyModal({
  policy,
  onClose,
  onSuccess,
}: AssignPolicyModalProps) {
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch available roles
  useEffect(() => {
    if (policy) {
      setLoading(true);
      getRoles()
        .then((roles) => {
          setAvailableRoles(roles.map((r) => r.role));
          // Pre-select current roles
          setSelectedRoles([...policy.granted_roles]);
        })
        .catch((error) => {
          console.error('Failed to fetch roles:', error);
          toast.error('Failed to load roles');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [policy]);

  const handleToggleRole = useCallback((role: string) => {
    setSelectedRoles((prev) => {
      if (prev.includes(role)) {
        return prev.filter((r) => r !== role);
      } else {
        return [...prev, role];
      }
    });
  }, []);

  const handleSave = async () => {
    if (!policy) return;

    setSaving(true);
    try {
      // Use just the policy name - backend endpoint expects policy name only
      // The endpoint format is: PUT /gouvernance/policies/{policy_type}/{policy_name}/roles
      const policyName = policy.policy_name;

      console.log('[Policy Grants] Assigning policy:', policyName);
      console.log('[Policy Grants] Policy type:', policy.policy_type);
      console.log('[Policy Grants] Selected roles:', selectedRoles);

      const response = await assignPolicyToRoles(
        policyName,
        policy.policy_type,
        selectedRoles
      );

      console.log('[Policy Grants] Assignment response:', response);

      toast.success(
        `✅ Policy ${policy.policy_name} assigned to ${selectedRoles.length} role(s)`
      );

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('[Policy Grants] Failed to assign policy:', error);
      toast.error(error.message || 'Failed to assign policy');
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return null;

  return (
    <Modal isOpen={!!policy} onClose={onClose} containerClassName="max-w-2xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Manage Policy Grants
            </h2>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                <HiOutlineShieldCheck className="w-3 h-3 mr-1 inline" />
                {POLICY_TYPE_LABELS[policy.policy_type]}
              </Badge>
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {policy.policy_name}
              </span>
            </div>
            {policy.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {policy.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Policy Details */}
        {policy.table_name && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">Applies to:</span>{' '}
              {policy.database && `${policy.database}.`}
              {policy.schema && `${policy.schema}.`}
              {policy.table_name}
            </p>
          </div>
        )}

        {/* Role Selection */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Assign to Roles ({selectedRoles.length} selected)
          </h3>

          {loading ? (
            <div className="py-8 text-center text-slate-500">Loading roles...</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-3">
              {availableRoles.map((role) => {
                const isSelected = selectedRoles.includes(role);
                return (
                  <label
                    key={role}
                    className={`
                      flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors
                      ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleRole(role)}
                      className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {role}
                    </span>
                  </label>
                );
              })}

              {availableRoles.length === 0 && (
                <div className="py-8 text-center text-slate-500">
                  No roles available
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {selectedRoles.length > 0 ? (
              <span>
                This policy will be assigned to{' '}
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {selectedRoles.length}
                </span>{' '}
                role(s)
              </span>
            ) : (
              <span>Select roles to assign this policy</span>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={onClose} variant="outline" disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-gradient-to-r from-violet-500 to-purple-600 text-white"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
