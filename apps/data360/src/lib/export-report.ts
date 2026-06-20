/**
 * export-report — build a downloadable CSV "report" for any admin page from the
 * data it already has on screen: a header block (title + context + KPIs) followed
 * by one or more labelled tables. No backend round-trip — it serialises the
 * current view, so the export always matches what the user sees (filters + page
 * included by the caller if desired). Null/undefined → "" (never a fake 0).
 */

export interface ReportKpi {
  label: string;
  value: string | number | null | undefined;
}

export interface ReportSection {
  name: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
}

export interface ReportInput {
  /** Page/report title, e.g. "Platform Health". */
  title: string;
  /** Context rows: account, window, generated-at, active filters… */
  meta?: ReportKpi[];
  kpis?: ReportKpi[];
  sections?: ReportSection[];
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise a report to CSV text (header block + sections). */
export function buildReportCsv(input: ReportInput): string {
  const lines: string[] = [];
  lines.push(csvCell(input.title));
  (input.meta ?? []).forEach((m) => lines.push(`${csvCell(m.label)},${csvCell(m.value)}`));
  if (input.kpis?.length) {
    lines.push('');
    lines.push('KPI,Value');
    input.kpis.forEach((k) => lines.push(`${csvCell(k.label)},${csvCell(k.value)}`));
  }
  (input.sections ?? []).forEach((sec) => {
    lines.push('');
    lines.push(csvCell(sec.name));
    lines.push(sec.columns.map(csvCell).join(','));
    sec.rows.forEach((r) => lines.push(r.map(csvCell).join(',')));
  });
  return lines.join('\n');
}

/** Build + trigger a CSV download. Filename derives from title + date param. */
export function downloadReportCsv(input: ReportInput, isoStamp: string): void {
  if (typeof document === 'undefined') return;
  const csv = buildReportCsv(input);
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug || 'report'}-${isoStamp.slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
