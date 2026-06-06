'use client';

import { useState, useCallback } from 'react';
import { Button, Input, Select, type SelectOption } from 'rizzui';
import { useCanPerform } from '@/hooks/useCanPerform';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getTags,
  getTagDetails,
  createTag,
  applyTag,
  deleteTag,
  formatPolicyError,
  type Tag,
  type EnrichedPolicy,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';
import { ObjectSelector } from './components/ObjectSelector';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { DEFAULTS } from '@/config/database.config';

interface TagDetails {
  tag_name?: string;
  allowed_values?: string;
  comment?: string;
  schema?: string;
  owner?: string;
  details?: { allowed_values?: string; comment?: string; owner?: string };
}

function tagToEnriched(tag: Tag): EnrichedPolicy {
  return {
    name: tag.tag_name || '',
    database_name: '',
    schema_name: tag.schema || '',
    created_on: tag.created_at || null,
    comment: tag.comment || null,
    granted_roles: [],
    granted_objects: [],
    granted_objects_count: 0,
    expiration_date: null,
  };
}
const OBJECT_TYPES = [
  { label: 'Database', value: 'DATABASE' },
  { label: 'Schema', value: 'SCHEMA' },
  { label: 'Table', value: 'TABLE' },
  { label: 'Column', value: 'COLUMN' },
];

