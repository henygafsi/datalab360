/**
 * Business glossary client (`/explore-design/glossary/*`) — self-contained
 * CRUD+AI feature. A shared glossary helps data_user clarity (consistent
 * business definitions across modules).
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export interface GlossaryTerm {
  term: string;
  definition: string;
  domain?: string | null;
  owner?: string | null;
  status?: 'DRAFT' | 'VALIDATED' | string;
  updated_at?: string | null;
  [k: string]: unknown;
}

const get = async <T>(url: string): Promise<T> => (await apiClient.get<T>(url)).data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body)).data;
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data;

export const glossary = {
  /** List all business glossary terms. */
  list: () => get<GlossaryTerm[]>(API.exploreDesign.glossaryList()),
  /** Lookup a term (advisor reuse) — optional free-text query. */
  lookup: (q?: string) => get<GlossaryTerm[]>(API.exploreDesign.glossaryLookup(q)),
  /** Create or update a term (admin). */
  upsert: (term: GlossaryTerm) => post<GlossaryTerm>(API.exploreDesign.glossaryUpsert(), term),
  /** AI-draft a definition for admin review. */
  aiDraft: (term: string, context?: string) =>
    post<{ definition: string }>(API.exploreDesign.glossaryAiDraft(), { term, context }),
  /** Delete a term (admin). */
  remove: (term: string) => del<{ deleted?: boolean }>(API.exploreDesign.glossaryDelete(term)),
};

export default glossary;
