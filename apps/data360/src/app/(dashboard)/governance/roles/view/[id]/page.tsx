'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { HiOutlineShieldCheck, HiOutlinePencil, HiOutlineArrowLeft } from 'react-icons/hi2';
import { Button, Input, Badge, Text } from 'rizzui';
import PageHeader from '@/components/layout/PageHeader';
import { getRoleDetails } from '@/app/services/governance/fetch_roles';
import { getRolesForGrantsMatrix } from '@/app/services/governance/fetch_grants';
import { RoleTableDataType } from '@/app/shared/governance/roles/table';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

export default function ViewRolePage() {
  const params = useParams();
  const router = useRouter();
  const roleId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleData, setRoleData] = useState<RoleTableDataType | null>(null);
  const [grants, setGrants] = useState<any[]>([]);

  useEffect(() => {
    if (!roleId) {
      setError('Role ID is required');
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRoleDetails(decodeURIComponent(roleId));
        setRoleData(data);

        // Try to fetch grants for this role
        try {
          const grantsData = await getRolesForGrantsMatrix(data.role);
          setGrants(Array.isArray(grantsData) ? grantsData : []);
        } catch (grantsErr) {
          console.warn('Could not fetch grants:', grantsErr);
          setGrants([]);
        }
      } catch (err: any) {
        console.error('Error fetching role:', err);
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to fetch role details';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [roleId]);

  const handleEdit = () => {
    router.push(`/governance/roles/edit/${roleId}`);
  };

  const handleBack = () => {
    router.push('/governance/roles');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<HiOutlineShieldCheck className="h-6 w-6" />}
          title="View Role"
          subtitle="Loading role details..."
          color="emerald"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (error || !roleData) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<HiOutlineShieldCheck className="h-6 w-6" />}
          title="View Role"
          subtitle="Error loading role"
          color="emerald"
        />
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <ErrorDisplay
            error={error || 'Role not found'}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<HiOutlineShieldCheck className="h-6 w-6" />}
        title={roleData.role}
        subtitle="Role details and permissions"
        color="emerald"
        badges={
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            {roleData.numberOfGrants} Grant{roleData.numberOfGrants !== 1 ? 's' : ''}
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
              Back to Roles
            </Button>
            <Button
              onClick={handleEdit}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <HiOutlinePencil className="h-4 w-4" />
              Edit Role
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Information Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4">Role Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Role Name
              </label>
              <Input
                value={roleData.role}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Number of Grants
              </label>
              <Input
                value={roleData.numberOfGrants.toString()}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Created On
              </label>
              <Input
                value={roleData.createdOn ? new Date(roleData.createdOn).toLocaleString() : 'N/A'}
                disabled
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Comment
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 min-h-[80px]">
                <Text className="text-sm text-gray-700 dark:text-gray-300">
                  {roleData.comment || 'No comment available'}
                </Text>
              </div>
            </div>
          </div>
        </div>

        {/* Grants/Permissions Card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <h3 className="text-lg font-semibold mb-4">Grants & Permissions</h3>
          {grants.length > 0 ? (
            <div className="space-y-2">
              {grants.slice(0, 10).map((grant, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">
                      {grant.privilege || grant.name || 'Grant'}
                    </Text>
                    <Badge variant="outline" size="sm">
                      {grant.granted_on || grant.type || 'Permission'}
                    </Badge>
                  </div>
                  {grant.name && grant.name !== grant.privilege && (
                    <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      On: {grant.name}
                    </Text>
                  )}
                </div>
              ))}
              {grants.length > 10 && (
                <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-4">
                  + {grants.length - 10} more grant{grants.length - 10 !== 1 ? 's' : ''}
                </Text>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Text className="text-gray-500 dark:text-gray-400">
                No grants information available
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
