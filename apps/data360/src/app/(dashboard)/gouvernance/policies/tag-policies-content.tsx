'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import {
  getTags,
  createTag,
  applyTag,
  removeTag,
  deleteTag,
  type Tag,
} from '@/app/services/gouvernance/policies';
import { ObjectSelector } from './components/ObjectSelector';

const OBJECT_TYPES = [
  { label: 'Database', value: 'DATABASE' },
  { label: 'Schema', value: 'SCHEMA' },
  { label: 'Table', value: 'TABLE' },
  { label: 'Column', value: 'COLUMN' },
];

export default function TagPoliciesContent() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // Form state for creating tag
  const [tagName, setTagName] = useState('');
  const [allowedValues, setAllowedValues] = useState('');
  const [comment, setComment] = useState('');

  // Form state for applying tag
  const [objectType, setObjectType] = useState('TABLE');
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');
  const [column, setColumn] = useState('');
  const [tagValue, setTagValue] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      const data = await getTags();
      setTags(data || []);
    } catch (error: any) {
      console.error('Error loading tags:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to load tags');
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!tagName) {
      toast.error('Please provide a tag name');
      return;
    }

    try {
      await createTag({
        tag_name: tagName,
        allowed_values: allowedValues,
        comment,
        schema: 'GOVERNANCE',
      });
      toast.success('Tag created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      loadTags();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create tag');
    }
  };

  const handleApply = async () => {
    if (!selectedTag || !tagValue) {
      toast.error('Please provide a tag value');
      return;
    }

    // Validate required object selections based on object type
    if (objectType === 'DATABASE' && !database) {
      toast.error('Please select a database');
      return;
    }
    if (objectType === 'SCHEMA' && (!database || !schema)) {
      toast.error('Please select database and schema');
      return;
    }
    if (objectType === 'TABLE' && (!database || !schema || !table)) {
      toast.error('Please select database, schema, and table');
      return;
    }
    if (objectType === 'COLUMN' && (!database || !schema || !table || !column)) {
      toast.error('Please select database, schema, table, and column');
      return;
    }

    try {
      await applyTag({
        tag_name: selectedTag.tag_name,
        object_type: objectType,
        database,
        schema,
        table,
        column,
        tag_value: tagValue,
        tag_schema: 'GOVERNANCE',
      });

      const objectPath = objectType === 'DATABASE' ? database
        : objectType === 'SCHEMA' ? `${database}.${schema}`
        : objectType === 'TABLE' ? `${database}.${schema}.${table}`
        : `${database}.${schema}.${table}.${column}`;

      toast.success(`Tag applied to ${objectPath}`);
      setShowApplyModal(false);
      setSelectedTag(null);
      resetApplyForm();
      loadTags();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to apply tag');
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.tag_name}"?`)) return;

    try {
      await deleteTag(tag.tag_name);
      toast.success('Tag deleted successfully');
      loadTags();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete tag');
    }
  };

  const resetCreateForm = () => {
    setTagName('');
    setAllowedValues('');
    setComment('');
  };

  const resetApplyForm = () => {
    setObjectType('TABLE');
    setDatabase('');
    setSchema('');
    setTable('');
    setColumn('');
    setTagValue('');
  };

  // Reset object selections when object type changes
  const handleObjectTypeChange = (newType: string) => {
    setObjectType(newType);
    setDatabase('');
    setSchema('');
    setTable('');
    setColumn('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Tag-Based Policies</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Classify and organize data objects with custom tags
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-green-600 hover:bg-green-700"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create Tag
        </Button>
      </div>

      {/* Tags List */}
      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No tags found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {tags.map((tag) => (
            <div
              key={tag.tag_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 flex justify-between items-start"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{tag.tag_name}</h3>
                {tag.comment && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {tag.comment}
                  </p>
                )}
                {tag.allowed_values && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500">Allowed Values:</p>
                    <p className="text-sm font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded mt-1">
                      {tag.allowed_values}
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">Schema: {tag.schema}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedTag(tag);
                    setShowApplyModal(true);
                  }}
                >
                  Apply Tag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  onClick={() => handleDelete(tag)}
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Tag Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Create Tag</h2>

          <Input
            label="Tag Name"
            placeholder="PII_LEVEL"
            value={tagName}
            onChange={(e) => setTagName(e.target.value.toUpperCase())}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Allowed Values (Optional)
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={3}
              value={allowedValues}
              onChange={(e) => setAllowedValues(e.target.value)}
              placeholder="HIGH, MEDIUM, LOW"
            />
            <p className="text-xs text-slate-500 mt-1">
              Comma-separated list of allowed tag values (leave empty for any value)
            </p>
          </div>

          <Input
            label="Comment (Optional)"
            placeholder="Data privacy classification level"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-green-600 hover:bg-green-700">
              Create Tag
            </Button>
          </div>
        </div>
      </Modal>

      {/* Apply Tag Modal */}
      <Modal isOpen={showApplyModal} onClose={() => setShowApplyModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">
            Apply Tag: {selectedTag?.tag_name}
          </h2>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select the object to apply this tag to:
          </p>

          <Select
            label="Object Type"
            value={objectType}
            onChange={(val) => handleObjectTypeChange(val as string)}
            options={OBJECT_TYPES}
          />

          <ObjectSelector
            level="database"
            onSelect={(val) => {
              setDatabase(val);
              setSchema('');
              setTable('');
              setColumn('');
            }}
            value={database}
          />

          {(objectType === 'SCHEMA' || objectType === 'TABLE' || objectType === 'COLUMN') && database && (
            <ObjectSelector
              level="schema"
              database={database}
              onSelect={(val) => {
                setSchema(val);
                setTable('');
                setColumn('');
              }}
              value={schema}
            />
          )}

          {(objectType === 'TABLE' || objectType === 'COLUMN') && schema && (
            <ObjectSelector
              level="table"
              database={database}
              schema={schema}
              onSelect={(val) => {
                setTable(val);
                setColumn('');
              }}
              value={table}
            />
          )}

          {objectType === 'COLUMN' && table && (
            <ObjectSelector
              level="column"
              database={database}
              schema={schema}
              table={table}
              onSelect={setColumn}
              value={column}
            />
          )}

          <Input
            label="Tag Value"
            placeholder={selectedTag?.allowed_values || "Enter tag value"}
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
          />

          {selectedTag?.allowed_values && (
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
              <p className="text-xs text-green-700 dark:text-green-300">
                <strong>Allowed Values:</strong> {selectedTag.allowed_values}
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!database || !tagValue}
              className="bg-green-600 hover:bg-green-700"
            >
              Apply Tag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
