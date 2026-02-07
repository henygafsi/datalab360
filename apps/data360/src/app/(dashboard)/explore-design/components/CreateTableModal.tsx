'use client';

import React, { useState } from 'react';
import { Modal, Button, Input, Select, Badge, Checkbox } from 'rizzui';
import { Plus, Trash2, Save, X, Database, Table as TableIcon, Key } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore } from '../stores/event-store';
import { addDesignEvent } from '@/app/services/explore-design';

interface Column {
  id: string;
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  projectId: string;
  onTableCreated?: (tableName: string, database: string, schema: string, columns: Column[]) => void;
}

const DATA_TYPES = [
  { value: 'VARCHAR', label: 'VARCHAR' },
  { value: 'NUMBER', label: 'NUMBER' },
  { value: 'INTEGER', label: 'INTEGER' },
  { value: 'FLOAT', label: 'FLOAT' },
  { value: 'BOOLEAN', label: 'BOOLEAN' },
  { value: 'DATE', label: 'DATE' },
  { value: 'TIMESTAMP', label: 'TIMESTAMP' },
  { value: 'VARIANT', label: 'VARIANT' },
  { value: 'OBJECT', label: 'OBJECT' },
  { value: 'ARRAY', label: 'ARRAY' },
  { value: 'BINARY', label: 'BINARY' },
];

