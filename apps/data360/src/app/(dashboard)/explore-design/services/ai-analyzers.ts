/**
 * Client-side AI Analyzers — Zero-cost checks that run against event store
 * These are the "pure Python" features from the drawio (page 11)
 * that don't need Cortex API calls.
 */

import type { AiSuggestion, AiFeatureId } from '../stores/ai-store';
import type { DesignEvent } from '../stores/event-store';

// ── Naming Checker ───────────────────────────────────────────────────────────

const NAMING_PATTERNS = {
  table: /^[A-Z][A-Z0-9_]*$/,       // UPPER_SNAKE_CASE
  column: /^[A-Z][A-Z0-9_]*$/,      // UPPER_SNAKE_CASE
  schema: /^[A-Z][A-Z0-9_]*$/,      // UPPER_SNAKE_CASE
};

const RESERVED_WORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
  'TABLE', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA', 'ALTER', 'ORDER', 'GROUP',
  'BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
  'OUTER', 'UNION', 'ALL', 'AS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'IF', 'ELSE', 'RETURN', 'SET', 'INTO', 'VALUES',
]);

export function analyzeNaming(events: DesignEvent[]): Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] {
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];

  for (const ev of events) {
    if (ev.type === 'TABLE_CREATED' || ev.type === 'TABLE_RENAMED') {
      const tableName = ev.payload?.newName || ev.payload?.tableName || ev.target?.table;
      if (tableName && !NAMING_PATTERNS.table.test(tableName)) {
        suggestions.push({
          featureId: 'naming_checker',
          type: 'warning',
          title: `Naming: "${tableName}"`,
          message: `Table name should be UPPER_SNAKE_CASE. Suggested: ${tableName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
          action: { label: 'Auto-fix name', eventType: 'TABLE_RENAMED', payload: { newName: tableName.toUpperCase().replace(/[^A-Z0-9]/g, '_') } },
        });
      }
      if (tableName && RESERVED_WORDS.has(tableName.toUpperCase())) {
        suggestions.push({
          featureId: 'naming_checker',
          type: 'warning',
          title: `Reserved word: "${tableName}"`,
          message: `"${tableName}" is a SQL reserved word. This will require quoting in all queries.`,
        });
      }
    }

    if (ev.type === 'ADD_COLUMN' || ev.type === 'COLUMN_RENAMED') {
      const colName = ev.payload?.columnName || ev.payload?.name || ev.payload?.newName;
      if (colName && !NAMING_PATTERNS.column.test(colName)) {
        suggestions.push({
          featureId: 'naming_checker',
          type: 'info',
          title: `Column naming: "${colName}"`,
          message: `Column should be UPPER_SNAKE_CASE. Suggested: ${colName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
        });
      }
    }
  }

  return suggestions;
}

// ── Column Classification (PII Detection) ───────────────────────────────────

const PII_PATTERNS: Array<{ pattern: RegExp; classification: string; suggestion: string }> = [
  { pattern: /(?:email|e_mail|mail_address)/i, classification: 'PII - Email', suggestion: 'Apply SHA256 masking policy' },
  { pattern: /(?:phone|mobile|cell|telephone|fax)/i, classification: 'PII - Phone', suggestion: 'Apply partial masking (last 4 digits)' },
  { pattern: /(?:ssn|social_security|sin|national_id|identity)/i, classification: 'PII - Government ID', suggestion: 'Apply full masking policy' },
  { pattern: /(?:first_name|last_name|full_name|surname|given_name)/i, classification: 'PII - Name', suggestion: 'Consider pseudonymization' },
  { pattern: /(?:address|street|city|zip|postal|zip_code)/i, classification: 'PII - Address', suggestion: 'Apply generalization (city-level)' },
  { pattern: /(?:birth|dob|date_of_birth|birthday)/i, classification: 'PII - Date of Birth', suggestion: 'Apply year-only masking' },
  { pattern: /(?:salary|income|wage|compensation|pay)/i, classification: 'Sensitive - Financial', suggestion: 'Apply range bucketing' },
  { pattern: /(?:password|passwd|secret|token|api_key)/i, classification: 'Credential', suggestion: 'NEVER store in clear text — apply SHA256 or remove' },
  { pattern: /(?:credit_card|card_number|cvv|expiry)/i, classification: 'PCI - Payment', suggestion: 'Apply PCI-DSS masking (first 6 + last 4)' },
  { pattern: /(?:ip_address|ip_addr|user_agent|device_id)/i, classification: 'PII - Digital', suggestion: 'Apply hashing or truncation' },
];


