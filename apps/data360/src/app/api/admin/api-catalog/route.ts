import { NextResponse } from 'next/server';
// Server-side import keeps the 0.5MB catalog out of the client bundle.
import catalog from '../../../(dashboard)/admin/api-health/data/api-catalog.json';
import meta from '../../../(dashboard)/admin/api-health/data/api-catalog.meta.json';

// Static functional catalog of all backend endpoints (generated from the
// backend OpenAPI snapshot by scripts/gen-api-catalog.mjs). Read by the admin
// API Health "Functional API View".
export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json({ meta, catalog });
}
