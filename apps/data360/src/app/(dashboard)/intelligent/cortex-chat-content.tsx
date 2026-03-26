'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Badge, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  HiOutlinePaperAirplane,
  HiOutlineClipboard,
  HiOutlineTableCells,
  HiOutlineChartBar,
  HiOutlineLightBulb,
  HiOutlineArrowPath,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClock,
} from 'react-icons/hi2';
import {
  PiBrain,
  PiDatabase,
  PiCode,
  PiMagicWand,
} from 'react-icons/pi';
import { queryCortex, type CortexQueryResult } from '@/app/services/cortex';
import { listSemanticModels, type SemanticModel } from '@/app/services/cortex/semantic-models';
import {
  listConversations,
  createGroupConversation,
  getMessages,
  sendMessage as sendChatMessage,
  type ChatConversation,
} from '@/app/services/chat';

// ── Types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  results?: CortexQueryResult[];
  loading?: boolean;
  error?: string;
}

// ── Example queries ────────────────────────────────────────────────────

const DEFAULT_EXAMPLE_QUERIES = [
  { text: 'What were the total sales last month?', icon: HiOutlineChartBar },
  { text: 'Show me the top 10 customers by revenue', icon: HiOutlineTableCells },
  { text: 'Compare this quarter vs last quarter', icon: HiOutlineLightBulb },
  { text: 'How many new users signed up today?', icon: PiDatabase },
];

function getContextExamples(table: string) {
  if (!table) return DEFAULT_EXAMPLE_QUERIES;
  const shortName = table.split('.').pop() || table;
  return [
    { text: `Describe the columns in ${shortName}`, icon: HiOutlineTableCells },
    { text: `Show the top 10 rows from ${shortName} ordered by the primary key`, icon: PiDatabase },
    { text: `What are the trends in ${shortName} over the last 30 days?`, icon: HiOutlineChartBar },
    { text: `Suggest optimizations for ${shortName}`, icon: HiOutlineLightBulb },
  ];
}

// ── Helpers ────────────────────────────────────────────────────────────

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getUserInitials(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('d360_username');
    if (stored) return stored.slice(0, 2).toUpperCase();
  }
  return 'ME';
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatConversationDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Main Component ─────────────────────────────────────────────────────

