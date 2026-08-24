'use client';

/**
 * Agentic Data OS — product-opportunity card. Functional, not audit: each row
 * is a data PRODUCT to build, with a one-click "Build product" that
 * auto-generates the real artifacts through the OS creators.
 */
import { Button } from 'rizzui';
import { PiStackDuotone, PiChartBarDuotone, PiCubeDuotone } from 'react-icons/pi';
import type { OpportunityScan, ProductOpportunity } from './scanOpportunities';

const KIND_META: Record<
  ProductOpportunity['kind'],
  { icon: typeof PiStackDuotone; label: string }
> = {
  star_model: { icon: PiStackDuotone, label: 'Star model + dashboard' },
  dashboard: { icon: PiChartBarDuotone, label: 'Dashboard' },
  data_product: { icon: PiCubeDuotone, label: 'Data product' },
};

export default function OpportunitiesCard({
  scan,
  busyId,
  onBuild,
}: {
  scan: OpportunityScan;
  busyId: string | null;
  onBuild: (opp: ProductOpportunity) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">{scan.narrative}</p>

      {scan.opportunities.length === 0 ? (
        <p className="text-xs text-gray-400">
          No build-ready product opportunities in the accessible estate — pick tables in the left
          rail and ask me to model them.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {scan.opportunities.map((o) => {
            const Icon = KIND_META[o.kind].icon;
            return (
              <li key={o.id} className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      {o.title}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500">
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                        {KIND_META[o.kind].label}
                      </span>
                      <span>{o.db}.{o.schema}</span>
                      {o.fact && <span className="truncate">fact: {o.fact.split('.').slice(-1)[0]}</span>}
                      {o.dims.length > 0 && <span>· {o.dims.length} dims</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">{o.reason}</p>
                  </div>
                  <Button size="sm" isLoading={busyId === o.id} onClick={() => onBuild(o)}>
                    Build product
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[10px] text-gray-400">
        Purely functional — builds real projects, models and dashboards. Security &amp; governance
        audits stay in their own surfaces. Nothing is deployed without your validation.
      </p>
    </div>
  );
}
