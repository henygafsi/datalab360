'use client';

/**
 * Agentic Data OS — assessment card. Hero narrative + honest coverage +
 * per-source availability (never zero-faked) + finding rows with fact/inferred
 * separation and severity. Each finding offers "Generate solution", which
 * hands the finding to the OS's existing propose/creator flow via prefill.
 */
import { Button } from 'rizzui';
import { PiShieldWarning, PiCheckCircle, PiWarningCircle, PiSparkle } from 'react-icons/pi';
import type { AssessAvailability, AssessmentReport, AssessFinding } from './types';

const AVAIL_TONE: Record<AssessAvailability, string> = {
  Available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Delayed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Not authorized': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'Not supported': 'bg-gray-100 text-gray-500 dark:bg-gray-800',
  'Not configured': 'bg-gray-100 text-gray-500 dark:bg-gray-800',
};

const SEV_TONE: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-gray-500',
};

export default function AssessmentCard({
  report,
  onGenerateSolution,
}: {
  report: AssessmentReport;
  onGenerateSolution: (f: AssessFinding) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Hero: narrative + coverage ring */}
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            {report.narrative}
          </p>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-2xl font-bold text-primary">
            {report.coveragePct == null ? '—' : `${report.coveragePct}%`}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">coverage</div>
          {report.score != null && (
            <div className="mt-1 text-xs text-gray-500">gov score {Math.round(report.score)}</div>
          )}
        </div>
      </div>

      {/* Availability — honest, never zero */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Source availability
        </p>
        <div className="flex flex-wrap gap-1.5">
          {report.availability.map((a) => (
            <span
              key={a.source}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${AVAIL_TONE[a.state]}`}
              title={a.reason ? `${a.state} — ${a.reason}` : a.state}
            >
              {a.source}: {a.state}
            </span>
          ))}
        </div>
      </div>

      {/* Findings */}
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          <PiShieldWarning className="h-3.5 w-3.5" aria-hidden />
          Findings ({report.findings.length})
        </p>
        {report.findings.length === 0 ? (
          <p className="text-xs text-gray-400">
            No findings in the analyzed scope (coverage {report.coveragePct ?? '—'}%).
          </p>
        ) : (
          <ul className="space-y-1.5">
            {report.findings.slice(0, 12).map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-gray-200 p-2 dark:border-gray-700"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0" aria-hidden>
                    {f.factType === 'observed' ? (
                      <PiWarningCircle className={`h-3.5 w-3.5 ${SEV_TONE[f.severity?.toLowerCase()] ?? 'text-gray-400'}`} />
                    ) : (
                      <PiSparkle className="h-3.5 w-3.5 text-violet-500" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      {f.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`font-semibold uppercase ${SEV_TONE[f.severity?.toLowerCase()] ?? 'text-gray-400'}`}>
                        {f.severity}
                      </span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">{f.kind}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 ${
                          f.factType === 'observed'
                            ? 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                            : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                        }`}
                      >
                        {f.factType === 'observed' ? '● observed fact' : '◆ inferred'}
                      </span>
                      {f.object && (
                        <span className="truncate text-gray-400" title={f.object}>
                          {f.object.split('.').slice(-1)[0]}
                        </span>
                      )}
                    </div>
                    {f.recommendation && (
                      <p className="mt-1 text-[11px] text-gray-500">{f.recommendation}</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onGenerateSolution(f)}>
                    Generate solution
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-center gap-1 text-[10px] text-gray-400">
        <PiCheckCircle className="h-3 w-3" aria-hidden />
        Every finding proves its evidence; solutions preview, validate and dry-run before any
        deploy — governed by your role.
      </p>
    </div>
  );
}