export function analyzeColumns(events: DesignEvent[]): Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] {
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];
  const maskedColumns = new Set<string>();

  // Collect already-masked columns
  for (const ev of events) {
    if (ev.type === 'MASKING_POLICY_APPLIED') {
      const col = ev.payload?.columnName || ev.payload?.column;
      const table = ev.target?.table;
      if (col && table) maskedColumns.add(`${table}.${col}`);
    }
  }

  for (const ev of events) {
    if (ev.type !== 'ADD_COLUMN') continue;
    const colName = ev.payload?.columnName || ev.payload?.name;
    const table = ev.target?.table;
    if (!colName || !table) continue;

    const key = `${table}.${colName}`;

    // PII detection
    for (const { pattern, classification, suggestion } of PII_PATTERNS) {
      if (pattern.test(colName) && !maskedColumns.has(key)) {
        suggestions.push({
          featureId: 'column_classification',
          type: classification.startsWith('Credential') ? 'warning' : 'recommendation',
          title: `${classification}: ${table}.${colName}`,
          message: suggestion,
          action: {
            label: 'Apply masking',
            eventType: 'MASKING_POLICY_APPLIED',
            payload: { columnName: colName, table, policyType: 'SHA256' },
          },
        });
        break; // one suggestion per column
      }
    }
  }

  return suggestions;
}

// ── Relationship Discovery ───────────────────────────────────────────────────

export function analyzeRelationships(events: DesignEvent[]): Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] {
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];
  const tables = new Map<string, string[]>(); // table -> columns
  const existingFKs = new Set<string>();

  for (const ev of events) {
    if (ev.type === 'ADD_COLUMN') {
      const table = ev.target?.table;
      const col = ev.payload?.columnName || ev.payload?.name;
      if (table && col) {
        if (!tables.has(table)) tables.set(table, []);
        tables.get(table)!.push(col);
      }
    }
    if (ev.type === 'FOREIGN_KEY_ADDED') {
      const src = `${ev.target?.table}.${ev.payload?.column}`;
      existingFKs.add(src);
    }
  }

  // Look for _ID columns that match other table names
  for (const [table, columns] of Array.from(tables.entries())) {
    for (const col of columns) {
      const match = col.match(/^(.+?)_ID$/i);
      if (!match) continue;

      const refTableName = match[1].toUpperCase();
      const fkKey = `${table}.${col}`;
      if (existingFKs.has(fkKey)) continue;

      // Check if referenced table exists
      if (tables.has(refTableName)) {
        const refCols = tables.get(refTableName)!;
        const hasPK = refCols.some((c) => c.toUpperCase() === 'ID' || c.toUpperCase() === `${refTableName}_ID`);
        if (hasPK) {
          suggestions.push({
            featureId: 'relationship_discovery',
            type: 'recommendation',
            title: `FK: ${table}.${col} → ${refTableName}`,
            message: `Column ${col} looks like a foreign key to ${refTableName}. Add a relationship?`,
            action: {
              label: 'Add FK',
              eventType: 'FOREIGN_KEY_ADDED',
              payload: { column: col, referencedTable: refTableName, referencedColumn: 'ID' },
            },
          });
        }
      }
    }
  }

  return suggestions;
}

// ── Schema Health Score ──────────────────────────────────────────────────────

export interface SchemaHealthResult {
  score: number; // 0-100
  details: { check: string; passed: boolean; impact: number; message: string }[];
}

