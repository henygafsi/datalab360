'use client';

import { useState, useCallback } from 'react';
import { Button, Input, Modal, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getTags,
  getTagDetails,
  createTag,
  applyTag,
  removeTag,
  deleteTag,
  type Tag,
} from '@/app/services/gouvernance/policies';
import { ObjectSelector } from './components/ObjectSelector';
import { DEFAULTS } from '@/config/database.config';
const OBJECT_TYPES = [
  { label: 'Database', value: 'DATABASE' },
  { label: 'Schema', value: 'SCHEMA' },
  { label: 'Table', value: 'TABLE' },
  { label: 'Column', value: 'COLUMN' },
];

export default function TagPoliciesContent() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [tagDetails, setTagDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchTags = useCallback(() => getTags().then(data => Array.isArray(data) ? data : []), []);
  const { data: tags, loading, error, refetch, isStale } = useCacheAwareQuery<Tag[]>(
    fetchTags,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const handleViewDetails = async (tag: Tag) => {
    setSelectedTag(tag);
    setShowDetailsModal(true);
    setLoadingDetails(true);
    setTagDetails(null);

    try {
      const details = await getTagDetails(tag.tag_name);
      // console.log('Tag details:', details);
      setTagDetails(details);
    } catch (error: any) {
      console.error('Error loading tag details:', error);
      toast.error('Failed to load tag details');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Helper function to format error messages from API responses
  const formatErrorMessage = (error: any, defaultMessage: string): string => {
    // Handle FastAPI validation errors (422) which return detail as an array
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;

      // If detail is an array of validation errors
      if (Array.isArray(detail)) {
        return detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      }
      // If detail is a string
      else if (typeof detail === 'string') {
        return detail;
      }
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.message) {
      return error.message;
    }

    return defaultMessage;
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
        schema: DEFAULTS.GOVERNANCE_FQN,
      });
      toast.success('Tag created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      refetch();
    } catch (error: any) {
      console.error('Create tag error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to create tag'));
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
        tag_schema: DEFAULTS.SCHEMA,
      });

      const objectPath = objectType === 'DATABASE' ? database
        : objectType === 'SCHEMA' ? `${database}.${schema}`
        : objectType === 'TABLE' ? `${database}.${schema}.${table}`
        : `${database}.${schema}.${table}.${column}`;

      toast.success(`Tag applied to ${objectPath}`);
      setShowApplyModal(false);
      setSelectedTag(null);
      resetApplyForm();
      refetch();
    } catch (error: any) {
      console.error('Apply tag error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to apply tag'));
    }
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.tag_name}"?`)) return;

    try {
      await deleteTag(tag.tag_name);
      toast.success('Tag deleted successfully');
      refetch();
    } catch (error: any) {
      console.error('Delete tag error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to delete tag'));
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
  const handleObjectTypeChange = (newType: any) => {
    const extractedValue = typeof newType === 'object' ? newType?.value : newType;
    setObjectType(extractedValue || 'TABLE');
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
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Tag-Based Policies</h2>
            {isStale && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
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
      ) : !tags || tags.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No tags found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {tags.map((tag) => (
            <div
              key={tag.tag_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 flex justify-between items-start hover:border-green-300 transition-colors"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => handleViewDetails(tag)}
              >
                <h3 className="font-semibold text-lg text-green-600 hover:text-green-700">
                  {String(tag.tag_name || '')}
                </h3>
                {tag.comment && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {String(tag.comment)}
                  </p>
                )}
                {tag.allowed_values && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500">Allowed Values:</p>
                    <p className="text-sm font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded mt-1">
                      {String(tag.allowed_values)}
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">Schema: {String(tag.schema || 'N/A')}</p>
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
            onChange={handleObjectTypeChange}
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

      {/* Tag Details Modal */}
      <Modal isOpen={showDetailsModal} onClose={() => setShowDetailsModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">
            Tag Details: {selectedTag?.tag_name}
          </h2>

          {loadingDetails ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : tagDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tag Name
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {tagDetails.tag_name || selectedTag?.tag_name || 'N/A'}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Allowed Values
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {tagDetails.details?.allowed_values || tagDetails.allowed_values || selectedTag?.allowed_values || 'Any value allowed'}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Comment / Description
                </label>
                <pre className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                  {tagDetails.details?.comment || tagDetails.comment || selectedTag?.comment || 'No description'}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Schema
                  </label>
                  <p className="text-sm">{tagDetails.schema || selectedTag?.schema || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Owner
                  </label>
                  <p className="text-sm">{tagDetails.details?.owner || tagDetails.owner || 'N/A'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No details available
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
              Close
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                setShowDetailsModal(false);
                setShowApplyModal(true);
              }}
            >
              Apply Tag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
