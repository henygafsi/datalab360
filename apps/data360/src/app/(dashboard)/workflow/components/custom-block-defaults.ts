/**
 * custom-block-defaults.ts
 *
 * Sensible scaffolds for the CustomBlockFactory wizard. The goal is that the
 * user lands on a working snippet that already references their declared
 * params + an upstream `input` placeholder, rather than a blank editor.
 *
 * Two languages are supported today:
 *   - sql    → executed via /workflow/run-sql (the "Test in sandbox" button)
 *   - python → no sandbox endpoint exists yet (Backend Gap surfaced in the UI)
 *
 * Categories the catalog supports: source / transform / destination / ai / ml.
 * The scaffold adapts to the category so a source doesn't try to read from an
 * upstream and a destination doesn't try to SELECT.
 */
import type { CustomBlockLanguage, CustomBlockParam } from './custom-blocks-store';

export type CustomBlockCategory = 'source' | 'transform' | 'destination' | 'ai' | 'ml';

interface ScaffoldInput {
  language: CustomBlockLanguage;
  category: CustomBlockCategory;
  blockName: string;
  description: string;
  params: CustomBlockParam[];
}

const PARAM_PLACEHOLDER = (p: CustomBlockParam): string => {
  if (p.default !== undefined && p.default !== null && p.default !== '') {
    return String(p.default);
  }
  switch (p.type) {
    case 'number':
      return '0';
    case 'boolean':
      return 'TRUE';
    case 'array':
      return "['a','b']";
    case 'object':
      return "{ 'k': 'v' }";
    default:
      return `:${p.name}`;
  }
};

function renderSqlParamComment(params: CustomBlockParam[]): string {
  if (!params.length) return '-- (no params declared)';
  return params
    .map((p) => `--   ${p.name} :: ${p.type}${p.required ? ' (required)' : ''}`)
    .join('\n');
}

function renderPythonParamHints(params: CustomBlockParam[]): string {
  if (!params.length) return '    # No params declared';
  return params
    .map(
      (p) =>
        `    ${p.name} = params.get(${JSON.stringify(p.name)}${p.required ? '' : `, ${pythonLiteralDefault(p)}`})`,
    )
    .join('\n');
}

function pythonLiteralDefault(p: CustomBlockParam): string {
  if (p.default === undefined || p.default === null || p.default === '') {
    switch (p.type) {
      case 'number':
        return '0';
      case 'boolean':
        return 'False';
      case 'array':
        return '[]';
      case 'object':
        return '{}';
      default:
        return 'None';
    }
  }
  if (p.type === 'string') return JSON.stringify(String(p.default));
  if (p.type === 'boolean') return String(p.default).toLowerCase() === 'true' ? 'True' : 'False';
  return String(p.default);
}

/**
 * Build a starter snippet that uses the declared params + an upstream
 * `input` CTE (only for non-source categories).
 */
export function buildScaffold({
  language,
  category,
  blockName,
  description,
  params,
}: ScaffoldInput): string {
  if (language === 'sql') return buildSqlScaffold({ language, category, blockName, description, params });
  return buildPythonScaffold({ language, category, blockName, description, params });
}

function buildSqlScaffold({ category, blockName, description, params }: ScaffoldInput): string {
  const header = [
    `-- Custom block: ${blockName}`,
    description ? `-- ${description}` : null,
    '-- Declared params:',
    renderSqlParamComment(params),
  ]
    .filter(Boolean)
    .join('\n');

  if (category === 'source') {
    return `${header}\n\n-- Sources read from a Snowflake object directly.\nSELECT *\nFROM YOUR_DB.YOUR_SCHEMA.YOUR_TABLE\nLIMIT 100;\n`;
  }

  if (category === 'destination') {
    return `${header}\n\n-- Destinations write the upstream rows out. Use INSERT or MERGE.\nINSERT INTO YOUR_DB.YOUR_SCHEMA.YOUR_TABLE\nSELECT *\nFROM input;\n`;
  }

  // transform / ai / ml — operate on the upstream "input" CTE.
  const whereClause =
    params.find((p) => p.name === 'filter_condition' && p.type === 'string')
      ? `WHERE ${PARAM_PLACEHOLDER(params.find((p) => p.name === 'filter_condition')!)}`
      : '-- WHERE <your condition here>';

  return `${header}\n\nSELECT *\nFROM input\n${whereClause}\nLIMIT 100;\n`;
}

function buildPythonScaffold({ category, blockName, description, params }: ScaffoldInput): string {
  const header = [
    `# Custom block: ${blockName}`,
    description ? `# ${description}` : null,
    '#',
    '# This block receives `input_df` (a Snowpark DataFrame) and `params` (dict).',
    '# It must return a Snowpark DataFrame named `output_df`.',
  ]
    .filter(Boolean)
    .join('\n');

  if (category === 'source') {
    return `${header}\n\ndef run(session, params):\n${renderPythonParamHints(params)}\n    # Sources build a DataFrame from scratch.\n    output_df = session.table('YOUR_DB.YOUR_SCHEMA.YOUR_TABLE')\n    return output_df\n`;
  }

  if (category === 'destination') {
    return `${header}\n\ndef run(session, input_df, params):\n${renderPythonParamHints(params)}\n    # Destinations write the DataFrame out — no return value expected.\n    input_df.write.mode('append').save_as_table('YOUR_DB.YOUR_SCHEMA.YOUR_TABLE')\n`;
  }

  return `${header}\n\ndef run(session, input_df, params):\n${renderPythonParamHints(params)}\n    # Transform the upstream DataFrame.\n    output_df = input_df.limit(100)\n    return output_df\n`;
}

/**
 * Suggest a category-appropriate port shape.
 * Used by step 2 to pre-fill the input/output radios.
 */
export function defaultPortsForCategory(category: CustomBlockCategory): {
  inputs: 0 | 1 | 2 | 3;
  hasOutput: boolean;
} {
  switch (category) {
    case 'source':
      return { inputs: 0, hasOutput: true };
    case 'destination':
      return { inputs: 1, hasOutput: false };
    default:
      return { inputs: 1, hasOutput: true };
  }
}
