'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Modal } from 'rizzui';
import {
  LayoutTemplate, Search, Loader2, CheckCircle2, Package,
  ChevronRight, FileCode, Variable,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { listEventTemplates, applyEventTemplate } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { EventTemplate, ApplyEventTemplateResult } from '@/app/services/api/types';

interface EventTemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  targetDatabase: string;
  targetSchema: string;
  onApplied?: (result: ApplyEventTemplateResult) => void;
}

const EventTemplatePickerModal: React.FC<EventTemplatePickerModalProps> = ({
  isOpen,
  onClose,
  projectId,
  targetDatabase,
  targetSchema,
  onApplied,
}) => {
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<EventTemplate | null>(null);
  const [variableOverrides, setVariableOverrides] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listEventTemplates();
      setTemplates(result);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setSelectedTemplate(null);
      setVariableOverrides({});
      setSearchQuery('');
    }
  }, [isOpen, fetchTemplates]);

  // Auto-fill DATABASE/SCHEMA variables when selecting a template
  useEffect(() => {
    if (selectedTemplate) {
      const overrides: Record<string, string> = {};
      // Scan template events for common variables
      const allSql = selectedTemplate.events.map((e) => e.ddl_sql).join(' ');
      if (allSql.includes('{{DATABASE}}') || allSql.includes('{DATABASE}')) {
        overrides['DATABASE'] = targetDatabase;
      }
      if (allSql.includes('{{SCHEMA}}') || allSql.includes('{SCHEMA}')) {
        overrides['SCHEMA'] = targetSchema;
      }
      setVariableOverrides(overrides);
    }
  }, [selectedTemplate, targetDatabase, targetSchema]);

  const filteredTemplates = templates.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.template_name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  // Group by category
  const grouped = filteredTemplates.reduce<Record<string, EventTemplate[]>>((acc, t) => {
    const cat = t.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const handleApply = async () => {
    if (!selectedTemplate) return;
    setIsApplying(true);
    try {
      const result = await applyEventTemplate(projectId, {
        template_id: selectedTemplate.template_id,
        target_database: targetDatabase,
        target_schema: targetSchema,
        variable_overrides: Object.keys(variableOverrides).length > 0 ? variableOverrides : undefined,
      });
      toast.success(`Applied template: ${result.events_created} events created`);
      onApplied?.(result);
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to apply template');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <LayoutTemplate className="h-5 w-5 text-indigo-500" />
          Event Templates
        </h3>

        {/* Search */}
        <Input
          size="sm"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          prefix={<Search className="h-3.5 w-3.5" />}
          className="mb-4"
        />

        <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-auto">
          {/* Template list */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading templates...
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Package className="h-6 w-6 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No templates found</p>
              </div>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {items.map((tmpl) => (
                      <button
                        key={tmpl.template_id}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg border transition-colors',
                          selectedTemplate?.template_id === tmpl.template_id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        )}
                        onClick={() => setSelectedTemplate(tmpl)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{tmpl.template_name}</span>
                          <div className="flex items-center gap-1.5">
                            {tmpl.is_builtin && (
                              <Badge size="sm" className="bg-slate-100 text-slate-500 text-[10px]">
                                Built-in
                              </Badge>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {tmpl.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Template detail */}
          <div className="border-l dark:border-slate-700 pl-4">
            {selectedTemplate ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">{selectedTemplate.template_name}</h4>
                  <p className="text-xs text-slate-500 mt-1">{selectedTemplate.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge size="sm" className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30">
                      {selectedTemplate.category}
                    </Badge>
                    <Badge size="sm" className="bg-slate-100 text-slate-600 dark:bg-slate-800">
                      {selectedTemplate.events.length} events
                    </Badge>
                  </div>
                </div>

                {/* Events preview */}
                <div>
                  <h5 className="text-xs font-medium text-slate-500 mb-2">Events</h5>
                  <div className="space-y-2 max-h-[200px] overflow-auto">
                    {selectedTemplate.events.map((evt, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="h-3 w-3 text-blue-500 shrink-0" />
                          <span className="font-mono font-semibold">{evt.ddl_type}</span>
                          <span className="text-slate-500">→ {evt.target_table}</span>
                        </div>
                        {evt.description && (
                          <p className="text-slate-500 mt-1 ml-5">{evt.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Variable overrides */}
                {Object.keys(variableOverrides).length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                      <Variable className="h-3 w-3" />
                      Variables
                    </h5>
                    <div className="space-y-2">
                      {Object.entries(variableOverrides).map(([key, val]) => (
                        <div key={key}>
                          <label className="text-xs text-slate-500 block mb-0.5">{key}</label>
                          <Input
                            size="sm"
                            value={val}
                            onChange={(e) =>
                              setVariableOverrides((prev) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Apply */}
                <Button
                  className="w-full gap-1.5"
                  onClick={handleApply}
                  disabled={isApplying}
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Apply Template
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">
                Select a template to see details
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EventTemplatePickerModal;
