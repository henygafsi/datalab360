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
import { AlertTriangle, Check, Copy, Mail, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  clearWorkflowEmail,
  enrollEmail,
  getEmailCapability,
  putWorkflowEmail,
  testWorkflowEmail,
  type EmailCapability,
  type EmailSaveResult,
  type EmailTestResult,
  type RecipientStatus,
  type WorkflowEmailState,
} from '@/app/services/studio/studio-api';
import { readFailure } from '@/app/shared/studio/studio-errors';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/config/constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Brand rule: vendor engine names never reach customer copy. Backend
 *  validation/reason strings can mention them (incl. run together, e.g.
 *  "SnowflakeSQLException"), so scrub WITHOUT requiring word boundaries. */
function neutralize(s?: string | null): string {
  return (s ?? '')
    .replace(/snowflake/gi, 'the data warehouse')
    .replace(/cortex/gi, 'the analytics engine')
    .replace(/\bkimi\b/gi, 'the AI');
}

/** Turn a test-send outcome into one clear sentence. Known error codes get
 *  guidance; the raw reason (scrubbed) stays available as a title. */
function testSummary(t: {
  status?: string;
  error_code?: string;
  reason?: string;
}): { text: string; ok: boolean; raw?: string } {
  if (t.status === 'sent') return { text: 'Test sent to the recipients above.', ok: true };
  if (t.status === 'dry_run')
    return { text: 'Dry run: the call is valid — nothing was sent.', ok: true };
  const raw = neutralize(t.reason);
  switch (t.error_code) {
    case 'EMAIL_RECIPIENT_UNVERIFIED':
      return {
        text: 'A recipient is not a verified account user yet — the address must belong to a user of this account and be confirmed (the user verifies the e-mail sent to them, or an administrator sets it). Remove or replace the unverified recipient and test again.',
        ok: false,
        raw,
      };
    case 'EMAIL_INTEGRATION_MISSING':
      return {
        text: 'No e-mail integration exists on this account yet — enable it from the card above (or ask an administrator), then test again.',
        ok: false,
        raw,
      };
    case 'EMAIL_NOT_CONFIGURED':
      return { text: 'Save the configuration first, then send a test.', ok: false, raw };
    case 'EMAIL_SEND_FAILED':
      return { text: `The send failed${raw ? ` — ${raw}` : ''}.`, ok: false, raw };
    default:
      return {
        text: `Not sent${t.error_code ? ` (${t.error_code})` : ''}${raw ? ` — ${raw}` : ''}.`,
        ok: false,
        raw,
      };
  }
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
  const [enrolling, setEnrolling] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [recipStatus, setRecipStatus] = useState<Record<string, RecipientStatus>>(() => {
    const m: Record<string, RecipientStatus> = {};
    for (const r of initialEmail?.recipients ?? []) if (r.address) m[r.address.toLowerCase()] = r;
    return m;
  });
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);

  const { role } = useAuth();
  const admin = isAdminRole(role);
  const isConfigured = (Boolean(initialEmail?.configured) || Boolean(saved)) && !cleared;

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
      if (res.recipients) {
        const m: Record<string, RecipientStatus> = {};
        for (const r of res.recipients) if (r.address) m[r.address.toLowerCase()] = r;
        setRecipStatus(m);
      }
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
        // a rejected send names the bad addresses — flag those chips
        const bad = (res as { bad_recipients?: string[] }).bad_recipients ?? [];
        if (bad.length) {
          setRecipStatus((cur) => {
            const m = { ...cur };
            for (const a of bad) {
              const k = a.toLowerCase();
              m[k] = { ...(m[k] ?? { address: a }), verified: 'rejected' };
            }
            return m;
          });
        }
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

  /** Enrol the account's e-mail integration under the admin's own session.
   *  Dry-run first so the exact DDL is confirmed before it runs; re-read the
   *  capability after so the card flips to enrolled. */
  const doEnroll = useCallback(async () => {
    setEnrolling(true);
    setError(null);
    try {
      const name = integration.trim() || 'DATA360_EMAIL';
      const dry = await enrollEmail({ confirm: false, name });
      if (dry.status !== 'already_enrolled') {
        const ddl = (dry.sql ?? []).join('\n');
        if (!window.confirm(`Create the account e-mail integration now?\n\n${ddl}\n\nThis runs under your session.`)) {
          setEnrolling(false);
          return;
        }
        await enrollEmail({ confirm: true, name });
      }
      setCap(await getEmailCapability());
    } catch (e) {
      setError(failure(e).text);
    } finally {
      setEnrolling(false);
    }
  }, [integration]);

  const clearConfig = useCallback(async () => {
    if (
      !window.confirm(
        'Remove the e-mail configuration from this alert? Nothing is sent; the in-app notification stays.',
      )
    )
      return;
    setError(null);
    try {
      await clearWorkflowEmail(draftId, automationId);
      setCleared(true);
      setSaved(null);
      setTest(null);
      setRecipients([]);
      onConfigured?.();
    } catch (e) {
      setError(failure(e).text);
    }
  }, [draftId, automationId, onConfigured]);

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
            {admin
              ? 'You can enable it now — the one-time setup runs under your own session. Or configure the alert below first; a save sends nothing.'
              : `An administrator (${enroll?.enroll_sql?.who ?? 'ACCOUNTADMIN'}) enables this once. You can still configure the alert below — it saves without sending; a test reports the missing setup until then.`}
          </p>
          {admin && (
            <button
              type="button"
              disabled={enrolling}
              onClick={doEnroll}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-amber-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
              {enrolling ? 'Enabling…' : 'Enable e-mail for this account'}
            </button>
          )}
          {(enroll?.enroll_sql?.sql?.length ?? 0) > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-amber-700/80 dark:text-amber-300/70">
                  {admin ? 'Or run it manually' : 'Setup SQL'}
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
              const st = recipStatus[r.toLowerCase()];
              const invalid = !EMAIL_RE.test(r);
              const rejected = st?.verified === 'rejected' || st?.account_user === false;
              const warn = st?.allowed_by_integration === false && !rejected;
              const verified = st?.verified === 'verified';
              const tone =
                invalid || rejected
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  : warn
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    : verified
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200';
              const title = invalid
                ? 'Not a valid e-mail address'
                : st?.account_user === false
                  ? 'Not a user of this account — mail is only delivered to account users'
                  : st?.verified === 'rejected'
                    ? 'Rejected by the last send — the address is not verified'
                    : warn
                      ? "Not in the integration's allowed-recipients list"
                      : verified
                        ? 'Verified by a successful send'
                        : st?.evidence
                          ? neutralize(st.evidence)
                          : 'Remove';
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecipients((cur) => cur.filter((x) => x !== r))}
                  title={title}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tone}`}
                >
                  {/* state carries a glyph, not just a hue — a colour-blind reader
                      must tell rejected/warn/verified apart without the colour */}
                  {invalid || rejected || warn ? (
                    <AlertTriangle aria-hidden className="h-3 w-3" />
                  ) : verified ? (
                    <Check aria-hidden className="h-3 w-3" />
                  ) : null}
                  {r}
                  <X aria-hidden className="h-3 w-3" />
                  <span className="sr-only">remove {r}</span>
                </button>
              );
            })}
          </span>
        )}
        {Object.keys(recipStatus).length > 0 &&
          recipients.some((r) => recipStatus[r.toLowerCase()]?.account_user === false) && (
            <span className="mt-1 block text-[11px] text-rose-600 dark:text-rose-400">
              A red recipient is not a user of this account — replace it. Final address
              verification only resolves after a test send.
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
        {isConfigured && (
          <button
            type="button"
            onClick={clearConfig}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-rose-400"
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          Saving stores the configuration — it sends nothing.
        </span>
      </div>

      {cleared && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          E-mail configuration removed — this alert delivers in-app only.
        </p>
      )}

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

          {test &&
            (() => {
              const s = testSummary(test);
              return (
                <p
                  title={s.raw && s.raw !== s.text ? s.raw : undefined}
                  className={`text-xs ${
                    s.ok && test.status === 'sent'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : s.ok
                        ? 'text-slate-600 dark:text-slate-300'
                        : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {s.text}
                </p>
              );
            })()}
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
