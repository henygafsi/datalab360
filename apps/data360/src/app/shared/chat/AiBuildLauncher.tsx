'use client';

// AiBuildLauncher — slim entry-point banner for the chat-first AI build flow.
// Dispatches OPEN_AI_BUILD_EVENT, which the globally-mounted ChatSidebar
// listens for: it opens the EXISTING docked chat panel directly on the
// AI-build view (no new popup, no modal). Rendered on the Project page so
// "create a project" starts as a described conversation, not a form.

import { ArrowRight, Sparkles } from 'lucide-react';
import { OPEN_AI_BUILD_EVENT } from './AiBuildConversation';

export default function AiBuildLauncher() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AI_BUILD_EVENT))}
      className="group mb-4 flex w-full items-center gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 px-4 py-3 text-left transition-colors hover:border-violet-300 hover:from-violet-100/70 dark:border-violet-900/50 dark:from-violet-950/40 dark:via-indigo-950/30 dark:to-blue-950/20 dark:hover:border-violet-800"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">Build with AI</span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
          Describe a module or project in chat — AI drafts the build proposal, your team refines and
          validates it in a stored discussion.
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-violet-400 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
