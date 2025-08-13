'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from '@/layouts/carbon/carbon-header';
import { CarbonSidebar } from './carbon-sidebar';

// Loading state component
function LoadingOverlay({ isLoading }: { isLoading: boolean }) {
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-purple-600 rounded-full animate-spin-reverse" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 animate-pulse">Loading...</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Scroll progress indicator
function ScrollProgress() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.div
      className="fixed top-0 left-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 z-50 shadow-lg shadow-blue-500/20"
      style={{ width: `${scrollProgress}%` }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.3 }}
    />
  );
}

export default function CarbonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);

  // Page visibility API for better performance
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30 dark:from-slate-950 dark:via-gray-950 dark:to-blue-950/30 relative overflow-hidden">
      {/* Scroll progress indicator */}
      <ScrollProgress />
      
      {/* Loading overlay */}
      <LoadingOverlay isLoading={isLoading} />
      {/* Enhanced animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Dynamic gradient orbs */}
        <motion.div 
          className="absolute -top-40 -left-40 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"
          animate={isPageVisible ? {
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
            x: [0, 20, 0],
            y: [0, -10, 0]
          } : {}}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-indigo-400/20 to-pink-400/20 rounded-full blur-3xl"
          animate={isPageVisible ? {
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2],
            x: [0, -15, 0],
            y: [0, 15, 0]
          } : {}}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
        
        {/* Interactive grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05] transition-opacity duration-1000"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}
        />
        
        {/* Enhanced floating geometric shapes */}
        <motion.div 
          className="absolute top-20 right-20 w-6 h-6 border border-blue-300/30 rotate-45"
          animate={isPageVisible ? {
            rotate: [45, 225, 45],
            y: [0, -20, 0],
            opacity: [0.3, 0.6, 0.3]
          } : {}}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute bottom-32 left-32 w-4 h-4 bg-purple-300/20 rounded-full"
          animate={isPageVisible ? {
            scale: [1, 1.5, 1],
            y: [0, -15, 0],
            x: [0, 10, 0],
            opacity: [0.2, 0.5, 0.2]
          } : {}}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        />
        <motion.div 
          className="absolute top-1/2 right-1/4 w-3 h-3 border border-indigo-300/30"
          animate={isPageVisible ? {
            rotate: [0, 360, 0],
            x: [0, -10, 0],
            opacity: [0.3, 0.7, 0.3]
          } : {}}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "linear",
            delay: 3
          }}
        />
        
        {/* Additional floating elements */}
        <motion.div 
          className="absolute top-1/4 left-1/3 w-2 h-8 bg-gradient-to-t from-cyan-300/20 to-transparent rounded-full"
          animate={isPageVisible ? {
            scaleY: [1, 1.5, 1],
            opacity: [0.2, 0.4, 0.2]
          } : {}}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2.5
          }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/3 w-5 h-2 bg-gradient-to-r from-emerald-300/20 to-transparent rounded-full"
          animate={isPageVisible ? {
            scaleX: [1, 2, 1],
            opacity: [0.2, 0.5, 0.2]
          } : {}}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4
          }}
        />
      </div>

      {/* Sidebar */}
      <CarbonSidebar className="fixed hidden flex-col justify-between xl:block z-50" />
      
      {/* Main content area */}
      <div className="flex w-full flex-col xl:ms-[280px] xl:w-[calc(100%-280px)] 2xl:ms-80 2xl:w-[calc(100%-320px)] relative z-10">
        <Header />
        
        {/* Enhanced Page content with better UX */}
        <main className="flex flex-grow flex-col px-6 pb-12 pt-6 md:px-8 lg:px-10 lg:pb-16 xl:px-12 2xl:px-16 3xl:px-20 4xl:px-24">
          <div className="w-full max-w-none">
            {/* Content wrapper with improved accessibility and performance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="focus-within:outline-none"
            >
              {/* Skip to content link for accessibility */}
              <a 
                href="#main-content" 
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:bg-blue-700"
              >
                Skip to main content
              </a>
              
              {/* Main content area */}
              <div id="main-content" className="min-h-[60vh] relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key="page-content"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </main>
        
        {/* Enhanced Footer with better UX */}
        <footer className="border-t border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm px-6 py-6 md:px-8 lg:px-10 xl:px-12 2xl:px-16 relative">
          {/* Footer gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
          
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                © 2024 DataLab360. All rights reserved.
              </div>
              {/* Status indicator */}
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-green-100/80 dark:bg-green-900/30">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">All Systems Operational</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              {[
                { label: 'Privacy', href: '/privacy' },
                { label: 'Terms', href: '/terms' },
                { label: 'Support', href: '/support' }
              ].map((link, index) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.3 }}
                >
                  {link.label}
                </motion.a>
              ))}
              
              {/* Back to top button */}
              <motion.button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="ml-4 p-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 group"
                whileHover={{ scale: 1.1, y: -2 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Back to top"
              >
                <svg className="w-4 h-4 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </motion.button>
            </div>
          </div>
        </footer>
      </div>

      {/* Enhanced CSS with better performance and accessibility */}
      <style jsx>{`
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        
        .animate-spin-reverse {
          animation: spin-reverse 1s linear infinite;
        }
        
        /* Reduced motion support for accessibility */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
        
        /* Focus styles for accessibility */
        .focus-visible:focus {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }
        
        /* Smooth scrolling */
        html {
          scroll-behavior: smooth;
        }
        
        /* High contrast mode support */
        @media (prefers-contrast: high) {
          .bg-gradient-to-br {
            background: white;
          }
          
          .dark .bg-gradient-to-br {
            background: black;
          }
        }
        
        /* Enhanced loading states */
        .loading-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          animation: shimmer 1.5s infinite;
        }
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}