/**
 * studio-keys — THE single reading of keys and relations in the Studio.
 *
 * Why this file exists: key identification is a CLOSED, enumerable problem.
 * The backend already classifies every source column into a five-value
 * enum with its evidence (`declared_primary`, `grain_key`,
 * `candidate_unique_sample`, `join_key`, `none`), and a relation's
 * soundness follows from the key role of the referenced side. Nothing here
 * needs a model call, and nothing here should be asked of the user: the
 * verdict is derived once, phrased once, and read the same way on the
 * canvas, in the inspector and on a relation.
 *
 * The one rule that outranks every other: CONFIDENCE IS NEVER OVERSTATED.
 * A key the warehouse declares but does not enforce is a declaration. A
 * column unique across a 10,000-row sample is unique *in that sample*. The
 * label carries that distinction, so a reader never has to open the
 * evidence to know how much to trust it.
 */

import type { SourceColumn, StudioTarget, TargetRelationship } from '@/app/services/studio/studio-api';

/* ── the closed vocabulary ──────────────────────────────────────────── */

export type KeyRole =
  | 'declared_primary'
  | 'grain_key'
  | 'candidate_unique_sample'
  | 'join_key'
  | 'none';

/** How much weight the evidence carries — drives wording everywhere. */
export type Confidence = 'declared' | 'sampled' | 'inferred' | 'none';

export interface KeyReading {
  role: KeyRole;
  /** ≤4 words, business language, never the enum. */
  label: string;
  /** One sentence, shown on hover. */
  explanation: string;
  confidence: Confidence;
  /** What would raise the confidence — null when nothing would. */
  wouldConfirm: string | null;
}

/** « we looked and found nothing » — a settled negative result. */
const NO_KEY: KeyReading = {
  role: 'none',
  label: 'no key evidence',
  explanation:
    'The key analysis ran and found nothing: no declaration, no uniqueness in the sample, no matching column elsewhere.',
  confidence: 'none',
  wouldConfirm: null,
};

/** « we did not look » — a DIFFERENT statement, with a different remedy.
 *  Rendering these two identically would tell the reader a negative result
 *  exists when none was ever produced. */
const NOT_EXAMINED: KeyReading = {
  role: 'none',
  label: 'not examined',
  explanation:
    'Uniqueness was never tested on this column, so there is nothing to read — this is not a negative result.',
  confidence: 'none',
  wouldConfirm: 'Profiling this table would produce a verdict.',
};

/* ── one column ─────────────────────────────────────────────────────── */

export interface KeyFacts {
  role?: string | null;
  enforced?: boolean | null;
  composite?: boolean | null;
  columns?: string[];
  scope?: string | null;
  evidence?: Record<string, unknown> | null;
}

/**
 * The reading of ONE column's key role. Deterministic: same facts in,
 * same sentence out, on every surface.
 */