export default function CortexChatContent() {
  const searchParams = useSearchParams();
  const modelFromUrl = searchParams.get('model') || '';
  const contextModule = searchParams.get('context_module') || '';
  const contextTable = searchParams.get('context_table') || '';

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Semantic model selection
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(modelFromUrl);
  const [loadingModels, setLoadingModels] = useState(true);

  // Conversation persistence
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const userInitials = getUserInitials();

  // ── Load models ────────────────────────────────────────────────────

  useEffect(() => {
    loadModels();
    loadConversations();
  }, []);

  useEffect(() => {
    if (modelFromUrl && modelFromUrl !== selectedModel) {
      setSelectedModel(modelFromUrl);
      toast.success(`Model "${modelFromUrl}" selected for chat`);
    }
  }, [modelFromUrl]);

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const data = await listSemanticModels();
      const modelsArray = Array.isArray(data) ? data : [];
      setModels(modelsArray);
      if (modelsArray.length > 0 && !selectedModel && !modelFromUrl) {
        setSelectedModel(modelsArray[0].name.replace('.yaml', ''));
      }
    } catch (err: any) {
      console.error('[CortexChat] Failed to load models:', err?.message);
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const modelOptions = models.map((m) => ({
    value: m.name.replace('.yaml', ''),
    label: m.name.replace('.yaml', ''),
  }));

  // ── Conversation persistence ───────────────────────────────────────

  const loadConversations = async () => {
    setLoadingConversations(true);
    try {
      const data = await listConversations(1, 50);
      const items = data?.items ?? [];
      // Filter only AI chat conversations (title starts with "Cortex Chat")
      const aiConvos = items.filter(
        (c: ChatConversation) => c.TITLE?.startsWith('Cortex Chat') || c.TYPE === 'AI_CHAT'
      );
      setConversations(aiConvos);
    } catch (err: any) {
      // Chat persistence is best-effort — do not block the UI
      console.warn('[CortexChat] Could not load conversations:', err?.message);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const data = await getMessages(conversationId, 1, 200);
      const items = data?.items ?? [];
      const loaded: ChatMessage[] = items.map((m: any) => ({
        id: m.MESSAGE_ID || generateId(),
        role: m.MESSAGE_TYPE === 'SYSTEM' || m.SENDER_USERNAME === 'CORTEX_AI'
          ? 'assistant' : 'user',
        content: m.CONTENT || '',
        timestamp: new Date(m.CREATED_AT || Date.now()),
        results: undefined,
        loading: false,
      }));
      setMessages(loaded);
      setActiveConversationId(conversationId);
    } catch (err: any) {
      console.warn('[CortexChat] Could not load messages:', err?.message);
      toast.error('Could not load conversation history');
    }
  };

  const persistMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!activeConversationId || !content) return;
    try {
      await sendChatMessage(
        activeConversationId,
        content,
        role === 'assistant' ? 'SYSTEM' as const : 'TEXT' as const
      );
    } catch (err: any) {
      console.warn('[CortexChat] Could not persist message:', err?.message);
    }
  };

  const ensureConversation = async (): Promise<string | null> => {
    if (activeConversationId) return activeConversationId;
    try {
      const title = `Cortex Chat — ${new Date().toLocaleDateString()}`;
      const conv = await createGroupConversation(title, []);
      const newId = conv.CONVERSATION_ID;
      setActiveConversationId(newId);
      setConversations((prev) => [conv, ...prev]);
      return newId;
    } catch (err: any) {
      console.warn('[CortexChat] Could not create conversation:', err?.message);
      return null;
    }
  };

  // ── Scrolling ──────────────────────────────────────────────────────

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Send message with context accumulation (Bug 6) ────────────────

  const handleSendMessage = async (prompt?: string) => {
    const messageText = prompt || inputValue.trim();
    if (!messageText || isQuerying) return;

    if (!selectedModel) {
      toast.error('Please select a semantic model first');
      return;
    }

    // Ensure we have a conversation for persistence
    const convId = await ensureConversation();

    // User message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    // Assistant placeholder
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInputValue('');
    setIsQuerying(true);

    // Persist user message (best-effort, non-blocking)
    if (convId) {
      persistMessage('user', messageText);
    }

    try {
      // Bug 6 fix: Accumulate context from recent messages
      const recentContext = messages
        .slice(-6)
        .filter((m) => !m.loading && m.content)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const contextPrefix = contextTable
        ? `You are helping the user analyze the table ${contextTable} in the ${contextModule || 'data'} module. `
        : '';

      const fullPrompt = recentContext
        ? `${contextPrefix}Previous conversation:\n${recentContext}\n\nUser: ${messageText}`
        : `${contextPrefix}${messageText}`;

      const response = await queryCortex({
        prompt: fullPrompt,
        semantic_model: selectedModel || undefined,
      });

      const resultContent = formatResults(response.results);

      // Update assistant message with results
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                loading: false,
                results: response.results,
                content: resultContent,
              }
            : msg
        )
      );

      // Persist assistant response (best-effort)
      if (convId) {
        persistMessage('assistant', resultContent);
      }
    } catch (error: any) {
      console.error('Cortex query error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                loading: false,
                error: error.message || 'Failed to process query',
                content: 'Sorry, I encountered an error processing your query.',
              }
            : msg
        )
      );
      toast.error(error.message || 'Failed to process query');
    } finally {
      setIsQuerying(false);
    }
  };

  // ── Formatting ─────────────────────────────────────────────────────

  const formatResults = (results: CortexQueryResult[]): string => {
    if (!results || results.length === 0) return 'No results found.';
    const textResults = results.filter((r) => r.type === 'text');
    if (textResults.length > 0) {
      return textResults.map((r) => r.text).join('\n');
    }
    return 'Results generated successfully.';
  };

  // ── Handlers ───────────────────────────────────────────────────────

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setActiveConversationId(null);
  };

  const handleSelectConversation = (conv: ChatConversation) => {
    loadConversationMessages(conv.CONVERSATION_ID);
  };

  const handleClearChat = () => {
    setMessages([]);
    setActiveConversationId(null);
    toast.success('Chat cleared');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  // ── Render result data (SQL tables, text, suggestions) ─────────────

  const renderResultData = (results: CortexQueryResult[]) => {
    return results.map((result, index) => {
      if (result.type === 'sql' && result.query) {
        return (
          <div key={index} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <PiCode className="w-4 h-4" />
                Generated SQL
              </span>
              <button
                onClick={() => copyToClipboard(result.query!)}
                className="text-xs text-fuchsia-600 hover:text-fuchsia-700 dark:text-fuchsia-400 flex items-center gap-1"
              >
                <HiOutlineClipboard className="w-3 h-3" />
                Copy
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
              <code>{result.query}</code>
            </pre>

            {result.data && result.data.length > 0 && (
              <div className="mt-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-2">
                  <HiOutlineTableCells className="w-4 h-4" />
                  Query Results ({result.data.length} rows)
                </span>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        {Object.keys(result.data[0]).map((key) => (
                          <th
                            key={key}
                            className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {result.data.slice(0, 10).map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {Object.values(row).map((value, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-4 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                            >
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.data.length > 10 && (
                    <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 text-center">
                      Showing 10 of {result.data.length} rows
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      if (result.type === 'text' && result.text) {
        return (
          <p key={index} className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {result.text}
          </p>
        );
      }

      if ((result as any).type === 'suggestions' && (result as any).suggestions) {
        return (
          <div key={index} className="mt-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Suggested follow-ups:</p>
            <div className="flex flex-wrap gap-2">
              {(result as any).suggestions.map((s: string, si: number) => (
                <button
                  key={si}
                  onClick={() => handleSendMessage(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        );
      }

      return null;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-[700px]">
      {/* ── Sidebar: Conversation list (Bug 7) ──────────────────────── */}
      {sidebarOpen && (
        <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-800/50 rounded-l-xl">
          {/* Sidebar header */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-700">
            <Button
              size="sm"
              className="w-full bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white"
              onClick={handleNewConversation}
            >
              <HiOutlinePlus className="w-4 h-4 mr-1.5" />
              New Conversation
            </Button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                <HiOutlineChatBubbleLeftRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No conversations yet.
                <br />Start chatting to create one.
              </div>
            ) : (
              conversations.map((conv) => {
                const isActive = conv.CONVERSATION_ID === activeConversationId;
                return (
                  <button
                    key={conv.CONVERSATION_ID}
                    onClick={() => handleSelectConversation(conv)}
                    className={`w-full text-left px-3 py-3 border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ${
                      isActive ? 'bg-fuchsia-50 dark:bg-fuchsia-900/20 border-l-2 border-l-fuchsia-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <PiBrain className="w-4 h-4 text-fuchsia-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                        {conv.TITLE || 'Untitled'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 ml-6">
                      <HiOutlineClock className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {formatConversationDate(conv.UPDATED_AT || conv.CREATED_AT)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Sidebar footer toggle */}
          <div className="p-2 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 w-full text-center"
            >
              Hide sidebar
            </button>
          </div>
        </div>
      )}

      {/* ── Main chat area ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header (Bug 7: model selector visible) */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 mr-1"
                title="Show conversations"
              >
                <HiOutlineChatBubbleLeftRight className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <PiBrain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                Cortex Chat
                <Badge className="bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 text-xs">
                  Beta
                </Badge>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Ask questions about your data in natural language
              </p>
            </div>
            {contextTable && (
              <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs ml-2">
                {contextModule ? `${contextModule} / ` : ''}{contextTable.split('.').pop()}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Model selector in header (Bug 7) */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <PiBrain className="w-3.5 h-3.5 text-fuchsia-500" />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">MODEL</span>
            </div>
            <div className="w-48">
              <Select
                options={modelOptions}
                value={selectedModel}
                onChange={(opt: any) => setSelectedModel(opt?.value || '')}
                placeholder={loadingModels ? 'Loading...' : 'Select model'}
                disabled={loadingModels || modelOptions.length === 0}
                size="sm"
              />
            </div>
            {messages.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearChat}
                className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
              >
                <HiOutlineTrash className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-4">
          {messages.length === 0 ? (
            /* Welcome State */
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full blur-2xl opacity-20 animate-pulse" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-fuchsia-500/30">
                  <PiMagicWand className="w-10 h-10 text-white" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Ask Anything About Your Data
              </h3>
              <p className="text-slate-600 dark:text-slate-400 max-w-md mb-8">
                Powered by Snowflake Cortex and your semantic models, I can help you query
                and understand your data using natural language.
              </p>

              {/* Example queries */}
              <div className="w-full max-w-2xl">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Try asking:</p>
                <div className="grid grid-cols-2 gap-3">
                  {getContextExamples(contextTable).map((query, index) => {
                    const Icon = query.icon;
                    return (
                      <button
                        key={index}
                        onClick={() => handleSendMessage(query.text)}
                        className="flex items-center gap-3 p-4 text-left rounded-xl border border-slate-200 dark:border-slate-700 hover:border-fuchsia-300 dark:hover:border-fuchsia-600 hover:bg-fuchsia-50/50 dark:hover:bg-fuchsia-900/10 transition-all duration-200 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-fuchsia-200 dark:group-hover:bg-fuchsia-900/50 transition-colors">
                          <Icon className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {query.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Message List */
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Assistant avatar */}
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center" title="Cortex AI">
                      <PiBrain className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`max-w-[75%] rounded-2xl p-4 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {message.loading ? (
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400">Analyzing your question...</span>
                      </div>
                    ) : message.error ? (
                      <div className="text-red-500 dark:text-red-400">
                        <p>{message.content}</p>
                        <p className="text-xs mt-2 opacity-75">{message.error}</p>
                      </div>
                    ) : (
                      <>
                        <p className={`whitespace-pre-wrap ${message.role === 'user' ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                          {message.content}
                        </p>
                        {message.results && message.role === 'assistant' && renderResultData(message.results)}
                      </>
                    )}

                    {/* Timestamp (Bug 7) */}
                    <p className={`text-[10px] mt-2 ${message.role === 'user' ? 'text-white/50' : 'text-slate-400 dark:text-slate-500'}`}>
                      {formatTimestamp(message.timestamp)}
                    </p>
                  </div>

                  {/* User avatar with initials (Bug 7) */}
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 dark:from-slate-500 dark:to-slate-600 flex items-center justify-center" title="You">
                      <span className="text-[10px] font-bold text-white">{userInitials}</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="px-4 pt-3 pb-3 border-t border-slate-200 dark:border-slate-700">
          <div className="relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={selectedModel ? 'Ask a question about your data...' : 'Select a semantic model to start chatting...'}
              disabled={isQuerying || !selectedModel}
              className="w-full p-4 pr-14 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-400 dark:placeholder:text-slate-500"
              rows={2}
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isQuerying || !selectedModel}
              className="absolute right-2 bottom-2 w-10 h-10 p-0 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isQuerying ? (
                <HiOutlineArrowPath className="w-5 h-5 text-white animate-spin" />
              ) : (
                <HiOutlinePaperAirplane className="w-5 h-5 text-white" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Powered by Snowflake Cortex Analyst. Press Enter to send.
            </p>
            {messages.length > 0 && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {messages.filter((m) => m.role === 'user').length} messages in this conversation
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
