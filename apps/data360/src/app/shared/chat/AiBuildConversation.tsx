'use client';

// AiBuildConversation — chat-first "build with AI" flow, rendered inside the
// EXISTING docked ChatSidebar panel (no popups, no new floating surface).
//
// Flow (mission: modules/projects created via AI chat, stored as a discussion):
//   1. The user describes what they want to build. On the FIRST message we
//      (a) create a stored GROUP conversation (POST /chat/conversations/group,
//          title "AI build · <short summary>", optional invited collaborators —
//          the backend only accepts participants at group creation; there is no
//          add-participant route, so invites happen up-front and honestly),
//      (b) post the user message (POST /chat/conversations/{id}/messages),
//      (c) call the existing completion service (POST /cortex/complete) and
//          post the AI reply back into the same conversation as a SYSTEM
//          message with a "🤖 AI: " content prefix (the backend has no message
//          metadata column, so type+prefix are the durable AI markers).
//   2. Every AI reply carries a fenced ```json proposal block. The latest
//      parseable one renders as a persistent proposal card with two actions:
//      "Validate & open builder" (RBAC-gated deep link + stored "✅ Validated
//      by <user>" note) and "Request changes" (quoted reply into the input).
//   3. Subsequent messages continue the SAME stored conversation — the
//      discussion is the artifact, and collaborators see it in their chat list.
//
// Honest states: AI failures post a "⚠️" note in-thread (best effort) AND show
// a local retry strip; the user directory failing degrades to "start solo";
// a missing JSON block shows a hint instead of a fabricated card.
// Copy is vendor-neutral: the assistant is only ever called "AI".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronUp,
  Loader2,
  Quote,
  RefreshCw,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { routes } from '@/config/routes';
import { getModuleDisplayName } from '@/config/modules';
import { useAuth } from '@/hooks/useAuth';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import {
  createGroupConversation,
  getMessages,
  getParticipants,
  markAsRead,
  sendMessage,
  type ChatConversation,
  type ChatMessageRecord,
} from '@/app/services/chat';
import { generateCompletion } from '@/app/services/cortex';

// ── Shared conventions (imported by ChatSidebar / AiBuildLauncher) ─────────

/** Window event that opens the AI-build view inside the docked chat panel. */
export const OPEN_AI_BUILD_EVENT = 'data360:chat:open-ai-build';

/** Stored-conversation title prefix — how AI-build discussions are recognized. */
export const AI_BUILD_TITLE_PREFIX = 'AI build · ';

/** Durable content prefix for AI replies (backend stores no message metadata). */
const AI_MSG_PREFIX = '🤖 AI: ';

export function isAiBuildConversationTitle(title?: string | null): boolean {
  return typeof title === 'string' && title.startsWith(AI_BUILD_TITLE_PREFIX);
}

// ── Build-target registry (module display names come from MODULES config) ──

type BuildTargetKey = 'explore-design' | 'workflow' | 'bi-dashboard';

const TARGET_KEYS: readonly BuildTargetKey[] = ['explore-design', 'workflow', 'bi-dashboard'];

interface BuildTarget {
  key: BuildTargetKey;
  /** Display name from MODULES[].name (house rule — never hardcoded). */
  moduleName: string;
  /** What gets built there (artifact noun for buttons/notes). */
  artifact: string;
  /** Action-RBAC module key for useCanPerform(module, 'create'). */
  gateModule: string;
  /** Deep link with intent params (ScanPrefillBanner-style hand-off). */
  deepLink: (prompt: string) => string;
}

const BUILD_TARGETS: Record<BuildTargetKey, BuildTarget> = {
  'explore-design': {
    key: 'explore-design',
    moduleName: getModuleDisplayName('explore_design'),
    artifact: 'data model',
    gateModule: 'explore_design',
    deepLink: (prompt) =>
      `${routes.exploreDesign.view}?intent=model&from=chat&prompt=${encodeURIComponent(prompt)}`,
  },
  workflow: {
    key: 'workflow',
    moduleName: getModuleDisplayName('workflow'),
    artifact: 'pipeline',
    gateModule: 'workflow',
    deepLink: (prompt) =>
      `${routes.workflow.ViewWorkflow}?from=chat&prompt=${encodeURIComponent(prompt)}`,
  },
  'bi-dashboard': {
    key: 'bi-dashboard',
    moduleName: getModuleDisplayName('bi_reporting'),
    artifact: 'dashboard',
    gateModule: 'bi_reporting',
    deepLink: (prompt) =>
      `${routes.biDashboard.view}?from=chat&prompt=${encodeURIComponent(prompt)}`,
  },
};

