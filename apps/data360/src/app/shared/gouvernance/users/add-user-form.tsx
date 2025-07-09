// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\users\add-user-form.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, SelectOption } from 'rizzui'; // Added Select, SelectOption
import { addUser, assignRoleToUser } from '@/app/services/gouvernance/fetch_users';
import { getRoles } from '@/app/services/gouvernance/fetch_roles'; // Import getRoles

type AddUserFormProps = {
  onAddUserSuccess: () => void;
  onClose: () => void;
};

export default function AddUserForm({ onAddUserSuccess, onClose }: AddUserFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>(''); // State for selected role
  const [availableRoles, setAvailableRoles] = useState<SelectOption[]>([]); // State for available roles
  const [loading, setLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true); // Loading state for roles
  const [error, setError] = useState<string | null>(null);

  // Fetch available roles on component mount
  useEffect(() => {
    const fetchRoles = async () => {
      setRolesLoading(true);
      try {
        const roles = await getRoles(); // Fetch roles from backend
        const roleOptions = roles.map(r => ({ label: r.role, value: r.role }));
        setAvailableRoles(roleOptions);
        if (roleOptions.length > 0) {
          setSelectedRole(roleOptions[0].value as string); // Select first role by default
        }
      } catch (err: any) {
        console.error('Failed to load roles for dropdown:', err);
        setError(err.message || 'Failed to load available roles.');
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!selectedRole) {
      setError("Please select a role for the user.");
      setLoading(false);
      return;
    }

    const username = `${firstName.toUpperCase()}${lastName.toUpperCase()}`;
    const defaultPassword = 'password123'; // Still hardcoded, consider secure password generation

    try {
      const userData = {
        username: username,
        password: defaultPassword,
        first_name: firstName,
        last_name: lastName,
        email: email,
      };
      await addUser(userData); // No accessToken parameter needed
      console.log('User added successfully:', username);

      await assignRoleToUser(username, selectedRole); // Use selected role
      console.log(`Role '${selectedRole}' assigned to user '${username}'`);

      onAddUserSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to add user or assign role:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="m-auto px-5 pb-8 pt-5 @lg:pt-6 @2xl:px-7">
      <div className="mb-6 flex items-center justify-between">
        <form onSubmit={handleSubmit} className="space-y-4 w-full">
          <div>
            <label htmlFor="firstName" className="block text-gray-700">First Name</label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
              required
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-gray-700">Last Name</label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-gray-700">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
              required
            />
          </div>
          <div>
            <label htmlFor="roleSelect" className="block text-gray-700">Assign Role</label>
            {rolesLoading ? (
              <div className="mt-1 text-gray-500">Loading roles...</div>
            ) : (
              <Select
                id="roleSelect"
                options={availableRoles}
                value={selectedRole}
                onChange={(value) => setSelectedRole(value?.value as string || '')}
                placeholder="Select a role"
                className="mt-1"
                required
              />
            )}
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <Button type="submit" className="mt-4 bg-blue-600 text-white" disabled={loading || rolesLoading || !selectedRole}>
            {loading ? 'Adding User...' : 'Add User'}
          </Button>
        </form>
      </div>
    </div>
  );
}