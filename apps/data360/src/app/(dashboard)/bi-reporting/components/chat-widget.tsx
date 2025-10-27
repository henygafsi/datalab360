'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from 'rizzui';
import { 
  HiOutlineChatBubbleLeftRight, 
  HiOutlineXMark, 
  HiOutlinePaperAirplane,
  HiOutlineCodeBracket,
  HiOutlineTableCells,
  HiOutlineClipboard,
  HiOutlineCheck,
  HiOutlineExclamationTriangle,
  HiOutlineLightBulb,
  HiOutlineSparkles,
  HiOutlineArrowPath,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlinePlus
} from 'react-icons/hi2';
import { queryCortex, CortexQueryResponse } from '@/app/services/cortex';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: any;
  sql?: string;
  status?: 'sending' | 'sent' | 'error';
  isTyping?: boolean;
}

interface ChatWidgetProps {
  className?: string;
}

export default function ChatWidget({ className = '' }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sampleQuestions = [
    "What is the average age of clients?",
    "Show me sales by region",
    "Which products are most popular?",
    "What's the revenue trend this year?",
    "How many new customers this month?"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'end',
      inline: 'nearest'
    });
  };


  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (messageText?: string) => {
    const message = messageText || inputValue.trim();
    if (!message || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: message,
      timestamp: new Date(),
      status: 'sending',
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setIsTyping(true);
    setShowSuggestions(false);

    try {
      // Update user message status to sent
      setMessages(prev => prev.map(msg => 
        msg.id === userMessage.id ? { ...msg, status: 'sent' } : msg
      ));

      const response = await queryCortex({
        prompt: userMessage.content,
      });
      
      // Process the response and create messages for each result
      const assistantMessages: ChatMessage[] = response.results.map((result, index: number) => ({
        id: `${Date.now()}-${index}`,
        type: 'assistant' as const,
        content: result.type === 'text' ? result.text || '' : '',
        timestamp: new Date(),
        data: result.type === 'sql' ? result.data : undefined,
        sql: result.type === 'sql' ? result.query : undefined,
        status: 'sent',
      }));

      setMessages(prev => [...prev, ...assistantMessages]);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsConnected(false);
      
      // Update user message status to error
      setMessages(prev => prev.map(msg => 
        msg.id === userMessage.id ? { ...msg, status: 'error' } : msg
      ));

      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please check your connection and try again.',
        timestamp: new Date(),
        status: 'error',
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        setIsConnected(true);
      }, 3000);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set(prev).add(itemId));
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const retryMessage = (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId);
    if (message && message.type === 'user') {
      // Remove the failed message and retry
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setInputValue(message.content);
      
      // Auto-send the retry
      setTimeout(() => {
        sendMessage();
      }, 100);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setShowSuggestions(true);
  };

  return (
    <>
      {/* Floating Chat Button - Only show when chat is closed */}
      {!isOpen && (
        <div 
          className={`fixed bottom-6 right-6 z-[9999] ${className}`}
          style={{ pointerEvents: 'none' }}
        >
        <div className="relative" style={{ pointerEvents: 'auto' }}>
          {/* Notification Badge */}
          {messages.length > 0 && (
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {messages.length}
            </div>
          )}
          
          <Button
            onClick={() => setIsOpen(!isOpen)}
            className="w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-colors duration-200 flex items-center justify-center"
            style={{ 
              pointerEvents: 'auto',
              zIndex: 1000
            }}
          >
            <HiOutlineChatBubbleLeftRight className="w-5 h-5" />
          </Button>
          
        </div>
        </div>
      )}

      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[9998] flex items-end justify-end p-4 sm:p-6">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Chat Container */}
          <div className="relative w-full max-w-sm h-[450px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/60 dark:border-slate-700/60 flex flex-col">
            {/* Action Buttons - Top Right Corner */}
            <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
              {/* New Chat Button */}
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl"
                  title="Start new chat"
                >
                  <HiOutlinePlus className="w-4 h-4" />
                </button>
              )}
              
              {/* Close Button */}
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl"
                title="Close chat"
              >
                <HiOutlineXMark className="w-5 h-5" />
              </button>
            </div>
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <HiOutlineSparkles className="w-4 h-4 text-white" />
                  </div>
                  {isTyping && (
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">Data Assistant</h3>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isTyping ? 'Analyzing your data...' : 'Ask questions about your data'}
                    </p>
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} ${!isConnected ? 'animate-pulse' : ''}`} title={isConnected ? 'Connected' : 'Disconnected'}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <HiOutlineSparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Data Assistant</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Ask questions about your data and get insights.
                  </p>
                </div>
              )}
              
              {messages.length === 0 && showSuggestions && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Try asking something like:</h4>
                  {sampleQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => sendMessage(question)}
                      className="w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-200 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                    >
                      <div className="flex items-center space-x-2">
                        <HiOutlineSparkles className="w-4 h-4 text-blue-500" />
                        <span>{question}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 relative group ${
                      message.type === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    }`}
                  >
                    {message.content && (
                      <div className="flex items-start justify-between">
                        <p className="text-sm whitespace-pre-wrap flex-1">{message.content}</p>
                        <button
                          onClick={() => copyToClipboard(message.content, `content-${message.id}`)}
                          className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded hover:bg-white/20"
                          title="Copy message"
                        >
                          {copiedItems.has(`content-${message.id}`) ? (
                            <HiOutlineCheck className="w-3 h-3" />
                          ) : (
                            <HiOutlineClipboard className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                    
                    {message.sql && (
                      <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <HiOutlineCodeBracket className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">SQL Query</span>
                          </div>
                          <Button
                            onClick={() => copyToClipboard(message.sql!, `sql-${message.id}`)}
                            className="text-xs px-2 py-1 h-auto bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 flex items-center space-x-1"
                          >
                            {copiedItems.has(`sql-${message.id}`) ? (
                              <>
                                <HiOutlineCheck className="w-3 h-3" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <HiOutlineClipboard className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </Button>
                        </div>
                        <pre className="text-xs text-slate-700 dark:text-slate-300 overflow-x-auto bg-slate-100 dark:bg-slate-800 p-2 rounded border">
                          <code>{message.sql}</code>
                        </pre>
                      </div>
                    )}
                    
                    {message.data && Array.isArray(message.data) && message.data.length > 0 && (
                      <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <HiOutlineTableCells className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Results</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              ({message.data.length} row{message.data.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <Button
                            onClick={() => copyToClipboard(JSON.stringify(message.data, null, 2), `data-${message.id}`)}
                            className="text-xs px-2 py-1 h-auto bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-300 flex items-center space-x-1"
                          >
                            {copiedItems.has(`data-${message.id}`) ? (
                              <>
                                <HiOutlineCheck className="w-3 h-3" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <HiOutlineClipboard className="w-3 h-3" />
                                <span>Copy JSON</span>
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-600">
                                {Object.keys(message.data[0] as Record<string, any>).map((key) => (
                                  <th key={key} className="text-left py-2 px-2 font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                                    {key}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {message.data.slice(0, 5).map((row: any, index: number) => (
                                <tr key={index} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/50">
                                  {Object.values(row).map((value: any, cellIndex: number) => (
                                    <td key={cellIndex} className="py-2 px-2 text-slate-700 dark:text-slate-300">
                                      {value}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {message.data.length > 5 && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                              Showing 5 of {message.data.length} results
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs opacity-70">
                        {formatTimestamp(message.timestamp)}
                      </p>
                      <div className="flex items-center space-x-2">
                        {message.status === 'sending' && (
                          <div className="flex items-center space-x-1 text-xs text-blue-500">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span>Sending...</span>
                          </div>
                        )}
                        {message.status === 'error' && message.type === 'user' && (
                          <button
                            onClick={() => retryMessage(message.id)}
                            className="flex items-center space-x-1 text-xs text-red-500 hover:text-red-600 transition-colors"
                            title="Retry message"
                          >
                            <HiOutlineArrowPath className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                        {message.status === 'error' && message.type === 'assistant' && (
                          <div className="flex items-center space-x-1 text-xs text-red-500">
                            <HiOutlineExclamationTriangle className="w-3 h-3" />
                            <span>Error</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl px-4 py-3 border border-blue-200/50 dark:border-blue-800/50">
                    <div className="flex items-center space-x-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                      <div className="flex items-center space-x-2">
                        <HiOutlineSparkles className="w-4 h-4 text-blue-500 animate-pulse" />
                        <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">Analyzing your data...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setInputValue(e.target.value);
                    }
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about your data... (Press Enter to send, Esc to close)"
                  className="w-full px-4 py-3 pr-16 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  disabled={isLoading}
                  maxLength={500}
                />
                
                {/* Send Button - Positioned in top-right of input */}
                <Button
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute top-1 right-1 w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <HiOutlinePaperAirplane className="w-4 h-4" />
                  )}
                </Button>
                
                {/* Typing indicator */}
                {inputValue.trim() && (
                  <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
              
              {/* Character Counter */}
              {inputValue.length > 0 && (
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${inputValue.length > 450 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    {inputValue.length}/500
                  </span>
                </div>
              )}
              
              {/* Quick Actions */}
              {messages.length > 0 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <HiOutlineLightBulb className="w-3 h-3" />
                    <span>Tip: Try asking about trends, comparisons, or specific metrics</span>
                  </div>
                  <button
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    className="flex items-center space-x-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    {showSuggestions ? (
                      <>
                        <HiOutlineEyeSlash className="w-3 h-3" />
                        <span>Hide suggestions</span>
                      </>
                    ) : (
                      <>
                        <HiOutlineEye className="w-3 h-3" />
                        <span>Show suggestions</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


