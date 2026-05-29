'use client';

import { useState } from 'react';
import { Button, Input, Password } from 'rizzui';
import { addUser } from '@/app/services/governance/fetch_users';
import { UserPlus, User, Mail, Lock, X } from 'lucide-react';


type AddUserFormProps = {
  onAddUserSuccess?: () => void;
  onClose: () => void;
};

export default function AddUserForm({ onAddUserSuccess, onClose }: AddUserFormProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await addUser({ username, password, email });
      onAddUserSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
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
