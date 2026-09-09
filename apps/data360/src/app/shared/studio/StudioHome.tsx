'use client';

/**
 * StudioHome — the Data360 Lite onboarding entry (selection-based).
 *
 * One question per screen, in plain words. The user picks a domain pack;
 * Data360 proposes, the user decides, nothing runs without them. A pack
 * click opens an IN-PLACE detail view (local state, no route change) with
 * the pack's questions, the decisions the user will make (never inferred:
 * metric_templates[].requires_decision), what is free before credits, and
 * an honest sample-data line. The single AI panel (AskRail) sits on the
 * right — its free-text ask arrives with a later slice, so it stays
 * disabled here; picking from the lists costs nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Plug, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';

import AskRail from '@/app/shared/studio/AskRail';
import { useAtomValue } from 'jotai';
import { stepAskAtom } from '@/app/shared/studio/studioAskAtom';
import {
  PlainQuestionHeader,
  QuietAction,
} from '@/app/shared/studio/PlainKit';
import {
  getDomainPacks,
  type DomainPacksCatalog,
} from '@/app/services/studio/domain-packs';
import {
  isPreparing,
  type PreparingEnvelope,
} from '@/app/shared/command-center/lib/meta';
import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import EmptyState from '@/components/ui/EmptyState';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import OnboardingFlow from '@/app/shared/studio/onboarding/OnboardingFlow';
import IndustryExplorer, { type ExplorerSeed } from '@/app/shared/studio/IndustryExplorer';
import type { NeedContext } from '@/app/shared/studio/onboarding/journey';

/* ------------------------------------------------------------------ */
/* Plain-words helpers (no vendor names in customer-facing copy)       */
/* ------------------------------------------------------------------ */

const SOURCE_TYPE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  s3_files: 'S3 files',
  azure_blob: 'Azure Blob',
  custom_api: 'Custom API',
  // Brand rule: never a vendor name in customer flows.
  snowflake_share: 'Warehouse share',
  snowflake_account_usage: 'Warehouse usage data',
};

function sourceTypeLabel(raw: string): string {
  return SOURCE_TYPE_LABELS[raw] ?? raw.replace(/_/g, ' ');
}

/** "preview_rows(limit<=100)" → "Preview rows (up to 100)". */
function gateLabel(raw: string): string {
  const spaced = raw
    .replace(/\(limit<=(\d+)\)/, ' (up to $1)')
    .replace(/_/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* ------------------------------------------------------------------ */
/* Load phases                                                         */
/* ------------------------------------------------------------------ */

type Phase =
  | { kind: 'loading' }
  | { kind: 'preparing'; startedAt: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; catalog: DomainPacksCatalog };

/* ------------------------------------------------------------------ */
/* Small local pieces                                                  */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'existing') return null;
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
      {status}
    </span>
  );
}