const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  projectId,
  onTableCreated,
}) => {
  const { addEvent } = useEventStore();
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<Column[]>([
    {
      id: '1',
      name: '',
      dataType: 'VARCHAR',
      nullable: true,
      primaryKey: false,
    },
  ]);
  const [tableComment, setTableComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddColumn = () => {
    const newColumn: Column = {
      id: Date.now().toString(),
      name: '',
      dataType: 'VARCHAR',
      nullable: true,
      primaryKey: false,
    };
    setColumns([...columns, newColumn]);
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length === 1) {
      toast.error('Table must have at least one column');
      return;
    }
    setColumns(columns.filter((col) => col.id !== id));
  };

  const handleColumnChange = (id: string, field: keyof Column, value: any) => {
    setColumns(
      columns.map((col) => (col.id === id ? { ...col, [field]: value } : col))
    );
  };

  const handleTogglePrimaryKey = (id: string) => {
    setColumns(
      columns.map((col) => ({
        ...col,
        primaryKey: col.id === id ? !col.primaryKey : col.primaryKey,
        nullable: col.id === id && !col.primaryKey ? false : col.nullable,
      }))
    );
  };

  const validateForm = (): string | null => {
    if (!tableName.trim()) {
      return 'Table name is required';
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      return 'Table name must start with a letter or underscore and contain only letters, numbers, and underscores';
    }

    const columnNames = columns.map((col) => col.name.trim().toUpperCase());
    const duplicateNames = columnNames.filter(
      (name, index) => name && columnNames.indexOf(name) !== index
    );

    if (duplicateNames.length > 0) {
      return `Duplicate column names: ${duplicateNames.join(', ')}`;
    }

    for (const col of columns) {
      if (!col.name.trim()) {
        return 'All columns must have a name';
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)) {
        return `Column "${col.name}" has an invalid name format`;
      }
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
      // Generate CREATE TABLE SQL
      const primaryKeyColumns = columns.filter((col) => col.primaryKey).map((col) => col.name);
      const columnDefinitions = columns
        .map((col) => {
          let def = `  ${col.name} ${col.dataType}`;
          if (!col.nullable) def += ' NOT NULL';
          if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
          if (col.comment) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
          return def;
        })
        .join(',\n');

      let sql = `CREATE TABLE ${database}.${schema}.${tableName} (\n${columnDefinitions}`;

      if (primaryKeyColumns.length > 0) {
        sql += `,\n  PRIMARY KEY (${primaryKeyColumns.join(', ')})`;
      }

      sql += '\n)';

      if (tableComment) {
        sql += `\nCOMMENT = '${tableComment.replace(/'/g, "''")}'`;
      }

      sql += ';';

      // Generate unique event ID
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const eventPayload = {
        tableName,
        columns: columns.map((col) => ({
          name: col.name,
          dataType: col.dataType,
          nullable: col.nullable,
          primaryKey: col.primaryKey,
          defaultValue: col.defaultValue,
          comment: col.comment,
        })),
        primaryKeys: primaryKeyColumns,
        comment: tableComment,
        sql,
      };

      // Call backend API to persist event
      await addDesignEvent(
        projectId,
        eventId,
        'TABLE_CREATED',
        {
          database,
          schema,
          table: tableName,
        },
        eventPayload,
        'explore-design'
      );

      // Add to local store for immediate UI update
      addEvent({
        type: 'TABLE_CREATED',
        projectId,
        target: {
          database,
          schema,
          table: tableName,
        },
        payload: eventPayload,
      });

      toast.success(`Table "${tableName}" creation event added to deployment queue`);

      // Call onTableCreated with table data before resetting form
      if (onTableCreated) {
        onTableCreated(tableName, database, schema, columns);
      }

      // Reset form
      setTableName('');
      setColumns([
        {
          id: '1',
          name: '',
          dataType: 'VARCHAR',
          nullable: true,
          primaryKey: false,
        },
      ]);
      setTableComment('');

      onClose();
    } catch (error: any) {
      console.error('Failed to create table event:', error);
      toast.error(error.message || 'Failed to create table event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const primaryKeyCount = columns.filter((col) => col.primaryKey).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <TableIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Create New Table</h2>
              <p className="text-sm text-slate-500">
                {database}.{schema}
              </p>
            </div>
          </div>
          <Button variant="text" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Table Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Table Name <span className="text-red-500">*</span>
          </label>
          <Input
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g., DIM_CUSTOMER"
            className="w-full"
          />
        </div>

        {/* Table Comment */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Table Comment (Optional)</label>
          <Input
            value={tableComment}
            onChange={(e) => setTableComment(e.target.value)}
            placeholder="Description of the table"
            className="w-full"
          />
        </div>

        {/* Columns Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Columns</h3>
            <Badge className="bg-slate-100 text-slate-600">{columns.length}</Badge>
            {primaryKeyCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
                <Key className="h-3 w-3" />
                {primaryKeyCount} PK
              </Badge>
            )}
          </div>
          <Button size="sm" onClick={handleAddColumn} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Column
          </Button>
        </div>

        {/* Columns List */}
        <div className="max-h-96 overflow-y-auto space-y-3 mb-6 border dark:border-slate-700 rounded-lg p-4">
          {columns.map((column, index) => (
            <div
              key={column.id}
              className="p-3 border dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  {/* Column Name */}
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Column Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={column.name}
                      onChange={(e) => handleColumnChange(column.id, 'name', e.target.value)}
                      placeholder="e.g., CUSTOMER_ID"
                      size="sm"
                    />
                  </div>

                  {/* Data Type */}
                  <div>
                    <label className="block text-xs font-medium mb-1">Data Type</label>
                    <Select
                      options={DATA_TYPES}
                      value={column.dataType}
                      onChange={(value) => handleColumnChange(column.id, 'dataType', value)}
                      size="sm"
                    />
                  </div>

                  {/* Default Value */}
                  <div>
                    <label className="block text-xs font-medium mb-1">Default Value</label>
                    <Input
                      value={column.defaultValue || ''}
                      onChange={(e) => handleColumnChange(column.id, 'defaultValue', e.target.value)}
                      placeholder="NULL, 0, 'value'"
                      size="sm"
                    />
                  </div>

                  {/* Comment */}
                  <div>
                    <label className="block text-xs font-medium mb-1">Comment</label>
                    <Input
                      value={column.comment || ''}
                      onChange={(e) => handleColumnChange(column.id, 'comment', e.target.value)}
                      placeholder="Column description"
                      size="sm"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-6">
                  <button
                    onClick={() => handleTogglePrimaryKey(column.id)}
                    className={`p-2 rounded border transition-colors ${
                      column.primaryKey
                        ? 'bg-amber-100 border-amber-300 text-amber-700'
                        : 'border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="Primary Key"
                  >
                    <Key className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveColumn(column.id)}
                    className="p-2 rounded border border-slate-300 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                    title="Remove Column"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t dark:border-slate-600">
                <Checkbox
                  checked={!column.nullable}
                  onChange={() => handleColumnChange(column.id, 'nullable', !column.nullable)}
                  disabled={column.primaryKey}
                  label="NOT NULL"
                  className="text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} className="gap-2" disabled={isSubmitting} isLoading={isSubmitting}>
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Creating...' : 'Create Table'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CreateTableModal;
