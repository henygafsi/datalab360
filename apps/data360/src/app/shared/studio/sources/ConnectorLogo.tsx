'use client';

/**
 * ConnectorLogo — the small brand mark for a source connector.
 *
 * Real vendor logos (react-icons / Simple Icons) for the connectors we
 * recognise, in their brand colour, with a neutral lucide family icon as
 * the honest fallback for anything without a bundled mark. Vendor names and
 * marks are legitimate HERE: this is the connector picker, where the user
 * chooses a specific technology — not AI copy (the brand rule bans vendor
 * names in generated prose, not in a connector catalogue).
 *
 * Keyed by a normalised match on the connector id + label, so it works
 * whatever exact connector_id the backend returns. Everything is bundled;
 * no network request, no external asset.
 */

import type { CSSProperties } from 'react';
import { Boxes, Cloud, Database, Plug, Table2, Workflow, type LucideIcon } from 'lucide-react';
import type { IconType } from 'react-icons';
import {
  SiAmazondynamodb,
  SiAmazons3,
  SiApachekafka,
  SiApachespark,
  SiDatabricks,
  SiGoogleanalytics,
  SiGooglecloud,
  SiHubspot,
  SiLooker,
  SiMicrosoftazure,
  SiMicrosoftsharepoint,
  SiMysql,
  SiOracle,
  SiPostgresql,
  SiPython,
  SiSalesforce,
  SiSap,
  SiSnowflake,
} from 'react-icons/si';

type Brand = { Icon: IconType; color: string };

/** ordered most-specific first; matched against `${id} ${label}` lowercased */
const BRANDS: Array<{ test: RegExp; brand: Brand }> = [
  { test: /amazon\s*s3|\bs3\b/, brand: { Icon: SiAmazons3, color: '#FF9900' } },
  { test: /dynamo/, brand: { Icon: SiAmazondynamodb, color: '#4053D6' } },
  { test: /azure|blob/, brand: { Icon: SiMicrosoftazure, color: '#0078D4' } },
  { test: /google\s*cloud|gcs|cloud\s*storage/, brand: { Icon: SiGooglecloud, color: '#4285F4' } },
  { test: /snowflake/, brand: { Icon: SiSnowflake, color: '#29B5E8' } },
  { test: /postgres/, brand: { Icon: SiPostgresql, color: '#4169E1' } },
  { test: /mysql/, brand: { Icon: SiMysql, color: '#4479A1' } },
  { test: /oracle/, brand: { Icon: SiOracle, color: '#C74634' } },
  { test: /salesforce/, brand: { Icon: SiSalesforce, color: '#00A1E0' } },
  { test: /hubspot/, brand: { Icon: SiHubspot, color: '#FF7A59' } },
  { test: /google\s*analytics/, brand: { Icon: SiGoogleanalytics, color: '#E37400' } },
  { test: /looker/, brand: { Icon: SiLooker, color: '#5F63F2' } },
  { test: /databricks/, brand: { Icon: SiDatabricks, color: '#FF3621' } },
  { test: /kafka/, brand: { Icon: SiApachekafka, color: '#7A7A7A' } },
  { test: /spark/, brand: { Icon: SiApachespark, color: '#E25A1C' } },
  { test: /sharepoint/, brand: { Icon: SiMicrosoftsharepoint, color: '#0078D4' } },
  { test: /\bsap\b/, brand: { Icon: SiSap, color: '#008FD3' } },
  { test: /python/, brand: { Icon: SiPython, color: '#3776AB' } },
];

/** neutral fallbacks by family / kind — no invented brand */
const FAMILY_FALLBACK: Record<string, LucideIcon> = {
  warehouse: Database,
  database: Database,
  object_storage: Cloud,
  cloud_storage: Cloud,
  saas_application: Boxes,
  api: Plug,
  events: Workflow,
  media: Table2,
};

export function ConnectorLogo({
  label,
  connectorId,
  family,
  className = 'h-4 w-4',
}: {
  label?: string | null;
  connectorId?: string | null;
  family?: string | null;
  className?: string;
}) {
  const key = `${connectorId ?? ''} ${label ?? ''}`.toLowerCase();
  const hit = BRANDS.find((b) => b.test.test(key));
  if (hit) {
    const Icon = hit.brand.Icon;
    const style: CSSProperties = hit.brand.color ? { color: hit.brand.color } : {};
    return <Icon aria-hidden className={`${className} shrink-0`} style={style} />;
  }
  const Fallback = FAMILY_FALLBACK[family ?? ''] ?? Plug;
  return <Fallback aria-hidden className={`${className} shrink-0 text-slate-400 dark:text-slate-500`} />;
}

export default ConnectorLogo;
