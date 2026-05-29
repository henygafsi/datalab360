'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlineShieldCheck } from 'react-icons/hi2';
import { PolicyGrant } from './table';
import { getRoles } from '@/app/services/governance/fetch_roles';
import { assignPolicyToRoles } from '@/app/services/governance/policies';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';

interface AssignPolicyModalProps {
  policy: PolicyGrant | null;
  onClose: () => void;
  onSuccess: (grantedRoles: string[]) => void;
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
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch available roles
  useEffect(() => {
    if (policy) {
      setLoading(true);
      setRolesError(null);
      setSaveError(null);
      getRoles()
        .then((roles) => {
          setAvailableRoles(roles.map((r) => r.role));
          // Pre-select current roles
          setSelectedRoles([...policy.granted_roles]);
        })
        .catch((error) => {
          setRolesError(error instanceof Error ? error.message : 'Failed to load roles');
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
    setSaveError(null);
    try {
      // Use just the policy name - backend endpoint expects policy name only
      // The endpoint format is: PUT /gouvernance/policies/{policy_type}/{policy_name}/roles
      await assignPolicyToRoles(
        policy.policy_name,
        policy.policy_type,
        selectedRoles
      );

      toast.success(
        `Policy ${policy.policy_name} assigned to ${selectedRoles.length} role(s)`
      );

      onSuccess(selectedRoles);
      onClose();
    } catch (error: any) {
      setSaveError(error?.message || 'Failed to assign policy');
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return null;

  return (
    <PolicyFormPanel
      isOpen={!!policy}
      onClose={onClose}
      title="Manage Policy Grants"
      accentClassName="bg-blue-500"
      footer={
        <>
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
        </>
      }
    >
        {/* Policy summary */}
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <HiOutlineShieldCheck className="w-3 h-3 mr-1 inline" />
            {POLICY_TYPE_LABELS[policy.policy_type]}
          </Badge>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {policy.policy_name}
          </span>
        </div>
        {policy.description && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {policy.description}
          </p>
        )}

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
          ) : rolesError ? (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {rolesError}
            </div>
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

        {/* Selection summary */}
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

        {saveError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
            {saveError}
          </p>
        )}
    </PolicyFormPanel>
  );
}