export function analyzeSchemaHealth(events: DesignEvent[]): {
  health: SchemaHealthResult;
  suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[];
} {
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];
  const checks: SchemaHealthResult['details'] = [];

  const tables = new Set<string>();
  const tablesWithPK = new Set<string>();
  const tablesWithColumns = new Map<string, number>();
  const tablesWithMasking = new Set<string>();
  const columnsTotal = { count: 0, withTypes: 0 };

  for (const ev of events) {
    const table = ev.target?.table;
    if (ev.type === 'TABLE_CREATED' && table) tables.add(table);
    if (ev.type === 'ADD_COLUMN' && table) {
      tablesWithColumns.set(table, (tablesWithColumns.get(table) || 0) + 1);
      columnsTotal.count++;
      if (ev.payload?.dataType || ev.payload?.type) columnsTotal.withTypes++;
    }
    if (ev.type === 'PRIMARY_KEY_SET' && table) tablesWithPK.add(table);
    if (ev.type === 'MASKING_POLICY_APPLIED' && table) tablesWithMasking.add(table);
  }

  // Check 1: All tables have PKs
  const pkRatio = tables.size > 0 ? tablesWithPK.size / tables.size : 1;
  checks.push({
    check: 'Primary Keys',
    passed: pkRatio >= 0.9,
    impact: 25,
    message: pkRatio >= 0.9
      ? `${tablesWithPK.size}/${tables.size} tables have primary keys`
      : `${tables.size - tablesWithPK.size} tables missing primary keys`,
  });

  // Check 2: No empty tables
  const emptyTables = Array.from(tables).filter((t) => !tablesWithColumns.has(t) || tablesWithColumns.get(t)! === 0);
  checks.push({
    check: 'No Empty Tables',
    passed: emptyTables.length === 0,
    impact: 15,
    message: emptyTables.length === 0
      ? 'All tables have columns defined'
      : `${emptyTables.length} table(s) with no columns: ${emptyTables.slice(0, 3).join(', ')}`,
  });

  // Check 3: Type coverage
  const typeCoverage = columnsTotal.count > 0 ? columnsTotal.withTypes / columnsTotal.count : 1;
  checks.push({
    check: 'Type Coverage',
    passed: typeCoverage >= 0.8,
    impact: 20,
    message: `${Math.round(typeCoverage * 100)}% of columns have explicit data types`,
  });

  // Check 4: PII protection
  let piiColumnsFound = 0;
  let piiColumnsMasked = 0;
  for (const ev of events) {
    if (ev.type === 'ADD_COLUMN') {
      const colName = ev.payload?.columnName || ev.payload?.name || '';
      if (PII_PATTERNS.some(({ pattern }) => pattern.test(colName))) {
        piiColumnsFound++;
        const table = ev.target?.table;
        if (table && tablesWithMasking.has(table)) piiColumnsMasked++;
      }
    }
  }
  const piiRatio = piiColumnsFound > 0 ? piiColumnsMasked / piiColumnsFound : 1;
  checks.push({
    check: 'PII Protection',
    passed: piiRatio >= 0.8,
    impact: 25,
    message: piiColumnsFound === 0
      ? 'No PII columns detected'
      : `${piiColumnsMasked}/${piiColumnsFound} PII columns have masking policies`,
  });

  // Check 5: Naming consistency
  let namingViolations = 0;
  for (const ev of events) {
    if (ev.type === 'TABLE_CREATED') {
      const name = ev.payload?.tableName || ev.target?.table;
      if (name && !NAMING_PATTERNS.table.test(name)) namingViolations++;
    }
    if (ev.type === 'ADD_COLUMN') {
      const name = ev.payload?.columnName || ev.payload?.name;
      if (name && !NAMING_PATTERNS.column.test(name)) namingViolations++;
    }
  }
  checks.push({
    check: 'Naming Conventions',
    passed: namingViolations === 0,
    impact: 15,
    message: namingViolations === 0
      ? 'All names follow UPPER_SNAKE_CASE convention'
      : `${namingViolations} naming violation(s) found`,
  });

  // Calculate score
  let score = 0;
  let maxScore = 0;
  for (const c of checks) {
    maxScore += c.impact;
    if (c.passed) score += c.impact;
  }
  const finalScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 100;

  // Generate suggestion if score is low
  if (finalScore < 70) {
    const failedChecks = checks.filter((c) => !c.passed);
    suggestions.push({
      featureId: 'schema_health_score',
      type: 'warning',
      title: `Schema Health: ${finalScore}/100`,
      message: `Issues: ${failedChecks.map((c) => c.check).join(', ')}. Fix these to improve your schema score.`,
    });
  } else if (finalScore < 90) {
    suggestions.push({
      featureId: 'schema_health_score',
      type: 'info',
      title: `Schema Health: ${finalScore}/100`,
      message: 'Good schema quality. A few improvements possible.',
    });
  }

  return { health: { score: finalScore, details: checks }, suggestions };
}

