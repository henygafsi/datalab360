'use client';

import { useState, useEffect } from 'react';
import { toMessage } from '@/lib/error-messages';
import { useParams, useRouter } from 'next/navigation';
import { HiOutlineUser } from 'react-icons/hi2';
import { Button, Input } from 'rizzui';
import PageHeader from '@/components/layout/PageHeader';
import { getUserDetails, updateUser } from '@/app/services/governance/fetch_users';
import { toServiceError } from '@/app/services/_errors';
import { useCanPerform } from '@/hooks/useCanPerform';
import { UserTableDataType } from '@/app/shared/governance/users/table';
import { toast } from 'react-hot-toast';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { useTrackEvent } from '@/hooks/useTrackEvent';

export default function EditUserPage() {
  useTrackEvent(); // fire-and-forget PAGE_VIEW on mount/route change
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserTableDataType | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    displayName: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const { allowed: canSave } = useCanPerform('gouvernance', 'create');

  useEffect(() => {
    if (!userId) {
      setError('User ID is required');
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getUserDetails(decodeURIComponent(userId));
        setUserData(data);
        setFormData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          displayName: data.name || '',
        });
      } catch (err: any) {
        console.error('Error fetching user:', err);
        const errorMessage = toMessage(err, 'Failed to fetch user details');
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId]);

  const handleSave = async () => {
    if (!userData) return;

    try {
      setIsSaving(true);
      await updateUser(userData.id, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        display_name: formData.displayName,
      });
      toast.success(`Utilisateur ${userData.name} mis à jour`);
      router.push('/governance/users');
    } catch (err: any) {
      console.error('Error updating user:', err);
      const errorMessage = toServiceError(err, 'Erreur lors de la mise à jour').message;
      toast.error(`${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/governance/users');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<HiOutlineUser className="h-6 w-6" />}
          title="Edit User"
          subtitle="Loading user details..."
          color="blue"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<HiOutlineUser className="h-6 w-6" />}
          title="Edit User"
          subtitle="Error loading user"
          color="blue"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <ErrorDisplay
            error={error || 'User not found'}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<HiOutlineUser className="h-6 w-6" />}
        title={`Edit User: ${userData.name}`}
        subtitle="Update user information"
        color="blue"
      />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        <div className="max-w-2xl space-y-6">
          {/* Username (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <Input
              value={userData.id}
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Username cannot be changed
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email *
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@company.com"
              required
            />
          </div>

          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              First Name
            </label>
            <Input
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="John"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Last Name
            </label>
            <Input
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Doe"
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Display Name
            </label>
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="John Doe"
            />
          </div>

          {/* Status (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <Input
              value={userData.status}
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use the toggle button in the user list to enable/disable users
            </p>
          </div>

          {/* Roles (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Assigned Roles
            </label>
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-700">
              {userData.roles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {userData.roles.map((role, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-gray-500 dark:text-gray-400 text-sm">No roles assigned</span>
              )}
            </div>
          </div>

          {/* Created On (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Created On
            </label>
            <Input
              value={userData.createdOn ? new Date(userData.createdOn).toLocaleString() : 'N/A'}
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={!canSave || isSaving || !formData.email}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