export default function TagPoliciesContent() {
  // System 2 Action-RBAC: Create → gouvernance:create, Apply → gouvernance:apply.
  // Fail-open while the allow-set loads (no flash of disabled).
  const createPerm = useCanPerform('gouvernance', 'create');
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canCreatePolicy = createPerm.allowed || createPerm.loading;
  const canApplyPolicy = applyPerm.allowed || applyPerm.loading;

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [tagDetails, setTagDetails] = useState<TagDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

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
    setShowDetailsPanel(true);
    setLoadingDetails(true);
    setTagDetails(null);
    setDetailsError(null);

    try {
      const details: TagDetails | null = await getTagDetails(tag.tag_name);
      if (!details) {
        setDetailsError('No details returned for this tag.');
      } else {
        setTagDetails(details);
      }
    } catch (error) {
      setDetailsError(formatPolicyError(error, 'Failed to load tag details'));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreate = async () => {
    if (!tagName) {
      setCreateError('Please provide a tag name.');
      return;
    }

    setCreateError(null);
    try {
      await createTag({
        tag_name: tagName,
        allowed_values: allowedValues,
        comment,
        schema: DEFAULTS.GOVERNANCE_FQN,
      });
      toast.success('Tag created successfully!');
      setShowCreatePanel(false);
      resetCreateForm();
      refetch();
    } catch (error) {
      setCreateError(formatPolicyError(error, 'Failed to create tag'));
    }
  };

  const handleApply = async () => {
    if (!selectedTag || !tagValue) {
      setApplyError('Please provide a tag value.');
      return;
    }

    // Validate required object selections based on object type
    if (objectType === 'DATABASE' && !database) {
      setApplyError('Please select a database.');
      return;
    }
    if (objectType === 'SCHEMA' && (!database || !schema)) {
      setApplyError('Please select database and schema.');
      return;
    }
    if (objectType === 'TABLE' && (!database || !schema || !table)) {
      setApplyError('Please select database, schema, and table.');
      return;
    }
    if (objectType === 'COLUMN' && (!database || !schema || !table || !column)) {
      setApplyError('Please select database, schema, table, and column.');
      return;
    }

    setApplyError(null);
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
      setShowApplyPanel(false);
      setSelectedTag(null);
      resetApplyForm();
      refetch();
    } catch (error) {
      setApplyError(formatPolicyError(error, 'Failed to apply tag'));
    }
  };

  const handleDeletePolicy = async (policy: EnrichedPolicy) => {
    await deleteTag(policy.name);
  };

  const resetCreateForm = () => {
    setTagName('');
    setAllowedValues('');
    setComment('');
    setCreateError(null);
  };

  const resetApplyForm = () => {
    setObjectType('TABLE');
    setDatabase('');
    setSchema('');
    setTable('');
    setColumn('');
    setTagValue('');
    setApplyError(null);
  };

  // Reset object selections when object type changes
  const handleObjectTypeChange = (newType: SelectOption | string) => {
    const extractedValue = typeof newType === 'object' ? newType?.value : newType;
    setObjectType(String(extractedValue || 'TABLE'));
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
          onClick={() => { setCreateError(null); setShowCreatePanel(true); }}
          disabled={!canCreatePolicy}
          title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
          className="bg-green-600 hover:bg-green-700"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create Tag
        </Button>
      </div>

      {/* Tags List */}
      {loading ? (
        <TableSkeleton rows={4} columns={3} showHeader={false} />
      ) : error ? (
        <ErrorDisplay error={error.message} onRetry={() => refetch()} context="general" />
      ) : !tags || tags.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No tags found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {tags.map((tag) => (
            <PolicyCard
              key={tag.tag_name}
              policy={tagToEnriched(tag)}
              accentColor="green"
              policyType="tag"
              onViewDetails={() => handleViewDetails(tag)}
              onApply={() => {
                setSelectedTag(tag);
                setApplyError(null);
                setShowApplyPanel(true);
              }}
              onDelete={handleDeletePolicy}
              onRefresh={refetch}
              applyLabel="Apply Tag"
              entityLabel="object(s)"
            >
              {tag.allowed_values && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500">Allowed Values:</p>
                  <p className="text-sm font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded mt-1">
                    {String(tag.allowed_values)}
                  </p>
                </div>
              )}
            </PolicyCard>
          ))}
        </div>
      )}

      {/* Create Tag Panel */}
      <PolicyFormPanel
        isOpen={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        title="Create Tag"
        description="Define a governance tag for databases, tables, and columns"
        accentClassName="bg-green-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreatePanel(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreatePolicy} className="bg-green-600 hover:bg-green-700">Create Tag</Button>
          </>
        }
      >
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

          {createError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {createError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Apply Tag Panel */}
      <PolicyFormPanel
        isOpen={showApplyPanel}
        onClose={() => { setShowApplyPanel(false); setSelectedTag(null); resetApplyForm(); }}
        title={`Apply Tag: ${selectedTag?.tag_name ?? ''}`}
        description="Select the object to apply this tag to"
        accentClassName="bg-green-500"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowApplyPanel(false); setSelectedTag(null); resetApplyForm(); }}>Cancel</Button>
            <Button onClick={handleApply} disabled={!canApplyPolicy || !database || !tagValue} title={!canApplyPolicy ? 'You lack the "apply" permission on governance. Ask an administrator to grant it.' : undefined} className="bg-green-600 hover:bg-green-700">Apply Tag</Button>
          </>
        }
      >
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

          {applyError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {applyError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Tag Details Panel */}
      <PolicyFormPanel
        isOpen={showDetailsPanel}
        onClose={() => setShowDetailsPanel(false)}
        title={`Tag Details: ${selectedTag?.tag_name ?? ''}`}
        accentClassName="bg-green-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDetailsPanel(false)}>Close</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => { setShowDetailsPanel(false); setApplyError(null); setShowApplyPanel(true); }}
            >
              Apply Tag
            </Button>
          </>
        }
      >
          {loadingDetails ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : detailsError ? (
            <ErrorDisplay error={detailsError} onRetry={() => selectedTag && handleViewDetails(selectedTag)} context="general" />
          ) : tagDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tag Name
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {tagDetails.tag_name || selectedTag?.tag_name || '—'}
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
                  <p className="text-sm">{tagDetails.schema || selectedTag?.schema || '—'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Owner
                  </label>
                  <p className="text-sm">{tagDetails.details?.owner || tagDetails.owner || '—'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No details available
            </div>
          )}
      </PolicyFormPanel>
    </div>
  );
}
