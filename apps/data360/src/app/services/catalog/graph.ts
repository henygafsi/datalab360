import apiClient from '@/lib/api-client';

// ---------------------------------------------------------------------------
// /catalog/graph — whole-account nodes + functional relations (center canvas)
// /catalog/schemas/{db}/{schema}/classify — enrichable TYPE/zone tag
// ---------------------------------------------------------------------------

export type SchemaType = 'SOURCE' | 'PRODUCT' | 'PROJECT' | 'UNCLASSIFIED';

export interface CatalogGraphNode {
  id: string;
  kind: 'database' | 'schema' | 'product' | 'project';
  label: string;
  level: number;
  database?: string;
  schema_type?: SchemaType;
  zone?: string | null;
  classified_by?: string | null;
  owner?: string | null;
  created?: string | null;
  status?: string | null;
  anchor_fqn?: string | null;
  project_id?: string;
  project_type?: string | null;
  environments?: string[];
  objects?: number;
  kpis?: { tables: number; rows: number; bytes: number };
}

export interface CatalogGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'contains' | 'anchored_in' | 'deploys_into' | 'lineage';
  weight: number;
}

export interface CatalogGraphResponse {
  nodes: CatalogGraphNode[];
  edges: CatalogGraphEdge[];
  summary: {
    databases: number;
    schemas: Record<string, number>;
    products: number;
    projects: number;
    lineage_edges: number;
  };
}

export async function getCatalogGraph(): Promise<CatalogGraphResponse> {
  const { data } = await apiClient.get<CatalogGraphResponse>('/catalog/graph');
  return data;
}

export async function classifyCatalogSchema(
  database: string,
  schema: string,
  schemaType: SchemaType,
  zone?: string | null,
): Promise<{ ok: boolean; schema_type: SchemaType }> {
  const { data } = await apiClient.post(
    `/catalog/schemas/${encodeURIComponent(database)}/${encodeURIComponent(schema)}/classify`,
    { schema_type: schemaType, zone: zone ?? null },
  );
  return data;
}
