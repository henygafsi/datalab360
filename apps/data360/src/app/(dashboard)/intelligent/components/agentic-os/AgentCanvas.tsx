'use client';

/**
 * Agentic OS — CENTER canvas: the discussion.
 *
 * One prompt bar; the active lifecycle step routes the ask through the
 * EXISTING governed engines (no new AI paths):
 *   dashboards → coco draft 'chart'   (tested on real data)
 *   questions  → coco draft 'sql'     (tested on real data)
 *   workflow   → coco draft 'etl'     (steps rendered & validated)
 *   others     → /cortex/agent/propose (governed next actions) when a project
 *                is selected, else a grounded SQL draft.
 * Read-only proposals run inline (coco run-sql / GET). Mutating ones are
 * parked in the right-rail approval queue — nothing mutating runs without a
 * human decision (same gate philosophy as AgentProposals).
 * A hand-off section embeds the existing CortexChatContent (the proven
 * human-approval chat) when an approval is sent to discussion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Button, Loader, Textarea } from 'rizzui';
import { toast } from 'react-hot-toast';
import { PiPaperPlaneRight, PiPlay, PiHandPalm, PiCaretDown, PiCaretUp } from 'react-icons/pi';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { getDatabases, getSchemas, getTables } from '@/app/services/mapping';
import { createExploreProject } from '@/app/services/api/exploreDesignApi';
import { getUnifiedProjects, type UnifiedProject } from '@/app/services/api/projectsApi';
import { generateCompletion } from '@/app/services/cortex';
import { cocoDraft, type CocoDraftResult, type DraftModule } from '@/app/services/cortex/draft';
import {
  cocoRunSql,
  proposeAgentActions,
  type ProposedAction,
} from '@/app/services/cortex/agent';
import LineageFlow from '@/app/shared/command-center/LineageFlow';
import { useTrackEvent } from '@/hooks/useTrackEvent';

// recharts is heavy — load the chart renderer only when a chart card exists.
const DynamicChart = dynamic(
  () => import('@/app/(dashboard)/bi-dashboard/components/DynamicChart'),
  { ssr: false },
);
import CortexChatContent, { type QueuedPrompt } from '../../cortex-chat-content';
import { STAGE_META, type AgentMessage, type LifecycleStage } from './types';
import {
  activeProjectIdAtom,
  activeStageAtom,
  approvalsAtom,
  groundingTablesAtom,
  messagesAtom,
  nextId,
  touchedStagesAtom,
} from './store';

const DRAFT_STAGE: Partial<Record<LifecycleStage, DraftModule>> = {
  dashboards: 'chart',
  questions: 'sql',
  workflow: 'etl',
};

const RISK_TINT: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function RowsPreview({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-xs text-gray-400">0 rows.</p>;
  const cols = columns.length ? columns : Object.keys(rows[0] ?? {});
  return (
    <div className="max-h-56 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-max text-left text-xs">
        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium text-gray-600 dark:text-gray-300">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
              {cols.map((c) => (
                <td key={c} className="max-w-[220px] truncate px-2 py-1 text-gray-700 dark:text-gray-300">
                  {String(r[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Governance denials read as wins, not crashes — explain them in words. */
function governanceNote(error?: string): string | null {
  if (!error) return null;
  if (/aggregation policy/i.test(error))
    return 'Blocked by a governance aggregation policy on this table — only aggregate queries are allowed. That is the governed path working; ask me for an aggregated view instead.';
  if (/masking policy|row access policy/i.test(error))
    return 'A masking / row-access policy applies to this data — results are protected for your role.';
  if (/does not exist or not authorized/i.test(error))
    return 'The draft referenced an object your role cannot see (or a placeholder) — ground me on real tables from the left rail and retry.';
  return null;
}

