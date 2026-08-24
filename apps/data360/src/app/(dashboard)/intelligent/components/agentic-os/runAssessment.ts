/**
 * Agentic Data OS — account assessment scan (real endpoints, honest coverage).
 *
 * Composes the EXISTING governance-intelligence aggregator (findings + evidence
 * + score + degraded sources) with the explorer/command-center summaries into
 * one AssessmentReport. Nothing is fabricated: unavailable sources map to real
 * availability states, coverage is derived from what actually answered.
 */
import { getGovernanceIntelligence, getSummary } from '@/app/services/command-center';
import type {
  AssessAvailability,
  AssessFinding,
  AssessmentReport,
} from './types';

const SOURCE_STATE: Record<string, AssessAvailability> = {
  ok: 'Available',
  available: 'Available',
  partial: 'Partial',
  delayed: 'Delayed',
  denied: 'Not authorized',
  forbidden: 'Not authorized',
  unsupported: 'Not supported',
  missing: 'Not configured',
};

function stateFor(reason: string): AssessAvailability {
  const r = reason.toLowerCase();
  for (const k of Object.keys(SOURCE_STATE)) if (r.includes(k)) return SOURCE_STATE[k];
  if (/not authoriz|permission|grant|orgadmin/.test(r)) return 'Not authorized';
  if (/retention|lag|window/.test(r)) return 'Delayed';
  return 'Partial';
}

export async function runAssessment(): Promise<AssessmentReport> {
  const gov = await getGovernanceIntelligence({}).catch(() => null);
  const summary = await getSummary().catch(() => null);

  const availability: AssessmentReport['availability'] = [];
  const okSources = new Set<string>();
  for (const s of gov?.sources ?? []) {
    okSources.add(s);
    availability.push({ source: s, state: 'Available' });
  }
  for (const [src, reason] of Object.entries(gov?.degraded_sources ?? {})) {
    availability.push({ source: src, state: stateFor(String(reason)), reason: String(reason) });
  }

  const findings: AssessFinding[] = (gov?.audit?.rows ?? []).map((f) => ({
    id: f.finding_id,
    kind: f.kind,
    severity: f.severity,
    title: f.finding,
    // recommendation-kind rows are inferred; identity/policy findings are observed facts.
    factType: f.kind === 'recommendation' ? 'inferred' : 'observed',
    recommendation: f.recommendation,
    object: f.object,
  }));

  const total = availability.length || 1;
  const coveragePct = Math.round((okSources.size / total) * 100);
  const critical =
    gov?.score_summary?.critical_findings ??
    findings.filter((f) => /critical|high/i.test(f.severity)).length;

  const estate =
    (summary as unknown as { totals?: Record<string, number> })?.totals ?? {};
  const estateBits = Object.entries(estate)
    .slice(0, 3)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');

  const narrative =
    `Data360 scanned ${gov?.account ?? 'the connected account'} and analyzed ` +
    `${coveragePct}% of the accessible metadata` +
    (estateBits ? ` (${estateBits})` : '') +
    `. It found ${critical} critical/high risk${critical === 1 ? '' : 's'} and ` +
    `${findings.length} finding${findings.length === 1 ? '' : 's'} in scope` +
    (availability.some((a) => a.state !== 'Available')
      ? `; ${availability.filter((a) => a.state !== 'Available').length} source(s) are not fully available (shown below, never counted as zero).`
      : '.');

  return {
    account: gov?.account ?? 'account',
    coveragePct,
    narrative,
    score: gov?.score_summary?.score ?? null,
    criticalCount: critical,
    availability,
    findings,
  };
}
