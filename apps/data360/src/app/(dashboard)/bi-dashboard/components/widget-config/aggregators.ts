/**
 * Single source of truth for measure aggregators shown in the widget-config forms.
 *
 * MUST stay in sync with the backend whitelist `SUPPORTED_AGGREGATORS`
 * (backend: app/modules/projects/bi_dashboard/models.py). The backend rejects
 * any aggregator outside this set with a 422, so the picker must never offer
 * more — and there is no reason for it to offer fewer (KPI cards previously
 * exposed only 5 of the 17, an unintended divergence).
 */
export interface AggregatorOption {
  value: string;
  label: string;
}

export const AGGREGATORS: AggregatorOption[] = [
  { value: 'SUM', label: 'SUM' },
  { value: 'AVG', label: 'AVG' },
  { value: 'MIN', label: 'MIN' },
  { value: 'MAX', label: 'MAX' },
  { value: 'COUNT', label: 'COUNT' },
  { value: 'COUNT_DISTINCT', label: 'COUNT DISTINCT' },
  { value: 'MEDIAN', label: 'MEDIAN' },
  { value: 'STDDEV', label: 'STDDEV' },
  { value: 'VARIANCE', label: 'VARIANCE' },
  { value: 'VAR_POP', label: 'VAR_POP' },
  { value: 'VAR_SAMP', label: 'VAR_SAMP' },
  { value: 'STDDEV_POP', label: 'STDDEV_POP' },
  { value: 'STDDEV_SAMP', label: 'STDDEV_SAMP' },
  { value: 'APPROX_COUNT_DISTINCT', label: 'APPROX COUNT DISTINCT' },
  { value: 'BIT_AND', label: 'BIT AND' },
  { value: 'BIT_OR', label: 'BIT OR' },
  { value: 'BIT_XOR', label: 'BIT XOR' },
];
