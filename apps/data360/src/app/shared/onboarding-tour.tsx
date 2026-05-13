'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Database, GitBranch, Shield, BarChart3, Brain, Activity, CheckCircle, HeartPulse, Eye } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  // CSS selector to highlight — the tooltip will point to this element
  targetSelector: string;
  // Position of tooltip relative to target
  position: 'right' | 'bottom' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Data360 Pro',
    description: 'Your all-in-one AI & Data ERP platform. Let us show you the key modules.',
    icon: Sparkles,
    color: 'blue',
    targetSelector: '[data-tour="logo"],.flex.items-center.gap-2 img[alt]',
    position: 'center',
  },
  {
    title: 'Command Center',
    description: 'Your platform dashboard — KPIs, module health, credits, security audit, and cost tracking across all tabs.',
    icon: Activity,
    color: 'indigo',
    targetSelector: 'a[href="/account-overview"],button:has-text("Account Overview"),[class*="Account"]',
    position: 'right',
  },
  {
    title: 'Connect Your Data Sources',
    description: 'Connect to Snowflake stages, cloud storage (S3, Azure, GCS), databases, and SaaS tools. Browse and preview files.',
    icon: Database,
    color: 'emerald',
    targetSelector: 'a[href*="data-source"],button:has-text("Connect Data"),[class*="Connect"]',
    position: 'right',
  },
  {
    title: 'Explore & Design Your DWH',
    description: 'Browse catalog, profile tables, AI-classify columns, design schemas, and deploy to Snowflake with one click.',
    icon: GitBranch,
    color: 'violet',
    targetSelector: 'a[href*="explore-design"],button:has-text("Explore"),[class*="Explore"]',
    position: 'right',
  },
  {
    title: 'Build ETL Workflows',
    description: 'Drag 71+ blocks to build pipelines: sources, joins, filters, AI functions. Compile to CTE SQL, validate, execute.',
    icon: Activity,
    color: 'amber',
    targetSelector: 'a[href*="workflow"],button:has-text("Workflow"),[class*="Workflow"]',
    position: 'right',
  },
  {
    title: 'Govern & Secure Data',
    description: '10 policy types: masking, RLS, tags, network, session. Manage roles, users, and compliance (GDPR, HIPAA, SOC2).',
    icon: Shield,
    color: 'rose',
    targetSelector: 'a[href*="governance"],button:has-text("Governance"),[class*="Governance"]',
    position: 'right',
  },
  {
    title: 'BI Dashboards & AI Intelligence',
    description: 'Create dashboards with 9+ chart types. Chat with your data using Cortex AI. Train ML models, analyze sentiment.',
    icon: Brain,
    color: 'purple',
    targetSelector: 'a[href*="intelligent"],button:has-text("AI Intelligence"),[class*="Intelligence"]',
    position: 'right',
  },
  {
    title: "You're All Set!",
    description: 'Data is cached in background for instant access. Start by exploring the Command Center dashboard above.',
    icon: CheckCircle,
    color: 'green',
    targetSelector: '',
    position: 'center',
  },
];

export default function OnboardingTour() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('data360_tour_completed');
    if (!hasSeenTour) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Find and highlight the target element for current step
  useEffect(() => {
    if (!isVisible) return;
    const step = TOUR_STEPS[currentStep];
    if (!step.targetSelector || step.position === 'center') {
      setTargetRect(null);
      return;
    }

    // Try each selector (comma-separated)
    const selectors = step.targetSelector.split(',');
    let target: Element | null = null;
    for (const sel of selectors) {
      try {
        // Try finding in sidebar navigation
        const sidebarItems = document.querySelectorAll('nav li, aside li, [role="listitem"]');
        for (const item of sidebarItems) {
          if (item.textContent?.includes(step.title.replace('Connect Your Data Sources', 'Connect Data')
            .replace('Explore & Design Your DWH', 'Explore & Design')
            .replace('Build ETL Workflows', 'Workflow')
            .replace('Govern & Secure Data', 'Governance')
            .replace('BI Dashboards & AI Intelligence', 'AI Intelligence')
            .replace('Command Center', 'Account Overview'))) {
            target = item;
            break;
          }
        }
        if (target) break;
        target = document.querySelector(sel.trim());
        if (target) break;
      } catch { /* invalid selector, try next */ }
    }

    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetRect(rect);
      // Scroll into view if needed
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
    }
  }, [currentStep, isVisible]);

  const completeTour = useCallback(() => {
    localStorage.setItem('data360_tour_completed', 'true');
    setIsVisible(false);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeTour();
    }
  }, [currentStep, completeTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }, [currentStep]);

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;
  const isCentered = step.position === 'center' || !targetRect;

  // Calculate tooltip position
  let tooltipStyle: React.CSSProperties = {};
  if (!isCentered && targetRect) {
    if (step.position === 'right') {
      tooltipStyle = {
        position: 'fixed',
        top: Math.max(20, Math.min(targetRect.top - 20, window.innerHeight - 300)),
        left: targetRect.right + 16,
        zIndex: 10001,
      };
    } else if (step.position === 'bottom') {
      tooltipStyle = {
        position: 'fixed',
        top: targetRect.bottom + 12,
        left: Math.max(20, targetRect.left - 100),
        zIndex: 10001,
      };
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={completeTour}
      />

      {/* Highlight box around target element */}
      {targetRect && !isCentered && (
        <div
          className="fixed z-[10000] rounded-lg ring-4 ring-blue-500 ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-500 ease-out"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`${isCentered ? 'fixed inset-0 flex items-center justify-center z-[10001]' : ''}`}
        style={!isCentered ? tooltipStyle : undefined}
      >
        <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden ${isCentered ? 'max-w-lg w-full mx-4' : 'w-[360px]'}`}>
          {/* Progress bar */}
          <div className="h-1 bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Arrow pointer (for positioned tooltips) */}
          {!isCentered && step.position === 'right' && (
            <div className="absolute -left-2 top-8 w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-r-[8px] border-r-white dark:border-r-gray-900" />
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4">
            <div className={`w-9 h-9 rounded-xl bg-${step.color}-100 dark:bg-${step.color}-900/30 flex items-center justify-center`}>
              <Icon className={`w-4.5 h-4.5 text-${step.color}-600 dark:text-${step.color}-400`} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-medium">{currentStep + 1}/{TOUR_STEPS.length}</span>
              <button onClick={completeTour} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition" title="Skip tour">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-3">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">{step.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{step.description}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 pb-4">
            {isFirst ? (
              <button onClick={completeTour} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                Skip tour
              </button>
            ) : (
              <button onClick={prevStep} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            <button onClick={nextStep} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1">
              {isLast ? 'Get Started' : 'Next'} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
