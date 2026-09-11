'use client';

/**
 * StudioEmailAlertPanel — configure e-mail delivery for ONE workflow, honestly.
 *
 * The channel is the platform's own built-in e-mail (a warehouse notification
 * integration, no external SMTP). Three truths shape the UI:
 *  1. Enrollment first. When the account has no e-mail integration, that is an
 *     ADMINISTRATOR's one-time setup — we show the exact SQL and who runs it,
 *     never run it here, and let the reader configure the alert anyway (a save
 *     stores, it never sends).
 *  2. A save sends nothing. PUT validates and stores; the returned preview is
 *     rendered in a sandboxed frame so the reader sees the real message.
 *  3. A test goes ONLY to the listed recipients, once, subject prefixed
 *     [TEST], and only on an explicit confirm — a missing integration comes
 *     back as a reason, not a crash.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Mail, Send, X } from 'lucide-react';
import {
  getEmailCapability,
  putWorkflowEmail,
  testWorkflowEmail,
  type EmailCapability,
  type EmailSaveResult,
  type EmailTestResult,
  type WorkflowEmailState,
} from '@/app/services/studio/studio-api';
import { readFailure } from '@/app/shared/studio/studio-errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Brand rule: vendor engine names never reach customer copy. Backend
 *  validation/reason strings can mention them — scrub before display. */
function neutralize(s?: string | null): string {
  return (s ?? '')
    .replace(/\bsnowflake\b/gi, 'the data warehouse')
    .replace(/\bcortex\b/gi, 'the analytics engine')
    .replace(/\bkimi\b/gi, 'the AI');
}

function failure(e: unknown): { text: string; errors?: Array<{ field?: string; error?: string }> } {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as
    | { error_code?: string; errors?: Array<{ field?: string; error?: string }> }
    | undefined;
  if (detail?.error_code === 'EMAIL_CONFIG_INVALID' && Array.isArray(detail.errors)) {
    return {
      text: 'Some fields need a fix before this can be saved.',
      errors: detail.errors.map((x) => ({ field: x.field, error: neutralize(x.error) })),
    };
  }
  return { text: neutralize(readFailure(detail ?? e).text) };
}