function SourceTypeChips({ types }: { types: string[] }) {
  if (!types || types.length === 0) {
    return (
      <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
    );
  }
  return (
    <>
      {types.map((t) => (
        <span
          key={t}
          className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          {sourceTypeLabel(t)}
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function StudioHome() {
  const router = useRouter();
  useTrackEvent(); // PAGE_VIEW, fire-and-forget
  // A wizard step can make the single right rail ACT (run a request), not just
  // show canned text — it publishes its handler here and we pass it through.
  const stepAsk = useAtomValue(stepAskAtom);

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickedPrompt, setPickedPrompt] = useState<string | null>(null);
  // 'journey' = the six-step onboarding flow is running in place.
  const [journeySeed, setJourneySeed] = useState<{
    needText?: string;
    domainId?: string;
    context?: NeedContext | null;
    step?: 'need' | 'sources';
  } | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const res = await getDomainPacks();
      if (isPreparing(res)) {
        setPhase({
          kind: 'preparing',
          startedAt: (res as PreparingEnvelope).started_at ?? null,
        });
        return;
      }
      setPhase({ kind: 'ready', catalog: res as DomainPacksCatalog });
    } catch (e) {
      setPhase({
        kind: 'error',
        message:
          e instanceof Error && e.message
            ? e.message
            : 'The domain catalog did not answer.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------- non-ready phases ---------------- */

  if (phase.kind === 'loading') {
    return (
      <div className="p-4 md:p-6">
        <div className="h-14 w-2/3 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (phase.kind === 'preparing') {
    return (
      <div className="p-4 md:p-6">
        <PreparingState
          domainLabel="the domain catalog"
          startedAt={phase.startedAt}
        />
        <QuietAction label="Check again" icon={RefreshCw} onClick={load} />
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={AlertCircle}
          title="The domain catalog could not be read"
          description={phase.message}
          action={
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-accent-300 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-accent-500 dark:hover:text-accent-400"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          }
        />
      </div>
    );
  }

  const { catalog } = phase;
  const packs = catalog.packs ?? [];
  const selectedPack =
    selectedId != null
      ? packs.find((p) => p.domain_id === selectedId) ?? null
      : null;

  /* ---------------- journey mode (six-step onboarding, in place) ------- */

  if (journeySeed) {
    const journeyPack = journeySeed.domainId
      ? packs.find((p) => p.domain_id === journeySeed.domainId) ?? null
      : null;
    const railSuggestions = (journeyPack?.sample_prompts ?? [])
      .slice(0, 3)
      .map((prompt, i) => ({ id: `j-${i}`, label: prompt }));
    return (
      // One page, no page scroll (user directive): the journey area is
      // viewport-bounded; only the step body scrolls internally.
      <div className="flex h-[calc(100dvh-140px)] min-h-0 gap-3 p-4 md:p-5">
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          <OnboardingFlow
            seed={journeySeed}
            suggestions={(journeyPack?.sample_prompts ?? []).slice(0, 4)}
            onExit={() => setJourneySeed(null)}
          />
        </div>
        <AskRail
          className="hidden max-h-full lg:flex"
          title="Ask about this step"
          suggestions={stepAsk?.suggestions ?? railSuggestions}
          onAsk={stepAsk?.onAsk}
          context={stepAsk?.context}
          costNote="Asking here is free within the preview envelope — never a credit. Picking from the lists costs nothing."
        />
      </div>
    );
  }

  /* ---------------- detail view (in-place) ---------------- */

  if (selectedPack) {
    const decisions = (selectedPack.metric_templates ?? []).filter(
      (mt) => mt.requires_decision,
    );
    const publishedSamples = (selectedPack.sample_datasets ?? []).filter(
      (ds) => ds.status !== 'missing',
    );
    const freeGates = catalog.gates?.free_sample?.allowed_without_credits ?? [];
    const creditGates = catalog.gates?.free_sample?.credit_gated ?? [];
    const suggestions = (selectedPack.sample_prompts ?? [])
      .slice(0, 3)
      .map((prompt, i) => ({
        id: `${selectedPack.domain_id}-prompt-${i}`,
        label: prompt,
        onPick: () => setPickedPrompt(prompt),
      }));

    return (
      <div className="flex flex-col gap-3 p-4 md:p-6">
        <QuietAction
          label="All domains"
          icon={ArrowLeft}
          onClick={() => {
            setSelectedId(null);
            setPickedPrompt(null);
          }}
        />

        <div className="flex min-h-[540px] items-stretch gap-4 lg:h-[calc(100vh-14rem)]">
          {/* Main column */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <PlainQuestionHeader
              question={selectedPack.label}
              detail="What this domain proposes, what stays your decision, and what is free to try."
              actions={<StatusBadge status={selectedPack.status} />}
            />

            {/* The grain, in plain words (one row = …) */}
            {(selectedPack.entities ?? []).length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {(selectedPack.entities ?? [])
                  .map((e) =>
                    e.grain ? `${e.name} — one row = one ${e.grain}` : e.name,
                  )
                  .join(' · ')}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <SectionCard title="Questions this domain answers">
                <div className="flex flex-wrap gap-1.5">
                  {(selectedPack.sample_prompts ?? []).length === 0 ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      —
                    </span>
                  ) : (
                    (selectedPack.sample_prompts ?? []).map((prompt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPickedPrompt(prompt)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-left text-xs text-slate-600 hover:border-accent-300 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-accent-500 dark:hover:text-accent-400"
                      >
                        {prompt}
                      </button>
                    ))
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Picking a question costs nothing.
                </p>
              </SectionCard>

              <SectionCard title="Decisions you'll make">
                {decisions.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Nothing to decide up front in this domain.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {decisions.map((mt) => (
                      <li key={mt.id}>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {mt.label || mt.id}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          You&rsquo;ll choose:{' '}
                          {(mt.ambiguities ?? []).length > 0
                            ? (mt.ambiguities ?? []).join(', ')
                            : 'the exact definition'}
                          .
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Data360 never answers these for you.
                </p>
              </SectionCard>

              <SectionCard title="What's free before credits">
                <div className="flex flex-wrap gap-1.5">
                  {freeGates.length === 0 && creditGates.length === 0 ? (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      —
                    </span>
                  ) : (
                    <>
                      {freeGates.map((g) => (
                        <span
                          key={g}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                        >
                          {gateLabel(g)}
                        </span>
                      ))}
                      {creditGates.map((g) => (
                        <span
                          key={g}
                          title="Uses credits — nothing runs without you."
                          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {gateLabel(g)}
                        </span>
                      ))}
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Green is free to try. Grey uses credits, and only after you
                  accept.
                </p>
              </SectionCard>

              <SectionCard title="Sample data">
                {publishedSamples.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No sample set is published for this domain yet.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {publishedSamples.map((ds) => (
                      <li
                        key={ds.id}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <span className="font-medium">
                          {ds.id.replace(/_/g, ' ')}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {ds.status ?? '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            {/* Bottom CTA row — starts the six-step journey IN PLACE */}
            <div className="mt-auto flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() =>
                  setJourneySeed({
                    domainId: selectedPack.domain_id,
                    needText: pickedPrompt ?? '',
                  })
                }
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                Continue with this domain
              </button>
              <QuietAction
                label="Open expert modeling instead"
                onClick={() =>
                  router.push(
                    `${routes.exploreDesign.view}?intent=model&from=studio&domain=${encodeURIComponent(selectedPack.domain_id)}`,
                  )
                }
              />
              <QuietAction
                label="Connect a source first"
                icon={Plug}
                href={routes.studioSource}
              />
            </div>
          </div>

          {/* The single AI panel, on the right */}
          <AskRail
            className="hidden lg:flex"
            title="Ask about this domain"
            suggestions={suggestions}
            costNote="Asking here is free within the preview envelope — never a credit. Picking from the lists costs nothing."
            context={
              pickedPrompt ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Your question
                  </p>
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {pickedPrompt}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Nothing has been sent. Free-text asking is not available
                    here yet.
                  </p>
                </div>
              ) : undefined
            }
          />
        </div>
      </div>
    );
  }

  /* ---------------- entry: industry → category → focus selector ------- */

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <PlainQuestionHeader
        question="What do you want to understand or automate?"
        detail="Pick your industry, then the question that matches — the AI drafts the full application from your selection, and you decide everything."
        actions={
          <>
            <QuietAction label="My applications" icon={Settings2} href={routes.studio} />
            <QuietAction
              label="Governance & access"
              icon={ShieldCheck}
              href={routes.studioGov}
            />
          </>
        }
      />

      {packs.length === 0 && !catalog.taxonomy?.industries?.length ? (
        <EmptyState
          title="No domains are published yet"
          description="The catalog answered but carries no domain packs. You can still start from your own data."
          action={
            <QuietAction
              label="Start from your own data"
              icon={Plug}
              href={routes.connexion.dataSourceConnection}
            />
          }
        />
      ) : (
        <IndustryExplorer
          catalog={catalog}
          onStart={(seed: ExplorerSeed) =>
            setJourneySeed({
              needText: seed.needText,
              domainId: seed.domainId,
              context: seed.context,
              // The context IS the need step's answer — land on sources.
              step: 'sources',
            })
          }
          onOpenPack={(domainId) => {
            setSelectedId(domainId);
            setPickedPrompt(null);
          }}
          onStartFromData={() => setJourneySeed({ step: 'sources' })}
        />
      )}
    </div>
  );
}
