'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Password, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import { addUser } from '@/app/services/governance/fetch_users';
import { getD360Roles, type D360Role } from '@/app/services/governance/fetch_roles';
import { UserPlus, User, Mail, Lock, ShieldCheck, X } from 'lucide-react';


type AddUserFormProps = {
  onAddUserSuccess?: () => void;
  onClose: () => void;
};

type RoleOption = { label: string; value: string };

export default function AddUserForm({ onAddUserSuccess, onClose }: AddUserFormProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(''); // '' = no role (assignment is optional)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live roles list (populates the picker). Failures are non-fatal: the picker
  // falls back to an honest empty/disabled state and creation still works.
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setRolesLoading(true);
      setRolesError(false);
      try {
        const roles = await getD360Roles();
        if (!active) return;
        const opts = roles
          .filter((r: D360Role) => !!r.role_name)
          .map((r: D360Role) => ({
            label: r.display_name?.trim() || r.role_name,
            value: r.role_name,
          }));
        setRoleOptions(opts);
      } catch {
        if (!active) return;
        setRolesError(true);
        setRoleOptions([]);
      } finally {
        if (active) setRolesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await addUser({ username, password, email, role });
      // 2xx → the user was created. A role was requested only if `role` is set.
      if (role) {
        if (result.role_error) {
          // Partial success: user exists, role grant failed → non-fatal warning.
          const msg =
            typeof result.role_error === 'string'
              ? result.role_error
              : result.message || 'unknown error';
          toast.error(`User created, role assignment failed: ${msg}`);
        } else {
          toast.success('User created + role assigned');
        }
      } else {
        toast.success('User created');
      }
      // The user exists in every 2xx branch — always refresh the list and close.
      onAddUserSuccess?.();
      onClose();
    } catch (err: any) {
      // Hard failure (non-2xx): user was NOT created → inline error, keep form open.
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  const rolePlaceholder = rolesLoading
    ? 'Loading roles…'
    : rolesError
      ? 'Roles unavailable'
      : roleOptions.length === 0
        ? 'No roles available'
        : 'Select a role (optional)';

  return (
    <div className="p-1">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add New User</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Create a new account for your team</p>
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
          placeholder="Enter username"
          prefix={<User className="h-4 w-4 text-gray-400" />}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <Input
          label="Email"
          type="email"
          placeholder="user@company.com"
          prefix={<Mail className="h-4 w-4 text-gray-400" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Password
          label="Password"
          placeholder="Create a strong password"
          prefix={<Lock className="h-4 w-4 text-gray-400" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Select
          label="Role"
          prefix={<ShieldCheck className="h-4 w-4 text-gray-400" />}
          options={roleOptions}
          value={role}
          onChange={(val: any) => setRole(val ?? '')}
          placeholder={rolePlaceholder}
          disabled={rolesLoading || rolesError || roleOptions.length === 0}
          clearable={!!role}
          onClear={() => setRole('')}
          getOptionValue={(o: RoleOption) => o.value}
          displayValue={(selected: string) =>
            roleOptions.find((o) => o.value === selected)?.label ?? ''
          }
          inPortal={false}
          dropdownClassName="!z-[1]"
          helperText={
            rolesError
              ? 'Could not load roles — the user can be created without a role and assigned one later.'
              : 'Assigned when the user is created. Leave empty to skip.'
          }
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
          >
            <UserPlus className="me-1.5 h-4 w-4" />
            Add User
          </Button>
        </div>
      </form>
    </div>
  );
}
