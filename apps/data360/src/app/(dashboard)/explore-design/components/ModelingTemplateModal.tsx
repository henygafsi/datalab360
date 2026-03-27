'use client';

import React, { useState } from 'react';
import { Modal, Button, Badge } from 'rizzui';
import {
  Database, Layers, Sparkles, ArrowRight, Box, Grid3X3,
  Table2, GitBranch, Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ModelingChoice = 'dwh_template' | 'scratch';

interface ModelingTemplateModalProps {
  isOpen: boolean;
  onSelect: (choice: ModelingChoice) => void;
  projectName?: string;
}

const ModelingTemplateModal: React.FC<ModelingTemplateModalProps> = ({
  isOpen,
  onSelect,
  projectName,
}) => {
  const [selected, setSelected] = useState<ModelingChoice | null>(null);

  const handleConfirm = () => {
    if (!selected) return;
    onSelect(selected);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} customSize="680px">
      <div className="p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 mb-4">
            <Workflow className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Start Modeling
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {projectName ? (
              <>Choose how to begin modeling for <span className="font-medium text-slate-700 dark:text-slate-300">{projectName}</span></>
            ) : (
              'Choose a starting point for your data model'
            )}
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* DWH Template */}
          <button
            onClick={() => setSelected('dwh_template')}

            className={cn(
              'relative group text-left rounded-xl border-2 p-5 transition-all duration-200',
              selected === 'dwh_template'
                ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20 shadow-lg shadow-indigo-500/10'
                : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-slate-50 dark:hover:bg-slate-800/50',
            )}
          >
            {/* Recommended badge */}
            <div className="absolute -top-2.5 left-4">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm">
                <Sparkles className="h-2.5 w-2.5" />
                Recommended
              </span>
            </div>

            {/* Icon */}
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors',
                selected === 'dwh_template'
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30',
              )}
            >
              <Database
                className={cn(
                  'h-6 w-6 transition-colors',
                  selected === 'dwh_template'
                    ? 'text-white'
                    : 'text-slate-500 group-hover:text-indigo-600',
                )}
              />
            </div>

            {/* Content */}
            <h3 className={cn(
              'text-base font-semibold mb-1',
              selected === 'dwh_template'
                ? 'text-indigo-700 dark:text-indigo-300'
                : 'text-slate-900 dark:text-white',
            )}>
              Use DWH Template
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Pre-loaded with our standard Data Warehouse schema including tables,
              relationships and structure.
            </p>

            {/* Features */}
            <div className="space-y-1.5">
              {[
                { icon: Table2, text: 'Retail DWH tables pre-loaded' },
                { icon: GitBranch, text: 'Foreign key relationships included' },
                { icon: Layers, text: 'Ready for source-to-target mapping' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2">
                  <Icon className={cn(
                    'h-3 w-3 shrink-0',
                    selected === 'dwh_template' ? 'text-indigo-500' : 'text-slate-400',
                  )} />
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">{text}</span>
                </div>
              ))}
            </div>

            {/* Selection indicator */}
            {selected === 'dwh_template' && (
              <div className="absolute top-4 right-4">
                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </button>

          {/* Start from Scratch */}
          <button
            onClick={() => setSelected('scratch')}

            className={cn(
              'relative group text-left rounded-xl border-2 p-5 transition-all duration-200',
              selected === 'scratch'
                ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-900/20 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10'
                : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-800/50',
            )}
          >
            {/* Spacer for alignment with recommended badge */}
            <div className="h-0 mb-0" />

            {/* Icon */}
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors',
                selected === 'scratch'
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30',
              )}
            >
              <Grid3X3
                className={cn(
                  'h-6 w-6 transition-colors',
                  selected === 'scratch'
                    ? 'text-white'
                    : 'text-slate-500 group-hover:text-emerald-600',
                )}
              />
            </div>

            {/* Content */}
            <h3 className={cn(
              'text-base font-semibold mb-1',
              selected === 'scratch'
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-slate-900 dark:text-white',
            )}>
              Start from Scratch
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Begin with a blank canvas. Add tables from your catalog and
              build your model step by step.
            </p>

            {/* Features */}
            <div className="space-y-1.5">
              {[
                { icon: Box, text: 'Empty canvas — full flexibility' },
                { icon: Table2, text: 'Add tables from catalog manually' },
                { icon: Layers, text: 'Define your own target schema' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2">
                  <Icon className={cn(
                    'h-3 w-3 shrink-0',
                    selected === 'scratch' ? 'text-emerald-500' : 'text-slate-400',
                  )} />
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">{text}</span>
                </div>
              ))}
            </div>

            {/* Selection indicator */}
            {selected === 'scratch' && (
              <div className="absolute top-4 right-4">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </button>
        </div>

        {/* Action */}
        <Button
          className={cn(
            'w-full gap-2 text-white shadow-md transition-all',
            selected === 'dwh_template'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-500/20'
              : selected === 'scratch'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed',
          )}
          onClick={handleConfirm}
          disabled={!selected}
        >
          {selected === 'dwh_template' ? (
            <>
              <Database className="h-4 w-4" />
              Load DWH Template
            </>
          ) : selected === 'scratch' ? (
            <>
              <Grid3X3 className="h-4 w-4" />
              Start with Empty Canvas
            </>
          ) : (
            'Select an option to continue'
          )}
          {selected && <ArrowRight className="h-4 w-4 ml-1" />}
        </Button>
      </div>
    </Modal>
  );
};

export default ModelingTemplateModal;
