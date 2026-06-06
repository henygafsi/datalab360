/**
 * shared/insights — the detect → notify → act glue.
 *
 * Import one button (`InsightActionButton`) to turn any inert recommendation /
 * alert / finding into a one-click, honestly-gated CTA. The gate self-disables
 * on 404/501 (no redeploy needed when the route ships), pings the bell + toasts
 * on success, and surfaces the real error envelope on failure.
 *
 * See ./README.md for the adoption pattern.
 */
export { default as InsightActionButton } from './InsightActionButton';
export type { InsightActionButtonProps } from './InsightActionButton';
export { useActionGate } from './useActionGate';
export type { ActionGate, UseActionGateOptions, GateState } from './useActionGate';