// ── Structured proposal (parsed from the AI reply's ```json block) ─────────

export interface BuildProposal {
  project_name: string;
  module: BuildTargetKey;
  summary: string;
  entities: string[];
  steps: string[];
  next_actions: string[];
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 8);
}

/** Parse the latest structured proposal from an AI message body (fenced ```json first, bare {...} fallback). */
function parseProposal(content: string): BuildProposal | null {
  const candidates: string[] = [];
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(content.slice(start, end + 1));

  for (const raw of candidates) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (!obj || typeof obj !== 'object') continue;
      const name = typeof obj.project_name === 'string' ? obj.project_name.trim() : '';
      if (!name) continue;
      const module = (TARGET_KEYS as readonly string[]).includes(String(obj.module))
        ? (obj.module as BuildTargetKey)
        : 'explore-design';
      return {
        project_name: name.slice(0, 120),
        module,
        summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 400) : '',
        entities: toStringArray(obj.entities),
        steps: toStringArray(obj.steps),
        next_actions: toStringArray(obj.next_actions),
      };
    } catch {
      /* not JSON — try the next candidate */
    }
  }
  return null;
}

// ── Message helpers ─────────────────────────────────────────────────────────

type MessageKind = 'user' | 'ai' | 'note';

function classifyMessage(m: ChatMessageRecord): MessageKind {
  const content = m.CONTENT || '';
  if (content.startsWith(AI_MSG_PREFIX) || content.startsWith('🤖')) return 'ai';
  if (m.MESSAGE_TYPE === 'SYSTEM') return 'note';
  return 'user';
}

function stripAiPrefix(content: string): string {
  return content.startsWith(AI_MSG_PREFIX) ? content.slice(AI_MSG_PREFIX.length) : content;
}

/** Prose part of an AI reply — the JSON block renders as the proposal card instead. */
function proseOf(content: string): string {
  return stripAiPrefix(content)
    .replace(/```(?:json)?\s*[\s\S]*?```/gi, '')
    .trim();
}

function shortSummary(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 48).replace(/\s+\S*$/, '')}…`;
}

function formatTime(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as Error).message === 'string') {
    return (err as Error).message;
  }
  return 'unexpected error';
}

// ── AI prompt (structured-proposal contract; vendor-neutral by instruction) ─

const AI_INSTRUCTIONS = `You are the AI build assistant inside the Data360 data platform. A team describes what they want to build; you turn it into a concrete build proposal and refine it across the conversation.

Reply format — STRICT:
1) Short, helpful prose (under 120 words, no headings): what you propose and why.
2) Then exactly ONE fenced code block tagged json containing ONLY this object:
{
  "project_name": "short suggested project name",
  "module": "explore-design" | "workflow" | "bi-dashboard",
  "summary": "one sentence describing what will be built",
  "entities": ["main tables or business entities"],
  "steps": ["3 to 6 concrete build steps"],
  "next_actions": ["1 to 3 immediate next actions for the user"]
}

