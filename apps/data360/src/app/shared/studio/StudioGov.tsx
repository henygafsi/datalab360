'use client';

/**
 * StudioGov — /studio/gov: the governance of Data360 seen from the Studio.
 *
 * Selection is BY ICON (roles · my access · policies · requests), each tile
 * backed by a REAL read the caller is allowed to make — application roles
 * (/gouvernance/d360-roles), the caller's own allow-set (my-permissions),
 * the policies in their role's scope (my-scope, tri-state flags rendered
 * honestly), and their access requests. No admin gate: everyone sees their
 * own governance truth.
 *
 * Creation happens WITHOUT FORMS — a chat-style guided journey (one
 * question per message: who → what → which application) that ends in
 * POST /studio/access/plan. The backend answers with a structured PLAN;
 * nothing is ever executed from this page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileKey2,
  Inbox,
  KeyRound,
  Send,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import {
  getD360Roles,
  getMyPermissions,
  type D360Role,
  type MyPermissionsResponse,
} from '@/app/services/governance/fetch_roles';
import {
  getMyScopePolicies,
  type MyScopePoliciesResult,
} from '@/app/services/governance/policies';
import {
  getMyRequests,
  type AccessRequest,
} from '@/app/services/access-requests';
import {
  listDrafts,
  planAccess,
  type AccessPlanWho,
  type StudioDraftSummary,
} from '@/app/services/studio/studio-api';
import { MODULES } from '@/config/modules';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

/* ── the four governance surfaces (icon selection) ──────────────────── */

type Surface = 'roles' | 'access' | 'policies' | 'requests';

const SURFACES: Array<{ id: Surface; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'roles', label: 'Application roles', icon: UserCog, hint: 'The Data360 roles and what each allows' },
  { id: 'access', label: 'My access', icon: KeyRound, hint: 'What your role lets you do, module by module' },
  { id: 'policies', label: 'Policies', icon: FileKey2, hint: 'Row, masking and aggregation rules in your scope' },
  { id: 'requests', label: 'My requests', icon: Inbox, hint: 'Data access you asked for, and where it stands' },
];

function triState(v: boolean | null | undefined): string {
  return v == null ? '—' : v ? 'yes' : 'no';
}

/** Module display names come from MODULES (brand rule — never raw api keys,
 *  which can carry vendor names). Falls back to a de-snaked key. */
const MODULE_NAMES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const m of MODULES) {
    map[m.apiName] = m.name;
    for (const sub of m.subModules ?? []) map[sub.apiName] = sub.name;
  }
  return map;
})();

function moduleLabel(apiName: string): string {
  return MODULE_NAMES[apiName] ?? apiName.replace(/_/g, ' ');
}

/** Customer-facing copy never names vendors (brand rule) — the plan text is
 *  displayed through this filter; the underlying plan stays untouched. */
function neutralize(s: string): string {
  return s.replace(/snowflake/gi, 'warehouse').replace(/cortex/gi, 'AI engine');
}

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

type PanelData =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'roles'; roles: D360Role[] }
  | { kind: 'access'; me: MyPermissionsResponse }
  | { kind: 'policies'; result: MyScopePoliciesResult }
  | { kind: 'requests'; requests: AccessRequest[] };

/* ── chat-only creation (no forms) ──────────────────────────────────── */

type ChatStage = 'who' | 'actions' | 'app' | 'planning' | 'planned';

interface ChatMessage {
  from: 'studio' | 'you';
  text: string;
}

const OPENING =
  'Let’s set up access together — no form to fill. Who is it for? Name roles or users, e.g. “role BI_ANALYST” or “user haha, role DATA_MODELER”.';

function parseWho(text: string): AccessPlanWho[] {
  return text
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(user|role)\s+(.+)$/i);
      if (m) return { type: m[1].toLowerCase(), name: m[2].trim() };
      return { type: 'role', name: t };
    });
}

function parseActions(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[,\s;]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  const known = words.filter((w) => ['view', 'edit', 'export', 'read', 'write'].includes(w));
  return known.length > 0 ? known : ['view'];
}