function DraftCard({
  draft,
  onRetryAggregated,
}: {
  draft: CocoDraftResult;
  onRetryAggregated?: () => void;
}) {
  const ok = draft.tested?.status === 'passed';
  const note = governanceNote(draft.tested?.error);
  const aggregationBlocked =
    !ok && /aggregation policy/i.test(draft.tested?.error ?? '') && Boolean(onRetryAggregated);

  // Chart drafts render as a REAL chart (recharts), not a rows table.
  const sample = draft.tested?.sample ?? [];
  let chartConfig: React.ComponentProps<typeof DynamicChart>['config'] | null = null;
  if (draft.module === 'chart' && ok && sample.length > 0) {
    const cols = draft.tested?.columns?.length ? draft.tested.columns : Object.keys(sample[0]);
    const xKey = cols.find((c) => typeof sample[0][c] !== 'number') ?? cols[0];
    const measures = cols.filter((c) => c !== xKey && typeof sample[0][c] === 'number');
    if (measures.length) {
      chartConfig = {
        chartType: ((draft.draft?.chart_type as string) ?? 'bar') as never,
        x: xKey,
        measures: measures.map((c) => ({ column: c })),
        prefetched: { data: sample },
      } as unknown as React.ComponentProps<typeof DynamicChart>['config'];
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            ok
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {draft.module} draft · {ok ? 'tested on real data' : `test ${draft.tested?.status ?? 'unknown'}`}
        </span>
        {typeof draft.tested?.sample_rows === 'number' && (
          <span className="text-gray-500">{draft.tested.sample_rows} sample rows</span>
        )}
      </div>
      {chartConfig ? (
        <div className="h-72 rounded-lg border border-gray-100 p-2 dark:border-gray-800">
          {typeof draft.draft?.title === 'string' && (
            <p className="px-1 pb-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {draft.draft.title}
            </p>
          )}
          <div className="h-[calc(100%-1.25rem)]">
            <DynamicChart config={chartConfig} />
          </div>
        </div>
      ) : (
        draft.tested?.sample &&
        draft.tested.sample.length > 0 && (
          <RowsPreview columns={draft.tested.columns ?? []} rows={draft.tested.sample} />
        )
      )}
      {draft.tested?.steps && draft.tested.steps.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          {draft.tested.steps.map((s) => (
            <li key={s.step}>
              {s.status === 'rendered' ? '✓' : '✗'} step {s.step} · {s.action_type}
              {s.error ? ` — ${s.error}` : ''}
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {note}
        </p>
      )}
      {aggregationBlocked && (
        <Button size="sm" variant="outline" onClick={onRetryAggregated}>
          Retry as an aggregated query (allowed by the policy)
        </Button>
      )}
      {draft.tested?.error && (
        <p className={`text-xs ${note ? 'text-gray-400' : 'text-red-500'}`}>{draft.tested.error}</p>
      )}
      {!draft.draft && <p className="text-xs text-gray-400">The model could not produce a draft.</p>}
    </div>
  );
}

const ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];

/** Snowflake session tokens live ~55 min — detect expiry in any caught error. */
function isAuthExpired(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err ?? '');
  return /390114|08001|token has expired|must authenticate|not authenticated|status code 401/i.test(s);
}

export default function AgentCanvas() {
  const stage = useAtomValue(activeStageAtom);
  const [grounding, setGrounding] = useAtom(groundingTablesAtom);
  const [projectId, setProjectId] = useAtom(activeProjectIdAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const setApprovals = useSetAtom(approvalsAtom);
  const setTouched = useSetAtom(touchedStagesAtom);
  const { role } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(role);
  const { trackFeatureClick } = useTrackEvent();

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<UnifiedProject[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [handOff, setHandOff] = useState<QueuedPrompt | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getUnifiedProjects({ mine_only: true, limit: 12, offset: 0 })
      .then((res) => {
        if (alive) setProjects(res.projects ?? []);
      })
      .catch(() => {
        /* degrade: propose falls back to grounded drafts */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  const push = useCallback(
    (m: Omit<AgentMessage, 'id' | 'at'>) => {
      setMessages((prev) => [...prev, { ...m, id: nextId('msg'), at: Date.now() }]);
      // The discussion IS part of the project trail: every turn is persisted as
      // an event (EVENT_STORE via /api/data360/track — fire-and-forget), keyed
      // by stage + active project so it reads like any classic module history.
      trackFeatureClick('agentic_os_discussion', {
        turn_role: m.role,
        kind: m.kind,
        stage: m.stage,
        project_id: projectId || null,
        project_name: projects.find((p) => p.project_id === projectId)?.name ?? null,
        preview: (m.text ?? '').slice(0, 160),
      });
    },
    [setMessages, trackFeatureClick, projectId, projects],
  );

  /**
   * Read-only source discovery: walk databases → schemas → tables (skipping
   * the app's own DB and empty/system schemas), ground up to 5 tables of the
   * richest schema found, and return what was explored. Null when nothing is
   * readable for this role.
   */
  const discoverAndGround = useCallback(async (): Promise<{
    db: string;
    schema: string;
    allTables: string[];
    picked: string[];
  } | null> => {
    try {
      const dbs = await getDatabases();
      const ordered = [
        ...dbs.filter((d) => /DRAFT_SOURCE|SOURCE|RAW|LAKE/i.test(d)),
        ...dbs.filter((d) => !/DRAFT_SOURCE|SOURCE|RAW|LAKE/i.test(d) && !/^CP_DATA360$/i.test(d)),
      ];
      for (const db of ordered.slice(0, 3)) {
        const schemas = (await getSchemas(db).catch(() => [])).filter(
          (s) => !/INFORMATION_SCHEMA/i.test(s),
        );
        for (const schema of schemas.slice(0, 4)) {
          const tables = await getTables(db, schema).catch(() => [] as string[]);
          if (tables.length) {
            const picked = tables.slice(0, 5).map((t) => `${db}.${schema}.${t}`.toUpperCase());
            setGrounding(picked);
            return { db: db.toUpperCase(), schema: schema.toUpperCase(), allTables: tables, picked };
          }
        }
      }
      return null;
    } catch (e) {
      // Expired warehouse session must surface as itself — never as the
      // misleading "no readable schema for your role".
      if (isAuthExpired(e)) throw new Error('AUTH_EXPIRED');
      return null;
    }
  }, [setGrounding]);

  /**
   * The agent DOES safe things itself instead of instructing the user.
   * Read-only context actions (grounding a schema's tables, grounding one FQN)
   * execute directly; only mutations wait for validation. Returns true when
   * the intent was handled.
   */
  const tryAutoAct = useCallback(
    async (text: string): Promise<boolean> => {
      const ident = '[A-Za-z_][A-Za-z0-9_]*';
      // "create/I want a project (from this / from DB.SCHEMA)" → the agent
      // creates a DRAFT project itself: app-registry write only, NO
      // deployment/DDL — deploys keep requiring human validation. The intent
      // net is wide on purpose: FR/EN want-verbs, agglutinations ("jeveu") and
      // common typos included — a mention of a wanted project must never fall
      // through to a doomed SQL draft.
      const wantsProject =
        /\b(projec?t|projet)\b/i.test(text) &&
        /(create|make|build|start|new|want|need|design|desin|cr[ée]e|nouveau|veu[xt]?|jeveu|voudrais|besoin|g[ée]n[èe]re|lance|fais|donne)/i.test(
          text,
        );
      if (wantsProject) {
        let tables = grounding;
        if (!tables.length) {
          const schemaRef = text.match(new RegExp(`\\b(${ident})\\.(${ident})\\b`));
          if (schemaRef) {
            const names = await getTables(schemaRef[1].toUpperCase(), schemaRef[2].toUpperCase()).catch(
              () => [] as string[],
            );
            tables = names
              .slice(0, 5)
              .map((t) => `${schemaRef[1]}.${schemaRef[2]}.${t}`.toUpperCase());
          }
          if (!tables.length) {
            const found = await discoverAndGround();
            tables = found?.picked ?? [];
          } else {
            setGrounding(tables);
          }
        }
        if (!tables.length) {
          push({
            role: 'agent',
            stage,
            kind: 'text',
            text: 'I could not find readable tables to seed the project — pick some in the left rail and re-ask.',
          });
          return true;
        }
        const name = `AGENTIC_${tables[0].split('.')[1]}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
        const created = await createExploreProject({
          project_name: name,
          description: `Created by the Agentic OS from: "${text.slice(0, 140)}"`,
          source_tables: tables.map((f) => {
            const [database, schema, table] = f.split('.');
            return { database, schema, table };
          }),
          tags: ['agentic-os'],
        });
        setProjectId(created.project_id);
        setTouched((t) => ({ ...t, [stage]: 'done' }));
        const wantsStar = /[ée]toile|star/i.test(text);
        const wantsIngestion = /ingest/i.test(text);
        const nextSteps = [
          wantsStar
            ? 'you asked for a star model — go to the Models step and say "propose a star schema", I draft it over these tables'
            : 'model it at the Models step',
          wantsIngestion
            ? 'for ingestion, the Ingestion step recommends the right mode (full/incremental/CDC) per table'
            : null,
        ]
          .filter(Boolean)
          .join('; ');
        push({
          role: 'agent',
          stage,
          kind: 'text',
          text:
            `Done — I created draft project ${created.project_name} (${created.project_id}) with ` +
            `${tables.length} source tables and selected it as the active project. Nothing was deployed — ` +
            `${nextSteps}; any deployment will wait for your validation.`,
        });
        return true;
      }
      // "… DB.SCHEMA.TABLE …" → ground that exact table.
      const fqnMatch = text.match(new RegExp(`\\b(${ident})\\.(${ident})\\.(${ident})\\b`));
      // "select/ground/pick … DB.SCHEMA …" → ground up to 5 of its tables.
      const schemaMatch =
        !fqnMatch &&
        /select|ground|pick|choisis|s[ée]lectionne|prends|use/i.test(text) &&
        text.match(new RegExp(`\\b(${ident})\\.(${ident})\\b`));
      if (fqnMatch) {
        const fqn = `${fqnMatch[1]}.${fqnMatch[2]}.${fqnMatch[3]}`.toUpperCase();
        setGrounding((g) => (g.includes(fqn) ? g : [...g.slice(-4), fqn]));
        push({
          role: 'agent',
          stage,
          kind: 'text',
          text: `Done — grounded ${fqn}. Ask me anything about it, or add more tables (5 max).`,
        });
        return true;
      }
      if (schemaMatch) {
        const db = schemaMatch[1].toUpperCase();
        const schema = schemaMatch[2].toUpperCase();
        try {
          const tables = await getTables(db, schema);
          if (!tables.length) {
            push({
              role: 'agent',
              stage,
              kind: 'text',
              text: `${db}.${schema} has no tables your role can see — pick another schema in the tree.`,
            });
            return true;
          }
          const picked = tables.slice(0, 5).map((t) => `${db}.${schema}.${t}`.toUpperCase());
          setGrounding(picked);
          push({
            role: 'agent',
            stage,
            kind: 'text',
            text:
              `Done — I grounded ${picked.length} of ${tables.length} tables from ${db}.${schema}: ` +
              `${picked.map((f) => f.split('.')[2]).join(', ')}. ` +
              `Ask me anything about them, or move to the next step (Models, Questions, Dashboards…).`,
          });
          return true;
        } catch {
          return false; // schema unreadable → fall through to conversation
        }
      }
      return false;
    },
    [push, setGrounding, stage, grounding, discoverAndGround, setProjectId, setTouched],
  );

  const submit = useCallback(async (textArg?: string) => {
    const text = (textArg ?? prompt).trim();
    if (!text || busy) return;
    setPrompt('');
    setBusy(true);
    push({ role: 'user', stage, kind: 'text', text });
    setTouched((t) => ({ ...t, [stage]: 'done' }));
    try {
      if (await tryAutoAct(text)) return;
      const draftModule = DRAFT_STAGE[stage];
      // Short acknowledgements ("go", "ok") are conversation, not data intents —
      // the draft engine requires a real intent (min length) and would 422.
      const conversational = text.length < 8;
      if (conversational) {
        // Short conversational ack — stay in discussion, role/context-aware.
        const ctx = grounding.length
          ? `They HAVE grounded these tables: ${grounding.join(', ')}. Suggest a concrete next ask on them.`
          : `They have not selected tables or a project yet.`;
        const res = await generateCompletion({
          prompt:
            `You are the Data360 agent at the "${STAGE_META[stage].label}" lifecycle step ` +
            `(${STAGE_META[stage].hint}). The user's warehouse role is ${role}. ${ctx} ` +
            `User says: "${text}". Reply briefly and helpfully (max 4 sentences, no markdown headers).`,
          model: 'mistral-large2',
        });
        push({ role: 'agent', stage, kind: 'text', text: res.response });
      } else if (!grounding.length && !projectId) {
        // A real data intent with nothing selected: the agent explores the
        // sources ITSELF (read-only), grounds a rich schema, then answers —
        // discover → ground → analyze, never "please select".
        push({ role: 'agent', stage, kind: 'text', text: 'Exploring your sources…' });
        const discovered = await discoverAndGround();
        if (!discovered) {
          push({
            role: 'agent',
            stage,
            kind: 'text',
            text: `I could not find a readable source schema for your role (${role}) — pick a table in the left rail or select a project and I take it from there.`,
          });
        } else {
          const { db, schema, allTables, picked } = discovered;
          push({
            role: 'agent',
            stage,
            kind: 'text',
            text: `I explored your sources and picked ${db}.${schema} (${allTables.length} tables). Grounded: ${picked.map((f) => f.split('.')[2]).join(', ')}.`,
          });
          const res = await generateCompletion({
            prompt:
              `You are the Data360 agent (user role: ${role}). The available tables in ${db}.${schema} are: ` +
              `${allTables.slice(0, 40).join(', ')}. The user asks: "${text}". ` +
              `Answer concretely using these REAL table names (max 8 sentences, no markdown headers). ` +
              `If they asked what to design/build, propose 3-5 concrete options mapped to specific tables, ` +
              `then tell them the next step happens right here (draft it at the Questions/Dashboards/Workflow step).`,
            model: 'mistral-large2',
          });
          push({ role: 'agent', stage, kind: 'text', text: res.response });
        }
      } else if (draftModule && grounding.length) {
        const draft = await cocoDraft({
          module: draftModule,
          intent: text,
          tables: grounding,
        });
        push({ role: 'agent', stage, kind: 'draft', draft, intent: text });
        offerGovernanceRemediation(draft, text);
      } else if (stage === 'models' && grounding.length) {
        // Modeling asks are DESIGN answers, not SQL drafts and not empty
        // propose calls on a fresh project: answer with a concrete model
        // (facts/dimensions/keys) mapped to the REAL grounded tables.
        const res = await generateCompletion({
          prompt:
            `You are the Data360 modeling agent (user role: ${role}). Grounded tables: ` +
            `${grounding.join(', ')}. The user asks: "${text}". Propose a concrete data model ` +
            `answer (max 10 sentences, no markdown headers): name the fact table(s), the dimension ` +
            `tables, the join keys you would expect, and one modeling risk to check. Use ONLY these ` +
            `real table names. End by saying they can draft the build pipeline at the Workflow step — ` +
            `nothing is deployed without their validation.`,
          model: 'mistral-large2',
        });
        push({ role: 'agent', stage, kind: 'text', text: res.response });
      } else if (projectId) {
        const res = await proposeAgentActions(projectId, text);
        push({
          role: 'agent',
          stage,
          kind: 'proposals',
          proposals: res.actions ?? [],
          contextSummary: res.context_summary,
          text: res.error,
        });
      } else {
        const draft = await cocoDraft({
          module: 'sql',
          intent: text,
          tables: grounding,
        });
        push({ role: 'agent', stage, kind: 'draft', draft, intent: text });
        offerGovernanceRemediation(draft, text);
      }
    } catch (err) {
      if (isAuthExpired(err)) {
        push({
          role: 'agent',
          stage,
          kind: 'text',
          text:
            'Your warehouse session has expired (tokens last ~55 minutes). Reload the page to sign in ' +
            'again, then re-ask — your grounding and the governed flow pick up right where you left off.',
        });
      } else {
        push({
          role: 'agent',
          stage,
          kind: 'error',
          text: err instanceof Error ? err.message : 'The agent call failed.',
        });
      }
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, busy, stage, grounding, projectId, role, push, setTouched, tryAutoAct]);

  /**
   * Non-stop agentic: a governance denial never dead-ends. The agent knows the
   * user's role — when it is allowed to fix the blocking policy, the governed
   * remediation is proposed AND pre-selected into the validation queue
   * (mutating → still needs the human click; read-only retry offered inline).
   */
  function offerGovernanceRemediation(draft: CocoDraftResult, intent: string) {
    const err = draft.tested?.error ?? '';
    if (draft.tested?.status === 'passed' || !/aggregation policy/i.test(err)) return;
    if (!isAdmin) {
      push({
        role: 'agent',
        stage,
        kind: 'text',
        text: `Your role (${role}) cannot change this policy — ask a security admin, or retry with an aggregated query (the policy allows those).`,
      });
      return;
    }
    const target = grounding.join(', ') || 'the grounded tables';
    setApprovals((prev) => {
      if (prev.some((a) => a.status === 'pending' && a.label.includes('aggregation policy'))) {
        return prev;
      }
      return [
        ...prev,
        {
          id: nextId('appr'),
          stage,
          label: `Adjust the aggregation policy blocking ${target}`,
          rationale: `As ${role} you are allowed to relax or unset this policy. The change is drafted and executed only after your confirmation in the validation chat.`,
          risk: 'high',
          handOffTab: 'cortex-chat',
          prompt: `An aggregation policy blocks row-level reads on ${target} (error: ${err.slice(0, 160)}). As ${role}, draft the exact ALTER/UNSET statements to relax it for my analysis of: "${intent}". Show me the statements and wait for my GO before anything runs.`,
          status: 'pending',
        },
      ];
    });
    toast('Remediation proposed — pre-selected in the validation rail (your role allows it).', {
      icon: '🛡️',
    });
  }

  /** Read-only proposal → run inline. Mutating → park for human validation. */
  const actOnProposal = useCallback(
    async (msgId: string, idx: number, action: ProposedAction) => {
      const key = `${msgId}:${idx}`;
      // A path with an unfilled {param} template is guaranteed to 404 — treat
      // it as discussion material, not a runnable.
      const templatePath =
        action.kind === 'endpoint' && /\{[^}]+\}/.test(action.endpoint?.path ?? '');
      const readonlySql = action.kind === 'coco_sql' && action.sql && !action._rejected;
      const readonlyGet =
        action.kind === 'endpoint' && action.endpoint?.method === 'GET' && !templatePath;
      if (readonlySql || readonlyGet) {
        setRunning(key);
        try {
          if (readonlySql) {
            const res = await cocoRunSql(action.sql as string, 100);
            push({
              role: 'agent',
              stage,
              kind: 'rows',
              text: `Ran: ${action.label}`,
              rows: (res as unknown as { rows?: Record<string, unknown>[] }).rows ?? [],
              rowColumns: (res as unknown as { columns?: string[] }).columns ?? [],
            });
          } else {
            const res = await apiClient.get(action.endpoint!.path);
            const data = res.data?.data ?? res.data;
            const rows = Array.isArray(data) ? data : [data];
            push({
              role: 'agent',
              stage,
              kind: 'rows',
              text: `Fetched: ${action.label}`,
              rows: rows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null).slice(0, 50),
              rowColumns: [],
            });
          }
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404 || status === 501) {
            // Honest unavailability, not a crash: the proposed read isn't wired
            // on this backend (same convention as InsightActionButton).
            push({
              role: 'agent',
              stage,
              kind: 'text',
              text: `"${action.label}" isn't available on this backend yet (${status}) — the agent proposed it, but no route serves it. Pick another proposal or rephrase.`,
            });
          } else {
            push({
              role: 'agent',
              stage,
              kind: 'error',
              text: `${action.label} failed: ${err instanceof Error ? err.message : 'error'}`,
            });
          }
        } finally {
          setRunning(null);
        }
        return;
      }
      // Mutating (or server-rejected write SQL) → right-rail approval queue.
      setApprovals((prev) => [
        ...prev,
        {
          id: nextId('appr'),
          stage,
          label: action.label,
          rationale: action.rationale,
          risk: action.risk,
          handOffTab: 'cortex-chat',
          prompt: `${action.label}${action.rationale ? ` — ${action.rationale}` : ''}`,
          status: 'pending',
        },
      ]);
      toast('Parked for validation — decide in the right rail.', { icon: '🛡️' });
    },
    [push, setApprovals, stage],
  );

  // Guided discussion: entering a step for the first time, the agent opens it
  // (what this step is, what your role can do here). On Dependencies with a
  // grounded object, the lineage canvas is posted automatically.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.some((m) => m.kind === 'guide' && m.stage === stage)) return prev;
      const additions: AgentMessage[] = [
        {
          id: nextId('guide'),
          role: 'agent',
          stage,
          kind: 'guide',
          text: STAGE_META[stage].guide,
          at: Date.now(),
        },
      ];
      if (stage === 'dependencies' && grounding.length) {
        additions.push({
          id: nextId('lin'),
          role: 'agent',
          stage,
          kind: 'lineage',
          text: `Lineage for ${grounding[grounding.length - 1]}:`,
          lineageFqn: grounding[grounding.length - 1],
          at: Date.now(),
        });
      }
      return [...prev, ...additions];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Pane-decoupling events: right rail hands approvals off to the validation
  // chat; left rail prefills the prompt with a step starter.
  useEffect(() => {
    const onHandOff = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      setHandOff({ text: detail.text, ts: Date.now() });
      setChatOpen(true);
    };
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) setPrompt(detail.text);
    };
    window.addEventListener('agentic-os:handoff', onHandOff);
    window.addEventListener('agentic-os:prefill', onPrefill);
    return () => {
      window.removeEventListener('agentic-os:handoff', onHandOff);
      window.removeEventListener('agentic-os:prefill', onPrefill);
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Context line */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700">
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {STAGE_META[stage].label}
        </span>
        <span aria-hidden>·</span>
        <span>{STAGE_META[stage].hint}</span>
        <span
          className="rounded-full border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-700"
          title="The agent proposes only what this role is allowed to do"
        >
          as {role}
        </span>
        <span className="ml-auto">
          <select
            aria-label="Project context"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-200 bg-transparent px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">No project (grounded drafts)</option>
            {projects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.name ?? p.project_id}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* Thread */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md pt-10 text-center text-sm text-gray-400">
            <p className="font-medium text-gray-500 dark:text-gray-300">
              One discussion, seven steps.
            </p>
            <p className="mt-1">
              Pick a step on the left, ground the agent on your tables, then ask.
              Read-only actions run here; anything that writes waits for your
              validation on the right.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[92%] rounded-xl border px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'ml-auto border-primary/20 bg-primary/5'
                : m.kind === 'guide'
                  ? 'border-dashed border-primary/30 bg-primary/[0.03] text-gray-600 dark:text-gray-300'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
            }`}
          >
            {m.text && (
              <p className={m.kind === 'error' ? 'text-red-600 dark:text-red-400' : ''}>{m.text}</p>
            )}
            {m.kind === 'proposals' && (
              <div className="mt-2 space-y-2">
                {m.contextSummary && (
                  <p className="text-xs text-gray-500">{m.contextSummary}</p>
                )}
                {(m.proposals ?? []).map((a, idx) => {
                  const mutating = !(
                    (a.kind === 'coco_sql' && a.sql && !a._rejected) ||
                    (a.kind === 'endpoint' && a.endpoint?.method === 'GET')
                  );
                  const key = `${m.id}:${idx}`;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-gray-200 p-2 dark:border-gray-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {a.label}
                        </span>
                        {a.risk && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${RISK_TINT[a.risk] ?? ''}`}>
                            {a.risk}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant={mutating ? 'outline' : 'solid'}
                          isLoading={running === key}
                          onClick={() => actOnProposal(m.id, idx, a)}
                        >
                          {mutating ? (
                            <>
                              <PiHandPalm className="mr-1 h-3.5 w-3.5" aria-hidden /> Validate
                            </>
                          ) : (
                            <>
                              <PiPlay className="mr-1 h-3.5 w-3.5" aria-hidden /> Run
                            </>
                          )}
                        </Button>
                      </div>
                      {a.rationale && (
                        <p className="mt-1 text-xs text-gray-500">{a.rationale}</p>
                      )}
                    </div>
                  );
                })}
                {(m.proposals ?? []).length === 0 && (
                  <p className="text-xs text-gray-400">No governed action proposed.</p>
                )}
              </div>
            )}
            {m.kind === 'draft' && m.draft && (
              <div className="mt-2">
                <DraftCard
                  draft={m.draft}
                  onRetryAggregated={
                    m.intent
                      ? () =>
                          void submit(
                            `Aggregated answer only (an aggregation policy applies — use GROUP BY / aggregate functions, no raw rows): ${m.intent}`,
                          )
                      : undefined
                  }
                />
              </div>
            )}
            {m.kind === 'rows' && (
              <div className="mt-2">
                <RowsPreview columns={m.rowColumns ?? []} rows={m.rows ?? []} />
              </div>
            )}
            {m.kind === 'lineage' && m.lineageFqn && (
              <div className="mt-2 h-64 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <LineageFlow
                  object={m.lineageFqn.split('.')[2] ?? m.lineageFqn}
                  db={m.lineageFqn.split('.')[0]}
                  schema={m.lineageFqn.split('.')[1]}
                />
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader size="sm" /> The agent is working on real data…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Hand-off chat (the proven human-approval surface), collapsible */}
      {handOff && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {chatOpen ? <PiCaretDown aria-hidden /> : <PiCaretUp aria-hidden />}
            Validation discussion
          </button>
          {chatOpen && (
            <div className="max-h-[45vh] overflow-y-auto border-t border-gray-100 dark:border-gray-800">
              <CortexChatContent variant="landing" queuedPrompt={handOff} />
            </div>
          )}
        </div>
      )}

      {/* Prompt bar */}
      <div className="shrink-0 border-t border-gray-200 p-2 dark:border-gray-700">
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Ask the agent"
            placeholder={`Ask at the ${STAGE_META[stage].label} step…`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            className="flex-1"
          />
          <Button aria-label="Send" onClick={() => void submit()} isLoading={busy}>
            <PiPaperPlaneRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
