'use client';

import { useState } from 'react';
import { Badge, Button } from 'rizzui';
import {
  PiTrash,
  PiInfo,
  PiPlay,
  PiShieldCheck,
  PiTable,
  PiUser,
  PiXCircle,
  PiCaretDown,
  PiCaretUp,
  PiWarning,
} from 'react-icons/pi';
import toast from 'react-hot-toast';
import { useCanPerform } from '@/hooks/useCanPerform';
import type { EnrichedPolicy, GrantedObject } from '@/app/services/governance/policies';
import { unapplyPolicyFromAll, formatPolicyError } from '@/app/services/governance/policies';

interface PolicyCardProps {
  policy: EnrichedPolicy;
  accentColor: string;
  policyType: string;
  children?: React.ReactNode;
  onViewDetails?: (policy: EnrichedPolicy) => void;
  onApply?: (policy: EnrichedPolicy) => void;
  onDelete: (policy: EnrichedPolicy) => Promise<void>;
  onRevokeObject?: (policy: EnrichedPolicy, obj: GrantedObject) => Promise<void>;
  onRefresh?: () => void;
  applyLabel?: string;
  entityLabel?: string;
}

const ACCENT_CLASSES: Record<string, { badge: string; button: string; border: string }> = {
  purple: { badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', button: 'text-purple-600 hover:bg-purple-50', border: 'border-l-purple-400' },
  amber: { badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', button: 'text-amber-600 hover:bg-amber-50', border: 'border-l-amber-400' },
  cyan: { badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300', button: 'text-cyan-600 hover:bg-cyan-50', border: 'border-l-cyan-400' },
  blue: { badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', button: 'text-blue-600 hover:bg-blue-50', border: 'border-l-blue-400' },
  red: { badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', button: 'text-red-600 hover:bg-red-50', border: 'border-l-red-400' },
  indigo: { badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300', button: 'text-indigo-600 hover:bg-indigo-50', border: 'border-l-indigo-400' },
  green: { badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', button: 'text-green-600 hover:bg-green-50', border: 'border-l-green-400' },
  violet: { badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300', button: 'text-violet-600 hover:bg-violet-50', border: 'border-l-violet-400' },
  teal: { badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300', button: 'text-teal-600 hover:bg-teal-50', border: 'border-l-teal-400' },
};

export default function PolicyCard({
  policy,
  accentColor,
  policyType,
  children,
  onViewDetails,
  onApply,
  onDelete,
  onRevokeObject,
  onRefresh,
  applyLabel = 'Apply',
  entityLabel = 'object(s)',
}: PolicyCardProps) {
  const [showAllObjects, setShowAllObjects] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // System 2 Action-RBAC: deleting a policy → gouvernance:delete; removing it
  // from an object → gouvernance:revoke. Fail-open while the allow-set loads.
  const deletePerm = useCanPerform('gouvernance', 'delete');
  const revokePerm = useCanPerform('gouvernance', 'revoke');
  // Applying a policy to an object → gouvernance:apply (same action the
  // policy-content apply panels gate their submit with). Fail-open while loading.
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canDeletePolicy = deletePerm.allowed || deletePerm.loading;
  const canRevokePolicy = revokePerm.allowed || revokePerm.loading;
  const canApplyPolicy = applyPerm.allowed || applyPerm.loading;

  const accent = ACCENT_CLASSES[accentColor] || ACCENT_CLASSES.purple;
  const { granted_objects, granted_roles, granted_objects_count } = policy;
  const visibleObjects = showAllObjects ? granted_objects : granted_objects.slice(0, 3);

  const handleRevoke = async (obj: GrantedObject) => {
    if (!onRevokeObject) return;
    setRevoking(obj.display);
    try {
      await onRevokeObject(policy, obj);
      toast.success(`Revoked from ${obj.display}`);
      onRefresh?.();
    } catch (err: any) {
      toast.error(formatPolicyError(err, 'Failed to revoke'));
    } finally {
      setRevoking(null);
    }
  };

  const executeDelete = async () => {
    setDeleting(true);
    try {
      if (granted_objects_count > 0) {
        await unapplyPolicyFromAll(policyType, policy.name);
      }
      await onDelete(policy);
      toast.success(`Policy "${policy.name}" deleted`);
      setConfirmDelete(false);
      onRefresh?.();
    } catch (err: any) {
      toast.error(formatPolicyError(err, 'Failed to delete policy'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 ${accent.border} rounded-xl p-5 hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900 dark:text-white truncate">{policy.name}</h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {policy.schema_name && (
              <span className="text-xs text-slate-500">{policy.schema_name}</span>
            )}
            {policy.created_on && (
              <span className="text-xs text-slate-400">
                {new Date(policy.created_on).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {policy.expiration_date && (
            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-[10px]">
              Expires {new Date(policy.expiration_date).toLocaleDateString()}
            </Badge>
          )}
          {granted_objects_count > 0 && (
            <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">
              <PiTable className="w-3 h-3 mr-0.5 inline" />{granted_objects_count}
            </Badge>
          )}
        </div>
      </div>

      {/* Comment */}
      {policy.comment && (
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">{policy.comment}</p>
      )}

      {/* Type-specific content (children slot) */}
      {children}

      {/* Applied to (granted_objects) */}
      {onRevokeObject && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-1.5 mb-2">
            <PiShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Applied to
            </span>
          </div>
          {granted_objects.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Not applied to any {entityLabel}</p>
          ) : (
            <div className="space-y-1">
              {visibleObjects.map((obj) => (
                <div key={obj.display} className="flex items-center justify-between gap-2 py-1 px-2 rounded-md bg-slate-50 dark:bg-slate-700/40 group">
                  <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{obj.display}</span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(obj)}
                    disabled={revoking === obj.display || !canRevokePolicy}
                    className="shrink-0 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                    title={canRevokePolicy ? 'Revoke' : 'You lack the "revoke" permission on governance. Ask an administrator to grant it.'}
                  >
                    {revoking === obj.display ? (
                      <span className="text-[10px]">...</span>
                    ) : (
                      <PiXCircle className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
              {granted_objects.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllObjects(!showAllObjects)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 mt-1"
                >
                  {showAllObjects ? <PiCaretUp className="w-3 h-3" /> : <PiCaretDown className="w-3 h-3" />}
                  {showAllObjects ? 'Show less' : `Show all ${granted_objects.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roles */}
      {granted_roles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-1.5 mb-2">
            <PiUser className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Roles
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {granted_roles.map((role) => (
              <Badge key={role} className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px]">
                {role}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Inline delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
          <p className="text-sm text-red-800 dark:text-red-200 mb-2">
            {granted_objects_count > 0
              ? `This will remove "${policy.name}" from ${granted_objects_count} ${entityLabel} and delete it.`
              : `Delete "${policy.name}"? This cannot be undone.`}
          </p>
          {granted_objects_count > 0 && (
            <div className="mb-2 space-y-0.5">
              {granted_objects.slice(0, 3).map((o) => (
                <p key={o.display} className="text-xs font-mono text-red-600 dark:text-red-300">• {o.display}</p>
              ))}
              {granted_objects_count > 3 && (
                <p className="text-xs text-red-500">… and {granted_objects_count - 3} more</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={executeDelete} disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 text-xs gap-1">
              {deleting ? 'Deleting…' : 'Confirm delete'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}
              className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
        {onViewDetails && (
          <Button variant="outline" size="sm" onClick={() => onViewDetails(policy)} className="gap-1">
            <PiInfo className="w-3.5 h-3.5" /> Details
          </Button>
        )}
        {onApply && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApply(policy)}
            disabled={!canApplyPolicy}
            title={!canApplyPolicy ? 'You lack the "apply" permission on governance. Ask an administrator to grant it.' : undefined}
            className={`gap-1 ${accent.button}`}
          >
            <PiPlay className="w-3.5 h-3.5" /> {applyLabel}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          disabled={deleting || confirmDelete || !canDeletePolicy}
          title={!canDeletePolicy ? 'You lack the "delete" permission on governance. Ask an administrator to grant it.' : undefined}
          className="gap-1 text-red-600 hover:bg-red-50 ml-auto"
        >
          {granted_objects_count > 0 && <PiWarning className="w-3.5 h-3.5" />}
          <PiTrash className="w-3.5 h-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}