export function readKey(
  facts?: KeyFacts | null,
  opts?: { inGrain?: boolean; columnRole?: string | null },
): KeyReading {
  // the application's own declared grain outranks anything inferred from
  // the source: it is what the user confirmed this table means
  if (opts?.inGrain) {
    return {
      role: 'grain_key',
      label: 'grain key',
      explanation:
        'This column is part of the grain confirmed for this table — one row per this value.',
      confidence: 'declared',
      wouldConfirm: null,
    };
  }
  // no key block at all ≠ a key block saying 'none'
  if (facts == null || facts.role == null) return NOT_EXAMINED;

  const role = String(facts.role) as KeyRole;
  const ev = (facts.evidence ?? {}) as Record<string, unknown>;
  const sampleRows = Number(ev.sample_rows ?? 0) || null;
  const rightRows = Number(ev.right_sample_rows ?? 0) || null;
  // `composite` is OPTIONAL and was observed absent on a real key — the
  // tuple length is the fact, the flag is only a hint
  const keyCols = facts.columns ?? [];
  const composite = keyCols.length > 1 || facts.composite === true;

  switch (role) {
    case 'declared_primary': {
      if (composite)
        return {
          role,
          label: 'part of the key',
          explanation: `The declared key is ${keyCols.join(' + ') || 'several columns'} together — this column alone does not identify a row, and any join or grain using it must carry all of them.`,
          confidence: 'declared',
          wouldConfirm: null,
        };
      if (facts.enforced === true)
        return {
          role,
          label: 'primary key',
          explanation:
            'Declared AND enforced as the primary key — the warehouse rejects a duplicate at write time.',
          confidence: 'declared',
          wouldConfirm: null,
        };
      if (facts.enforced === false)
        return {
          role,
          label: 'declared primary key',
          explanation:
            'Someone declared this the identifier of the table, but the warehouse does not enforce it — a duplicate could be loaded and stay invisible until counted.',
          confidence: 'declared',
          wouldConfirm: 'A uniqueness check on the whole table would confirm it.',
        };
      // null is NOT false: a fact never read, not a fact read as negative
      return {
        role,
        label: 'declared primary key',
        explanation:
          'Declared as the identifier of the table; whether the warehouse enforces it was never established, so treat it as unenforced.',
        confidence: 'declared',
        wouldConfirm: 'Reading the enforcement state, or counting duplicates, would settle it.',
      };
    }
    case 'grain_key':
      return {
        role,
        label: 'grain key',
        explanation: `Declared by the model as what one row means${keyCols.length > 1 ? ` — together with ${keyCols.join(' + ')}` : ''}. An assertion by its author, not a measurement.`,
        confidence: 'declared',
        wouldConfirm: null,
      };
    case 'candidate_unique_sample':
      return {
        role,
        label: 'unique in sample',
        explanation: sampleRows
          ? `No duplicate across ${sampleRows.toLocaleString()} sampled rows, and nobody declared it a key — a sample landing on one day or one store can be unique while the table is not.`
          : 'No duplicate in the rows sampled, and nobody declared it a key — the whole table has not been checked.',
        confidence: 'sampled',
        wouldConfirm: 'A uniqueness check on the whole table would settle it.',
      };
    case 'join_key':
      // TWO stacked claims: that the columns correspond (a NAME match, with
      // no data behind it) and that the other side is unique. The reading
      // takes the weakest link — the name — so this is inferred, never
      // sampled: presenting a name match as measured evidence overstates it.
      return {
        role,
        label: ev.right_key_unique_in_sample === true ? 'links to another table' : 'possible link',
        explanation:
          ev.right_key_unique_in_sample === true
            ? `Matched by NAME to a column that looks unique across ${rightRows ? rightRows.toLocaleString() : 'a few hundred'} rows on the other side. The correspondence itself is a naming guess — identical names across systems collide routinely.`
            : 'A column of the same name exists elsewhere, but nothing shows that side is unique — a candidate to inspect, not a key.',
        confidence: 'inferred',
        wouldConfirm:
          'Confirming the two columns really refer to the same thing, then checking every value exists on the other side, would settle it.',
      };
    case 'none':
      // the profiler's name-based guess disagreeing with the key analysis is
      // the interesting signal — and the one place a check is worth offering
      if (String(opts?.columnRole ?? '').toLowerCase() === 'identifier')
        return {
          role,
          label: 'named like an id',
          explanation:
            'Named and typed like an identifier, but the key analysis found no uniqueness behind it — the name raised a question, it did not answer one.',
          confidence: 'none',
          wouldConfirm: 'Counting duplicates on the whole column would settle it.',
        };
      return NO_KEY;
    default:
      // a role this build does not know: say so rather than reporting a
      // settled negative that was never established
      return {
        role: 'none',
        label: 'key role not recognised',
        explanation: `The column carries a key reading (« ${String(facts.role)} ») that this version cannot interpret.`,
        confidence: 'none',
        wouldConfirm: null,
      };
  }
}

/* ── a target column, whose key facts live on its SOURCE ────────────── */

/**
 * Target columns carry no key facts of their own: the application's target
 * has a confirmed grain, and every other column traces back to a source
 * column that IS classified. This resolves both without a model call.
 */
export function readTargetColumnKey(
  column: { name: string; source?: { fqn?: string; column?: string } | null },
  target: Pick<StudioTarget, 'grain'>,
  /** source key facts by `FQN.COLUMN`, from the columns route */
  sourceKeys?: Map<string, KeyFacts>,
): KeyReading {
  const grain = target.grain;
  const grainKeys =
    grain && typeof grain === 'object' && Array.isArray((grain as { key?: string[] }).key)
      ? ((grain as { key?: string[] }).key ?? []).map((k) => String(k).toUpperCase())
      : [];
  if (grainKeys.includes(column.name.toUpperCase())) return readKey(null, { inGrain: true });
  const src = column.source;
  if (src?.fqn && src.column && sourceKeys) {
    const facts = sourceKeys.get(`${src.fqn}.${src.column}`.toUpperCase());
    if (facts) return readKey(facts, { columnRole: (column as { role?: string }).role });
  }
  return NO_KEY;
}

