'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Modal, Button, Badge } from 'rizzui';
import {
  AlertTriangle, ArrowRight, RefreshCw, Trash2, Link2,
  Table2, ChevronRight, Shield, GitBranch, X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CascadeImpact {
  id: string;
  type: 'fk_reference' | 'policy_reference' | 'ingestion_reference' | 'view_reference';
  objectType: string;
  objectName: string;
  field: string;
  currentValue: string;
  newValue: string;
  severity: 'high' | 'medium' | 'low';
}

interface CascadeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (impacts: CascadeImpact[]) => void;
  action: 'rename' | 'drop';
  objectType: 'table' | 'column';
  objectName: string;
  newName?: string;
  impacts: CascadeImpact[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const impactTypeConfig: Record<CascadeImpact['type'], {
  icon: React.ComponentType<any>;
  label: string;
  color: string;
}> = {
  fk_reference: { icon: Link2, label: 'Foreign Key', color: 'bg-purple-100 text-purple-600' },
  policy_reference: { icon: Shield, label: 'Policy', color: 'bg-red-100 text-red-600' },
  ingestion_reference: { icon: RefreshCw, label: 'Ingestion', color: 'bg-green-100 text-green-600' },
  view_reference: { icon: Table2, label: 'View', color: 'bg-blue-100 text-blue-600' },
};

const severityColors: Record<CascadeImpact['severity'], string> = {
  high: 'bg-red-100 text-red-600 dark:bg-red-900/30',
  medium: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
};

// ── Component ──────────────────────────────────────────────────────────────────

const CascadeConfirmModal: React.FC<CascadeConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  action,
  objectType,
  objectName,
  newName,
  impacts,
}) => {
  const stats = useMemo(() => ({
    high: impacts.filter((i) => i.severity === 'high').length,
    medium: impacts.filter((i) => i.severity === 'medium').length,
    low: impacts.filter((i) => i.severity === 'low').length,
  }), [impacts]);

  const hasHighSeverity = stats.high > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize="560px">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            action === 'drop'
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-amber-100 dark:bg-amber-900/30',
          )}>
            {action === 'drop' ? (
              <Trash2 className="h-6 w-6 text-red-500" />
            ) : (
              <RefreshCw className="h-6 w-6 text-amber-500" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {action === 'drop' ? 'Drop' : 'Rename'} {objectType} — Cascade Impact
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {action === 'rename' ? (
                <>
                  Renaming <code className="text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1 rounded">{objectName}</code>
                  {' → '}
                  <code className="text-green-600 bg-green-50 dark:bg-green-900/30 px-1 rounded">{newName}</code>
                </>
              ) : (
                <>
                  Dropping <code className="text-red-600 bg-red-50 dark:bg-red-900/30 px-1 rounded">{objectName}</code>
                </>
              )}
              {' '}affects <strong>{impacts.length}</strong> dependent reference(s).
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Severity Summary */}
        <div className="flex items-center gap-3 mb-4">
          {stats.high > 0 && (
            <Badge className="bg-red-100 text-red-600 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {stats.high} high
            </Badge>
          )}
          {stats.medium > 0 && (
            <Badge className="bg-amber-100 text-amber-600 gap-1">
              {stats.medium} medium
            </Badge>
          )}
          {stats.low > 0 && (
            <Badge className="bg-slate-100 text-slate-600 gap-1">
              {stats.low} low
            </Badge>
          )}
        </div>

        {/* Impact List */}
        <div className="max-h-[300px] overflow-auto border dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700">
          {impacts.map((impact) => {
            const config = impactTypeConfig[impact.type];
            const ImpactIcon = config.icon;

            return (
              <div key={impact.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge size="sm" className={cn(severityColors[impact.severity], 'text-[10px] uppercase')}>
                    {impact.severity}
                  </Badge>
                  <Badge size="sm" className={cn(config.color, 'text-[10px]')}>
                    <ImpactIcon className="h-2.5 w-2.5 mr-0.5" />
                    {config.label}
                  </Badge>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {impact.objectName}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-1 text-xs">
                  <span className="text-slate-500">{impact.field}:</span>
                  <code className="text-red-500 line-through bg-red-50 dark:bg-red-900/20 px-1 rounded">
                    {impact.currentValue}
                  </code>
                  {action === 'rename' && (
                    <>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <code className="text-green-600 bg-green-50 dark:bg-green-900/20 px-1 rounded">
                        {impact.newValue}
                      </code>
                    </>
                  )}
                  {action === 'drop' && (
                    <span className="text-red-500 italic">will be orphaned</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning */}
        {hasHighSeverity && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Warning:</strong> High-severity impacts may cause data integrity issues.
              All dependent references will be {action === 'rename' ? 'auto-updated' : 'orphaned'} atomically.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            className={cn(
              'flex-1 gap-2 text-white',
              action === 'drop'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700',
            )}
            onClick={() => onConfirm(impacts)}
          >
            {action === 'rename' ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Auto-Update All ({impacts.length})
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Drop & Orphan ({impacts.length})
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CascadeConfirmModal;
