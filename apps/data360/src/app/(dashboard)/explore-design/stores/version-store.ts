/**
 * Version Store for Explore & Design
 * Manages versioning with schema cloning, changelog, and version history
 *
 * Versioning creates a clone of the source schema with:
 * - All table structures
 * - Column definitions and constraints
 * - Ingestion configurations adapted for the new version
 */

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Version Types
export type VersionType = 'major' | 'minor' | 'patch';
export type VersionStatus = 'draft' | 'published' | 'deployed' | 'archived' | 'deprecated';
export type SchemaCloneStatus = 'pending' | 'cloning' | 'completed' | 'failed' | 'rollback';

// Schema Clone Configuration
export interface SchemaCloneConfig {
  source_database: string;
  source_schema: string;
  target_database: string;
  target_schema: string; // e.g., "SCHEMA_V1_0_0" or "SCHEMA_20231215"
  naming_strategy: 'version_suffix' | 'timestamp_suffix' | 'custom';
  include_data: boolean;
  include_constraints: boolean;
  include_policies: boolean;
  include_grants: boolean;
  warehouse?: string;
}

export interface SchemaCloneResult {
  status: SchemaCloneStatus;
  clone_id: string;
  started_at: string;
  completed_at?: string;
  tables_cloned: number;
  tables_total: number;
  error?: string;
  ddl_statements: string[];
  rollback_ddl?: string[];
}

// Interfaces
export interface ChangelogEntry {
  type: string;
  table?: string;
  column?: string;
  from?: string;
  to?: string;
  description?: string;
}

// Ingestion Adaptation for versioned schema
export interface IngestionAdaptation {
  table: string;
  original_config: {
    mode: string;
    source_schema: string;
    target_schema: string;
    schedule?: string;
  };
  adapted_config: {
    mode: string;
    source_schema: string;
    target_schema: string;
    schedule?: string;
    pause_during_clone?: boolean;
    resume_after_clone?: boolean;
  };
  streams_to_recreate?: string[];
  tasks_to_recreate?: string[];
  pipes_to_recreate?: string[];
}

export interface VersionSnapshot {
  tables: Array<{
    id: string;
    database: string;
    schema: string;
    table: string;
    columns: Array<{
      name: string;
      data_type: string;
      nullable: boolean;
      default_value?: string;
      constraints?: string[];
    }>;
    ingestion_mode?: string;
    primary_keys?: string[];
    foreign_keys?: Array<{
      column: string;
      references_table: string;
      references_column: string;
    }>;
    indexes?: Array<{
      name: string;
      columns: string[];
      unique: boolean;
    }>;
  }>;
  events: string[];
  configs: Record<string, any>;
  ingestion_adaptations?: IngestionAdaptation[];
}

export interface Version {
  version_id: string;
  project_id: string;
  version: string;
  previous_version?: string;
  status: VersionStatus;
  created_at: string;
  created_by: string;
  published_at?: string;
  deployed_at?: string;
  deployed_by?: string;
  environment?: string;
  changelog: {
    summary: string;
    changes: ChangelogEntry[];
  };
  snapshot: VersionSnapshot;
  deployment_id?: string;

  // Schema Clone Configuration
  schema_clone?: {
    config: SchemaCloneConfig;
    result?: SchemaCloneResult;
    versioned_schema_name: string; // The new schema name (e.g., "MY_SCHEMA_V1_2_0")
  };
}

export interface VersionComparison {
  from_version: string;
  to_version: string;
  diff: {
    tables_added: string[];
    tables_removed: string[];
    tables_modified: Array<{
      table: string;
      changes: ChangelogEntry[];
    }>;
    policies_added: string[];
    policies_removed: string[];
    columns_added: Array<{ table: string; column: string }>;
    columns_removed: Array<{ table: string; column: string }>;
  };
}

// Store State
interface VersionStoreState {
  versions: Version[];
  currentVersion: Version | null;
  projectVersions: Record<string, Version[]>;
  isLoading: boolean;
  error: string | null;
}