export default function StudioEmailAlertPanel({
  draftId,
  automationId,
  initialEmail,
  onConfigured,
}: {
  draftId: string;
  automationId: string;
  initialEmail?: WorkflowEmailState | null;
  /** called after a successful save, so the editor can re-read the workflow */
  onConfigured?: () => void;
}) {
  const [cap, setCap] = useState<EmailCapability | 'loading' | 'error' | null>('loading');

  const cfg0 = initialEmail?.config ?? null;
  const [integration, setIntegration] = useState(cfg0?.integration ?? '');
  const [recipients, setRecipients] = useState<string[]>(cfg0?.recipients ?? []);
  const [recipInput, setRecipInput] = useState('');
  const [subject, setSubject] = useState(cfg0?.subject ?? '');
  const [template, setTemplate] = useState<'professional' | 'custom'>(
    cfg0?.template === 'custom' ? 'custom' : 'professional',
  );
  const [customHtml, setCustomHtml] = useState(cfg0?.custom_html ?? '');
  const [rowsLimit, setRowsLimit] = useState<number>(cfg0?.include?.rows_limit ?? 20);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<false | 'dry' | 'send'>(false);
  const [saved, setSaved] = useState<EmailSaveResult | null>(null);
  const [test, setTest] = useState<EmailTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Array<{ field?: string; error?: string }>>([]);
  const [copied, setCopied] = useState(false);
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);

  const isConfigured = Boolean(initialEmail?.configured) || Boolean(saved);

  useEffect(() => {
    let live = true;
    setCap('loading');
    void getEmailCapability()
      .then((c) => {
        if (!live) return;
        setCap(c);
        // prefill the integration name from the account's own, if any
        const first = c.enrollment?.integrations?.[0]?.name;
        setIntegration((cur) => cur || first || '');
      })
      .catch(() => live && setCap('error'));
    return () => {
      live = false;
    };
  }, []);

  const capObj = cap && cap !== 'loading' && cap !== 'error' ? cap : null;
  const limits = capObj?.limits ?? { recipients_max: 10, rows_max: 50, body_max_chars: 100_000 };
  const templates = capObj?.templates ?? [];
  const enroll = capObj?.enrollment;
  const enrolled = enroll?.status === 'enrolled';
  const placeholders = useMemo(
    () => templates.find((t) => t.id === 'custom')?.placeholders ?? [],
    [templates],
  );

  const addRecipients = useCallback(
    (raw: string) => {
      const parts = raw
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) return;
      setRecipients((cur) => {
        const next = [...cur];
        for (const p of parts) {
          if (next.length >= (limits.recipients_max ?? 10)) break;
          if (!next.includes(p)) next.push(p);
        }
        return next;
      });
      setRecipInput('');
    },
    [limits.recipients_max],
  );

  const badRecipients = recipients.filter((r) => !EMAIL_RE.test(r));
  const canSave =
    !saving &&
    recipients.length >= 1 &&
    badRecipients.length === 0 &&
    integration.trim() !== '' &&
    (template !== 'custom' || customHtml.trim() !== '') &&
    rowsLimit >= 0 &&
    rowsLimit <= (limits.rows_max ?? 50);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setFieldErrors([]);
    setTest(null);
    try {
      const res = await putWorkflowEmail(draftId, automationId, {
        integration: integration.trim(),
        recipients,
        subject: subject.trim() ? subject.trim() : undefined,
        template,
        custom_html: template === 'custom' ? customHtml : undefined,
        include: { rows_limit: rowsLimit },
      });
      setSaved(res);
      onConfigured?.();
    } catch (e) {
      const f = failure(e);
      setError(f.text);
      if (f.errors) setFieldErrors(f.errors);
    } finally {
      setSaving(false);
    }
  }, [
    draftId,
    automationId,
    integration,
    recipients,
    subject,
    template,
    customHtml,
    rowsLimit,
    onConfigured,
  ]);

  const runTest = useCallback(
    async (confirm: boolean) => {
      setTesting(confirm ? 'send' : 'dry');
      setError(null);
      setTest(null);
      try {
        const res = await testWorkflowEmail(draftId, automationId, confirm);
        setTest(res);
      } catch (e) {
        setError(failure(e).text);
      } finally {
        setTesting(false);
      }
    },
    [draftId, automationId],
  );

  const copyDdl = useCallback(() => {
    const sql = (enroll?.enroll_sql?.sql ?? []).join('\n');
    if (!sql) return;
    void navigator.clipboard?.writeText(sql).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [enroll]);

  const inputCls =
    'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
  const errOf = (field: string) => fieldErrors.find((f) => f.field === field)?.error;

  if (cap === 'loading') {
    return <p className="p-3 text-xs text-slate-400 dark:text-slate-500">Reading e-mail options…</p>;
  }
  if (cap === 'error' || !capObj) {
    return (
      <p className="p-3 text-xs text-slate-500 dark:text-slate-400">
        E-mail options could not be read right now — the in-app notification still works.
      </p>
    );
  }

  return (
    <section
      aria-label="E-mail delivery"
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <header className="flex items-center gap-2">
        <Mail aria-hidden className="h-4 w-4 text-accent-600 dark:text-accent-400" />
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Deliver by e-mail</h4>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          the platform's built-in e-mail — no external mail service to connect
        </span>
      </header>

      {/* 1 — enrollment (administrator, one-time) */}
      {!enrolled && (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-2.5 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
          <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
            {enroll?.status === 'not_readable'
              ? 'E-mail setup status could not be read on this account.'
              : "E-mail delivery isn't set up on this account yet."}
          </p>
          <p className="mt-1 text-amber-700 dark:text-amber-300/90">
            An administrator ({enroll?.enroll_sql?.who ?? 'ACCOUNTADMIN'}) runs this once. You can
            still configure the alert below — it saves without sending; a test will report the
            missing setup until this is done.
          </p>
          {(enroll?.enroll_sql?.sql?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-amber-700/80 dark:text-amber-300/70">
                  Setup SQL
                </span>
                <button
                  type="button"
                  onClick={copyDdl}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-amber-100/70 p-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                {(enroll?.enroll_sql?.sql ?? []).join('\n')}
              </pre>
              {enroll?.enroll_sql?.note && (
                <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/70">
                  {enroll.enroll_sql.note}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2 — configuration (a save sends nothing) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            E-mail integration
          </span>
          <input
            value={integration}
            onChange={(e) => setIntegration(e.target.value)}
            placeholder="DATA360_EMAIL"
            className={inputCls}
          />
          {errOf('integration') && (
            <span className="mt-0.5 block text-[11px] text-rose-600 dark:text-rose-400">
              {errOf('integration')}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Records listed in the e-mail ({rowsLimit}/{limits.rows_max ?? 50})
          </span>
          <input
            type="number"
            min={0}
            max={limits.rows_max ?? 50}
            value={rowsLimit}
            onChange={(e) => setRowsLimit(Math.max(0, Math.min(limits.rows_max ?? 50, Number(e.target.value) || 0)))}
            className={inputCls}
          />
        </label>
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Recipients ({recipients.length}/{limits.recipients_max ?? 10}) — verified addresses of
          account users
        </span>
        <input
          value={recipInput}
          onChange={(e) => setRecipInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addRecipients(recipInput);
            }
          }}
          onBlur={() => addRecipients(recipInput)}
          placeholder="name@company.com — Enter to add"
          disabled={recipients.length >= (limits.recipients_max ?? 10)}
          className={inputCls}
          aria-label="Add a recipient e-mail"
        />
        {recipients.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {recipients.map((r) => {
              const bad = !EMAIL_RE.test(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecipients((cur) => cur.filter((x) => x !== r))}
                  title={bad ? 'Not a valid e-mail address' : 'Remove'}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                    bad
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
                  }`}
                >
                  {r}
                  <X aria-hidden className="h-3 w-3" />
                  <span className="sr-only">remove {r}</span>
                </button>
              );
            })}
          </span>
        )}
        {errOf('recipients') && (
          <span className="mt-0.5 block text-[11px] text-rose-600 dark:text-rose-400">
            {errOf('recipients')}
          </span>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Subject <span className="font-normal text-slate-400">— optional</span>
        </span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="[app] workflow — the default if left blank"
          className={inputCls}
        />
      </label>

      {/* template picker */}
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Template
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {(templates.length ? templates : [{ id: 'professional' }, { id: 'custom' }]).map((t) => {
            const active = template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id === 'custom' ? 'custom' : 'professional')}
                className={`rounded-lg border p-2.5 text-left transition ${
                  active
                    ? 'border-accent-500 bg-accent-50/60 ring-1 ring-accent-500 dark:bg-accent-900/20'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {active && <Check aria-hidden className="h-3.5 w-3.5 text-accent-600" />}
                  {t.label ?? (t.id === 'custom' ? 'Custom HTML' : 'Professional')}
                </span>
                {t.description && (
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                    {t.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {template === 'custom' && (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Your HTML
            </span>
            {placeholders.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setCustomHtml((h) => h + p);
                  htmlRef.current?.focus();
                }}
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {p}
              </button>
            ))}
          </div>
          <textarea
            ref={htmlRef}
            value={customHtml}
            onChange={(e) => setCustomHtml(e.target.value.slice(0, limits.body_max_chars ?? 100_000))}
            rows={6}
            placeholder="<h2>{{app}} — {{workflow}}</h2><p>{{condition}} · {{count}} records</p>{{rows_table}}"
            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {customHtml.length.toLocaleString()}/{(limits.body_max_chars ?? 100_000).toLocaleString()} · scripts and external resources are stripped
          </span>
          {errOf('custom_html') && (
            <span className="mt-0.5 block text-[11px] text-rose-600 dark:text-rose-400">
              {errOf('custom_html')}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {saving ? 'Saving…' : isConfigured ? 'Update configuration' : 'Save configuration'}
        </button>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          Saving stores the configuration — it sends nothing.
        </span>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* 3 — preview + warnings + governed test */}
      {saved && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
            <Check aria-hidden className="h-3.5 w-3.5" />
            Configuration saved{typeof saved.version === 'number' ? ` (v${saved.version})` : ''} — nothing was sent.
          </p>
          {(saved.warnings ?? []).map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              {neutralize(w)}
            </p>
          ))}
          {saved.preview?.html && (
            <div>
              {saved.preview.subject && (
                <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">Subject:</span> {saved.preview.subject}
                </p>
              )}
              <iframe
                title="E-mail preview"
                sandbox=""
                srcDoc={saved.preview.html}
                className="h-64 w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
              />
              {saved.preview.rows_source && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Rows: {saved.preview.rows_source}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            <button
              type="button"
              disabled={testing !== false}
              onClick={() => runTest(false)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              {testing === 'dry' ? 'Checking…' : 'Dry run'}
            </button>
            <button
              type="button"
              disabled={testing !== false}
              onClick={() => {
                if (
                  window.confirm(
                    `Send one [TEST] e-mail now to: ${recipients.join(', ')}?\nThis is the only send — nothing is scheduled.`,
                  )
                )
                  void runTest(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-300 px-2.5 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 dark:border-accent-500/40 dark:text-accent-300 dark:hover:bg-accent-900/20"
            >
              <Send aria-hidden className="h-3.5 w-3.5" />
              {testing === 'send' ? 'Sending…' : 'Send a test'}
            </button>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              A test goes only to the recipients above, once, subject prefixed [TEST].
            </span>
          </div>

          {test && (
            <p
              className={`text-xs ${
                test.status === 'sent'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : test.status === 'dry_run'
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {test.status === 'sent'
                ? `Test sent to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}.`
                : test.status === 'dry_run'
                  ? 'Dry run: the call is valid — nothing was sent.'
                  : `Not sent${test.error_code ? ` (${test.error_code})` : ''}${
                      test.reason ? ` — ${neutralize(test.reason)}` : ''
                    }.`}
            </p>
          )}
        </div>
      )}

      {(capObj.governance ?? []).length > 0 && (
        <ul className="space-y-0.5 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {(capObj.governance ?? []).map((g, i) => (
            <li key={i}>• {g}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
