'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip, Modal } from 'rizzui';
import {
  BookTemplate, Plus, Search, Download, Upload, Trash2,
  Check, ChevronDown, ChevronRight, Clock, Users, Star,
  Copy, Edit2, Layers, History, Key, Shield, Tag,
  Table2, Database, Loader2, X, Save,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, DesignEvent, EventType } from '../stores/event-store';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EventTemplate {
  id: string;
  name: string;
  description: string;
  category: 'modeling' | 'ingestion' | 'security' | 'custom';
  events: Array<{
    type: EventType;
    payload: Record<string, any>;
    target: { database: string; schema: string; table: string; column?: string };
  }>;
  eventCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  isBuiltIn: boolean;
  tags: string[];
  version: number;
}

interface TemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | null;
  currentDatabase?: string;
  currentSchema?: string;
  /** List of available tables the user can apply templates to */
  availableTables?: Array<{ database: string; schema: string; table: string }>;
  onApplyTemplate?: (template: EventTemplate) => void;
}

type TabType = 'browse' | 'save';

// ── Built-in Templates ─────────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES: EventTemplate[] = [
  {
    id: 'tpl_scd2_setup',
    name: 'SCD Type 2 Setup',
    description: 'Standard SCD Type 2 configuration with effective dates, expiration dates, current flag, and hash diff column.',
    category: 'ingestion',
    events: [
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'EFF_DATE', columnType: 'TIMESTAMP_NTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP()' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'EXP_DATE', columnType: 'TIMESTAMP_NTZ', nullable: true },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'IS_CURRENT', columnType: 'BOOLEAN', nullable: false, defaultValue: 'TRUE' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'HASH_DIFF', columnType: 'VARCHAR(64)', nullable: true },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'DW_INSERT_TS', columnType: 'TIMESTAMP_NTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP()' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'DW_UPDATE_TS', columnType: 'TIMESTAMP_NTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP()' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'SCD_CONFIGURED',
        payload: { scdType: 'scd_type2', trackingColumns: [], effectiveDateColumn: 'EFF_DATE', expirationDateColumn: 'EXP_DATE', currentFlagColumn: 'IS_CURRENT' },
        target: { database: '', schema: '', table: '' },
      },
    ],
    eventCount: 7,
    createdBy: 'System',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    isBuiltIn: true,
    tags: ['scd', 'history', 'data-vault'],
    version: 1,
  },
  {
    id: 'tpl_audit_columns',
    name: 'Audit Columns',
    description: 'Standard audit columns: created_by, created_at, updated_by, updated_at for tracking record changes.',
    category: 'modeling',
    events: [
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'CREATED_BY', columnType: 'VARCHAR(256)', nullable: false, defaultValue: 'CURRENT_USER()' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'CREATED_AT', columnType: 'TIMESTAMP_NTZ', nullable: false, defaultValue: 'CURRENT_TIMESTAMP()' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'UPDATED_BY', columnType: 'VARCHAR(256)', nullable: true },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'UPDATED_AT', columnType: 'TIMESTAMP_NTZ', nullable: true },
        target: { database: '', schema: '', table: '' },
      },
    ],
    eventCount: 4,
    createdBy: 'System',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    isBuiltIn: true,
    tags: ['audit', 'tracking', 'governance'],
    version: 1,
  },
  {
    id: 'tpl_std_indexes',
    name: 'Standard Indexes',
    description: 'Common index patterns: surrogate key (PK), natural key constraint, and clustering keys for query performance.',
    category: 'modeling',
    events: [
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'SK_ID', columnType: 'NUMBER(38,0)', nullable: false, isIdentity: true },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'PRIMARY_KEY_SET',
        payload: { columns: ['SK_ID'], constraintName: 'PK_SK_ID' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'NK_HASH', columnType: 'VARCHAR(64)', nullable: false, description: 'Natural key hash for dedup' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'TAG_APPLIED',
        payload: { tagName: 'CLUSTER_KEY', tagValue: 'NK_HASH', description: 'Clustering key for query performance' },
        target: { database: '', schema: '', table: '' },
      },
    ],
    eventCount: 4,
    createdBy: 'System',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    isBuiltIn: true,
    tags: ['indexes', 'performance', 'keys'],
    version: 1,
  },
  {
    id: 'tpl_pii_masking',
    name: 'PII Masking Setup',
    description: 'Apply standard masking policies for common PII fields: email, phone, SSN, name.',
    category: 'security',
    events: [
      {
        type: 'MASKING_POLICY_APPLIED',
        payload: { policyName: 'MASK_EMAIL', policyDatabase: 'CP_DATA360', policySchema: 'GOUVERNANCE', policyType: 'SHA2_HASH', columns: ['EMAIL'], description: 'Hash email for analytics' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'MASKING_POLICY_APPLIED',
        payload: { policyName: 'MASK_PHONE', policyDatabase: 'CP_DATA360', policySchema: 'GOUVERNANCE', policyType: 'PARTIAL_MASK', columns: ['PHONE'], maskPattern: '***-***-XXXX' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'MASKING_POLICY_APPLIED',
        payload: { policyName: 'MASK_SSN', policyDatabase: 'CP_DATA360', policySchema: 'GOUVERNANCE', policyType: 'FULL_MASK', columns: ['SSN'], description: 'Full masking for SSN' },
        target: { database: '', schema: '', table: '' },
      },
    ],
    eventCount: 3,
    createdBy: 'System',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    isBuiltIn: true,
    tags: ['pii', 'masking', 'security', 'compliance'],
    version: 1,
  },
  {
    id: 'tpl_soft_delete',
    name: 'Soft Delete Pattern',
    description: 'Add soft delete columns instead of physical deletes: is_deleted flag and deleted_at timestamp.',
    category: 'modeling',
    events: [
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'IS_DELETED', columnType: 'BOOLEAN', nullable: false, defaultValue: 'FALSE' },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'DELETED_AT', columnType: 'TIMESTAMP_NTZ', nullable: true },
        target: { database: '', schema: '', table: '' },
      },
      {
        type: 'ADD_COLUMN',
        payload: { columnName: 'DELETED_BY', columnType: 'VARCHAR(256)', nullable: true },
        target: { database: '', schema: '', table: '' },
      },
    ],
    eventCount: 3,
    createdBy: 'System',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    isBuiltIn: true,
    tags: ['soft-delete', 'modeling'],
    version: 1,
  },
];

