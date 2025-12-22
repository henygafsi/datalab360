'use client';

import React, { useState } from 'react';
import { Modal, Button, Badge, Input, Text, Textarea } from 'rizzui';
import {
  X, MinusCircle, PlusCircle, AlertTriangle, Check, GitBranch
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColumnExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  table: string;
  column: string;
  dataType: string;
  isExcluded: boolean;
  exclusionReason?: string;
  onExclude: (reason: string) => void;
  onInclude: () => void;
}

const EXCLUSION_REASONS = [
  { id: 'deprecated', label: 'Deprecated Column', description: 'Column is no longer in use' },
  { id: 'duplicate', label: 'Duplicate Data', description: 'Data exists in another column' },
  { id: 'derived', label: 'Derived/Calculated', description: 'Will be calculated in DWH' },
  { id: 'internal', label: 'Internal Use Only', description: 'System/audit column' },
  { id: 'low_quality', label: 'Low Data Quality', description: 'Too many nulls or errors' },
  { id: 'not_needed', label: 'Not Needed', description: 'Not required for analytics' },
  { id: 'custom', label: 'Custom Reason', description: 'Enter your own reason' },
];

export const ColumnExclusionModal: React.FC<ColumnExclusionModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  table,
  column,
  dataType,
  isExcluded,
  exclusionReason,
  onExclude,
  onInclude,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(
    exclusionReason ? 'custom' : ''
  );
  const [customReason, setCustomReason] = useState(exclusionReason || '');

  const handleConfirm = () => {
    if (isExcluded) {
      onInclude();
    } else {
      const reason = selectedReason === 'custom'
        ? customReason
        : EXCLUSION_REASONS.find(r => r.id === selectedReason)?.label || 'Excluded';
      onExclude(reason);
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              isExcluded
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-slate-100 dark:bg-slate-700'
            )}>
              {isExcluded ? (
                <PlusCircle className="h-5 w-5 text-green-600" />
              ) : (
                <MinusCircle className="h-5 w-5 text-slate-600" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {isExcluded ? 'Include Column in Modeling' : 'Exclude Column from Modeling'}
              </h3>
              <p className="text-sm text-slate-500">
                <span className="font-mono">{column}</span> ({dataType})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isExcluded ? (
            // Include column
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Currently Excluded
                  </p>
                  {exclusionReason && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Reason: {exclusionReason}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400">
                Including this column will allow it to be mapped to target DWH columns in the modeling view.
              </p>

              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <GitBranch className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  After including, you can create ETL mappings for this column.
                </p>
              </div>
            </div>
          ) : (
            // Exclude column
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Excluding this column will prevent it from being mapped in the modeling view. Select a reason for exclusion:
              </p>

              {/* Reason Selection */}
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {EXCLUSION_REASONS.map((reason) => (
                  <button
                    key={reason.id}
                    onClick={() => setSelectedReason(reason.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-lg border-2 text-left transition-all',
                      selectedReason === reason.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div>
                      <p className="font-medium text-sm">{reason.label}</p>
                      <p className="text-xs text-slate-500">{reason.description}</p>
                    </div>
                    {selectedReason === reason.id && (
                      <Check className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Custom Reason Input */}
              {selectedReason === 'custom' && (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Custom Reason
                  </label>
                  <Textarea
                    className="mt-1"
                    placeholder="Enter your reason for excluding this column..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <MinusCircle className="h-5 w-5 text-slate-500 flex-shrink-0" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Excluded columns will not appear in the modeling canvas and cannot be mapped to target columns.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t dark:border-slate-700 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isExcluded && !selectedReason}
            className={cn(
              isExcluded
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-slate-600 hover:bg-slate-700'
            )}
          >
            {isExcluded ? (
              <>
                <PlusCircle className="h-4 w-4 mr-2" />
                Include in Modeling
              </>
            ) : (
              <>
                <MinusCircle className="h-4 w-4 mr-2" />
                Exclude from Modeling
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ColumnExclusionModal;
