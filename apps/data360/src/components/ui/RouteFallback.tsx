/**
 * Lightweight skeleton for App-Router Suspense boundaries (useSearchParams).
 * Replaces `fallback={null}` so a suspending route shows a skeleton, never a
 * blank screen. Inline styles keep it dependency-free and theme-neutral.
 */
export default function RouteFallback() {
  return (
    <div style={{ padding: 24 }} aria-busy="true" aria-label="Chargement…">
      <div style={{ height: 28, width: 240, background: '#e5e7eb', borderRadius: 6, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 30, width: 110, background: '#eef2f7', borderRadius: 8 }} />
        ))}
      </div>
      <div style={{ height: 200, background: '#f3f4f6', borderRadius: 12 }} />
    </div>
  );
}
