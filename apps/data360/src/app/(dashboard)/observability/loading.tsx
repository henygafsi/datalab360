// Route-level loading skeleton — instant feedback on navigation
// (the "running" leg of idle → running → completed → error → empty).
export default function Loading() {
  return (
    <div className="space-y-4 p-6" role="status" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
    </div>
  );
}
