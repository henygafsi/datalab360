'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select } from 'rizzui';
import { UserPlus, User, Shield, X } from 'lucide-react';
import { assignRoleToUser } from '@/app/services/gouvernance/fetch_users';
import { getRoles } from '@/app/services/gouvernance/fetch_roles';
import apiClient from '@/lib/api-client';

type GrantUserFormProps = {
  onSuccess?: () => void;
  onClose: () => void;
};

export default function AddUserForm({ onSuccess, onClose }: GrantUserFormProps) {
  const [username, setUsername] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [availableRoles, setAvailableRoles] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRoles()
      .then((roles) => {
        setAvailableRoles(roles.map((r) => ({ value: r.role, label: r.role })));
      })
      .catch(() => setAvailableRoles([]))
      .finally(() => setRolesLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !selectedRole) {
      setError('Username and role are required.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await assignRoleToUser(username.trim(), selectedRole);
      try { await apiClient.post('/cache/clear/pattern', { pattern: 'cache:*:get_grants:*' }); } catch {}
      try { await apiClient.post('/cache/clear/pattern', { pattern: 'cache:*:route_get_grants:*' }); } catch {}
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Failed to assign role.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-1">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Grant Role to User</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Assign a Snowflake role to a user</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close form"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-px bg-gray-100 dark:bg-gray-700" />

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5 px-5 pt-5 pb-6">
        <Input
          label="Username"
          placeholder="Enter Snowflake username"
          prefix={<User className="h-4 w-4 text-gray-400" />}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <Select
          label="Role"
          placeholder={rolesLoading ? 'Loading roles...' : 'Select a role'}
          options={availableRoles}
          value={selectedRole}
          onChange={(val: any) => setSelectedRole(val?.value ?? val ?? '')}
          disabled={rolesLoading}
        />

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            isLoading={loading}
            disabled={rolesLoading}
          >
            <Shield className="me-1.5 h-4 w-4" />
            Grant Role
          </Button>
        </div>
      </form>
    </div>
  );
}