// ── Category Config ────────────────────────────────────────────────────────────

const categoryConfig: Record<EventTemplate['category'], { label: string; color: string; icon: React.ComponentType<any> }> = {
  modeling: { label: 'Modeling', color: 'bg-blue-100 text-blue-600', icon: Table2 },
  ingestion: { label: 'Ingestion', color: 'bg-green-100 text-green-600', icon: Layers },
  security: { label: 'Security', color: 'bg-red-100 text-red-600', icon: Shield },
  custom: { label: 'Custom', color: 'bg-purple-100 text-purple-600', icon: Star },
};

// ── Component ──────────────────────────────────────────────────────────────────

const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  isOpen,
  onClose,
  projectId,
  currentDatabase,
  currentSchema,
  availableTables,
  onApplyTemplate,
}) => {
  const { events, addEvent } = useEventStore(projectId);
  const [activeTab, setActiveTab] = useState<TabType>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<EventTemplate['category'] | 'all'>('all');
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Target picker state: which template is awaiting a target selection
  const [pickingTargetFor, setPickingTargetFor] = useState<string | null>(null);
  const [selectedTargetTable, setSelectedTargetTable] = useState<string>('');

  // Per-template event selection: templateId → Set of selected event indices
  const [selectedEventsMap, setSelectedEventsMap] = useState<Record<string, Set<number>>>({});

  // Per-event column overrides for column-targeted events (masking, tags, etc.)
  // Key: `${templateId}:${eventIdx}`, Value: column name(s) the user picked
  const [columnOverrides, setColumnOverrides] = useState<Record<string, string>>({});

  // Cascading target selectors: Database → Schema → Table → Column
  const [selectedDb, setSelectedDb] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedColumn, setSelectedColumn] = useState('');

  // API-fetched options for cascade
  const [dbOptions, setDbOptions] = useState<string[]>([]);
  const [schemaOptions, setSchemaOptions] = useState<string[]>([]);
  const [tableOptionsForSchema, setTableOptionsForSchema] = useState<string[]>([]);
  const [columnOptions, setColumnOptions] = useState<string[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);
  // Non-fatal hint for the cascading target picker when metadata can't be fetched.
  const [loadError, setLoadError] = useState<string | null>(null);

  // Derive tables from props or from events in the store
  const tableOptions = useMemo(() => {
    if (availableTables && availableTables.length > 0) return availableTables;
    // Fallback: extract unique tables from existing events
    const seen = new Map<string, { database: string; schema: string; table: string }>();
    for (const ev of events) {
      const t = ev.target;
      if (t?.table && t.table !== t.schema) {
        const key = `${t.database}.${t.schema}.${t.table}`;
        if (!seen.has(key)) seen.set(key, { database: t.database, schema: t.schema, table: t.table });
      }
    }
    return Array.from(seen.values());
  }, [availableTables, events]);

  // Fetch databases on mount
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingDb(true);
    setLoadError(null);
    getDatabases()
      .then((dbs) => { if (!cancelled) setDbOptions(dbs); })
      .catch(() => setLoadError("Couldn't load target metadata."))
      .finally(() => { if (!cancelled) setLoadingDb(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Fetch schemas when database changes
  React.useEffect(() => {
    if (!selectedDb) { setSchemaOptions([]); return; }
    let cancelled = false;
    setLoadingSchema(true);
    getSchemas(selectedDb)
      .then((schemas) => { if (!cancelled) setSchemaOptions(schemas); })
      .catch(() => setLoadError("Couldn't load target metadata."))
      .finally(() => { if (!cancelled) setLoadingSchema(false); });
    return () => { cancelled = true; };
  }, [selectedDb]);

  // Fetch tables when schema changes
  React.useEffect(() => {
    if (!selectedDb || !selectedSchema) { setTableOptionsForSchema([]); return; }
    let cancelled = false;
    setLoadingTable(true);
    getTables(selectedDb, selectedSchema)
      .then((tables) => { if (!cancelled) setTableOptionsForSchema(tables); })
      .catch(() => setLoadError("Couldn't load target metadata."))
      .finally(() => { if (!cancelled) setLoadingTable(false); });
    return () => { cancelled = true; };
  }, [selectedDb, selectedSchema]);

  // Fetch columns when table changes
  React.useEffect(() => {
    if (!selectedDb || !selectedSchema || !selectedTable) { setColumnOptions([]); return; }
    let cancelled = false;
    setLoadingColumns(true);
    getTableColumns(selectedDb, selectedSchema, selectedTable)
      .then((cols) => {
        if (!cancelled) setColumnOptions(cols.map((c) => c.name || c.COLUMN_NAME || '').filter(Boolean));
      })
      .catch(() => setLoadError("Couldn't load target metadata."))
      .finally(() => { if (!cancelled) setLoadingColumns(false); });
    return () => { cancelled = true; };
  }, [selectedDb, selectedSchema, selectedTable]);

  // Sync cascading selects → selectedTargetTable (used by handleConfirmApply)
  React.useEffect(() => {
    if (selectedDb && selectedSchema && selectedTable) {
      setSelectedTargetTable(`${selectedDb}.${selectedSchema}.${selectedTable}`);
    } else {
      setSelectedTargetTable('');
    }
  }, [selectedDb, selectedSchema, selectedTable]);

  // availableColumns from API (replaces event-derived columns)
  const availableColumns = columnOptions;

  // Check if an event type targets specific columns (needs column picker)
  const isColumnTargetedEvent = (type: EventType): boolean =>
    type === 'MASKING_POLICY_APPLIED' || type === 'MASKING_POLICY_REMOVED' ||
    type === 'TAG_APPLIED' || type === 'TAG_REMOVED';

  // Save template state
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveCategory, setSaveCategory] = useState<EventTemplate['category']>('custom');
  const [saveTags, setSaveTags] = useState('');

  // Custom templates stored in localStorage
  const [customTemplates, setCustomTemplates] = useState<EventTemplate[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('explore-design-templates');
      return stored ? (JSON.parse(stored) as EventTemplate[]) : [];
    } catch {
      return [];
    }
  });

  const allTemplates = useMemo(
    () => [...BUILT_IN_TEMPLATES, ...customTemplates],
    [customTemplates],
  );

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allTemplates, categoryFilter, searchQuery]);

  // Get the selected indices for a template (default: all selected)
  const getSelectedIndices = useCallback((template: EventTemplate): Set<number> => {
    if (selectedEventsMap[template.id]) return selectedEventsMap[template.id];
    return new Set(template.events.map((_, i) => i));
  }, [selectedEventsMap]);

  const toggleEventSelection = useCallback((templateId: string, idx: number, totalEvents: number) => {
    setSelectedEventsMap((prev) => {
      const current = prev[templateId] ?? new Set(Array.from({ length: totalEvents }, (_, i) => i));
      const next = new Set(current);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { ...prev, [templateId]: next };
    });
  }, []);

  const toggleAllEvents = useCallback((templateId: string, totalEvents: number) => {
    setSelectedEventsMap((prev) => {
      const current = prev[templateId] ?? new Set(Array.from({ length: totalEvents }, (_, i) => i));
      const allSelected = current.size === totalEvents;
      return { ...prev, [templateId]: allSelected ? new Set<number>() : new Set(Array.from({ length: totalEvents }, (_, i) => i)) };
    });
  }, []);

  // Step 1: Click "Apply" → expand template to show cascade selectors + events
  const handleApplyClick = useCallback((templateId: string) => {
    setExpandedTemplateId(templateId);
    setPickingTargetFor(templateId);

    // Initialize cascade with current context
    setSelectedDb(currentDatabase || '');
    setSelectedSchema(currentSchema || '');
    setSelectedTable('');
    setSelectedColumn('');
    setSelectedTargetTable('');
  }, [currentDatabase, currentSchema]);

  // Step 2: Confirm target → apply only selected events
  const handleConfirmApply = useCallback(
    async (template: EventTemplate) => {
      if (!selectedTargetTable) {
        toast.error('Please select a target table');
        return;
      }

      const selected = getSelectedIndices(template);
      if (selected.size === 0) {
        toast.error('Select at least one event to apply');
        return;
      }

      const parts = selectedTargetTable.split('.');
      const targetDb = parts[0] || currentDatabase || 'DB';
      const targetSch = parts[1] || currentSchema || 'PUBLIC';
      const targetTbl = parts.slice(2).join('.') || 'TABLE';

      setIsApplying(true);
      try {
        let added = 0;
        let failed = 0;

        for (let i = 0; i < template.events.length; i++) {
          if (!selected.has(i)) continue;
          const evt = template.events[i];

          // For column-targeted events, use the user-picked column override
          let finalPayload: Record<string, any> = { ...evt.payload, isTemplate: false, templateId: template.id };
          let finalColumn = evt.target.column;

          if (isColumnTargetedEvent(evt.type)) {
            const overrideKey = `${template.id}:${i}`;
            const pickedCol = columnOverrides[overrideKey];
            if (pickedCol) {
              // Override the columns array with the user's pick
              finalPayload = { ...finalPayload, columns: [pickedCol] };
              finalColumn = pickedCol;
            } else if (!evt.payload.columns?.length && !finalColumn) {
              // No column specified at all — skip with warning
              failed++;
              continue;
            }
          }

          const result = addEvent({
            type: evt.type,
            projectId: projectId || undefined,
            target: {
              database: targetDb,
              schema: targetSch,
              table: targetTbl,
              column: finalColumn,
            },
            payload: finalPayload,
          });
          if (result) added++;
          else failed++;
        }

        if (!template.isBuiltIn) {
          setCustomTemplates((prev) => {
            const updated = prev.map((t) =>
              t.id === template.id ? { ...t, usageCount: t.usageCount + 1 } : t,
            );
            localStorage.setItem('explore-design-templates', JSON.stringify(updated));
            return updated;
          });
        }

        if (onApplyTemplate) onApplyTemplate(template);

        if (failed > 0) {
          toast(`Applied ${added}/${added + failed} events to ${targetTbl}. ${failed} event(s) were rejected by validation.`, { icon: '⚠️' });
        } else {
          toast.success(`Applied ${added} event(s) to ${targetTbl}`);
        }

        setPickingTargetFor(null);
        setSelectedTargetTable('');
        onClose();
      } catch (err) {
        toast.error('Failed to apply template');
      } finally {
        setIsApplying(false);
      }
    },
    [selectedTargetTable, getSelectedIndices, addEvent, projectId, currentDatabase, currentSchema, onApplyTemplate, onClose],
  );

  const handleSaveTemplate = useCallback(() => {
    if (!saveName.trim()) {
      toast.error('Template name is required');
      return;
    }

    const pendingEvents = events.filter((e) => e.status === 'pending' && !e.payload?.isTemplate);
    if (pendingEvents.length === 0) {
      toast.error('No pending events to save as template');
      return;
    }

    const newTemplate: EventTemplate = {
      id: `tpl_custom_${Date.now()}`,
      name: saveName.trim(),
      description: saveDescription.trim() || `Custom template with ${pendingEvents.length} events`,
      category: saveCategory,
      events: pendingEvents.map((e) => ({
        type: e.type,
        payload: { ...e.payload },
        target: { database: '', schema: '', table: '', column: e.target.column },
      })),
      eventCount: pendingEvents.length,
      createdBy: 'You',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
      isBuiltIn: false,
      tags: saveTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      version: 1,
    };

    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    localStorage.setItem('explore-design-templates', JSON.stringify(updated));

    toast.success(`Template "${saveName}" saved! Visible to all team members.`);
    setSaveName('');
    setSaveDescription('');
    setSaveTags('');
    setActiveTab('browse');
  }, [saveName, saveDescription, saveCategory, saveTags, events, customTemplates]);

  const handleDeleteTemplate = useCallback(
    (templateId: string) => {
      const updated = customTemplates.filter((t) => t.id !== templateId);
      setCustomTemplates(updated);
      localStorage.setItem('explore-design-templates', JSON.stringify(updated));
      toast.success('Template deleted');
    },
    [customTemplates],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize="720px">
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <BookTemplate className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Event Templates
                </h2>
                <p className="text-xs text-slate-500">
                  Save & reuse common event patterns across projects
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('browse')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTab === 'browse'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" />
                Browse Templates
                <Badge size="sm" className="bg-slate-200 text-slate-600">{allTemplates.length}</Badge>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('save')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTab === 'save'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Save Current as Template
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'browse' && (
            <div>
              {/* Search + Filter */}
              <div className="px-6 py-3 border-b dark:border-slate-700 flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="px-3 py-2 text-sm border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="all">All Categories</option>
                  <option value="modeling">Modeling</option>
                  <option value="ingestion">Ingestion</option>
                  <option value="security">Security</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Template List */}
              <div className="divide-y dark:divide-slate-700">
                {filteredTemplates.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <BookTemplate className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No templates found</p>
                  </div>
                ) : (
                  filteredTemplates.map((template) => {
                    const cat = categoryConfig[template.category];
                    const CatIcon = cat.icon;
                    const isExpanded = expandedTemplateId === template.id;

                    return (
                      <div key={template.id} className="px-6">
                        <div
                          className="py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 -mx-6 px-6"
                          onClick={() => {
                            setExpandedTemplateId(isExpanded ? null : template.id);
                            if (!isExpanded) {
                              // Initialize cascade selectors with defaults when expanding
                              setSelectedDb(currentDatabase || '');
                              setSelectedSchema(currentSchema || '');
                              setSelectedTable('');
                              setSelectedColumn('');
                            }
                          }}
                        >
                          <button className="p-0.5 mt-1">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{template.name}</h4>
                              <Badge size="sm" className={cn(cat.color, 'text-[10px]')}>
                                <CatIcon className="h-2.5 w-2.5 mr-0.5" />
                                {cat.label}
                              </Badge>
                              {template.isBuiltIn && (
                                <Badge size="sm" className="bg-indigo-100 text-indigo-600 text-[10px]">
                                  Built-in
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2">
                              {template.description}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Layers className="h-2.5 w-2.5" />
                                {template.eventCount} events
                              </span>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Users className="h-2.5 w-2.5" />
                                {template.createdBy}
                              </span>
                              {template.usageCount > 0 && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                  <Download className="h-2.5 w-2.5" />
                                  Used {template.usageCount}x
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"
                              onClick={() => handleApplyClick(template.id)}
                              disabled={isApplying}
                            >
                              {isApplying && pickingTargetFor === template.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Apply
                            </Button>
                            {!template.isBuiltIn && (
                              <Tooltip content="Delete">
                                <button
                                  onClick={() => handleDeleteTemplate(template.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </div>

                        {/* Target picker is now integrated into the expanded section above */}

                        {/* Expanded: target selectors + events with selection checkboxes */}
                        {isExpanded && (() => {
                          const sel = getSelectedIndices(template);
                          const allChecked = sel.size === template.events.length;
                          const someChecked = sel.size > 0 && !allChecked;

                          return (
                            <div className="pb-3 ml-7">
                              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                                {/* Cascading target selectors: Database → Schema → Table → Column */}
                                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 mb-3 border border-purple-200 dark:border-purple-800">
                                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-1.5">
                                    <Database className="h-3.5 w-3.5" />
                                    Target location
                                  </p>
                                  {loadError && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">{loadError}</p>
                                  )}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-medium text-slate-500 mb-0.5 flex items-center gap-1">
                                        Database {loadingDb && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                      </label>
                                      <select
                                        value={selectedDb}
                                        onChange={(e) => { setSelectedDb(e.target.value); setSelectedSchema(''); setSelectedTable(''); setSelectedColumn(''); }}
                                        className="w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-slate-800 dark:border-slate-700 font-mono"
                                      >
                                        <option value="">-- Database --</option>
                                        {dbOptions.map((db) => (
                                          <option key={db} value={db}>{db}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-medium text-slate-500 mb-0.5 flex items-center gap-1">
                                        Schema {loadingSchema && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                      </label>
                                      <select
                                        value={selectedSchema}
                                        onChange={(e) => { setSelectedSchema(e.target.value); setSelectedTable(''); setSelectedColumn(''); }}
                                        disabled={!selectedDb || loadingSchema}
                                        className="w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-slate-800 dark:border-slate-700 font-mono disabled:opacity-50"
                                      >
                                        <option value="">{loadingSchema ? 'Loading...' : '-- Schema --'}</option>
                                        {schemaOptions.map((s) => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-medium text-slate-500 mb-0.5 flex items-center gap-1">
                                        Table {loadingTable && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                      </label>
                                      <select
                                        value={selectedTable}
                                        onChange={(e) => { setSelectedTable(e.target.value); setSelectedColumn(''); }}
                                        disabled={!selectedSchema || loadingTable}
                                        className="w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-slate-800 dark:border-slate-700 font-mono disabled:opacity-50"
                                      >
                                        <option value="">{loadingTable ? 'Loading...' : '-- Table --'}</option>
                                        {tableOptionsForSchema.map((t) => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {template.events.some((e) => isColumnTargetedEvent(e.type)) && (
                                      <div>
                                        <label className="text-[10px] font-medium text-slate-500 mb-0.5 flex items-center gap-1">
                                          Column {loadingColumns && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                        </label>
                                        <select
                                          value={selectedColumn}
                                          onChange={(e) => setSelectedColumn(e.target.value)}
                                          disabled={!selectedTable || loadingColumns}
                                          className="w-full px-2 py-1.5 text-xs border rounded-lg dark:bg-slate-800 dark:border-slate-700 font-mono disabled:opacity-50"
                                        >
                                          <option value="">{loadingColumns ? 'Loading...' : '-- Column (optional) --'}</option>
                                          {availableColumns.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                  {selectedDb && (
                                    <p className="text-[10px] font-mono text-purple-600 dark:text-purple-400 mt-1.5 truncate">
                                      {selectedDb}{selectedSchema ? `.${selectedSchema}` : ''}{selectedTable ? `.${selectedTable}` : ''}{selectedColumn ? ` → ${selectedColumn}` : ''}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-slate-500">Select events to apply:</p>
                                  <button
                                    onClick={() => toggleAllEvents(template.id, template.events.length)}
                                    className="text-[10px] font-medium text-purple-600 hover:text-purple-700 hover:underline"
                                  >
                                    {allChecked ? 'Deselect all' : 'Select all'}
                                  </button>
                                </div>
                                <div className="space-y-1.5">
                                  {template.events.map((evt, idx) => {
                                    const checked = sel.has(idx);
                                    const needsColumnPick = isColumnTargetedEvent(evt.type);
                                    const overrideKey = `${template.id}:${idx}`;
                                    const currentCol = columnOverrides[overrideKey] || '';
                                    const defaultCol = evt.payload.columns?.[0] || '';

                                    return (
                                      <div key={idx}>
                                        <label
                                          className={cn(
                                            'flex items-center gap-2 text-xs rounded px-2.5 py-1.5 border cursor-pointer transition-colors',
                                            checked
                                              ? 'bg-white dark:bg-slate-800 border-purple-200 dark:border-purple-800'
                                              : 'bg-slate-100/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700 opacity-50',
                                            needsColumnPick ? 'rounded-b-none' : '',
                                          )}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleEventSelection(template.id, idx, template.events.length)}
                                            className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                          />
                                          <Badge size="sm" className="bg-slate-100 text-slate-500 text-[10px] min-w-[1.5rem] text-center">
                                            {idx + 1}
                                          </Badge>
                                          <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                                            {evt.type}
                                          </span>
                                          <span className="text-slate-400 flex-1 truncate">
                                            {evt.payload.columnName || evt.payload.policyName || evt.payload.constraintName || evt.payload.scdType || evt.payload.tagName || ''}
                                          </span>
                                        </label>
                                        {/* Column picker for masking / tag events */}
                                        {needsColumnPick && checked && (
                                          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/10 border border-t-0 border-amber-200 dark:border-amber-800 rounded-b text-[11px]">
                                            <Shield className="h-3 w-3 text-amber-500 flex-shrink-0" />
                                            <span className="text-amber-700 dark:text-amber-300 whitespace-nowrap">Apply on column:</span>
                                            {availableColumns.length > 0 ? (
                                              <select
                                                value={currentCol || defaultCol}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  setColumnOverrides((prev) => ({ ...prev, [overrideKey]: e.target.value }));
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex-1 px-2 py-0.5 text-[11px] border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                                              >
                                                <option value="">-- pick column --</option>
                                                {availableColumns.map((col) => (
                                                  <option key={col} value={col}>{col}</option>
                                                ))}
                                              </select>
                                            ) : (
                                              <input
                                                type="text"
                                                value={currentCol || defaultCol}
                                                placeholder={defaultCol || 'COLUMN_NAME'}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  setColumnOverrides((prev) => ({ ...prev, [overrideKey]: e.target.value }));
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex-1 px-2 py-0.5 text-[11px] border rounded dark:bg-slate-800 dark:border-slate-700 font-mono"
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                {sel.size > 0 && sel.size < template.events.length && (
                                  <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                                    {sel.size} of {template.events.length} events selected
                                  </p>
                                )}
                                {template.tags.length > 0 && (
                                  <div className="flex items-center gap-1.5 mt-2">
                                    <Tag className="h-3 w-3 text-slate-400" />
                                    {template.tags.map((tag) => (
                                      <Badge key={tag} size="sm" className="bg-slate-100 text-slate-500 text-[10px]">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

                                {/* Confirm apply button */}
                                <div className="flex items-center gap-2 mt-3 pt-3 border-t dark:border-slate-700">
                                  <Button
                                    size="sm"
                                    className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                                    onClick={() => handleConfirmApply(template)}
                                    disabled={!selectedTargetTable || isApplying || sel.size === 0}
                                  >
                                    {isApplying ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                    Apply {sel.size} event(s)
                                  </Button>
                                  {!selectedTargetTable && (
                                    <p className="text-[10px] text-amber-600">Select a database, schema and table above</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'save' && (
            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <BookTemplate className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Save your current pending events as a reusable template.
                  Templates are shared with all team members.
                </span>
              </div>

              <div>
                <label className="text-sm font-medium">Template Name *</label>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., SCD2 Setup, Audit Columns"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Describe what this template does..."
                  className="w-full mt-1 p-2 text-sm border rounded-lg dark:bg-slate-800 dark:border-slate-700 min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <select
                    value={saveCategory}
                    onChange={(e) => setSaveCategory(e.target.value as EventTemplate['category'])}
                    className="w-full mt-1 p-2 text-sm border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                  >
                    <option value="modeling">Modeling</option>
                    <option value="ingestion">Ingestion</option>
                    <option value="security">Security</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Tags</label>
                  <Input
                    value={saveTags}
                    onChange={(e) => setSaveTags(e.target.value)}
                    placeholder="scd, history, audit"
                    className="mt-1"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Comma-separated</p>
                </div>
              </div>

              {/* Preview of events to save */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Events to include ({events.filter((e) => e.status === 'pending' && !e.payload?.isTemplate).length})
                </label>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 max-h-[200px] overflow-auto space-y-1">
                  {events
                    .filter((e) => e.status === 'pending' && !e.payload?.isTemplate)
                    .map((evt, idx) => (
                      <div
                        key={evt.id}
                        className="flex items-center gap-2 text-xs bg-white dark:bg-slate-800 rounded px-2.5 py-1.5 border dark:border-slate-700"
                      >
                        <Badge size="sm" className="bg-slate-100 text-slate-500 text-[10px]">
                          {idx + 1}
                        </Badge>
                        <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                          {evt.type}
                        </span>
                        <span className="text-slate-400 truncate flex-1">
                          {evt.target.table}
                        </span>
                      </div>
                    ))}
                  {events.filter((e) => e.status === 'pending' && !e.payload?.isTemplate).length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No pending events. Make some changes first.
                    </p>
                  )}
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleSaveTemplate}
                disabled={!saveName.trim() || events.filter((e) => e.status === 'pending' && !e.payload?.isTemplate).length === 0}
              >
                <Save className="h-4 w-4" />
                Save Template
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TemplateLibrary;
