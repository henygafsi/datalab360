'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input } from 'rizzui';
import {
  Database, MapPin, ArrowRight, Loader2, AlertTriangle,
  CheckCircle2, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import DesignDockPanel from './DesignDockPanel';

interface DwhLocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (database: string, schema: string) => void;
  projectName?: string;
}

const SCHEMA_REGEX = /^[A-Z_][A-Z0-9_]*$/;

const DwhLocationPickerModal: React.FC<DwhLocationPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  projectName,
}) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [schemaName, setSchemaName] = useState('');
  const [dbSearchQuery, setDbSearchQuery] = useState('');

  // Fetch databases on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingDbs(true);
    setDbError(null);
    getDatabases()
      .then((dbs) => setDatabases(Array.isArray(dbs) ? dbs : []))
      .catch(() => setDbError('Failed to load databases'))
      .finally(() => setLoadingDbs(false));
  }, [isOpen]);

  // Validation
  const schemaUppercase = schemaName.toUpperCase().replace(/\s+/g, '_');
  const isSchemaValid = schemaUppercase.length >= 3 && SCHEMA_REGEX.test(schemaUppercase);
  const canConfirm = selectedDatabase && isSchemaValid;

  const filteredDatabases = databases.filter((db) =>
    db.toLowerCase().includes(dbSearchQuery.toLowerCase()),
  );

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(selectedDatabase, schemaUppercase);
  };

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Choose Deployment Location"
      subtitle={projectName
        ? `Select where the DWH tables will be created for ${projectName}`
        : 'Select the database and schema name for your Data Warehouse'}
      icon={
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
          <MapPin className="h-5 w-5 text-white" />
        </div>
      }
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className={cn(
              'flex-1 gap-2 text-white shadow-md',
              canConfirm
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-500/20'
                : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed',
            )}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            <MapPin className="h-4 w-4" />
            Set Location & Load Template
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div>
        {/* Database Selection */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Database className="h-4 w-4 text-indigo-500" />
              Target Database
            </label>
            {loadingDbs ? (
              <div className="flex items-center justify-center gap-2 py-6 border rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                <span className="text-sm text-slate-500">Loading databases...</span>
              </div>
            ) : dbError ? (
              <div className="flex items-center justify-center gap-2 py-6 border rounded-xl border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">{dbError}</span>
                <button
                  onClick={() => {
                    setLoadingDbs(true);
                    setDbError(null);
                    getDatabases()
                      .then((dbs) => setDatabases(Array.isArray(dbs) ? dbs : []))
                      .catch(() => setDbError('Failed to load databases'))
                      .finally(() => setLoadingDbs(false));
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 underline ml-1"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="border rounded-xl border-slate-200 dark:border-slate-700 overflow-hidden">
                {databases.length > 5 && (
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <Input
                      size="sm"
                      placeholder="Search databases..."
                      value={dbSearchQuery}
                      onChange={(e) => setDbSearchQuery(e.target.value)}
                    />
                  </div>
                )}
                <div className="max-h-44 overflow-y-auto">
                  {filteredDatabases.length === 0 ? (
                    <div className="py-4 text-center text-sm text-slate-400">
                      No databases found
                    </div>
                  ) : (
                    filteredDatabases.map((db) => (
                      <button
                        key={db}
                        onClick={() => setSelectedDatabase(db)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                          selectedDatabase === db
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-l-transparent',
                        )}
                      >
                        <Database className={cn(
                          'h-4 w-4 shrink-0',
                          selectedDatabase === db ? 'text-indigo-500' : 'text-slate-400',
                        )} />
                        <span className={cn(
                          'text-sm font-medium truncate',
                          selectedDatabase === db
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-700 dark:text-slate-300',
                        )}>
                          {db}
                        </span>
                        {selectedDatabase === db && (
                          <CheckCircle2 className="h-4 w-4 text-indigo-500 ml-auto shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Schema Name */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Layers className="h-4 w-4 text-purple-500" />
              Schema Name
              <span className="text-xs text-slate-400 font-normal">(will be created on deploy)</span>
            </label>
            <Input
              size="lg"
              placeholder="e.g. RETAIL_DWH"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              className="font-mono"
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              {schemaName.length > 0 && (
                isSchemaValid ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                      Schema will be created as <span className="font-mono font-medium">{selectedDatabase ? `${selectedDatabase}.${schemaUppercase}` : schemaUppercase}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      {schemaUppercase.length < 3
                        ? 'Minimum 3 characters required'
                        : 'Only letters, numbers, and underscores allowed. Must start with a letter or underscore.'}
                    </span>
                  </>
                )
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        {canConfirm && (
          <div className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-3">
            <div className="text-[11px] text-indigo-500 font-medium mb-1 uppercase tracking-wide">
              Deployment Target
            </div>
            <div className="text-sm font-mono font-semibold text-indigo-700 dark:text-indigo-300">
              {selectedDatabase}.{schemaUppercase}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              13 tables with foreign key relationships will be loaded into the modeling canvas
            </div>
          </div>
        )}
      </div>
    </DesignDockPanel>
  );
};

export default DwhLocationPickerModal;