// ── Risk Scorer ──────────────────────────────────────────────────────────────

export function analyzeDeploymentRisk(events: DesignEvent[]): {
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[];
} {
  let risk = 0;
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];

  const destructiveEvents = events.filter((e) =>
    ['REMOVE_COLUMN', 'TABLE_RENAMED', 'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED',
     'PRIMARY_KEY_REMOVED', 'FOREIGN_KEY_REMOVED'].includes(e.type)
  );
  risk += destructiveEvents.length * 15;

  const tableCount = new Set(events.filter((e) => e.type === 'TABLE_CREATED').map((e) => e.target?.table)).size;
  if (tableCount > 10) risk += 10;
  if (tableCount > 20) risk += 15;

  const hasColumnDrops = events.some((e) => e.type === 'REMOVE_COLUMN');
  if (hasColumnDrops) risk += 20;

  const hasTypeChanges = events.some((e) => e.type === 'COLUMN_TYPE_CHANGED');
  if (hasTypeChanges) risk += 15;

  const hasRenames = events.some((e) => e.type === 'TABLE_RENAMED' || e.type === 'COLUMN_RENAMED');
  if (hasRenames) risk += 10;

  risk = Math.min(risk, 100);
  const riskLevel = risk < 35 ? 'LOW' : risk < 65 ? 'MEDIUM' : 'HIGH';

  if (riskLevel !== 'LOW') {
    const reasons: string[] = [];
    if (hasColumnDrops) reasons.push('column removals');
    if (hasTypeChanges) reasons.push('type changes');
    if (hasRenames) reasons.push('renames');
    if (destructiveEvents.length > 3) reasons.push(`${destructiveEvents.length} destructive operations`);

    suggestions.push({
      featureId: 'risk_scorer',
      type: riskLevel === 'HIGH' ? 'warning' : 'info',
      title: `Deploy Risk: ${risk}/100 (${riskLevel})`,
      message: `Risk factors: ${reasons.join(', ')}. Consider running a dry-run before deploying.`,
      action: { label: 'Run Dry-Run', eventType: 'DRY_RUN' },
    });
  }

  return { riskScore: risk, riskLevel, suggestions };
}

// ── Ingestion Optimizer ──────────────────────────────────────────────────────

export function analyzeIngestion(events: DesignEvent[]): Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] {
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];

  // Check for full_refresh on tables with many columns (likely large)
  for (const ev of events) {
    if (ev.type !== 'INGESTION_MODE_SET') continue;
    const mode = ev.payload?.mode || ev.payload?.ingestionMode;
    const table = ev.target?.table;
    if (!table || mode !== 'full_refresh') continue;

    // Count columns for this table
    const colCount = events.filter(
      (e) => e.type === 'ADD_COLUMN' && e.target?.table === table
    ).length;

    if (colCount > 15) {
      suggestions.push({
        featureId: 'ingestion_optimizer',
        type: 'warning',
        title: `Full refresh on large table: ${table}`,
        message: `${table} has ${colCount} columns — full_refresh may be slow. Consider incremental or SCD Type 1.`,
        action: {
          label: 'Switch to incremental',
          eventType: 'INGESTION_MODE_SET',
          payload: { mode: 'incremental', table },
        },
      });
    }

    // Check if table has timestamp columns (could use incremental)
    const hasTimestamp = events.some(
      (e) =>
        e.type === 'ADD_COLUMN' &&
        e.target?.table === table &&
        /(?:_date|_time|_at|_ts|timestamp|created|updated|modified)/i.test(
          e.payload?.columnName || e.payload?.name || ''
        ),
    );

    if (hasTimestamp && mode === 'full_refresh') {
      suggestions.push({
        featureId: 'ingestion_optimizer',
        type: 'recommendation',
        title: `Incremental possible: ${table}`,
        message: `${table} has timestamp columns — incremental ingestion would be more efficient.`,
      });
    }
  }

  return suggestions;
}