// Helper functions
const generateVersionId = (): string => {
  return `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const parseVersion = (version: string): { major: number; minor: number; patch: number } => {
  const parts = version.replace('v', '').split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
};

const incrementVersion = (currentVersion: string, type: VersionType): string => {
  const { major, minor, patch } = parseVersion(currentVersion);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
};

// Generate versioned schema name based on naming strategy
export const generateVersionedSchemaName = (
  sourceSchema: string,
  version: string,
  strategy: SchemaCloneConfig['naming_strategy']
): string => {
  const versionClean = version.replace(/\./g, '_');
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

  switch (strategy) {
    case 'version_suffix':
      return `${sourceSchema}_V${versionClean}`;
    case 'timestamp_suffix':
      return `${sourceSchema}_${timestamp}`;
    case 'custom':
    default:
      return `${sourceSchema}_V${versionClean}`;
  }
};

// Generate DDL statements for schema clone
export const generateSchemaCloneDDL = (config: SchemaCloneConfig): string[] => {
  const statements: string[] = [];
  const { source_database, source_schema, target_database, target_schema } = config;

  // Create schema
  statements.push(`CREATE SCHEMA IF NOT EXISTS ${target_database}.${target_schema};`);

  // Clone tables (structure only or with data)
  if (config.include_data) {
    statements.push(
      `CREATE OR REPLACE SCHEMA ${target_database}.${target_schema} CLONE ${source_database}.${source_schema};`
    );
  } else {
    statements.push(`-- Clone table structures without data`);
    statements.push(
      `CREATE OR REPLACE SCHEMA ${target_database}.${target_schema} CLONE ${source_database}.${source_schema} CLONE=STRUCTURE_ONLY;`
    );
  }

  // Copy grants if needed
  if (config.include_grants) {
    statements.push(`-- Grant copying`);
    statements.push(
      `GRANT USAGE ON SCHEMA ${target_database}.${target_schema} TO ROLE DATA_ANALYST;`
    );
    statements.push(
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${target_database}.${target_schema} TO ROLE DATA_ANALYST;`
    );
  }

  return statements;
};

// Generate rollback DDL statements
export const generateRollbackDDL = (config: SchemaCloneConfig): string[] => {
  return [
    `-- Rollback: Drop versioned schema`,
    `DROP SCHEMA IF EXISTS ${config.target_database}.${config.target_schema} CASCADE;`,
  ];
};

// Generate ingestion adaptations for versioned schema
export const generateIngestionAdaptations = (
  tables: VersionSnapshot['tables'],
  sourceSchema: string,
  targetSchema: string
): IngestionAdaptation[] => {
  return tables.map((table) => ({
    table: table.table,
    original_config: {
      mode: table.ingestion_mode || 'full_refresh',
      source_schema: sourceSchema,
      target_schema: sourceSchema,
    },
    adapted_config: {
      mode: table.ingestion_mode || 'full_refresh',
      source_schema: sourceSchema,
      target_schema: targetSchema,
      pause_during_clone: true,
      resume_after_clone: true,
    },
    streams_to_recreate: table.ingestion_mode === 'incremental' ? [`STREAM_${table.table}`] : [],
    tasks_to_recreate: table.ingestion_mode?.startsWith('scd') ? [`TASK_${table.table}_SCD`] : [],
    pipes_to_recreate: [],
  }));
};

// Atoms with localStorage persistence
export const versionStoreAtom = atomWithStorage<VersionStoreState>('explore-design-versions', {
  versions: [],
  currentVersion: null,
  projectVersions: {},
  isLoading: false,
  error: null,
});

// Derived atoms
export const latestVersionAtom = atom((get) => {
  const store = get(versionStoreAtom);
  if (store.versions.length === 0) return null;

  return store.versions
    .filter((v) => v.status === 'deployed' || v.status === 'published')
    .sort((a, b) => {
      const vA = parseVersion(a.version);
      const vB = parseVersion(b.version);
      if (vA.major !== vB.major) return vB.major - vA.major;
      if (vA.minor !== vB.minor) return vB.minor - vA.minor;
      return vB.patch - vA.patch;
    })[0];
});

export const draftVersionsAtom = atom((get) => {
  const store = get(versionStoreAtom);
  return store.versions.filter((v) => v.status === 'draft');
});

export const versionHistoryAtom = atom((get) => {
  const store = get(versionStoreAtom);
  return store.versions
    .filter((v) => v.status !== 'draft')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
});

