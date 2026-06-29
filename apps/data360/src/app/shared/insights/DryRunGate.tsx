'use client';
/**
 * DryRunGate — a cost-aware action wrapper. Before a user runs anything that
 * burns warehouse credits, it offers two honest paths:
 *
 *   1. **Dry-run gratuit** — runs against SAMPLE data, no credits, instant.
 *   2. **Run réel** — the real, costed action, gated behind a confirm that
 *      shows the estimated cost (and, when `paymentRequired`, a payment step).
 *
 * This is the FinOps "coût maîtrisé + paiement dans l'UI + dry-run gratuit avec
 * sample data" primitive. Both paths reuse {@link InsightActionButton} so they
 * inherit the confirm + toast + 404/501-disables-itself gate behaviour.
 *
 * NOTE: the actual payment capture is a TODO — it plugs into `onPay` once a
 * payment provider is chosen (W8 decision). Until then, `paymentRequired` just
 * adds an explicit confirm acknowledging the charge.
 *
 * @example
 *   <DryRunGate
 *     label="Reclusterer la table"
 *     estimatedCost={{ credits: 1.2, note: 'XS warehouse · ~3 min' }}
 *     onDryRun={() => dq.optimize(table, { dryRun: true })}
 *     onRealRun={() => dq.optimize(table)}
 *     paymentRequired
 *   />
 */
import { FlaskConical, Coins } from 'lucide-react';
import InsightActionButton from './InsightActionButton';

export interface EstimatedCost {
  /** Estimated Snowflake credits. */
  credits?: number;
  /** Estimated USD (if a price is known). */
  usd?: number;
  /** Free-text qualifier, e.g. "XS warehouse · ~3 min". */
  note?: string;
}

export interface DryRunGateProps {
  /** Base label of the action (verb phrase), e.g. "Reclusterer la table". */
  label: string;
  /** Free dry-run against sample data (no credits). */
  onDryRun: () => Promise<unknown>;
  /** The real, costed run. */
  onRealRun: () => Promise<unknown>;
  /** Estimated cost shown on the real-run confirm. */
  estimatedCost?: EstimatedCost;
  /** Require an explicit payment acknowledgement before the real run. */
  paymentRequired?: boolean;
  /** Advisory capability hint (runtime 404/501 is authoritative). */
  capable?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  onDone?: (result: unknown) => void;
}

function costLabel(c?: EstimatedCost): string {
  if (!c) return 'coût estimé inconnu';
  const parts: string[] = [];
  if (c.usd != null) parts.push(`$${c.usd.toFixed(2)}`);
  if (c.credits != null) parts.push(`${c.credits} crédit${c.credits > 1 ? 's' : ''}`);
  return (parts.join(' · ') || 'coût estimé') + (c.note ? ` (${c.note})` : '');
}

export default function DryRunGate({
  label,
  onDryRun,
  onRealRun,
  estimatedCost,
  paymentRequired,
  capable,
  size = 'sm',
  className,
  onDone,
}: DryRunGateProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <span
        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
        title="Coût estimé du run réel"
      >
        <Coins className="h-3 w-3" /> {costLabel(estimatedCost)}
      </span>

      <InsightActionButton
        label="Dry-run gratuit"
        icon={FlaskConical}
        onAction={onDryRun}
        capable={capable}
        variant="subtle"
        size={size}
        successToast="Dry-run terminé (données d'exemple, aucun crédit)"
        unavailableHint="Dry-run indisponible sur ce backend"
        onDone={onDone}
      />

      <InsightActionButton
        label={`${label} (réel)`}
        onAction={onRealRun}
        capable={capable}
        variant="primary"
        size={size}
        pingBell
        successToast={`${label} — lancé`}
        confirm={{
          title: `Lancer ${label} en run réel ?`,
          body: (
            <span>
              Ce run consomme des ressources : <b>{costLabel(estimatedCost)}</b>.
              {paymentRequired && (
                <>
                  {' '}
                  Un <b>paiement</b> sera requis pour ce run.{' '}
                  <span className="text-gray-500">
                    (Intégration paiement à brancher — provider à définir.)
                  </span>
                </>
              )}
            </span>
          ),
          confirmLabel: paymentRequired ? 'Payer et lancer' : 'Lancer le run réel',
          variant: 'warning',
        }}
        unavailableHint="Action indisponible sur ce backend"
        onDone={onDone}
      />
    </div>
  );
}
