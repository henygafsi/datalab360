'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Select, Badge, Input } from 'rizzui';
import { Link2, Save, Trash2, GitBranch, AlertCircle, ArrowRight, Sparkles, Check, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import DesignDockPanel from './DesignDockPanel';
import { useEventStore } from '../stores/event-store';
import { aiDiscoverRelationships } from '@/app/services/api/exploreDesignApi';
import { useAiFeatures } from '../stores/ai-store';
import type { AiRelationship } from '@/app/services/api/types';

interface TableColumn {
  name: string;
  dataType: string;
}

interface RelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  sourceTable: string;
  sourceColumns: TableColumn[];
  availableTables: Array<{ database: string; schema: string; table: string }>;
  tableColumnsMap: Map<string, TableColumn[]>;
  projectId: string;
  existingRelationship?: {
    sourceColumn: string;
    targetTable: { database: string; schema: string; table: string };
    targetColumn: string;
    type?: string;
  } | null;
  onRelationshipCreated?: () => void;
}

const RELATIONSHIP_TYPES = [
  { value: 'one_to_one', label: 'One to One' },
  { value: 'one_to_many', label: 'One to Many' },
  { value: 'many_to_one', label: 'Many to One' },
  { value: 'many_to_many', label: 'Many to Many' },
];

