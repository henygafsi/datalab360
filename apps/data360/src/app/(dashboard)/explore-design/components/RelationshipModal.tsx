'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Badge, Input } from 'rizzui';
import { Link2, X, Save, Trash2, GitBranch, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore } from '../stores/event-store';
import { addDDLAction } from '@/app/services/api/exploreDesignApi';

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
  const [sourceColumn, setSourceColumn] = useState('');
  const [targetTableKey, setTargetTableKey] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [relationshipType, setRelationshipType] = useState<string>('many_to_one');
  const [constraintName, setConstraintName] = useState('');
  const [targetColumns, setTargetColumns] = useState<TableColumn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      // Call backend API to persist DDL action
      await addDDLAction(projectId, {
        ddl_sql: sql,
        ddl_type: 'ALTER_ADD_COLUMN',
        target_table: `${database}.${schema}.${sourceTable}`,
        description: `Add foreign key ${fkName} on ${sourceColumn} → ${targetTbl}(${targetColumn})`,
      });

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

      // Call backend API to persist DDL action
      await addDDLAction(projectId, {
        ddl_sql: sql,
        ddl_type: 'ALTER_DROP_COLUMN',
        target_table: `${database}.${schema}.${sourceTable}`,
        description: `Drop foreign key ${fkName}`,
      });

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
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {existingRelationship ? 'Edit Relationship' : 'Create Relationship'}
              </h2>
              <p className="text-sm text-slate-500">
                {database}.{schema}.{sourceTable}
              </p>
            </div>
          </div>
          <Button variant="text" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

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

        {/* Footer Actions */}
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
      </div>
    </Modal>
  );
};

export default RelationshipModal;