function AccessChat({ drafts }: { drafts: StudioDraftSummary[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: 'studio', text: OPENING },
  ]);
  const [stage, setStage] = useState<ChatStage>('who');
  const [input, setInput] = useState('');
  const [who, setWho] = useState<AccessPlanWho[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  const say = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const restart = useCallback(() => {
    setMessages([{ from: 'studio', text: OPENING }]);
    setStage('who');
    setWho([]);
    setActions([]);
    setPlan(null);
    setInput('');
  }, []);

  const runPlan = useCallback(
    async (draft: StudioDraftSummary, whoList: AccessPlanWho[], actionList: string[]) => {
      setStage('planning');
      say({
        from: 'studio',
        text: `Preparing the plan for “${draft.title || draft.draft_id}” — ${whoList
          .map((w) => `${w.type} ${w.name}`)
          .join(', ')} · ${actionList.join(', ')}…`,
      });
      try {
        const result = await planAccess({
          draft_id: draft.draft_id,
          who: whoList,
          actions: actionList,
        });
        setPlan(result);
        setStage('planned');
        say({
          from: 'studio',
          text: 'Here is the proposed plan. Nothing has been executed — an account admin applies it when you decide.',
        });
      } catch (e) {
        setStage('app');
        say({
          from: 'studio',
          text: `The plan could not be prepared: ${errText(e, 'the backend did not answer')}. Pick another application or start over.`,
        });
      }
    },
    [say],
  );

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || stage === 'planning' || stage === 'planned') return;
    say({ from: 'you', text });
    setInput('');

    if (stage === 'who') {
      const parsed = parseWho(text);
      if (parsed.length === 0) {
        say({ from: 'studio', text: 'I did not catch a role or user — try “role BI_ANALYST”.' });
        return;
      }
      setWho(parsed);
      setStage('actions');
      say({
        from: 'studio',
        text: `Got it — ${parsed.map((w) => `${w.type} ${w.name}`).join(', ')}. What should they be able to do? Say “view”, “edit” or “export” (view is the default).`,
      });
      return;
    }

    if (stage === 'actions') {
      const parsed = parseActions(text);
      setActions(parsed);
      setStage('app');
      say({
        from: 'studio',
        text:
          drafts.length > 0
            ? `Understood: ${parsed.join(', ')}. Which application is this about? Pick one below or type its name.`
            : 'Understood — but you have no Studio application yet. Create one first, then come back.',
      });
      return;
    }

    if (stage === 'app') {
      const match = drafts.find(
        (d) =>
          (d.title ?? '').toLowerCase() === text.toLowerCase() ||
          (d.title ?? '').toLowerCase().startsWith(text.toLowerCase()) ||
          d.draft_id === text,
      );
      if (!match) {
        say({ from: 'studio', text: 'I could not find that application — pick one of the chips below.' });
        return;
      }
      void runPlan(match, who, actions);
    }
  }, [actions, drafts, input, runPlan, say, stage, who]);

  /* defensive plan rendering — arrays first, then a compact fallback */
  const planLists = plan
    ? Object.entries(plan).filter(
        (e): e is [string, unknown[]] => Array.isArray(e[1]) && e[1].length > 0,
      )
    : [];

  return (
    <section
      className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      aria-label="Set up access by chat"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
          Set up access — just chat
        </p>
        <QuietAction label="Start over" onClick={restart} />
      </header>

      <div className="max-h-72 min-h-[10rem] flex-1 space-y-2 overflow-y-auto p-3" role="log">
        {messages.map((m, i) => (
          <p
            key={i}
            className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
              m.from === 'studio'
                ? 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                : 'ml-auto bg-accent-600 text-white'
            }`}
          >
            {m.text}
          </p>
        ))}

        {stage === 'app' && drafts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {drafts.slice(0, 6).map((d) => (
              <button
                key={d.draft_id}
                type="button"
                onClick={() => {
                  say({ from: 'you', text: d.title || d.draft_id });
                  void runPlan(d, who, actions);
                }}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-accent-300 hover:text-accent-700 dark:border-slate-700 dark:text-slate-300"
              >
                {d.title || d.draft_id}
              </button>
            ))}
          </div>
        )}

        {plan && (
          <div className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-700">
            {planLists.length > 0 ? (
              planLists.map(([key, items]) => (
                <div key={key} className="mb-1.5 last:mb-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {items.slice(0, 12).map((item, i) => (
                      <li key={i} className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {neutralize(typeof item === 'string' ? item : JSON.stringify(item))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-600 dark:text-slate-300">
                {neutralize(JSON.stringify(plan, null, 1).slice(0, 2000))}
              </pre>
            )}
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              A proposal only — nothing was executed.
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 p-2.5 dark:border-slate-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={stage === 'planning' || stage === 'planned'}
          placeholder={
            stage === 'who'
              ? 'role BI_ANALYST, user haha…'
              : stage === 'actions'
                ? 'view, edit…'
                : stage === 'app'
                  ? 'the application name…'
                  : 'Start over to plan another access'
          }
          aria-label="Your answer"
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim() || stage === 'planning' || stage === 'planned'}
          aria-label="Send"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </section>
  );
}

/* ── main component ─────────────────────────────────────────────────── */

export default function StudioGov() {
  useTrackEvent();

  const [surface, setSurface] = useState<Surface>('access');
  const [panels, setPanels] = useState<Partial<Record<Surface, PanelData>>>({});
  const [drafts, setDrafts] = useState<StudioDraftSummary[]>([]);

  useEffect(() => {
    void listDrafts()
      .then(setDrafts)
      .catch(() => setDrafts([]));
  }, []);

  useEffect(() => {
    if (panels[surface]) return; // loaded once per surface
    setPanels((p) => ({ ...p, [surface]: { kind: 'loading' } }));
    const put = (data: PanelData) => setPanels((p) => ({ ...p, [surface]: data }));
    switch (surface) {
      case 'roles':
        void getD360Roles()
          .then((roles) => put({ kind: 'roles', roles }))
          .catch((e) => put({ kind: 'error', message: errText(e, 'Roles could not be read.') }));
        break;
      case 'access':
        void getMyPermissions()
          .then((me) => put({ kind: 'access', me }))
          .catch((e) => put({ kind: 'error', message: errText(e, 'Your access could not be read.') }));
        break;
      case 'policies':
        void getMyScopePolicies()
          .then((result) => put({ kind: 'policies', result }))
          .catch((e) => put({ kind: 'error', message: errText(e, 'Policies could not be read.') }));
        break;
      case 'requests':
        void getMyRequests()
          .then((r) => put({ kind: 'requests', requests: r.requests }))
          .catch((e) => put({ kind: 'error', message: errText(e, 'Your requests could not be read.') }));
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  const data = panels[surface];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PlainQuestionHeader
        question="Governance & access"
        detail="Who can do what in Data360, the policies that protect the data, and a chat to set up new access — no form anywhere."
        backHref={routes.studio}
        backLabel="Studio"
        actions={
          <>
            <QuietAction label="Full governance module" icon={ShieldCheck} href={routes.governance.users} />
          </>
        }
      />

      {/* icon selection */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Governance surfaces">
        {SURFACES.map((s) => {
          const Icon = s.icon;
          const active = s.id === surface;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSurface(s.id)}
              title={s.hint}
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                active
                  ? 'border-accent-500 bg-accent-50/50 ring-1 ring-accent-500 dark:bg-accent-900/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
              }`}
            >
              <Icon aria-hidden className={`h-4 w-4 ${active ? 'text-accent-600' : 'text-slate-400 dark:text-slate-500'}`} />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{s.label}</span>
              <span className="text-xs leading-tight text-slate-400 dark:text-slate-500">{s.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,380px]">
        {/* the selected surface, real data */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {!data || data.kind === 'loading' ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
          ) : data.kind === 'error' ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">{data.message}</p>
          ) : data.kind === 'roles' ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.roles.length === 0 && (
                <li className="py-2 text-xs text-slate-400 dark:text-slate-500">No application role yet.</li>
              )}
              {data.roles.map((r) => (
                <li key={r.role_name} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {r.display_name || r.role_name}
                    </p>
                    {r.description && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {r.permission_count != null ? `${r.permission_count} action(s) allowed` : '—'}
                    {r.is_system ? ' · system' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : data.kind === 'access' ? (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Signed in as <span className="font-medium">{data.me.username || '—'}</span> · application role{' '}
                <span className="font-medium">{data.me.d360_role || '—'}</span> · warehouse role{' '}
                <span className="font-medium">{data.me.snowflake_role || '—'}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(
                  data.me.permissions.reduce<Record<string, number>>((acc, p) => {
                    if (p.access_level === 'ALLOW') acc[p.module] = (acc[p.module] ?? 0) + 1;
                    return acc;
                  }, {}),
                ).map(([module, n]) => (
                  <span
                    key={module}
                    className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    {moduleLabel(module)}: {n} allowed
                  </span>
                ))}
                {data.me.permissions.length === 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {data.me.uninitialized ? 'Permissions not initialised yet.' : '—'}
                  </span>
                )}
              </div>
            </div>
          ) : data.kind === 'policies' ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Scope of role {data.result.role || '—'} · {data.result.total} policy(ies)
                {data.result.note ? ` · ${data.result.note}` : ''}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr>
                      {['Policy', 'Type', 'Where', 'Manageable by me', 'Mentions my role'].map((h) => (
                        <th key={h} scope="col" className="whitespace-nowrap px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.result.policies.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-slate-400 dark:text-slate-500">
                          No policy in your role&rsquo;s scope.
                        </td>
                      </tr>
                    )}
                    {data.result.policies.slice(0, 50).map((p) => (
                      <tr key={`${p.database_name}.${p.schema_name}.${p.name}`}>
                        <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-700 dark:text-slate-200">{p.name}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">{p.policy_type}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                          {[p.database_name, p.schema_name].filter(Boolean).join('.') || '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-600 dark:text-slate-300">{triState(p.manageable_by_me)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-600 dark:text-slate-300">{triState(p.references_my_role)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.requests.length === 0 && (
                <li className="py-2 text-xs text-slate-400 dark:text-slate-500">
                  You have not requested any data access yet.
                </li>
              )}
              {data.requests.slice(0, 50).map((r) => (
                <li key={r.REQUEST_ID} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {r.PRIVILEGE} on {r.ASSET_FQN}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.REASON || '—'}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {r.STATUS}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* creation — chat only, no forms */}
        <AccessChat drafts={drafts} />
      </div>
    </div>
  );
}
