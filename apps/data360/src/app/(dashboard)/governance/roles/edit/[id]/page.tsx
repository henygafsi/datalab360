'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { HiOutlineShieldCheck } from 'react-icons/hi2';
import { Button, Input, Textarea } from 'rizzui';
import PageHeader from '@/components/layout/PageHeader';
import { getRoleForEdit, updateRole } from '@/app/services/governance/fetch_roles';
import { RoleTableDataType } from '@/app/shared/governance/roles/table';
import { toast } from 'react-hot-toast';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

export default function EditRolePage() {
  const params = useParams();
  const router = useRouter();
  const roleId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleData, setRoleData] = useState<RoleTableDataType | null>(null);
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
        const data = await getRoleForEdit(decodeURIComponent(roleId));
        setRoleData(data);
        setComment(data.comment || '');
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

  const handleSave = async () => {
    if (!roleData) return;

    try {
      setIsSaving(true);
      await updateRole(roleData.role, { comment });
      toast.success(`✅ Rôle ${roleData.role} mis à jour avec succès`);
      router.push('/governance/roles');
    } catch (err: any) {
      console.error('Error updating role:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Erreur lors de la mise à jour';
      toast.error(`❌ ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/governance/roles');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<HiOutlineShieldCheck className="h-6 w-6" />}
          title="Edit Role"
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
          title="Edit Role"
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
        title={`Edit Role: ${roleData.role}`}
        subtitle="Update role information and settings"
        color="emerald"
      />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        <div className="max-w-2xl space-y-6">
          {/* Role Name (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Role Name
            </label>
            <Input
              value={roleData.role}
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Role name cannot be changed
            </p>
          </div>

          {/* Number of Grants (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Number of Grants
            </label>
            <Input
              value={roleData.numberOfGrants.toString()}
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
          </div>

          {/* Created On (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Created On
            </label>
            <Input
              value={roleData.createdOn ? new Date(roleData.createdOn).toLocaleString() : 'N/A'}
              disabled
              className="bg-gray-100 dark:bg-gray-700"
            />
          </div>

          {/* Comment (Editable) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Comment
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter role description or notes..."
              rows={4}
              className="w-full"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
