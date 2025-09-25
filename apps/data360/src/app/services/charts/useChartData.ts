import { useEffect, useRef, useState } from 'react';
import { ChartDataResponse, ChartRequest } from './types';
import { fetchChartData } from './fetchChartData';

interface UseChartDataOptions {
    enabled?: boolean;
    skipOnEmpty?: boolean; // if any required missing, skip
}

export function useChartData(req: ChartRequest, options: UseChartDataOptions = {}) {
    const { enabled = true, skipOnEmpty = true } = options;
    const [data, setData] = useState<ChartDataResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const lastRequestKeyRef = useRef<string | null>(null);

    useEffect(() => {
        // Compute skip conditions and stable key without useMemo
        const hasBase = !!req.database && !!req.schema && !!req.table;
        const hasMeasures = Array.isArray(req.measures) && req.measures.length > 0;
        if (!enabled || (skipOnEmpty && !(hasBase && hasMeasures))) return;

        let currentKey = '';
        try {
            currentKey = JSON.stringify({
                database: req.database,
                schema: req.schema,
                table: req.table,
                x: req.x ?? null,
                measures: req.measures,
                filters: req.filters || [],
                groupBy: req.groupBy || [],
                limit: req.limit ?? null,
                // chartType removed from backend payload
            });
        } catch {
            currentKey = String(Math.random());
        }
        if (lastRequestKeyRef.current === currentKey) {
            return;
        }
        lastRequestKeyRef.current = currentKey;

        let cancelled = false;
        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        fetchChartData(req)
            .then((res) => {
                if (cancelled) return;
                setData(res);
            })
            .catch((err: any) => {
                if (cancelled) return;
                setError(err instanceof Error ? err : new Error(err?.message || 'Failed to load chart data'));
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [enabled, skipOnEmpty, req]);

    return { data, loading, error };
}



