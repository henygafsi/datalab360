export interface MappingDataLike {
  groups?: Array<{ sources: { database: string; schema: string; table: string }[]; target: { database: string; schema: string; table: string } | null }>;
  source_database?: string;
  source_schema?: string;
  source_table?: string;
  target_database?: string;
  target_schema?: string;
  target_table?: string;
  primary_keys?: { source?: Record<string, string[]>; target?: string[] };
  column_attributes?: Record<string, Record<string, unknown>>;
  column_mappings?: Array<any>;
  new_target_columns?: Array<any>;
  new_target_columns_by_table?: Record<string, Array<any>>;
}

/**
 * Compute the latest completed step based on the stored mapping data.
 * Returns a number in [1..5]. Use to route users to the right step when resuming.
 */
export function computeLatestStep(md: MappingDataLike | null | undefined): number {
  if (!md) return 1;

  // Step 1 complete when at least one group has >=1 source and a target
  const g = md.groups || [];
  const step1Done = g.some(grp => (grp.sources || []).length > 0 && !!grp.target)
    || (!!md.source_database && !!md.source_schema && !!md.source_table && !!md.target_database && !!md.target_schema && !!md.target_table);
  if (!step1Done) return 1;

  // Step 2 complete when any column_attributes exist
  const ca = md.column_attributes || {};
  const step2Done = Object.keys(ca).length > 0;
  if (!step2Done) return 2;

  // Step 3 complete when any column_mappings exist
  const cm = md.column_mappings || [];
  const step3Done = cm.length > 0;
  if (!step3Done) return 3;

  // Step 4 complete when any new target columns exist (either legacy or per-table)
  const ntc = (md.new_target_columns || []).length > 0;
  const ntcBy = Object.values(md.new_target_columns_by_table || {}).some(arr => (arr || []).length > 0);
  const step4Done = ntc || ntcBy;
  if (!step4Done) return 4;

  return 5;
}

