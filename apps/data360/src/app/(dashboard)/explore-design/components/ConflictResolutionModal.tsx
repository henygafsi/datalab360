'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  AlertTriangle, Users, GitBranch, Check, X, ArrowRight,
  Merge, User, Clock,
} from 'lucide-react';
import DesignDockPanel from './DesignDockPanel';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ConflictVersion {
  user: string;
  timestamp: string;
  changes: Record<string, { old: string; new: string }>;
}

export interface EventConflict {
  eventId: string;
  eventType: string;
  objectName: string;
  yours: ConflictVersion;
  theirs: ConflictVersion;
}

type Resolution = 'mine' | 'theirs' | 'manual';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: EventConflict | null;
  onResolve: (resolution: Resolution, mergedChanges?: Record<string, string>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  conflict,
  onResolve,
}) => {
  const [selectedResolution, setSelectedResolution] = useState<Resolution | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});

  if (!conflict) return null;

  const allFields = new Set([
    ...Object.keys(conflict.yours.changes),
    ...Object.keys(conflict.theirs.changes),
  ]);

  const handleResolve = () => {
    if (!selectedResolution) return;
    if (selectedResolution === 'manual') {
      onResolve('manual', manualValues);
    } else {
      onResolve(selectedResolution);
    }
    onClose();
  };

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Conflict Detected"
      subtitle={`${conflict.objectName} was modified by another user while you were editing.`}
      widthClass="max-w-2xl"
      icon={
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
      }
      footer={
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleResolve}
            disabled={!selectedResolution}
          >
            <Check className="h-4 w-4" />
            Resolve Conflict
          </Button>
        </div>
      }
    >
      <div>
        {/* Users */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex-1 flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <User className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Your changes</p>
              <p className="text-[10px] text-blue-500">
                {new Date(conflict.yours.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
          <GitBranch className="h-5 w-5 text-slate-300 rotate-90" />
          <div className="flex-1 flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <Users className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                {conflict.theirs.user}'s changes
              </p>
              <p className="text-[10px] text-purple-500">
                {new Date(conflict.theirs.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Side-by-Side Diff */}
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden mb-5">
          <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800">
            <div className="px-3 py-2 text-xs font-medium text-slate-500">Field</div>
            <div className="px-3 py-2 text-xs font-medium text-blue-600 border-l dark:border-slate-700">
              Yours
            </div>
            <div className="px-3 py-2 text-xs font-medium text-purple-600 border-l dark:border-slate-700">
              {conflict.theirs.user}'s
            </div>
          </div>

          <div className="divide-y dark:divide-slate-700">
            {Array.from(allFields).map((field) => {
              const mine = conflict.yours.changes[field];
              const theirs = conflict.theirs.changes[field];
              const isDifferent = mine?.new !== theirs?.new;

              return (
                <div
                  key={field}
                  className={cn(
                    'grid grid-cols-3',
                    isDifferent ? 'bg-amber-50/50 dark:bg-amber-900/10' : '',
                  )}
                >
                  <div className="px-3 py-2 text-sm font-mono font-medium flex items-center gap-1">
                    {isDifferent && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {field}
                  </div>
                  <div className="px-3 py-2 border-l dark:border-slate-700">
                    {mine ? (
                      <div className="text-xs">
                        <span className="text-slate-400 line-through">{mine.old}</span>
                        <ArrowRight className="h-2.5 w-2.5 inline mx-1 text-slate-400" />
                        <span className="text-blue-600 font-medium">{mine.new}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">no change</span>
                    )}
                  </div>
                  <div className="px-3 py-2 border-l dark:border-slate-700">
                    {theirs ? (
                      <div className="text-xs">
                        <span className="text-slate-400 line-through">{theirs.old}</span>
                        <ArrowRight className="h-2.5 w-2.5 inline mx-1 text-slate-400" />
                        <span className="text-purple-600 font-medium">{theirs.new}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">no change</span>
                    )}
                  </div>

                  {/* Manual merge field */}
                  {selectedResolution === 'manual' && isDifferent && (
                    <div className="col-span-3 px-3 pb-2">
                      <label className="text-[10px] text-slate-500 mb-1 block">Merged value for {field}:</label>
                      <input
                        type="text"
                        value={manualValues[field] ?? mine?.new ?? theirs?.new ?? ''}
                        onChange={(e) => setManualValues((p) => ({ ...p, [field]: e.target.value }))}
                        className="w-full text-xs px-2 py-1.5 border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Resolution Options */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            {
              key: 'mine' as Resolution,
              label: 'Accept Mine',
              desc: 'Keep your changes',
              color: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
              activeColor: 'ring-2 ring-blue-500/50',
              icon: User,
              iconColor: 'text-blue-500',
            },
            {
              key: 'theirs' as Resolution,
              label: `Accept ${conflict.theirs.user}'s`,
              desc: 'Use their changes',
              color: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20',
              activeColor: 'ring-2 ring-purple-500/50',
              icon: Users,
              iconColor: 'text-purple-500',
            },
            {
              key: 'manual' as Resolution,
              label: 'Merge Manually',
              desc: 'Pick values per field',
              color: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20',
              activeColor: 'ring-2 ring-amber-500/50',
              icon: Merge,
              iconColor: 'text-amber-500',
            },
          ].map((opt) => {
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.key}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  selectedResolution === opt.key
                    ? `${opt.color} ${opt.activeColor}`
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300',
                )}
                onClick={() => setSelectedResolution(opt.key)}
              >
                <OptIcon className={cn('h-5 w-5 mb-1.5', opt.iconColor)} />
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-[10px] text-slate-500">{opt.desc}</p>
              </button>
            );
          })}
        </div>

      </div>
    </DesignDockPanel>
  );
};

export default ConflictResolutionModal;