/** Index the columns route payload for the lookup above. */
export function indexSourceKeys(
  fqn: string,
  columns: SourceColumn[],
): Map<string, KeyFacts> {
  const m = new Map<string, KeyFacts>();
  for (const c of columns) {
    if (c.key) m.set(`${fqn}.${c.name}`.toUpperCase(), c.key as KeyFacts);
  }
  return m;
}

/* ── a relation between two tables ──────────────────────────────────── */

export interface RelationReading {
  /** ≤4 words. */
  label: string;
  explanation: string;
  confidence: Confidence | 'broken';
  cardinality: string | null;
  wouldConfirm: string | null;
  /** true only when the evidence cannot decide — the ONLY case worth asking. */
  undecidable: boolean;
}

const CARD_WORDS: Record<string, string> = {
  many_to_one: 'many → one',
  one_to_many: 'one → many',
  one_to_one: 'one — one',
  many_to_many: 'many — many',
};

export function cardinalityWords(c?: string | null): string {
  return CARD_WORDS[String(c ?? '')] ?? 'cardinality unknown';
}

/**
 * The verdict on ONE relation, derived from the key role of the referenced
 * (right-hand) side. Ordered most-severe first: a broken reference is
 * reported before any uniqueness verdict, because a missing column makes
 * every other question moot.
 */
export function readRelation(
  rel: Pick<TargetRelationship, 'cardinality' | 'state' | 'missing_columns' | 'left' | 'right'>,
  /** key reading of the RIGHT-hand column, when it is known */
  rightKey?: KeyReading | null,
): RelationReading {
  const card = rel.cardinality ?? null;

  // 1 — a referenced column that does not exist: nothing else matters
  if (rel.state === 'broken' || (rel.missing_columns?.length ?? 0) > 0) {
    const missing = (rel.missing_columns ?? []).join(', ');
    return {
      label: 'broken link',
      explanation: missing
        ? `The link points at ${missing}, which does not exist any more.`
        : 'The link points at a column that does not exist any more.',
      confidence: 'broken',
      cardinality: card,
      wouldConfirm: 'Pointing it at an existing column would repair it.',
      undecidable: false,
    };
  }

  // 2 — the referenced side is a declared key: the reference is sound
  if (rightKey?.role === 'declared_primary' || rightKey?.role === 'grain_key') {
    return {
      label: 'sound link',
      explanation: `Each row points at one row of the other table, identified by its ${rightKey.role === 'grain_key' ? 'grain' : 'primary key'}.`,
      confidence: 'declared',
      cardinality: card ?? 'many_to_one',
      wouldConfirm:
        rightKey.wouldConfirm ?? 'Checking that every value exists on the other side would prove it.',
      undecidable: false,
    };
  }

  // 3 — the referenced side is unique only in a sample: plausible, not proven
  if (rightKey?.role === 'candidate_unique_sample' || rightKey?.confidence === 'sampled') {
    return {
      label: 'likely link',
      explanation:
        'The other side looks unique in the rows sampled, so this reads as many rows pointing at one — the whole table has not been checked.',
      confidence: 'sampled',
      cardinality: card ?? 'many_to_one',
      wouldConfirm: 'A uniqueness check on the whole referenced table would settle it.',
      undecidable: false,
    };
  }

  // 4 — no uniqueness anywhere: a join here multiplies rows
  if (rightKey && rightKey.confidence === 'inferred') {
    return {
      label: 'duplicates rows',
      explanation:
        'Nothing shows the other side is unique, so joining on it can return more rows than you started with.',
      confidence: 'inferred',
      cardinality: card ?? 'many_to_many',
      wouldConfirm: 'Confirming which column identifies the other table would settle it.',
      undecidable: false,
    };
  }

  // 5 — the evidence genuinely does not decide: say what is missing
  return {
    label: 'not checked yet',
    explanation:
      'This link has never been checked against the data, so its shape is an assumption.',
    confidence: 'none',
    cardinality: card,
    wouldConfirm:
      'Checking whether the referenced column is unique, and whether every value exists there, would settle it.',
    undecidable: true,
  };
}

/** Chip colour per confidence — one accent, severity by tone. */
export const CONFIDENCE_CLS: Record<string, string> = {
  declared: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  sampled: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  inferred: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  broken: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  none: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