// ── SCD Recommender ──────────────────────────────────────────────────────────

export function analyzeScdType(events: DesignEvent[]): Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] {
  const suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];
  const tablesConfigured = new Set<string>();

  for (const ev of events) {
    if (ev.type === 'SCD_CONFIGURED') {
      tablesConfigured.add(ev.target?.table || '');
    }
  }

  // For tables not yet SCD-configured, recommend based on column patterns
  const tablesWithColumns = new Map<string, string[]>();
  for (const ev of events) {
    if (ev.type === 'ADD_COLUMN') {
      const table = ev.target?.table;
      const col = ev.payload?.columnName || ev.payload?.name;
      if (table && col) {
        if (!tablesWithColumns.has(table)) tablesWithColumns.set(table, []);
        tablesWithColumns.get(table)!.push(col);
      }
    }
  }

  for (const [table, cols] of Array.from(tablesWithColumns.entries())) {
    if (tablesConfigured.has(table)) continue;

    const hasHistory = cols.some((c: string) => /(?:effective|valid|start|end)_date/i.test(c));
    const hasStatus = cols.some((c: string) => /(?:status|active|is_current|is_deleted)/i.test(c));
    const hasPII = cols.some((c: string) => PII_PATTERNS.some(({ pattern }) => pattern.test(c)));

    if (hasHistory || hasStatus) {
      suggestions.push({
        featureId: 'scd_recommender',
        type: 'recommendation',
        title: `SCD Type 2 recommended: ${table}`,
        message: `${table} has history/status columns — SCD Type 2 preserves full change history.`,
        action: {
          label: 'Configure SCD2',
          eventType: 'SCD_CONFIGURED',
          payload: { scdType: 'type2', table },
        },
      });
    } else if (hasPII) {
      suggestions.push({
        featureId: 'scd_recommender',
        type: 'info',
        title: `SCD Type 1 for PII table: ${table}`,
        message: `${table} contains PII — SCD Type 1 (overwrite) may be preferred for GDPR compliance.`,
      });
    }
  }

  return suggestions;
}

// ── Master Analyzer ──────────────────────────────────────────────────────────

export interface AnalysisResult {
  suggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[];
  schemaHealth?: SchemaHealthResult;
  riskScore?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export function runAllAnalyzers(
  events: DesignEvent[],
  enabledFeatures: Set<AiFeatureId>,
): AnalysisResult {
  const allSuggestions: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>[] = [];
  let schemaHealth: SchemaHealthResult | undefined;
  let riskScore: number | undefined;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | undefined;

  if (enabledFeatures.has('naming_checker')) {
    allSuggestions.push(...analyzeNaming(events));
  }

  if (enabledFeatures.has('column_classification')) {
    allSuggestions.push(...analyzeColumns(events));
  }

  if (enabledFeatures.has('relationship_discovery')) {
    allSuggestions.push(...analyzeRelationships(events));
  }

  if (enabledFeatures.has('schema_health_score')) {
    const result = analyzeSchemaHealth(events);
    schemaHealth = result.health;
    allSuggestions.push(...result.suggestions);
  }

  if (enabledFeatures.has('risk_scorer')) {
    const result = analyzeDeploymentRisk(events);
    riskScore = result.riskScore;
    riskLevel = result.riskLevel;
    allSuggestions.push(...result.suggestions);
  }

  if (enabledFeatures.has('ingestion_optimizer')) {
    allSuggestions.push(...analyzeIngestion(events));
  }

  if (enabledFeatures.has('scd_recommender')) {
    allSuggestions.push(...analyzeScdType(events));
  }

  return { suggestions: allSuggestions, schemaHealth, riskScore, riskLevel };
}
