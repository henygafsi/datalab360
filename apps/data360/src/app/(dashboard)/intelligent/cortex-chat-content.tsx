'use client';

import { useState, useRef, useEffect } from 'react';
import { Button, Input, Badge, Loader } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiOutlineClipboard,
  HiOutlineTableCells,
  HiOutlineChartBar,
  HiOutlineLightBulb,
  HiOutlineUser,
  HiOutlineArrowPath,
  HiOutlineTrash,
} from 'react-icons/hi2';
import {
  PiBrain,
  PiDatabase,
  PiCode,
  PiMagicWand,
} from 'react-icons/pi';
import { queryCortex, type CortexQueryResponse, type CortexQueryResult } from '@/app/services/cortex';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  results?: CortexQueryResult[];
  loading?: boolean;
  error?: string;
}

const EXAMPLE_QUERIES = [
  { text: "What were the total sales last month?", icon: HiOutlineChartBar },
  { text: "Show me the top 10 customers by revenue", icon: HiOutlineTableCells },
  { text: "Compare this quarter vs last quarter", icon: HiOutlineLightBulb },
  { text: "How many new users signed up today?", icon: PiDatabase },
];

export default function CortexChatContent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleSendMessage = async (prompt?: string) => {
    const messageText = prompt || inputValue.trim();
    if (!messageText || isQuerying) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    // Add assistant placeholder with loading state
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInputValue('');
    setIsQuerying(true);

    try {
      const response = await queryCortex({ prompt: messageText });

      // Update assistant message with results
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                loading: false,
                results: response.results,
                content: formatResults(response.results),
              }
            : msg
        )
      );
    } catch (error: any) {
      console.error('Cortex query error:', error);
      setMessages(prev =>
        prev.map(msg =>
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

  const formatResults = (results: CortexQueryResult[]): string => {
    if (!results || results.length === 0) return 'No results found.';

    const textResults = results.filter(r => r.type === 'text');
    if (textResults.length > 0) {
      return textResults.map(r => r.text).join('\n');
    }

    return 'Results generated successfully.';
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    toast.success('Chat cleared');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const renderResultData = (results: CortexQueryResult[]) => {
    return results.map((result, index) => {
      if (result.type === 'sql' && result.query) {
        return (
          <div key={index} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <PiCode className="w-4 h-4" />
                Generated SQL
              </span>
              <button
                onClick={() => copyToClipboard(result.query!)}
                className="text-xs text-fuchsia-600 hover:text-fuchsia-700 flex items-center gap-1"
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
                <span className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-2">
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
          <p key={index} className="text-slate-700 dark:text-slate-300">
            {result.text}
          </p>
        );
      }

      return null;
    });
  };

  return (
    <div className="flex flex-col h-[700px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
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
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ask questions about your data in natural language
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearChat}
            className="text-slate-500 hover:text-red-500"
          >
            <HiOutlineTrash className="w-4 h-4 mr-1" />
            Clear Chat
          </Button>
        )}
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
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
              <p className="text-xs font-medium text-slate-500 mb-3">Try asking:</p>
              <div className="grid grid-cols-2 gap-3">
                {EXAMPLE_QUERIES.map((query, index) => {
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
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center">
                    <PiBrain className="w-4 h-4 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-2xl p-4 ${
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
                      <span className="text-sm text-slate-500">Analyzing your question...</span>
                    </div>
                  ) : message.error ? (
                    <div className="text-red-500 dark:text-red-400">
                      <p>{message.content}</p>
                      <p className="text-xs mt-2 opacity-75">{message.error}</p>
                    </div>
                  ) : (
                    <>
                      <p className={message.role === 'user' ? 'text-white' : 'text-slate-700 dark:text-slate-300'}>
                        {message.content}
                      </p>
                      {message.results && message.role === 'assistant' && renderResultData(message.results)}
                    </>
                  )}

                  {/* Timestamp */}
                  <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-white/60' : 'text-slate-400'}`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <HiOutlineUser className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your data..."
            disabled={isQuerying}
            className="w-full p-4 pr-14 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 resize-none focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            rows={2}
          />
          <Button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isQuerying}
            className="absolute right-2 bottom-2 w-10 h-10 p-0 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isQuerying ? (
              <HiOutlineArrowPath className="w-5 h-5 text-white animate-spin" />
            ) : (
              <HiOutlinePaperAirplane className="w-5 h-5 text-white" />
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2 text-center">
          Powered by Snowflake Cortex Analyst. Press Enter to send.
        </p>
      </div>
    </div>
  );
}
