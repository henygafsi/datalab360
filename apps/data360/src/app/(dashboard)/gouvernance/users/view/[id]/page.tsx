'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { HiOutlineUser, HiOutlinePencil, HiOutlineArrowLeft } from 'react-icons/hi2';
import { Button, Input, Badge, Text } from 'rizzui';
import PageHeader from '@/components/layout/PageHeader';
import { getUserDetails } from '@/app/services/gouvernance/fetch_users';
import { UserTableDataType } from '@/app/shared/gouvernance/users/table';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

export default function ViewUserPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserTableDataType | null>(null);

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
      } catch (err: any) {
        console.error('Error fetching user:', err);
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to fetch user details';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId]);

  const handleEdit = () => {
    router.push(`/gouvernance/users/edit/${userId}`);
  };

  const handleBack = () => {
    router.push('/gouvernance/users');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<HiOutlineUser className="h-6 w-6" />}
          title="View User"
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
          title="View User"
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
        title={userData.name}
        subtitle="User details and role assignments"
        color="blue"
        badges={
          <Badge
            className={`px-3 py-1 ${
              userData.status === 'Active'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {userData.status}
          </Badge>
        }
        actions={
          <>
            <Button
              onClick={handleBack}
              variant="outline"
              className="flex items-center gap-2"
            >
              <HiOutlineArrowLeft className="h-4 w-4" />
              Back to Users
            </Button>
            <Button
              onClick={handleEdit}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <HiOutlinePencil className="h-4 w-4" />
              Edit User
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <Input
                value={userData.id}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <Input
                value={userData.name || 'N/A'}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                First Name
              </label>
              <Input
                value={userData.firstName || 'N/A'}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Last Name
              </label>
              <Input
                value={userData.lastName || 'N/A'}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <Input
                value={userData.email || 'N/A'}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>
          </div>
        </div>

        {/* Account Information Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4">Account Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                <Badge
                  className={`${
                    userData.status === 'Active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {userData.status}
                </Badge>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Created On
              </label>
              <Input
                value={userData.createdOn ? new Date(userData.createdOn).toLocaleString() : 'N/A'}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assigned Roles
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 min-h-[100px]">
                {userData.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {userData.roles.map((role, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200"
                      >
                        {role}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Text className="text-gray-500 dark:text-gray-400 text-sm">
                    No roles assigned
                  </Text>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Number of Roles
              </label>
              <Input
                value={userData.roles.length.toString()}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        <h3 className="text-lg font-semibold mb-4">Security & Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Text className="text-sm text-gray-600 dark:text-gray-400 mb-1">Account Status</Text>
            <Text className="text-lg font-semibold">
              {userData.status === 'Active' ? '🟢 Active' : '🔴 Disabled'}
            </Text>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Text className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Roles</Text>
            <Text className="text-lg font-semibold">
              {userData.roles.length}
            </Text>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Text className="text-sm text-gray-600 dark:text-gray-400 mb-1">Account Age</Text>
            <Text className="text-lg font-semibold">
              {userData.createdOn
                ? Math.floor(
                    (new Date().getTime() - new Date(userData.createdOn).getTime()) /
                      (1000 * 60 * 60 * 24)
                  ) + ' days'
                : 'N/A'}
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
