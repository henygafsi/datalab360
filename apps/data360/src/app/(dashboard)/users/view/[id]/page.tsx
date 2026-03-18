'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Loader, Badge } from 'rizzui';
import { HiArrowLeft, HiPencil } from 'react-icons/hi2';
import PageHeader from '@/components/layout/PageHeader';
import apiClient from '@/lib/api-client';

interface UserDetails {
  username: string;
  login_name: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  comment: string;
  disabled: string;
  default_warehouse: string;
  default_namespace: string;
  default_role: string;
  default_secondary_roles: string;
  created_on: string;
  last_success_login: string;
  owner: string;
  has_password: string;
  has_rsa_public_key: string;
}

export default function UserViewPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const fetchUserDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      // ////to do//// Replace with actual API call when backend implements GET /gouvernance/users/{username}
      // const response = await apiClient.get(`/gouvernance/users/${userId}`);
      // setUser(response.data);

      // MOCK DATA - Remove when backend is ready
      const mockUser: UserDetails = {
        username: userId,
        login_name: `${userId.toLowerCase()}@example.com`,
        display_name: userId,
        first_name: userId.charAt(0) + userId.slice(1).toLowerCase(),
        last_name: 'User',
        email: `${userId.toLowerCase()}@gmail.com`,
        comment: 'Data Governor user',
        disabled: 'false',
        default_warehouse: 'COMPUTE_WH',
        default_namespace: 'CP_DATA360.PUBLIC',
        default_role: 'DATA_GOVERNER',
        default_secondary_roles: '[]',
        created_on: '2025-09-16T13:55:00Z',
        last_success_login: '2026-01-03T10:30:00Z',
        owner: 'ACCOUNTADMIN',
        has_password: 'true',
        has_rsa_public_key: 'false',
      };

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      setUser(mockUser);
    } catch (err: any) {
      console.error('Failed to fetch user details:', err);
      setError(err.message || 'Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader size="xl" variant="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <p className="font-semibold">Error loading user details</p>
          <p className="text-sm mt-1">{error}</p>
          <Button
            onClick={() => router.push('/gouvernance/users')}
            className="mt-4"
            size="sm"
          >
            Back to Users
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          <p>User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`User: ${user.display_name || user.username}`}
        subtitle="View complete user information and permissions"
        color="blue"
        actions={
          <>
            <Button
              onClick={() => router.push('/gouvernance/users')}
              variant="outline"
              className="gap-2"
            >
              <HiArrowLeft className="h-4 w-4" />
              Back to Users
            </Button>
            <Button
              onClick={() => router.push(`/users/edit/${userId}`)}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <HiPencil className="h-4 w-4" />
              Edit User
            </Button>
          </>
        }
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Basic Information
          </h3>
          <div className="space-y-3">
            <InfoRow label="Username" value={user.username} />
            <InfoRow label="Login Name" value={user.login_name} />
            <InfoRow label="Display Name" value={user.display_name} />
            <InfoRow label="First Name" value={user.first_name} />
            <InfoRow label="Last Name" value={user.last_name} />
            <InfoRow label="Email" value={user.email} />
            <InfoRow
              label="Status"
              value={
                <Badge
                  className={
                    user.disabled === 'false'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }
                >
                  {user.disabled === 'false' ? 'Active' : 'Disabled'}
                </Badge>
              }
            />
          </div>
        </div>

        {/* Snowflake Configuration */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Snowflake Configuration
          </h3>
          <div className="space-y-3">
            <InfoRow label="Default Role" value={user.default_role} />
            <InfoRow
              label="Secondary Roles"
              value={user.default_secondary_roles || '[]'}
            />
            <InfoRow label="Default Warehouse" value={user.default_warehouse} />
            <InfoRow label="Default Namespace" value={user.default_namespace} />
            <InfoRow label="Owner" value={user.owner} />
          </div>
        </div>

        {/* Security & Authentication */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Security & Authentication
          </h3>
          <div className="space-y-3">
            <InfoRow
              label="Has Password"
              value={
                <Badge
                  className={
                    user.has_password === 'true'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {user.has_password === 'true' ? 'Yes' : 'No'}
                </Badge>
              }
            />
            <InfoRow
              label="Has RSA Public Key"
              value={
                <Badge
                  className={
                    user.has_rsa_public_key === 'true'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {user.has_rsa_public_key === 'true' ? 'Yes' : 'No'}
                </Badge>
              }
            />
            <InfoRow
              label="Last Successful Login"
              value={
                user.last_success_login
                  ? new Date(user.last_success_login).toLocaleString()
                  : 'Never'
              }
            />
          </div>
        </div>

        {/* Additional Information */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Additional Information
          </h3>
          <div className="space-y-3">
            <InfoRow
              label="Created On"
              value={new Date(user.created_on).toLocaleString()}
            />
            <InfoRow label="Comment" value={user.comment || 'No comment'} />
          </div>
        </div>
      </div>

      {/* Backend Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
        <p className="font-semibold">ℹ️ Note:</p>
        <p className="text-sm mt-1">
          This page currently displays mock data. Once the backend implements{' '}
          <code className="bg-blue-100 px-1 rounded">
            GET /gouvernance/users/{'{username}'}
          </code>
          , real user data will be fetched.
        </p>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
        {label}:
      </span>
      <span className="text-sm text-gray-900 dark:text-white text-right max-w-xs">
        {value || 'N/A'}
      </span>
    </div>
  );
}