// Actions
export const createVersionAtom = atom(
  null,
  (get, set, params: {
    project_id: string;
    version_type: VersionType;
    changelog_summary: string;
    changes: ChangelogEntry[];
    snapshot: VersionSnapshot;
    created_by: string;
  }) => {
    const store = get(versionStoreAtom);

    // Find latest version for this project
    const projectVersions = store.versions
      .filter((v) => v.project_id === params.project_id)
      .sort((a, b) => {
        const vA = parseVersion(a.version);
        const vB = parseVersion(b.version);
        if (vA.major !== vB.major) return vB.major - vA.major;
        if (vA.minor !== vB.minor) return vB.minor - vA.minor;
        return vB.patch - vA.patch;
      });

    const latestVersion = projectVersions[0]?.version || '0.0.0';
    const newVersionNumber = incrementVersion(latestVersion, params.version_type);

    const newVersion: Version = {
      version_id: generateVersionId(),
      project_id: params.project_id,
      version: newVersionNumber,
      previous_version: latestVersion !== '0.0.0' ? latestVersion : undefined,
      status: 'draft',
      created_at: new Date().toISOString(),
      created_by: params.created_by,
      changelog: {
        summary: params.changelog_summary,
        changes: params.changes,
      },
      snapshot: params.snapshot,
    };

    set(versionStoreAtom, {
      ...store,
      versions: [...store.versions, newVersion],
      currentVersion: newVersion,
    });

    return newVersion.version_id;
  }
);

export const publishVersionAtom = atom(null, (get, set, version_id: string) => {
  const store = get(versionStoreAtom);

  set(versionStoreAtom, {
    ...store,
    versions: store.versions.map((v) =>
      v.version_id === version_id
        ? { ...v, status: 'published' as const, published_at: new Date().toISOString() }
        : v
    ),
  });
});

export const deployVersionAtom = atom(
  null,
  (get, set, params: { version_id: string; deployment_id: string; deployed_by: string; environment: string }) => {
    const store = get(versionStoreAtom);

    set(versionStoreAtom, {
      ...store,
      versions: store.versions.map((v) =>
        v.version_id === params.version_id
          ? {
              ...v,
              status: 'deployed' as const,
              deployed_at: new Date().toISOString(),
              deployed_by: params.deployed_by,
              deployment_id: params.deployment_id,
              environment: params.environment,
            }
          : v
      ),
    });
  }
);

export const archiveVersionAtom = atom(null, (get, set, version_id: string) => {
  const store = get(versionStoreAtom);

  set(versionStoreAtom, {
    ...store,
    versions: store.versions.map((v) =>
      v.version_id === version_id ? { ...v, status: 'archived' as const } : v
    ),
  });
});

export const compareVersionsAtom = atom(
  null,
  (get, _set, params: { from_version_id: string; to_version_id: string }): VersionComparison | null => {
    const store = get(versionStoreAtom);
    const fromVersion = store.versions.find((v) => v.version_id === params.from_version_id);
    const toVersion = store.versions.find((v) => v.version_id === params.to_version_id);

    if (!fromVersion || !toVersion) return null;

    const fromTables = new Set(fromVersion.snapshot.tables.map((t) => t.id));
    const toTables = new Set(toVersion.snapshot.tables.map((t) => t.id));

    const tablesAdded = [...toTables].filter((t) => !fromTables.has(t));
    const tablesRemoved = [...fromTables].filter((t) => !toTables.has(t));

    // Find modified tables
    const tablesModified: VersionComparison['diff']['tables_modified'] = [];
    const columnsAdded: VersionComparison['diff']['columns_added'] = [];
    const columnsRemoved: VersionComparison['diff']['columns_removed'] = [];

    toVersion.snapshot.tables.forEach((toTable) => {
      const fromTable = fromVersion.snapshot.tables.find((t) => t.id === toTable.id);
      if (!fromTable) return;

      const changes: ChangelogEntry[] = [];

      // Check columns
      const fromCols = new Set(fromTable.columns);
      const toCols = new Set(toTable.columns);

      toCols.forEach((col) => {
        if (!fromCols.has(col)) {
          changes.push({ type: 'column_added', table: toTable.table, column: col });
          columnsAdded.push({ table: toTable.table, column: col });
        }
      });

      fromCols.forEach((col) => {
        if (!toCols.has(col)) {
          changes.push({ type: 'column_removed', table: toTable.table, column: col });
          columnsRemoved.push({ table: toTable.table, column: col });
        }
      });

      // Check ingestion mode
      if (fromTable.ingestion_mode !== toTable.ingestion_mode) {
        changes.push({
          type: 'ingestion_changed',
          table: toTable.table,
          from: fromTable.ingestion_mode,
          to: toTable.ingestion_mode,
        });
      }

      if (changes.length > 0) {
        tablesModified.push({ table: toTable.table, changes });
      }
    });

    return {
      from_version: fromVersion.version,
      to_version: toVersion.version,
      diff: {
        tables_added: tablesAdded,
        tables_removed: tablesRemoved,
        tables_modified: tablesModified,
        policies_added: [],
        policies_removed: [],
        columns_added: columnsAdded,
        columns_removed: columnsRemoved,
      },
    };
  }
);

