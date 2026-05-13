'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Input, Loader, Select, Textarea } from 'rizzui';
import { HiArrowLeft, HiCheck } from 'react-icons/hi2';
import PageHeader from '@/components/layout/PageHeader';
import apiClient from '@/lib/api-client';
import { toast } from 'react-hot-toast';

interface UserEditForm {
  email: string;
  first_name: string;
  last_name: string;
  default_role: string;
  default_warehouse: string;
  comment: string;
  disabled: boolean;
}

export default function UserEditPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [formData, setFormData] = useState<UserEditForm>({
    email: '',
    first_name: '',
    last_name: '',
    default_role: '',
    default_warehouse: '',
    comment: '',
    disabled: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  const fetchUserData = async () => {
    setLoading(true);
    setError(null);
    try {
      // ////to do//// Replace with actual API call when backend implements GET /gouvernance/users/{username}
      // const response = await apiClient.get(`/gouvernance/users/${userId}`);
      // setFormData({
      //   email: response.data.email,
      //   first_name: response.data.first_name,
      //   last_name: response.data.last_name,
      //   default_role: response.data.default_role,
      //   default_warehouse: response.data.default_warehouse,
      //   comment: response.data.comment,
      //   disabled: response.data.disabled === 'true',
      // });

      // MOCK DATA - Remove when backend is ready
      await new Promise(resolve => setTimeout(resolve, 500));
      setFormData({
        email: `${userId.toLowerCase()}@gmail.com`,
        first_name: userId.charAt(0) + userId.slice(1).toLowerCase(),
        last_name: 'User',
        default_role: 'DATA_GOVERNER',
        default_warehouse: 'COMPUTE_WH',
        comment: 'Data Governor user',
        disabled: false,
      });
    } catch (err: any) {
      console.error('Failed to fetch user data:', err);
      setError(err.message || 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // ////to do//// Replace with actual API call when backend implements PUT /gouvernance/users/{username}
      // await apiClient.put(`/gouvernance/users/${userId}`, formData);

      // MOCK SUCCESS - Remove when backend is ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast.success(`User ${userId} updated successfully!`);
      router.push('/governance/users');
    } catch (err: any) {
      console.error('Failed to update user:', err);
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
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
          <p className="font-semibold">Error loading user data</p>
          <p className="text-sm mt-1">{error}</p>
          <Button
            onClick={() => router.push('/governance/users')}
            className="mt-4"
            size="sm"
          >
            Back to Users
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit User: ${userId}`}
        subtitle="Update user information and settings"
        color="blue"
        actions={
          <Button
            onClick={() => router.push('/governance/users')}
            variant="outline"
            className="gap-2"
          >
            <HiArrowLeft className="h-4 w-4" />
            Back to Users
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Basic Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={formData.first_name}
              onChange={(e) =>
                setFormData({ ...formData, first_name: e.target.value })
              }
              placeholder="Enter first name"
              required
            />
            <Input
              label="Last Name"
              value={formData.last_name}
              onChange={(e) =>
                setFormData({ ...formData, last_name: e.target.value })
              }
              placeholder="Enter last name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="user@example.com"
              required
              className="md:col-span-2"
            />
          </div>
        </div>

        {/* Snowflake Configuration */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Snowflake Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Default Role"
              value={formData.default_role}
              onChange={(value) =>
                setFormData({ ...formData, default_role: value as string })
              }
              options={[
                { value: 'DATA_GOVERNER', label: 'DATA_GOVERNER' },
                { value: 'DATA_MODELER', label: 'DATA_MODELER' },
                { value: 'ACCOUNTADMIN', label: 'ACCOUNTADMIN' },
                { value: 'SYSADMIN', label: 'SYSADMIN' },
                { value: 'PUBLIC', label: 'PUBLIC' },
              ]}
            />
            <Select
              label="Default Warehouse"
              value={formData.default_warehouse}
              onChange={(value) =>
                setFormData({ ...formData, default_warehouse: value as string })
              }
              options={[
                { value: 'COMPUTE_WH', label: 'COMPUTE_WH' },
                { value: 'ANALYTICS_WH', label: 'ANALYTICS_WH' },
                { value: 'LOAD_WH', label: 'LOAD_WH' },
              ]}
            />
          </div>
        </div>

        {/* Additional Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Additional Settings
          </h3>
          <div className="space-y-4">
            <Textarea
              label="Comment"
              value={formData.comment}
              onChange={(e) =>
                setFormData({ ...formData, comment: e.target.value })
              }
              placeholder="Add a comment about this user..."
              rows={3}
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="disabled"
                checked={formData.disabled}
                onChange={(e) =>
                  setFormData({ ...formData, disabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="disabled"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Disable this user account
              </label>
            </div>
          </div>
        </div>

        {/* Backend Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
          <p className="font-semibold">ℹ️ Note:</p>
          <p className="text-sm mt-1">
            This form is ready but currently uses mock data. Once the backend
            implements{' '}
            <code className="bg-blue-100 px-1 rounded">
              PUT /governance/users/{'{username}'}
            </code>
            , changes will be saved to Snowflake.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/governance/users')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader size="sm" variant="spinner" />
                Saving...
              </>
            ) : (
              <>
                <HiCheck className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
