export type Aggregator = 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'card';

export type FilterOperator =
    '=' | '!=' | '>' | '>=' | '<' | '<=' |
    'IN' | 'NOT IN' | 'LIKE' | 'ILIKE' | 'BETWEEN';

export interface ChartFilter {
    column: string;
    operator: FilterOperator;
    value: string | number | boolean | Array<string | number> | { from: string | number; to: string | number };
}

export interface Threshold {
    operator: '<' | '>' | '>=' | '<=' | '=' | '!=' | 'between';
    value: number | [number, number];
    label: string;
    color: string;
}

export interface Measure {
    column: string;
    aggregator: Aggregator;
    seuils?: Threshold[];
}

export interface ChartRequest {
    database: string;
    schema: string;
    table: string;
    x?: string | null;
    measures: Measure[];
    filters?: ChartFilter[];
    groupBy?: string[];
    limit?: number | null;
}

export interface ChartRow {
    x: string | number | Date;
    y: number;
    // Additional grouped fields if any
    [key: string]: any;
}

export interface ChartDataResponse {
    data: any[];
    meta?: {
        columns?: string[];
        queryId?: string;
        executionMs?: number;
    };
}