export const setCurrentVersionAtom = atom(null, (get, set, version_id: string | null) => {
  const store = get(versionStoreAtom);
  const version = version_id ? store.versions.find((v) => v.version_id === version_id) : null;

  set(versionStoreAtom, {
    ...store,
    currentVersion: version || null,
  });
});

export const getVersionsByProjectAtom = atom((get) => (project_id: string) => {
  const store = get(versionStoreAtom);
  return store.versions
    .filter((v) => v.project_id === project_id)
    .sort((a, b) => {
      const vA = parseVersion(a.version);
      const vB = parseVersion(b.version);
      if (vA.major !== vB.major) return vB.major - vA.major;
      if (vA.minor !== vB.minor) return vB.minor - vA.minor;
      return vB.patch - vA.patch;
    });
});

// Create version with schema clone
export const createVersionWithSchemaCloneAtom = atom(
  null,
  (get, set, params: {
    project_id: string;
    version_type: VersionType;
    changelog_summary: string;
    changes: ChangelogEntry[];
    snapshot: VersionSnapshot;
    created_by: string;
    schema_clone_config: Omit<SchemaCloneConfig, 'target_schema'>;
  }) => {
    const store = get(versionStoreAtom);

    // Find latest version for this project
    const projectVersions = store.versions
      .filter((v) => v.project_id === params.project_id)
      .sort((a, b) => {
        const vA = parseVersion(a.version);
        const vB = parseVersion(b.version);
        if (vA.major !== vB.major) return vB.major - vA.major;
        if (vA.minor !== vB.minor) return vB.minor - vA.minor;
        return vB.patch - vA.patch;
      });

    const latestVersion = projectVersions[0]?.version || '0.0.0';
    const newVersionNumber = incrementVersion(latestVersion, params.version_type);

    // Generate versioned schema name
    const versionedSchemaName = generateVersionedSchemaName(
      params.schema_clone_config.source_schema,
      newVersionNumber,
      params.schema_clone_config.naming_strategy
    );

    // Create schema clone config with target
    const schemaCloneConfig: SchemaCloneConfig = {
      ...params.schema_clone_config,
      target_schema: versionedSchemaName,
    };

    // Generate ingestion adaptations
    const ingestionAdaptations = generateIngestionAdaptations(
      params.snapshot.tables,
      params.schema_clone_config.source_schema,
      versionedSchemaName
    );

    // Update snapshot with ingestion adaptations
    const snapshotWithAdaptations: VersionSnapshot = {
      ...params.snapshot,
      ingestion_adaptations: ingestionAdaptations,
    };

    const newVersion: Version = {
      version_id: generateVersionId(),
      project_id: params.project_id,
      version: newVersionNumber,
      previous_version: latestVersion !== '0.0.0' ? latestVersion : undefined,
      status: 'draft',
      created_at: new Date().toISOString(),
      created_by: params.created_by,
      changelog: {
        summary: params.changelog_summary,
        changes: params.changes,
      },
      snapshot: snapshotWithAdaptations,
      schema_clone: {
        config: schemaCloneConfig,
        versioned_schema_name: versionedSchemaName,
        result: {
          status: 'pending',
          clone_id: `clone_${Date.now()}`,
          started_at: new Date().toISOString(),
          tables_cloned: 0,
          tables_total: params.snapshot.tables.length,
          ddl_statements: generateSchemaCloneDDL(schemaCloneConfig),
          rollback_ddl: generateRollbackDDL(schemaCloneConfig),
        },
      },
    };

    set(versionStoreAtom, {
      ...store,
      versions: [...store.versions, newVersion],
      currentVersion: newVersion,
    });

    return {
      version_id: newVersion.version_id,
      versioned_schema_name: versionedSchemaName,
      ddl_statements: newVersion.schema_clone?.result?.ddl_statements || [],
      ingestion_adaptations: ingestionAdaptations,
    };
  }
);