const RelationshipModal: React.FC<RelationshipModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  sourceTable,
  sourceColumns,
  availableTables,
  tableColumnsMap,
  projectId,
  existingRelationship,
  onRelationshipCreated,
}) => {
  const { addEvent } = useEventStore();
  const { isEnabled } = useAiFeatures();
  const [sourceColumn, setSourceColumn] = useState('');
  const [targetTableKey, setTargetTableKey] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [relationshipType, setRelationshipType] = useState<string>('many_to_one');
  const [constraintName, setConstraintName] = useState('');
  const [targetColumns, setTargetColumns] = useState<TableColumn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredRelationships, setDiscoveredRelationships] = useState<AiRelationship[]>([]);
  const [showDiscovery, setShowDiscovery] = useState(false);

  const handleAiDiscover = useCallback(async () => {
    if (isDiscovering) return;
    setIsDiscovering(true);
    setShowDiscovery(true);
    try {
      const result = await aiDiscoverRelationships(projectId, {
        database,
        schema,
        tables: [sourceTable],
      });
      setDiscoveredRelationships(result.relationships || []);
      if (!result.relationships?.length) {
        toast('No relationships discovered for this table.', { icon: 'ℹ️' });
      }
    } catch (err: any) {
      console.error('AI relationship discovery failed:', err);
      toast.error(err?.message || 'AI relationship discovery failed.');
      setDiscoveredRelationships([]);
    } finally {
      setIsDiscovering(false);
    }
  }, [isDiscovering, projectId, database, schema, sourceTable]);

  const handleAcceptSuggestion = useCallback(async (rel: AiRelationship) => {
    try {
      const fkName = rel.suggested_fk || `FK_${rel.source_table}_${rel.source_column}`;
      const sql = `ALTER TABLE ${database}.${schema}.${rel.source_table} ADD CONSTRAINT ${fkName} FOREIGN KEY (${rel.source_column}) REFERENCES ${database}.${schema}.${rel.target_table}(${rel.target_column});`;

      // DDL action is auto-synced by the central DDL sync effect in page.tsx
      addEvent({
        type: 'FOREIGN_KEY_ADDED',
        projectId,
        target: {
          database,
          schema,
          table: rel.source_table,
          column: rel.source_column,
        },
        payload: {
          sourceColumn: rel.source_column,
          targetTable: { database, schema, table: rel.target_table },
          targetColumn: rel.target_column,
          constraintName: fkName,
          sql,
          columns: [rel.source_column],
          referencedTable: { database, schema, table: rel.target_table },
          referencedColumns: [rel.target_column],
          discoveryMethod: rel.discovery_method,
        },
      });

      toast.success(`Relationship "${fkName}" accepted and added to deployment queue`);
      setDiscoveredRelationships((prev) => prev.filter((r) => r !== rel));
      if (onRelationshipCreated) onRelationshipCreated();
    } catch (err: any) {
      console.error('Failed to accept AI suggestion:', err);
      toast.error(err?.message || 'Failed to accept suggestion.');
    }
  }, [projectId, database, schema, addEvent, onRelationshipCreated]);

  const handleDismissSuggestion = useCallback((rel: AiRelationship) => {
    setDiscoveredRelationships((prev) => prev.filter((r) => r !== rel));
  }, []);

  // Initialize form with existing relationship
  useEffect(() => {
    if (existingRelationship) {
      setSourceColumn(existingRelationship.sourceColumn);
      const targetKey = `${existingRelationship.targetTable.database}.${existingRelationship.targetTable.schema}.${existingRelationship.targetTable.table}`;
      setTargetTableKey(targetKey);
      setTargetColumn(existingRelationship.targetColumn);
      setRelationshipType(existingRelationship.type || 'many_to_one');

      // Load target columns
      const cols = tableColumnsMap.get(targetKey) || [];
      setTargetColumns(cols);

      // Generate constraint name
      const constraintNameGenerated = `FK_${sourceTable}_${existingRelationship.sourceColumn}`;
      setConstraintName(constraintNameGenerated);
    } else {
      // Reset form for new relationship
      setSourceColumn('');
      setTargetTableKey('');
      setTargetColumn('');
      setRelationshipType('many_to_one');
      setConstraintName('');
      setTargetColumns([]);
    }
  }, [existingRelationship, sourceTable, tableColumnsMap]);

  // Update target columns when target table changes
  useEffect(() => {
    if (targetTableKey) {
      const cols = tableColumnsMap.get(targetTableKey) || [];
      setTargetColumns(cols);

      // Auto-generate constraint name
      if (sourceColumn) {
        const constraintNameGenerated = `FK_${sourceTable}_${sourceColumn}`;
        setConstraintName(constraintNameGenerated);
      }
    } else {
      setTargetColumns([]);
    }
  }, [targetTableKey, sourceColumn, sourceTable, tableColumnsMap]);

  const handleTargetTableChange = (value: string) => {
    setTargetTableKey(value);
    setTargetColumn(''); // Reset target column when table changes
  };

  const validateForm = (): string | null => {
    if (!sourceColumn) {
      return 'Source column is required';
    }

    if (!targetTableKey) {
      return 'Target table is required';
    }

    if (!targetColumn) {
      return 'Target column is required';
    }

    if (!relationshipType) {
      return 'Relationship type is required';
    }

    // Check data type compatibility
    const sourceCol = sourceColumns.find((col) => col.name === sourceColumn);
    const targetCol = targetColumns.find((col) => col.name === targetColumn);

    if (sourceCol && targetCol && sourceCol.dataType !== targetCol.dataType) {
      return `Data type mismatch: ${sourceCol.dataType} (source) vs ${targetCol.dataType} (target)`;
    }

    return null;
  };

  const handleCreate = async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const [targetDb, targetSch, targetTbl] = targetTableKey.split('.');
      const targetTableRef = {
        database: targetDb,
        schema: targetSch,
        table: targetTbl,
      };

      // Generate SQL for foreign key
      const fkName = constraintName || `FK_${sourceTable}_${sourceColumn}`;
      const sql = `ALTER TABLE ${database}.${schema}.${sourceTable} ADD CONSTRAINT ${fkName} FOREIGN KEY (${sourceColumn}) REFERENCES ${targetDb}.${targetSch}.${targetTbl}(${targetColumn});`;

      const eventPayload = {
        sourceColumn,
        targetTable: targetTableRef,
        targetColumn,
        relationshipType,
        constraintName: fkName,
        sql,
        columns: [sourceColumn],
        referencedTable: targetTableRef,
        referencedColumns: [targetColumn],
      };

      // DDL action is auto-synced by the central DDL sync effect in page.tsx
      // Add to local store for immediate UI update
      addEvent({
        type: 'FOREIGN_KEY_ADDED',
        projectId,
        target: {
          database,
          schema,
          table: sourceTable,
          column: sourceColumn,
        },
        payload: eventPayload,
      });

      toast.success(`Foreign key relationship "${fkName}" added to deployment queue`);

      if (onRelationshipCreated) {
        onRelationshipCreated();
      }

      onClose();
    } catch (error: any) {
      console.error('Failed to create relationship event:', error);
      toast.error(error.message || 'Failed to create relationship event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingRelationship) return;

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const fkName = constraintName || `FK_${sourceTable}_${sourceColumn}`;
      const sql = `ALTER TABLE ${database}.${schema}.${sourceTable} DROP CONSTRAINT ${fkName};`;

      const eventPayload = {
        sourceColumn,
        constraintName: fkName,
        sql,
      };

      // DDL action is auto-synced by the central DDL sync effect in page.tsx
      // Add to local store for immediate UI update
      addEvent({
        type: 'FOREIGN_KEY_REMOVED',
        projectId,
        target: {
          database,
          schema,
          table: sourceTable,
          column: sourceColumn,
        },
        payload: eventPayload,
      });

      toast.success(`Foreign key removal "${fkName}" added to deployment queue`);

      if (onRelationshipCreated) {
        onRelationshipCreated();
      }

      onClose();
    } catch (error: any) {
      console.error('Failed to remove relationship event:', error);
      toast.error(error.message || 'Failed to remove relationship event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRelationshipIcon = () => {
    switch (relationshipType) {
      case 'one_to_one':
        return '1:1';
      case 'one_to_many':
        return '1:N';
      case 'many_to_one':
        return 'N:1';
      case 'many_to_many':
        return 'N:N';
      default:
        return '?';
    }
  };

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title={existingRelationship ? 'Edit Relationship' : 'Create Relationship'}
      subtitle={`${database}.${schema}.${sourceTable}`}
      widthClass="max-w-xl"
      icon={
        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Link2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-between">
          {existingRelationship && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="gap-2 text-red-600 border-red-300"
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              <Trash2 className="h-4 w-4" />
              {isSubmitting ? 'Removing...' : 'Remove Relationship'}
            </Button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="gap-2" disabled={isSubmitting} isLoading={isSubmitting}>
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Saving...' : `${existingRelationship ? 'Update' : 'Create'} Relationship`}
            </Button>
          </div>
        </div>
      }
    >
      <div>
        {/* AI Discover action (relocated from header) */}
        {isEnabled('relationship_discovery') && (
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiDiscover}
              disabled={isDiscovering}
              className="gap-1.5 border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
            >
              {isDiscovering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI Discover
            </Button>
          </div>
        )}

        {/* AI Discovery Results */}
        {showDiscovery && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                AI-Discovered Relationships
              </h3>
              {discoveredRelationships.length > 0 && (
                <button
                  onClick={() => { setShowDiscovery(false); setDiscoveredRelationships([]); }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Dismiss all
                </button>
              )}
            </div>

            {isDiscovering ? (
              <div className="p-6 text-center border dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <Loader2 className="h-6 w-6 animate-spin text-purple-500 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Analyzing table relationships...</p>
              </div>
            ) : discoveredRelationships.length === 0 ? (
              <div className="p-4 text-center border dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <p className="text-sm text-slate-500">No relationships discovered.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {discoveredRelationships.map((rel, idx) => (
                  <div
                    key={`${rel.source_table}-${rel.source_column}-${rel.target_table}-${rel.target_column}-${idx}`}
                    className="p-3 border dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs truncate">
                          {rel.source_table}.{rel.source_column}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs truncate">
                          {rel.target_table}.{rel.target_column}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                        <span className="capitalize">{rel.discovery_method?.replace(/_/g, ' ') || 'AI'}</span>
                        <span className="flex items-center gap-1">
                          Confidence:
                          <span className={`font-medium ${
                            rel.confidence >= 0.8 ? 'text-green-600' :
                            rel.confidence >= 0.5 ? 'text-amber-600' : 'text-red-500'
                          }`}>
                            {Math.round(rel.confidence * 100)}%
                          </span>
                        </span>
                        {rel.suggested_fk && (
                          <span className="text-slate-400 truncate">{rel.suggested_fk}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAcceptSuggestion(rel)}
                        className="gap-1 text-green-600 border-green-300 hover:bg-green-50 dark:border-green-700 dark:hover:bg-green-900/20 px-2"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </Button>
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => handleDismissSuggestion(rel)}
                        className="text-slate-400 hover:text-red-500 px-1.5"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">Foreign Key Relationship</p>
            <p className="text-xs mt-1">
              Define a foreign key constraint between two tables. This will be created during deployment.
            </p>
          </div>
        </div>

        {/* Source Column */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Source Column (This Table) <span className="text-red-500">*</span>
          </label>
          <Select
            options={[
              { value: '', label: 'Select column...' },
              ...sourceColumns.map((col) => ({
                value: col.name,
                label: `${col.name} (${col.dataType})`,
              })),
            ]}
            value={sourceColumn}
            onChange={(option: any) => setSourceColumn(option?.value ?? option ?? '')}
            className="w-full"
            disabled={!!existingRelationship}
          />
        </div>

        {/* Relationship Type */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Relationship Type</label>
          <div className="grid grid-cols-4 gap-2">
            {RELATIONSHIP_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setRelationshipType(type.value)}
                className={`p-3 border rounded-lg text-center transition-all ${
                  relationshipType === type.value
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'border-slate-300 dark:border-slate-600 hover:border-purple-300'
                }`}
              >
                <div className="text-lg font-bold">{type.value.replace(/_/g, ':').toUpperCase()}</div>
                <div className="text-xs text-slate-500 mt-1">{type.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Visual Representation */}
        {sourceColumn && targetTableKey && targetColumn && (
          <div className="mb-4 p-4 border dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center justify-center gap-3">
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Source</div>
                <Badge className="bg-blue-100 text-blue-700">
                  {sourceTable}.{sourceColumn}
                </Badge>
              </div>
              <div className="flex flex-col items-center">
                <Badge className="bg-purple-100 text-purple-700 mb-1">{getRelationshipIcon()}</Badge>
                <ArrowRight className="h-5 w-5 text-slate-400" />
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Target</div>
                <Badge className="bg-green-100 text-green-700">
                  {targetTableKey.split('.')[2]}.{targetColumn}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Target Table */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Target Table (Referenced Table) <span className="text-red-500">*</span>
          </label>
          <Select
            options={[
              { value: '', label: 'Select table...' },
              ...availableTables.map((table) => {
                const key = `${table.database}.${table.schema}.${table.table}`;
                const label =
                  table.database === database && table.schema === schema
                    ? table.table
                    : `${table.database}.${table.schema}.${table.table}`;
                return { value: key, label };
              }),
            ]}
            value={targetTableKey}
            onChange={(option: any) => handleTargetTableChange(option?.value ?? option ?? '')}
            className="w-full"
            disabled={!!existingRelationship}
          />
        </div>

        {/* Target Column */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Target Column (Referenced Column) <span className="text-red-500">*</span>
          </label>
          <Select
            options={[
              { value: '', label: 'Select column...' },
              ...targetColumns.map((col) => ({
                value: col.name,
                label: `${col.name} (${col.dataType})`,
              })),
            ]}
            value={targetColumn}
            onChange={(option: any) => setTargetColumn(option?.value ?? option ?? '')}
            className="w-full"
            disabled={!targetTableKey || !!existingRelationship}
          />
          {targetTableKey && targetColumns.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No columns available. Please load the target table first.
            </p>
          )}
        </div>

        {/* Constraint Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Constraint Name (Optional)</label>
          <Input
            value={constraintName}
            onChange={(e) => setConstraintName(e.target.value)}
            placeholder="Auto-generated if empty"
            className="w-full"
          />
          {!constraintName && sourceColumn && (
            <p className="text-xs text-slate-500 mt-1">
              Will be auto-generated as: FK_{sourceTable}_{sourceColumn}
            </p>
          )}
        </div>
      </div>
    </DesignDockPanel>
  );
};

export default RelationshipModal;
