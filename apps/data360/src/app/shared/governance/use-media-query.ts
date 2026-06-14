'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe media-query hook.
 *
 * Returns `false` on the server and on the first client render (so SSR markup
 * and the initial hydration agree — no mismatch). After mount it resolves the
 * real `matchMedia` result and stays subscribed to viewport changes.
 *
 * Consumers should treat the default (`false`) as "the query does not match"
 * — for the right-tab panel that means "desktop by default", which is the
 * cheaper, no-layout-shift baseline.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);

    // Resolve immediately on mount, then keep in sync with viewport changes.
    onChange();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14 fallback.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/** True when the viewport is below the Tailwind `md` breakpoint (768px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
