'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Plus, Users, Search, ArrowLeft, Paperclip, Sparkles, FolderOpen, Layers, Loader2 } from 'lucide-react';
import { Button, Badge } from 'rizzui';
import { useAuth } from '@/hooks/useAuth';
import { usePathname } from 'next/navigation';
import apiClient from '@/lib/api-client';
import AiBuildConversation, {
  OPEN_AI_BUILD_EVENT,
  isAiBuildConversationTitle,
} from './AiBuildConversation';

interface Conversation {
  conversation_id: string;
  title: string;
  conversation_type: 'dm' | 'group';
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  participants?: string[];
}

interface Message {
  message_id: string;
  conversation_id: string;
  sender: string;
  content: string;
  created_at: string;
  edited?: boolean;
  metadata?: { module?: string; project?: string; ai_response?: boolean; attachment?: string };
}

interface ChatContext {
  module: string;
  moduleName: string;
  projectId?: string;
  projectName?: string;
}

// Map pathname to module context
function getModuleContext(pathname: string): ChatContext {
  const map: Record<string, { module: string; moduleName: string }> = {
    '/account-overview': { module: 'account_overview', moduleName: 'Account Overview' },
    '/data-source-connection': { module: 'connect', moduleName: 'Connect Data' },
    '/explore-design': { module: 'explore_design', moduleName: 'Explore & Design' },
    '/workflow': { module: 'workflow', moduleName: 'Workflow' },
    '/governance': { module: 'governance', moduleName: 'Governance' },
    '/bi-dashboard': { module: 'bi_dashboard', moduleName: 'BI Dashboard' },
    '/intelligent': { module: 'intelligence', moduleName: 'AI Intelligence' },
    '/data-quality': { module: 'data_quality', moduleName: 'Data Quality' },
    '/observability': { module: 'observability', moduleName: 'Observability' },
    '/client-accounts': { module: 'client_accounts', moduleName: 'Client Accounts' },
  };
  for (const [path, ctx] of Object.entries(map)) {
    if (pathname.startsWith(path)) return ctx;
  }
  return { module: 'platform', moduleName: 'Data360' };
}

