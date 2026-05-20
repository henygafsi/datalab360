'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface AiGuidedModelButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The "magic" purple CTA that launches the AI-guided modeling wizard.
 * Visual cloned from the ETL builder's AI button (purple→fuchsia gradient,
 * Sparkles, shimmer sweep on hover).
 */
const AiGuidedModelButton: React.FC<AiGuidedModelButtonProps> = ({ onClick, disabled }) => {
  return (
    <motion.button
      whileHover={!disabled ? { y: -1 } : undefined}
      whileTap={!disabled ? { scale: 0.96 } : undefined}
      onClick={onClick}
      disabled={disabled}
      title="Build a data model with AI — guided end-to-end"
      className="group relative flex h-8 items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 text-xs font-semibold text-white shadow-sm shadow-purple-500/40 transition-shadow hover:shadow-md hover:shadow-purple-500/60 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <Sparkles className="h-3.5 w-3.5" />
      AI Model
    </motion.button>
  );
};

export default AiGuidedModelButton;
