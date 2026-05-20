'use client';

/**
 * custom-blocks-store.ts
 *
 * Read / write project-scoped custom ETL blocks via the project events API.
 *
 *   - There is no global block registry yet (Backend Gap → POST /registry/blocks
 *     is the future home). Today we persist each saved block as an
 *     AI_BLOCK_CREATED event on the project, and we rebuild the in-memory
 *     custom-block list by reading the project's event log back.
 *
 *   - Multiple saves with the same block.name are treated as revisions; the
 *     newest one (latest timestamp) wins. Older revisions stay in the audit
 *     trail untouched.
 *
 * Persona coverage:
 *   - Superadmin gets a real audit trail (event_id, username, timestamp,
 *     event_details.block_definition).
 *   - Admin can list / re-use their own custom blocks in the palette.
 *   - QA reads the same store the palette renders, so the test sandbox
 *     verdict is durable across reloads.
 */
import { useCallback, useEffect, useState } from 'react';
import { addEvent, listEvents } from '@/app/services/api/projectsApi';
import type { ProjectEvent } from '@/app/services/api/types';
import type { CustomBlockCategory } from './custom-block-defaults';

export const CUSTOM_BLOCK_EVENT_TYPE = 'AI_BLOCK_CREATED';
const MODULE_NAME = 'workflow';
const SCHEMA_VERSION = 1;

export type CustomBlockLanguage = 'sql' | 'python';
export type CustomBlockParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface CustomBlockParam {
  name: string;
  type: CustomBlockParamType;
  required: boolean;
  default?: string | number | boolean | null;
  description?: string;
}

export interface CustomBlockPorts {
  /** 0 = no inputs (source), 1 = single, 2 = join, 3 = union (3+) */
  inputs: 0 | 1 | 2 | 3;
  hasOutput: boolean;
  outputSchemaHint?: string;
}

export interface CustomBlockDefinition {
  /** snake_case slug, unique per project */
  name: string;
  label: string;
  description: string;
  category: CustomBlockCategory;
  /** lucide icon name (e.g. "Sparkles") — resolved at render time */
  icon_name: string;
  ports: CustomBlockPorts;
  params: CustomBlockParam[];
  language: CustomBlockLanguage;
  body: string;
  schema_version: number;
}

export interface CustomBlock extends CustomBlockDefinition {
  /** Mirror of the source event for the audit popover */
  event_id: string;
  created_by: string;
  created_at: string;
}

/**
 * Shape we persist inside event_details. Documented here so the future
 * /registry/blocks endpoint can reuse the same JSON.
 */
export interface CustomBlockEventDetails {
  block_definition: CustomBlockDefinition;
  language: CustomBlockLanguage;
  body: string;
  schema_version: number;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export interface SaveCustomBlockInput {
  name: string;
  label: string;
  description: string;
  category: CustomBlockCategory;
  icon_name: string;
  ports: CustomBlockPorts;
  params: CustomBlockParam[];
  language: CustomBlockLanguage;
  body: string;
}

export async function saveCustomBlock(
  projectId: string,
  block: SaveCustomBlockInput,
): Promise<{ event_id: string }> {
  const definition: CustomBlockDefinition = {
    ...block,
    schema_version: SCHEMA_VERSION,
  };
  const details: CustomBlockEventDetails = {
    block_definition: definition,
    language: block.language,
    body: block.body,
    schema_version: SCHEMA_VERSION,
  };
  const response = await addEvent(projectId, {
    module_name: MODULE_NAME,
    event_type: CUSTOM_BLOCK_EVENT_TYPE,
    status: 'success',
    entity_id: block.name,
    entity_type: 'custom_block',
    event_subtype: block.language,
    details: details as unknown as Record<string, unknown>,
  });
  return { event_id: response.event_id };
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

function isCustomBlockEvent(e: ProjectEvent): boolean {
  return e.event_type === CUSTOM_BLOCK_EVENT_TYPE && !!e.details;
}

function eventToBlock(e: ProjectEvent): CustomBlock | null {
  if (!isCustomBlockEvent(e)) return null;
  const details = e.details as unknown as Partial<CustomBlockEventDetails> | null;
  const def = details?.block_definition;
  if (!def || typeof def !== 'object') return null;
  if (typeof def.name !== 'string' || !def.name) return null;
  // Body / language can live either on the definition or alongside it
  // (older revisions or future variants). Coalesce here so the consumer
  // sees a single canonical shape.
  const language: CustomBlockLanguage =
    (def.language as CustomBlockLanguage) ||
    (details?.language as CustomBlockLanguage) ||
    'sql';
  const body = (def.body as string) ?? (details?.body as string) ?? '';
  return {
    name: def.name,
    label: def.label || def.name,
    description: def.description || '',
    category: (def.category as CustomBlockCategory) || 'transform',
    icon_name: def.icon_name || 'Sparkles',
    ports: def.ports || { inputs: 1, hasOutput: true },
    params: Array.isArray(def.params) ? def.params : [],
    language,
    body,
    schema_version: def.schema_version || SCHEMA_VERSION,
    event_id: e.event_id,
    created_by: e.username,
    created_at: e.timestamp,
  };
}

/**
 * Dedupe by block.name — latest revision wins. The events endpoint already
 * returns newest first, but we sort defensively so order swaps don't change
 * the projected list.
 */
function projectEventsToBlocks(events: ProjectEvent[]): CustomBlock[] {
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });
  const byName = new Map<string, CustomBlock>();
  for (const ev of sorted) {
    const block = eventToBlock(ev);
    if (!block) continue;
    if (!byName.has(block.name)) byName.set(block.name, block);
  }
  return Array.from(byName.values());
}

interface UseCustomBlocksResult {
  blocks: CustomBlock[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCustomBlocks(projectId: string | null | undefined): UseCustomBlocksResult {
  const [blocks, setBlocks] = useState<CustomBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setBlocks([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listEvents(projectId, {
        event_type: CUSTOM_BLOCK_EVENT_TYPE,
        limit: 100,
      });
      setBlocks(projectEventsToBlocks(data.events || []));
    } catch (err) {
      // The events endpoint may 404 on brand-new projects — surface a soft
      // empty state rather than a hard error in that case.
      const message = err instanceof Error ? err.message : 'Failed to load custom blocks';
      setError(message);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { blocks, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Validation helpers (used by the wizard)
// ---------------------------------------------------------------------------

export const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

export function validateBlockName(name: string): string | null {
  if (!name) return 'Name is required';
  if (name.length > 40) return 'Max 40 characters';
  if (!SLUG_REGEX.test(name)) return 'Use lowercase letters, digits, underscores (start with a letter)';
  return null;
}

export function validateParamName(name: string): string | null {
  if (!name) return 'Param name required';
  if (!SLUG_REGEX.test(name)) return 'snake_case only';
  return null;
}