Module choice: data model / schema / semantic layer -> "explore-design"; ingestion / ETL / pipeline / scheduling -> "workflow"; KPIs / charts / reporting -> "bi-dashboard".
On follow-ups or change requests, apply the changes and RE-EMIT the FULL updated json block.
Refer to yourself only as "AI". Never mention any vendor, engine, or model name.`;

function buildAiPrompt(messages: ChatMessageRecord[]): string {
  const turns = messages
    .filter((m) => classifyMessage(m) !== 'note')
    .slice(-8)
    .map((m) => {
      const kind = classifyMessage(m);
      const body = (kind === 'ai' ? stripAiPrefix(m.CONTENT || '') : m.CONTENT || '').slice(0, 600);
      return kind === 'ai' ? `ASSISTANT: ${body}` : `USER (${m.SENDER_USERNAME}): ${body}`;
    })
    .join('\n\n');
  return `${AI_INSTRUCTIONS}\n\nConversation so far:\n\n${turns}\n\nRespond to the latest user message now, following the strict reply format.\nASSISTANT:`;
}

// ── Collaborator directory (picked at creation — see header comment) ───────

interface DirectoryUser {
  username: string;
  display: string;
}

// ── Component ───────────────────────────────────────────────────────────────

const STARTERS = [
  'A retail analytics model with orders + customers',
  'A daily ingestion pipeline for sales transactions',
  'A revenue KPI dashboard by region and month',
];

export interface AiBuildConversationProps {
  /** Reopen a stored AI-build discussion (from the conversation list). */
  initialConversation?: { conversation_id: string; title: string } | null;
  /** Back to the conversation list (caller refreshes it). */
  onBack: () => void;
}

export default function AiBuildConversation({ initialConversation, onBack }: AiBuildConversationProps) {
  const { username } = useAuth();
  const me = (username || '').toUpperCase();
  const router = useRouter();
  const { trackFeatureClick } = useTrackEvent();

  // RBAC gates for the three build targets (hooks must be unconditional;
  // they share one cached /my-permissions request module-wide).
  const edGate = useCanPerform('explore_design', 'create');
  const wfGate = useCanPerform('workflow', 'create');
  const biGate = useCanPerform('bi_reporting', 'create');
  const gates: Record<BuildTargetKey, ReturnType<typeof useCanPerform>> = {
    'explore-design': edGate,
    workflow: wfGate,
    'bi-dashboard': biGate,
  };

  const [conv, setConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'idle' | 'starting' | 'thinking'>('idle');
  const [loadingThread, setLoadingThread] = useState(false);
  const [localError, setLocalError] = useState<{ message: string; onRetry: () => void } | null>(null);

  // Invite-at-creation picker (backend accepts participants only on create).
  const [showInvite, setShowInvite] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [directoryState, setDirectoryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const fetchingRef = useRef(false);

  // ── Data loading ──────────────────────────────────────────────────────

  const refreshMessages = useCallback(async (conversationId: string, markRead = true) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await getMessages(conversationId, 1, 100);
      const items = res.items || [];
      setMessages((prev) => {
        const lastPrev = prev[prev.length - 1]?.MESSAGE_ID;
        const lastNew = items[items.length - 1]?.MESSAGE_ID;
        if (lastPrev === lastNew && prev.length === items.length) return prev; // stable ref → no scroll churn
        return items;
      });
      const lastId = items[items.length - 1]?.MESSAGE_ID;
      if (markRead && lastId) markAsRead(conversationId, lastId).catch(() => {});
    } catch {
      /* poll/refresh failures are non-fatal; the next tick retries */
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const loadParticipants = useCallback(async (conversationId: string) => {
    try {
      const rows = await getParticipants(conversationId);
      // Rows come back with Snowflake UPPER keys despite the service's
      // lowercase ChatParticipant type — normalize defensively.
      const names = (rows as unknown as Array<Record<string, unknown>>)
        .map((p) => String((p.USERNAME as string) || (p.username as string) || ''))
        .filter(Boolean);
      setParticipants(names);
    } catch {
      setParticipants([]); // roster is informative only — never blocks the flow
    }
  }, []);

  // Reopen a stored AI-build discussion.
  useEffect(() => {
    if (!initialConversation?.conversation_id) return;
    const now = new Date().toISOString();
    setConv({
      CONVERSATION_ID: initialConversation.conversation_id,
      TITLE: initialConversation.title,
      TYPE: 'GROUP',
      CREATED_AT: now,
      UPDATED_AT: now,
    });
    setLoadingThread(true);
    Promise.all([
      refreshMessages(initialConversation.conversation_id),
      loadParticipants(initialConversation.conversation_id),
    ]).finally(() => setLoadingThread(false));
  }, [initialConversation?.conversation_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for collaborator replies every 10s while a conversation is open.
  useEffect(() => {
    const id = conv?.CONVERSATION_ID;
    if (!id) return;
    const timer = setInterval(() => {
      if (busyRef.current !== 'idle') return;
      void refreshMessages(id);
    }, 10_000);
    return () => clearInterval(timer);
  }, [conv?.CONVERSATION_ID, refreshMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, localError]);

  const loadDirectory = useCallback(async () => {
    setDirectoryState('loading');
    try {
      const { data } = await apiClient.get(API.gouvernance.users());
      const raw = data?.data ?? data;
      const rows = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
      const users = rows
        .map((u) => {
          const uname = String((u.name as string) || (u.login_name as string) || '').toUpperCase();
          return {
            username: uname,
            display: String((u.display_name as string) || (u.name as string) || (u.login_name as string) || uname),
          };
        })
        .filter((u) => u.username && u.username !== me);
      setDirectory(users);
      setDirectoryState('ready');
    } catch {
      setDirectory([]);
      setDirectoryState('error');
    }
  }, [me]);

  useEffect(() => {
    if (showInvite && directoryState === 'idle') void loadDirectory();
  }, [showInvite, directoryState, loadDirectory]);

  // ── AI turn (retry-safe: rebuilt from the STORED thread every time) ───

  const runAiTurn = useCallback(
    async (conversationId: string) => {
      setBusy('thinking');
      setLocalError(null);
      try {
        const res = await getMessages(conversationId, 1, 100);
        const thread = res.items || [];
        setMessages(thread);
        const { response } = await generateCompletion({
          prompt: buildAiPrompt(thread),
          model: 'mistral-large2',
        });
        const aiText = (response || '').trim();
        if (!aiText) throw new Error('the AI returned an empty reply');
        await sendMessage(conversationId, `${AI_MSG_PREFIX}${aiText}`.slice(0, 10_000), 'SYSTEM');
        await refreshMessages(conversationId);
      } catch (err) {
        // Honest in-thread note (best effort — collaborators see why there is
        // no reply) + a local retry strip for the author.
        sendMessage(
          conversationId,
          `⚠️ The AI reply failed for the last request — it can be retried from the AI build panel.`,
          'SYSTEM',
        )
          .then(() => refreshMessages(conversationId))
          .catch(() => {});
        setLocalError({
          message: `AI is unavailable right now — ${errorMessage(err)}.`,
          onRetry: () => void runAiTurn(conversationId),
        });
      } finally {
        setBusy('idle');
      }
    },
    [refreshMessages],
  );

  // ── Sending (first message creates the stored group conversation) ─────

  const submitUserMessage = useCallback(
    async (text: string) => {
      setLocalError(null);
      const optimistic: ChatMessageRecord = {
        MESSAGE_ID: `local_${Date.now()}`,
        CONVERSATION_ID: conv?.CONVERSATION_ID || '',
        SENDER_USERNAME: me,
        CONTENT: text,
        MESSAGE_TYPE: 'TEXT',
        CREATED_AT: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      let active = conv;
      try {
        if (!active) {
          setBusy('starting');
          // NOTE: creation is idempotent backend-side (same title + creator
          // returns the existing conversation) — an identical re-description
          // simply continues that discussion. Creator is auto-added as ADMIN;
          // duplicates in the roster are de-duped by the backend.
          const roster = Array.from(new Set([me, ...invited])).filter(Boolean);
          active = await createGroupConversation(`${AI_BUILD_TITLE_PREFIX}${shortSummary(text)}`, roster);
          setConv(active);
          trackFeatureClick('ai_build_start', {
            conversation_id: active.CONVERSATION_ID,
            invited: invited.length,
          });
          void loadParticipants(active.CONVERSATION_ID);
        }
        await sendMessage(active.CONVERSATION_ID, text, 'TEXT');
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.MESSAGE_ID !== optimistic.MESSAGE_ID));
        setInput(text); // hand the draft back — nothing was lost
        setBusy('idle');
        setLocalError({
          message: `${conv ? "Couldn't send your message" : "Couldn't start the build conversation"} — ${errorMessage(err)}.`,
          onRetry: () => void submitUserMessage(text),
        });
        return;
      }
      await runAiTurn(active.CONVERSATION_ID);
    },
    [conv, invited, me, loadParticipants, runAiTurn, trackFeatureClick],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy !== 'idle') return;
    setInput('');
    void submitUserMessage(text);
  }, [input, busy, submitUserMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Proposal card (latest parseable AI proposal in the thread) ────────

  const latestProposal = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (classifyMessage(m) !== 'ai') continue;
      const p = parseProposal(m.CONTENT || '');
      if (p) return { proposal: p, at: m.CREATED_AT };
    }
    return null;
  }, [messages]);

  const hasAiReply = useMemo(() => messages.some((m) => classifyMessage(m) === 'ai'), [messages]);
  const [proposalOpen, setProposalOpen] = useState(true);

  const handleValidate = useCallback(async () => {
    if (!conv || !latestProposal) return;
    const { proposal } = latestProposal;
    const target = BUILD_TARGETS[proposal.module];
    const seed = `${proposal.project_name}: ${proposal.summary || 'as discussed in the AI build conversation'}`.slice(0, 400);
    trackFeatureClick('ai_build_validate', { module: proposal.module, conversation_id: conv.CONVERSATION_ID });
    try {
      await sendMessage(
        conv.CONVERSATION_ID,
        `✅ Validated by ${me} — opening the ${target.artifact} builder in ${target.moduleName}.`,
        'SYSTEM',
      );
      await refreshMessages(conv.CONVERSATION_ID);
      toast.success(`Proposal validated — opening ${target.moduleName}`);
    } catch {
      // Navigation still proceeds; be honest that the note was not stored.
      toast.error("Couldn't record the validation note in the discussion — opening the builder anyway.");
    }
    router.push(target.deepLink(seed));
  }, [conv, latestProposal, me, refreshMessages, router, trackFeatureClick]);

  const handleRequestChanges = useCallback(() => {
    if (!latestProposal) return;
    const { proposal } = latestProposal;
    trackFeatureClick('ai_build_request_changes', { module: proposal.module });
    setInput(`> Proposal: ${proposal.project_name}\nPlease change: `);
    inputRef.current?.focus();
  }, [latestProposal, trackFeatureClick]);

  const toggleInvited = (uname: string) => {
    setInvited((prev) => (prev.includes(uname) ? prev.filter((u) => u !== uname) : [...prev, uname]));
  };

  // ── Render ────────────────────────────────────────────────────────────

  const started = !!conv;
  const gate = latestProposal ? gates[latestProposal.proposal.module] : null;
  const target = latestProposal ? BUILD_TARGETS[latestProposal.proposal.module] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <button
          aria-label="Back to conversations"
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {conv?.TITLE || 'Build with AI'}
          </h3>
          <p className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
            <Bot className="h-3 w-3 text-violet-500" />
            AI Assistant · virtual participant
            {started && participants.length > 0 && (
              <span>
                {' '}
                · {participants.length} member{participants.length > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Participant chips — stored roster + the AI virtual participant */}
      {started && participants.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-800/50">
          <Users className="h-3 w-3 shrink-0 text-gray-400" />
          {participants.map((p) => (
            <span
              key={p}
              className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
            >
              {p}
            </span>
          ))}
          <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-600 ring-1 ring-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-800">
            ✨ AI Assistant
          </span>
        </div>
      )}

      {/* Thread / intro */}
      <div className="flex-1 overflow-y-auto">
        {!started && messages.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-3 dark:border-violet-900/50 dark:from-violet-950/30 dark:to-indigo-950/20">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                Describe what you want to build
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-violet-700/80 dark:text-violet-300/80">
                AI turns your description into a build proposal — suggested project name, target module,
                main entities and steps. The whole exchange is saved as a group discussion your team can
                join, refine, and validate.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Try one</p>
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s);
                    inputRef.current?.focus();
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-gray-600 hover:border-violet-300 hover:bg-violet-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-violet-700 dark:hover:bg-violet-900/20"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Invite collaborators — only possible at creation (no add-participant route) */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowInvite((v) => !v)}
                className="flex w-full items-center justify-between px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <span className="flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-gray-400" />
                  Invite collaborators (optional)
                  {invited.length > 0 && (
                    <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                      {invited.length}
                    </span>
                  )}
                </span>
                {showInvite ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showInvite && (
                <div className="max-h-36 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
                  {directoryState === 'loading' && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  {directoryState === 'error' && (
                    <p className="px-2.5 py-2 text-[11px] text-gray-400">
                      Couldn&apos;t load the user directory — you can still start the build solo.
                    </p>
                  )}
                  {directoryState === 'ready' && directory.length === 0 && (
                    <p className="px-2.5 py-2 text-[11px] text-gray-400">No other users found.</p>
                  )}
                  {directoryState === 'ready' &&
                    directory.slice(0, 30).map((u) => (
                      <button
                        key={u.username}
                        type="button"
                        onClick={() => toggleInvited(u.username)}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          invited.includes(u.username) ? 'bg-violet-50 dark:bg-violet-900/20' : ''
                        }`}
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[8px] font-bold ${
                            invited.includes(u.username)
                              ? 'border-violet-500 bg-violet-500 text-white'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {invited.includes(u.username) ? '✓' : ''}
                        </span>
                        <span className="truncate text-gray-700 dark:text-gray-200">{u.display}</span>
                        <span className="ml-auto truncate text-[10px] text-gray-400">@{u.username}</span>
                      </button>
                    ))}
                </div>
              )}
              <p className="border-t border-gray-100 px-2.5 py-1.5 text-[10px] text-gray-400 dark:border-gray-800">
                Collaborators are added when the discussion starts and can then reply in this thread.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 p-3">
            {loadingThread && messages.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            )}
            {messages.map((msg) => {
              const kind = classifyMessage(msg);
              if (kind === 'note') {
                return (
                  <div key={msg.MESSAGE_ID} className="my-1 flex justify-center">
                    <span className="max-w-[92%] rounded-full bg-gray-100 px-2.5 py-1 text-center text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {msg.CONTENT}
                    </span>
                  </div>
                );
              }
              const isAi = kind === 'ai';
              const isMine = !isAi && msg.SENDER_USERNAME?.toUpperCase() === me;
              const body = isAi ? proseOf(msg.CONTENT || '') || 'Proposal updated — see the card below.' : msg.CONTENT;
              return (
                <div key={msg.MESSAGE_ID} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      isAi
                        ? 'rounded-bl-md border border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-100'
                        : isMine
                          ? 'rounded-br-md bg-blue-600 text-white'
                          : 'rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {!isMine && (
                      <p className="mb-0.5 text-[10px] font-medium opacity-60">
                        {isAi ? '✨ AI Assistant' : msg.SENDER_USERNAME}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{body}</p>
                    <p className={`mt-0.5 text-[10px] ${isMine ? 'text-blue-200' : 'opacity-40'}`}>
                      {formatTime(msg.CREATED_AT)}
                    </p>
                  </div>
                </div>
              );
            })}

            {busy !== 'idle' && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {busy === 'starting' ? 'Creating the build discussion…' : 'AI is drafting the proposal…'}
                </div>
              </div>
            )}

            {localError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/30">
                <p className="flex-1 text-[11px] leading-snug text-red-700 dark:text-red-300">{localError.message}</p>
                <button
                  type="button"
                  onClick={localError.onRetry}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-700"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </div>
            )}

            {hasAiReply && !latestProposal && busy === 'idle' && (
              <p className="px-1 text-center text-[10px] text-gray-400">
                The latest AI reply had no structured proposal — ask it to restate the proposal.
              </p>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Persistent proposal card — from the latest structured AI reply */}
      {latestProposal && target && gate && (
        <div className="border-t border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 dark:border-violet-900/50 dark:from-violet-950/40 dark:to-indigo-950/30">
          <button
            type="button"
            onClick={() => setProposalOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-900 dark:text-white">
              {latestProposal.proposal.project_name}
            </span>
            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
              {target.moduleName}
            </span>
            {proposalOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            )}
          </button>

          {proposalOpen && (
            <div className="px-3 pb-2">
              {latestProposal.proposal.summary && (
                <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-300">
                  {latestProposal.proposal.summary}
                </p>
              )}
              {latestProposal.proposal.entities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {latestProposal.proposal.entities.slice(0, 6).map((e) => (
                    <span
                      key={e}
                      className="rounded border border-gray-200 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
              {latestProposal.proposal.steps.length > 0 && (
                <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                  {latestProposal.proposal.steps.slice(0, 5).map((s) => (
                    <li key={s} className="truncate" title={s}>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 pb-2.5">
            <button
              type="button"
              onClick={handleValidate}
              disabled={!gate.allowed || gate.loading || busy !== 'idle'}
              title={
                gate.loading
                  ? 'Checking your permissions…'
                  : gate.allowed
                    ? `Open the ${target.artifact} builder in ${target.moduleName}`
                    : `Your role can't create in ${target.moduleName}`
              }
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Validate &amp; open builder <ArrowRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleRequestChanges}
              disabled={busy !== 'idle'}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Quote className="h-3 w-3" /> Request changes
            </button>
          </div>
          {!gate.allowed && !gate.loading && (
            <p className="px-3 pb-2 text-[10px] text-amber-600 dark:text-amber-400">
              Your role can&apos;t create in {target.moduleName} — you can still discuss and request changes.
            </p>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-1.5 border-t border-gray-200 px-3 py-2.5 dark:border-gray-700">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={input.includes('\n') ? 3 : 1}
          maxLength={4000}
          placeholder={
            busy === 'thinking'
              ? 'AI is thinking…'
              : started
                ? 'Refine the proposal or reply to your team…'
                : 'Describe what you want to build…'
          }
          disabled={busy !== 'idle'}
          className="max-h-24 flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
        />
        <button
          aria-label="Send to AI build discussion"
          onClick={handleSend}
          disabled={!input.trim() || busy !== 'idle'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-40"
        >
          {busy !== 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
