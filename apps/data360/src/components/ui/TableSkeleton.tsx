'use client';

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

export default function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className = '',
}: TableSkeletonProps) {
  return (
    <div className={`overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          <div className="flex gap-4">
            {Array.from({ length: columns }).map((_, i) => (
              <div
                key={`header-${i}`}
                className="h-4 flex-1 animate-pulse rounded bg-gray-300 dark:bg-gray-600"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Body rows */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="p-4 transition-opacity hover:bg-gray-50 dark:hover:bg-gray-900/30"
          >
            <div className="flex gap-4">
              {Array.from({ length: columns }).map((_, colIndex) => {
                // Vary width for more realistic skeleton
                const widths = ['w-24', 'w-32', 'w-48', 'w-40', 'w-36'];
                const width = widths[colIndex % widths.length];

                return (
                  <div
                    key={`col-${colIndex}`}
                    className={`h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${width}`}
                    style={{
                      animationDelay: `${rowIndex * 100 + colIndex * 50}ms`,
                      maxWidth: colIndex === 0 ? '150px' : colIndex === columns - 1 ? '100px' : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer skeleton */}
      <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-300 dark:bg-gray-600" />
          <div className="flex gap-2">
            <div className="h-8 w-8 animate-pulse rounded bg-gray-300 dark:bg-gray-600" />
            <div className="h-8 w-8 animate-pulse rounded bg-gray-300 dark:bg-gray-600" />
            <div className="h-8 w-8 animate-pulse rounded bg-gray-300 dark:bg-gray-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Specialized skeleton for permission matrix (grants page)
export function GrantsMatrixSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-blue-200 dark:bg-blue-900/30" />
      </div>

      {/* Matrix table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {/* Table header */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-gray-700 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex gap-4">
            <div className="h-5 w-32 animate-pulse rounded bg-blue-300 dark:bg-blue-700" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`module-header-${i}`}
                className="h-5 w-24 animate-pulse rounded bg-blue-200 dark:bg-blue-800"
                style={{ animationDelay: `${i * 75}ms` }}
              />
            ))}
          </div>
        </div>

        {/* Rows */}
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <div
            key={`grant-row-${rowIndex}`}
            className="border-b border-gray-100 p-4 last:border-0 dark:border-gray-700"
          >
            <div className="flex items-center gap-4">
              {/* Role name */}
              <div
                className="h-6 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
                style={{ animationDelay: `${rowIndex * 100}ms` }}
              />

              {/* Module checkboxes */}
              {Array.from({ length: 8 }).map((_, colIndex) => (
                <div
                  key={`checkbox-${colIndex}`}
                  className="h-5 w-5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
                  style={{ animationDelay: `${rowIndex * 100 + colIndex * 50}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Loading message */}
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Chargement de la matrice de permissions...
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Cette opération peut prendre quelques secondes
        </p>
      </div>
    </div>
  );
}
