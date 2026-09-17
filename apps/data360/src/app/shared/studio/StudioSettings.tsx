'use client';

/**
 * TOMBSTONE — the app-administration surface was removed on purpose
 * (Administration now shows Data360 roles & users only; see
 * (studio)/studio/admin/page.tsx). Nothing imports this module anymore
 * (tsc-verified) — the file exists ONLY because a running Next dev server
 * pins deleted modules in its client-reference manifests until restarted,
 * and its absence 500s unrelated pages (/signin). Safe to delete after the
 * next dev-server restart / fresh build.
 */

export default function StudioSettings() {
  return null;
}