// Update schema clone status
export const updateSchemaCloneStatusAtom = atom(
  null,
  (get, set, params: {
    version_id: string;
    status: SchemaCloneStatus;
    tables_cloned?: number;
    error?: string;
    completed_at?: string;
  }) => {
    const store = get(versionStoreAtom);

    set(versionStoreAtom, {
      ...store,
      versions: store.versions.map((v) => {
        if (v.version_id !== params.version_id || !v.schema_clone?.result) return v;

        return {
          ...v,
          schema_clone: {
            ...v.schema_clone,
            result: {
              ...v.schema_clone.result,
              status: params.status,
              tables_cloned: params.tables_cloned ?? v.schema_clone.result.tables_cloned,
              error: params.error,
              completed_at: params.completed_at,
            },
          },
        };
      }),
    });
  }
);

// Rollback schema clone
export const rollbackSchemaCloneAtom = atom(
  null,
  (get, set, version_id: string) => {
    const store = get(versionStoreAtom);
    const version = store.versions.find((v) => v.version_id === version_id);

    if (!version?.schema_clone?.result) return null;

    // Update status to rollback
    set(versionStoreAtom, {
      ...store,
      versions: store.versions.map((v) =>
        v.version_id === version_id && v.schema_clone?.result
          ? {
              ...v,
              status: 'archived' as const,
              schema_clone: {
                ...v.schema_clone,
                result: {
                  ...v.schema_clone.result,
                  status: 'rollback' as const,
                },
              },
            }
          : v
      ),
    });

    return version.schema_clone.result.rollback_ddl;
  }
);

// Custom hook
export function useVersionStore() {
  const [store] = useAtom(versionStoreAtom);
  const latestVersion = useAtomValue(latestVersionAtom);
  const draftVersions = useAtomValue(draftVersionsAtom);
  const versionHistory = useAtomValue(versionHistoryAtom);
  const getVersionsByProject = useAtomValue(getVersionsByProjectAtom);

  const createVersion = useSetAtom(createVersionAtom);
  const publishVersion = useSetAtom(publishVersionAtom);
  const deployVersion = useSetAtom(deployVersionAtom);
  const archiveVersion = useSetAtom(archiveVersionAtom);
  const compareVersions = useSetAtom(compareVersionsAtom);
  const setCurrentVersion = useSetAtom(setCurrentVersionAtom);

  // Schema clone functions
  const createVersionWithSchemaClone = useSetAtom(createVersionWithSchemaCloneAtom);
  const updateSchemaCloneStatus = useSetAtom(updateSchemaCloneStatusAtom);
  const rollbackSchemaClone = useSetAtom(rollbackSchemaCloneAtom);

  return {
    versions: store.versions,
    currentVersion: store.currentVersion,
    latestVersion,
    draftVersions,
    versionHistory,
    isLoading: store.isLoading,
    error: store.error,
    getVersionsByProject,
    createVersion,
    publishVersion,
    deployVersion,
    archiveVersion,
    compareVersions,
    setCurrentVersion,
    // Schema clone
    createVersionWithSchemaClone,
    updateSchemaCloneStatus,
    rollbackSchemaClone,
  };
}

// Helper to format version for display
export function formatVersionDisplay(version: Version): string {
  const statusLabel = {
    draft: '(Draft)',
    published: '',
    deployed: '✓',
    archived: '(Archived)',
    deprecated: '(Deprecated)',
  };

  return `v${version.version} ${statusLabel[version.status] || ''}`.trim();
}

// Helper to get version type label
export function getVersionTypeLabel(type: VersionType): string {
  const labels: Record<VersionType, string> = {
    major: 'Major (Breaking Changes)',
    minor: 'Minor (New Features)',
    patch: 'Patch (Bug Fixes)',
  };
  return labels[type];
}