export default function ChatSidebar() {
  const { username, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUserForChat, setSelectedUserForChat] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isAskingAI, setIsAskingAI] = useState(false);
  // AI-build view (chat-first module/project creation). When set, the docked
  // panel renders AiBuildConversation instead of the regular list/thread.
  const [showAiBuild, setShowAiBuild] = useState(false);
  const [aiBuildConv, setAiBuildConv] = useState<{ conversation_id: string; title: string } | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Tracks whether a full loadMessages fetch is in progress; used by the poll
  // guard to avoid concurrent fetches (React state is stale in interval closures).
  const loadingRef = useRef(false);

  const context = getModuleContext(pathname);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      loadConversations();
      loadOnlineUsers();
    }
  }, [isOpen, isAuthenticated]);

  useEffect(() => {
    if (showNewChat && safeAllUsers.length === 0) {
      loadAllUsers();
    }
  }, [showNewChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Polling: new messages every 10 s while a conversation is open ─────
  useEffect(() => {
    if (!isOpen || !activeConversation?.conversation_id) return;
    const convId = activeConversation.conversation_id;

    const poll = async () => {
      if (loadingRef.current) return; // full load in flight — skip this tick
      try {
        const { data } = await apiClient.get(`/chat/conversations/${convId}/messages?limit=50`);
        const items = data?.data?.items || data?.items || data?.messages || (Array.isArray(data) ? data : []);
        const normalized: Message[] = items.map((m: Record<string, unknown>) => ({
          message_id: (m.MESSAGE_ID || m.message_id || '') as string,
          conversation_id: (m.CONVERSATION_ID || m.conversation_id || convId) as string,
          sender: (m.SENDER_USERNAME || m.sender || '') as string,
          content: (m.CONTENT || m.content || '') as string,
          created_at: (m.CREATED_AT || m.created_at || '') as string,
          edited: (m.IS_EDITED || m.edited || false) as boolean,
          metadata: m.metadata as Message['metadata'],
        }));
        setMessages(prev => {
          const lastPrevId = prev[prev.length - 1]?.message_id;
          const lastNewId = normalized[normalized.length - 1]?.message_id;
          // Same last message — return identical reference → no re-render, no scroll
          if (lastPrevId === lastNewId && prev.length === normalized.length) return prev;
          // Genuinely new messages → mark as read
          if (lastNewId && lastNewId !== lastPrevId) {
            apiClient.post(`/chat/conversations/${convId}/read`, {
              last_read_message_id: lastNewId,
            }).catch(() => {});
          }
          return normalized;
        });
      } catch { /* silent — poll failures are non-critical */ }
    };

    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeConversation?.conversation_id]);

  // ── Polling: online-users badge every 30 s while open ────────────────
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(loadOnlineUsers, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── External entry point: open the docked panel on the AI-build view ──
  // (e.g. the Project page's "Build with AI" launcher dispatches this event).
  useEffect(() => {
    const openAiBuild = () => {
      setIsOpen(true);
      setShowNewChat(false);
      setActiveConversation(null);
      setAiBuildConv(null);
      setShowAiBuild(true);
    };
    window.addEventListener(OPEN_AI_BUILD_EVENT, openAiBuild);
    return () => window.removeEventListener(OPEN_AI_BUILD_EVENT, openAiBuild);
  }, []);

  const loadConversations = async () => {
    try {
      const { data } = await apiClient.get('/chat/conversations?page_size=100');
      const items = data?.data?.items || data?.items || data?.conversations || (Array.isArray(data) ? data : []);
      
      // Now fetch participants for each DM conversation to get display names
      const convWithParticipants = await Promise.all(
        items.map(async (c: any) => {
          const convId = c.CONVERSATION_ID || c.conversation_id;
          const convType = (c.CONVERSATION_TYPE || c.conversation_type || 'DM').toUpperCase();
          
          try {
            const pRes = await apiClient.get(`/chat/conversations/${convId}/participants`);
            const participants = pRes?.data?.data?.participants || pRes?.data?.participants || [];
            
            // For DM, get the other participant's username
            let displayTitle = c.TITLE || c.title || 'Chat';
            if (convType === 'DM' && participants.length > 0) {
              const otherParticipant = participants.find((p: any) => {
                const pUsername = p.USERNAME || p.username || '';
                return pUsername.toUpperCase() !== username?.toUpperCase();
              });
              if (otherParticipant?.USERNAME) {
                displayTitle = otherParticipant.USERNAME;
              }
            }
            
            return {
              conversation_id: convId,
              title: displayTitle,
              conversation_type: c.CONVERSATION_TYPE || c.conversation_type,
              last_message_at: c.LAST_MESSAGE_AT || c.last_message_at,
              last_message: c.LAST_MESSAGE_PREVIEW || c.LAST_MESSAGE || c.last_message,
              unread_count: c.UNREAD_COUNT ?? c.unread_count,
              created_at: c.CREATED_AT || c.created_at,
              participants: participants,
            };
          } catch {
            return {
              conversation_id: convId,
              title: c.TITLE || c.title || 'Chat',
              conversation_type: c.CONVERSATION_TYPE || c.conversation_type,
              last_message_at: c.LAST_MESSAGE_AT || c.last_message_at,
              last_message: c.LAST_MESSAGE_PREVIEW || c.LAST_MESSAGE || c.last_message,
              unread_count: c.UNREAD_COUNT ?? c.unread_count,
              created_at: c.CREATED_AT || c.created_at,
            };
          }
        })
      );
      
      console.log('[Chat] Loaded conversations:', convWithParticipants);
      setConversations(convWithParticipants);
    } catch (err) { 
      console.error('[Chat] Failed to load conversations:', err);
      setConversations([]); 
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const { data } = await apiClient.get('/chat/online-users');
      const users = data?.data?.online_users || data?.online_users || [];
      setOnlineUsers(Array.isArray(users) ? (users as string[]) : []);
    } catch { setOnlineUsers([]); }
  };

  const loadAllUsers = async () => {
    setAllUsersLoading(true);
    try {
      const { data } = await apiClient.get('/gouvernance/users');
      const raw = data?.data || data;
      setAllUsers(Array.isArray(raw) ? raw : []);
    } catch { setAllUsers([]); }
    finally { setAllUsersLoading(false); }
  };

  const loadMessages = async (conversationId: string) => {
    if (!conversationId || conversationId === 'undefined') return;
    try {
      setLoading(true);
      loadingRef.current = true;
      const { data } = await apiClient.get(`/chat/conversations/${conversationId}/messages?limit=50`);
      // API returns {success, data: {items: [{MESSAGE_ID, CONTENT, SENDER_USERNAME, ...}]}}
      const items = data?.data?.items || data?.items || data?.messages || (Array.isArray(data) ? data : []);
      // Normalize Snowflake UPPER_CASE keys to our interface
      const normalized = items.map((m: Record<string, unknown>) => ({
        message_id: m.MESSAGE_ID || m.message_id || '',
        conversation_id: m.CONVERSATION_ID || m.conversation_id || conversationId,
        sender: m.SENDER_USERNAME || m.sender || '',
        content: m.CONTENT || m.content || '',
        created_at: m.CREATED_AT || m.created_at || '',
        edited: m.IS_EDITED || m.edited || false,
        metadata: m.metadata,
      }));
      setMessages(normalized);
      apiClient.post(`/chat/conversations/${conversationId}/read`, {
        last_read_message_id: normalized[normalized.length - 1]?.message_id || '',
      }).catch(() => {});
    } catch { setMessages([]); }
    finally { setLoading(false); loadingRef.current = false; }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversation?.conversation_id) return;
    try {
      await apiClient.post(`/chat/conversations/${activeConversation.conversation_id}/messages`, {
        content: newMessage.trim(),
        metadata: { module: context.module, project: context.projectName },
      });
      setNewMessage('');
      loadMessages(activeConversation.conversation_id);
    } catch (err) { console.error('Send failed:', err); }
  };

  // Ask Cortex AI — sends question to /cortex/complete and posts response in chat
  const askCortexAI = async () => {
    if (!newMessage.trim()) return;
    setIsAskingAI(true);
    const question = newMessage.trim();
    setNewMessage('');

    // Add user question to local messages immediately
    const userMsg: Message = {
      message_id: `local_${Date.now()}`,
      conversation_id: activeConversation?.conversation_id || 'ai',
      sender: username,
      content: `🤖 AI Question: ${question}`,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const prompt = `You are Data360 AI assistant. The user is on the ${context.moduleName} module.${context.projectName ? ` Working on project: ${context.projectName}.` : ''} Answer concisely:\n\n${question}`;
      const { data } = await apiClient.post('/cortex/complete', {
        model: 'mistral-large2',
        prompt,
        max_tokens: 500,
      });
      const aiResponse = data.response || data.completion || data.text || JSON.stringify(data).slice(0, 500);
      const aiMsg: Message = {
        message_id: `ai_${Date.now()}`,
        conversation_id: activeConversation?.conversation_id || 'ai',
        sender: 'Data360 AI',
        content: aiResponse,
        created_at: new Date().toISOString(),
        metadata: { ai_response: true },
      };
      setMessages(prev => [...prev, aiMsg]);

      // Also post to conversation if active
      if (activeConversation) {
        await apiClient.post(`/chat/conversations/${activeConversation.conversation_id}/messages`, {
          content: `🤖 AI: ${aiResponse}`,
          metadata: { ai_response: true, module: context.module },
        }).catch(() => {});
      }
    } catch (err) {
      const errMsg: Message = {
        message_id: `err_${Date.now()}`,
        conversation_id: 'ai',
        sender: 'Data360 AI',
        content: '❌ AI unavailable. Check Cortex connection.',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally { setIsAskingAI(false); }
  };

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;
    setAttachFile(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiClient.post(`/chat/conversations/${activeConversation.conversation_id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Send message about the attachment
      await apiClient.post(`/chat/conversations/${activeConversation.conversation_id}/messages`, {
        content: `📎 Shared file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
        metadata: { attachment: file.name, module: context.module },
      });
      loadMessages(activeConversation.conversation_id);
    } catch (err) { console.error('Upload failed:', err); }
    finally { setAttachFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // Attach current context as message
  const attachContext = async () => {
    if (!activeConversation) return;
    const contextMsg = `📍 Context: ${context.moduleName}${context.projectName ? ` > ${context.projectName}` : ''} (${pathname})`;
    await apiClient.post(`/chat/conversations/${activeConversation.conversation_id}/messages`, {
      content: contextMsg,
      metadata: { module: context.module, project: context.projectName, pathname },
    }).catch(() => {});
    loadMessages(activeConversation.conversation_id);
    setShowContextMenu(false);
  };

  const createDM = async () => {
    if (!selectedUserForChat.trim()) return;
    try {
      const { data } = await apiClient.post('/chat/conversations/dm', { target_username: selectedUserForChat.trim().toUpperCase() });
      const conv = data?.data || data;
      
      setShowNewChat(false); 
      setUserSearchQuery(''); 
      setSelectedUserForChat('');
      
      // Clear local conversations state and reload
      setConversations([]);
      setTimeout(() => loadConversations(), 50);
      
      // Open the new conversation if created successfully
      if (conv?.conversation_id || conv?.CONVERSATION_ID) {
        setTimeout(() => {
          const newConv = {
            conversation_id: conv?.conversation_id || conv?.CONVERSATION_ID,
            title: conv?.title || conv?.TITLE,
            conversation_type: conv?.conversation_type || conv?.CONVERSATION_TYPE,
          };
          openConversation(newConv);
        }, 100);
      }
    } catch (err) { console.error('Create DM failed:', err); }
  };

  // Safe array helpers
  const safeOnlineUsers = Array.isArray(onlineUsers) ? onlineUsers : [];
  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeConversations = Array.isArray(conversations) ? conversations : [];
  const filteredConversations = safeConversations.filter(c =>
    !searchQuery || c.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openConversation = useCallback((conv: Conversation) => {
    // Stored AI-build discussions reopen in the AI-build view so the proposal
    // card and the AI reply loop keep working across sessions.
    if (isAiBuildConversationTitle(conv.title)) {
      setAiBuildConv({ conversation_id: conv.conversation_id, title: conv.title });
      setShowAiBuild(true);
      return;
    }
    setActiveConversation(conv);
    loadMessages(conv.conversation_id);
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="*/*" />

      {/* Floating chat button */}
      <button
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 transition-all hover:scale-105 hover:shadow-xl active:scale-95"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!isOpen && safeConversations.some(c => (c.unread_count || 0) > 0) && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {safeConversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[560px] w-[400px] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          {showAiBuild ? (
            /* Chat-first AI build flow — same docked panel, no popup */
            <AiBuildConversation
              initialConversation={aiBuildConv}
              onBack={() => {
                setShowAiBuild(false);
                setAiBuildConv(null);
                loadConversations();
              }}
            />
          ) : (
          <>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            {activeConversation ? (
              <>
                <button aria-label="Back to conversations" onClick={() => setActiveConversation(null)} className="mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{activeConversation.title || 'Chat'}</h3>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{activeConversation.conversation_type === 'dm' ? 'Direct Message' : 'Group'}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Messages</h3>
                  <p className="text-[10px] text-gray-400">{context.moduleName}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="text-[9px] px-1.5 py-0.5" color="success">{safeOnlineUsers.length} online</Badge>
                  <button
                    aria-label="Build with AI"
                    title="Describe a module or project — AI turns it into a stored build discussion"
                    onClick={() => { setShowNewChat(false); setAiBuildConv(null); setShowAiBuild(true); }}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:from-violet-700 hover:to-indigo-700"
                  >
                    <Sparkles className="h-3 w-3" /> Build with AI
                  </button>
                  <button aria-label="New conversation" onClick={() => setShowNewChat(true)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Module context bar */}
          {activeConversation && (
            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-800/50">
              <Layers className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                {context.moduleName}{context.projectName ? ` › ${context.projectName}` : ''}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeConversation ? (
              <div className="flex flex-col gap-1.5 p-3">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
                  </div>
                ) : safeMessages.length === 0 ? (
                  <div className="py-8 text-center">
                    <Sparkles className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-400">No messages yet</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Type a message or ask AI with ✨</p>
                  </div>
                ) : (
                  safeMessages.map((msg) => {
                    const isMine = msg.sender?.toUpperCase() === username?.toUpperCase();
                    const isAI = msg.sender === 'Data360 AI' || msg.metadata?.ai_response;
                    return (
                      <div key={msg.message_id} className={`flex ${isMine && !isAI ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                          isAI
                            ? 'bg-purple-50 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100 border border-purple-200 dark:border-purple-800 rounded-bl-md'
                            : isMine
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-bl-md'
                        }`}>
                          {(!isMine || isAI) && <p className="mb-0.5 text-[10px] font-medium opacity-60">{isAI ? '✨ Data360 AI' : msg.sender}</p>}
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <p className={`mt-0.5 text-[10px] ${isMine && !isAI ? 'text-blue-200' : 'opacity-40'}`}>{formatTime(msg.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : showNewChat ? (
              <div className="flex flex-col h-full">
                {/* Modal Header */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3">New Conversation</h4>
                  
                  {/* Search Input with Icon */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search users by name or username..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      autoFocus
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                
                {/* User List - Scrollable */}
                <div className="flex-1 overflow-y-auto">
                  {allUsersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <>
                      {/* Filtered Users */}
                      {safeAllUsers
                        .filter((user: any) => {
                          const query = userSearchQuery.toLowerCase();
                          if (!query) return true;
                          const name = (user.name || user.login_name || '').toLowerCase();
                          const displayName = (user.display_name || '').toLowerCase();
                          return name.includes(query) || displayName.includes(query);
                        })
                        .slice(0, 15)
                        .map((user: any) => {
                          const isOnline = safeOnlineUsers.includes(user.name || user.login_name);
                          const isSelected = selectedUserForChat === (user.name || user.login_name);
                          return (
                            <button
                              key={user.name || user.login_name}
                              onClick={() => setSelectedUserForChat(user.name || user.login_name)}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 transition-colors ${
                                isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                              }`}
                            >
                              {/* Avatar */}
                              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isOnline ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                              }`}>
                                {(user.display_name || user.name || user.login_name || '?')[0].toUpperCase()}
                              </div>
                              
                              {/* User Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {user.display_name || user.name || user.login_name}
                                  </p>
                                  {isOnline && (
                                    <span className="flex h-2 w-2 rounded-full bg-green-500" />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  @{user.name || user.login_name} • {user.default_role || 'No role'}
                                </p>
                              </div>
                              
                              {/* Selection indicator */}
                              {isSelected && (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
                                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      
                      {/* No results */}
                      {safeAllUsers.filter((user: any) => {
                        const query = userSearchQuery.toLowerCase();
                        if (!query) return true;
                        const name = (user.name || user.login_name || '').toLowerCase();
                        const displayName = (user.display_name || '').toLowerCase();
                        return name.includes(query) || displayName.includes(query);
                      }).length === 0 && (
                        <div className="py-8 text-center">
                          <p className="text-sm text-gray-400">No users found</p>
                          <p className="text-xs text-gray-300 mt-1">Try a different search term</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedUserForChat ? (
                        <>Chat with <span className="font-medium text-gray-700 dark:text-gray-300">@{selectedUserForChat}</span></>
                      ) : (
                        'Select a user to start chatting'
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => { setShowNewChat(false); setUserSearchQuery(''); setSelectedUserForChat(''); }} 
                        className="rounded-lg"
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={createDM} 
                        disabled={!selectedUserForChat} 
                        className="rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Start Chat
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="p-3 pb-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      placeholder="Search conversations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                {filteredConversations.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">{safeConversations.length === 0 ? 'No conversations yet' : 'No results'}</div>
                ) : (
                  filteredConversations.map((conv) => (
                    <button key={conv.conversation_id} onClick={() => openConversation(conv)} className="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-bold text-white">
                        {conv.conversation_type === 'dm' ? (conv.title?.[0] || '?') : <Users className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{conv.title || 'Chat'}</span>
                          <span className="text-[10px] text-gray-400 ml-2">{formatTime(conv.last_message_at || '')}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{conv.last_message || 'Start chatting...'}</p>
                      </div>
                      {(conv.unread_count || 0) > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{conv.unread_count}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Message input with context actions */}
          {activeConversation && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              {/* Context action bar */}
              {showContextMenu && (
                <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
                  <button onClick={attachContext} className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50">
                    <Layers className="h-3 w-3" /> Share Context
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                    <Paperclip className="h-3 w-3" /> Upload File
                  </button>
                  <button onClick={() => { setShowContextMenu(false); askCortexAI(); }} className="flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1 text-xs text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50">
                    <Sparkles className="h-3 w-3" /> Ask AI
                  </button>
                </div>
              )}
              {/* Input row */}
              <div className="flex items-center gap-1.5 px-3 py-2.5">
                <button aria-label="Attach context or file" onClick={() => setShowContextMenu(!showContextMenu)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
                  <Plus className="h-4 w-4" />
                </button>
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={isAskingAI ? 'AI is thinking...' : 'Type a message...'}
                  disabled={isAskingAI}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 disabled:opacity-50"
                />
                <button aria-label="Ask AI" onClick={askCortexAI} disabled={!newMessage.trim() || isAskingAI} className="flex h-8 w-8 items-center justify-center rounded-lg text-purple-500 hover:bg-purple-50 disabled:opacity-30 dark:hover:bg-purple-900/30" title="Ask AI">
                  <Sparkles className="h-4 w-4" />
                </button>
                <button aria-label="Send message" onClick={sendMessage} disabled={!newMessage.trim() || isAskingAI} className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </>
  );
}
