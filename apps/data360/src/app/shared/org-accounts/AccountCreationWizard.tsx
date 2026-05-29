'use client';

/**
 * AccountCreationWizard
 * =====================
 *
 * 3-step modal for provisioning a new Snowflake client account.
 *
 * Persona served
 * --------------
 *   - Superadmin (orgadmin) → primary user. Sees the full form, can
 *     force-set passwords, pick edition, region, cloud.
 *   - QA → can flip the "QA sandbox" toggle in step 1 to short-cut the
 *     form to known-good defaults so a sandbox is online in < 30 sec.
 *
 * Backend reality
 * ---------------
 * The matching server endpoint (`POST /org-accounts/accounts`) is NOT
 * yet wired. Submitting still calls `createAccount()` from `hooks.ts`;
 * a 404/405 from the server surfaces a Backend Gap card with the
 * expected endpoint + payload so the contract is unambiguous.
 */

import * as React from 'react';
import toast from 'react-hot-toast';
import {
  Check,
  X,
  Eye,
  EyeOff,
  Copy,
  Cloud,
  Shield,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  AlertTriangle,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  createAccount,
  type CreateAccountRequest,
  type CreateAccountResponse,
} from '@/app/services/org-accounts/hooks';
import type { ClientAccount } from '@/app/services/org-accounts/types';

/* ------------------------------------------------------------------ */
/*  Static reference data                                              */
/* ------------------------------------------------------------------ */

type Cloud = 'AWS' | 'AZURE' | 'GCP';
type Edition = 'STANDARD' | 'ENTERPRISE' | 'BUSINESS_CRITICAL';

const CLOUD_OPTIONS: { value: Cloud; label: string; note: string }[] = [
  { value: 'AWS', label: 'AWS', note: 'Most regions — standard pricing tier.' },
  { value: 'AZURE', label: 'Azure', note: 'Enterprise integration — +5% on storage.' },
  { value: 'GCP', label: 'GCP', note: 'Cheapest egress — limited region set.' },
];

const REGIONS_BY_CLOUD: Record<Cloud, string[]> = {
  AWS: [
    'us-east-1',
    'us-east-2',
    'us-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-northeast-1',
  ],
  AZURE: [
    'eastus',
    'eastus2',
    'westus2',
    'westeurope',
    'northeurope',
    'southeastasia',
    'australiaeast',
  ],
  GCP: ['us-central1', 'us-east4', 'europe-west2', 'europe-west4', 'asia-east1'],
};

const EDITIONS: {
  value: Edition;
  label: string;
  tooltip: string;
  base_cost: number;
}[] = [
  {
    value: 'STANDARD',
    label: 'Standard',
    tooltip: '1 day Time Travel · standard SLA · no Tri-Secret.',
    base_cost: 25,
  },
  {
    value: 'ENTERPRISE',
    label: 'Enterprise',
    tooltip: 'Up to 90 days Time Travel · multi-cluster warehouses · materialised views.',
    base_cost: 45,
  },
  {
    value: 'BUSINESS_CRITICAL',
    label: 'Business Critical',
    tooltip: 'HIPAA · Tri-Secret · failover groups · enhanced encryption.',
    base_cost: 75,
  },
];

/* ------------------------------------------------------------------ */
/*  Snowflake name validation                                          */
/* ------------------------------------------------------------------ */

const SNOWFLAKE_NAME_RE = /^[A-Z][A-Z0-9_]{0,254}$/;

function validateSnowflakeName(raw: string): { ok: boolean; reason?: string } {
  const v = raw.trim();
  if (!v) return { ok: false, reason: 'Required.' };
  if (v.length > 255) return { ok: false, reason: 'Maximum 255 characters.' };
  if (!/^[A-Za-z]/.test(v)) {
    return { ok: false, reason: 'Must start with a letter.' };
  }
  if (!/^[A-Za-z0-9_]+$/.test(v)) {
    return { ok: false, reason: 'Letters, digits, and underscores only.' };
  }
  // Uppercase preview always passes if base passes.
  if (!SNOWFLAKE_NAME_RE.test(v.toUpperCase())) {
    return { ok: false, reason: 'Invalid Snowflake identifier.' };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Password helpers                                                   */
/* ------------------------------------------------------------------ */

function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const pickFrom = (s: string) => s[Math.floor(Math.random() * s.length)];
  const base = [
    pickFrom(upper),
    pickFrom(lower),
    pickFrom(digits),
    pickFrom(symbols),
  ];
  for (let i = 0; i < 14; i++) base.push(pickFrom(all));
  // Fisher-Yates shuffle.
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

function passwordStrength(pwd: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = [
  'bg-red-500',
  'bg-red-500',
  'bg-amber-500',
  'bg-amber-500',
  'bg-green-500',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export interface AccountCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass 'orgadmin' to unlock the QA sandbox toggle. */
  currentUserRole: 'orgadmin' | 'accountadmin' | 'qa' | 'user';
  /** Called after a successful creation. */
  onCreated?: (newAccount: ClientAccount) => void;
}

export default function AccountCreationWizard({
  open,
  onOpenChange,
  currentUserRole,
  onCreated,
}: AccountCreationWizardProps) {
  /* ------------------------------ State ------------------------------ */
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Step 1 — identity
  const [accountNameInput, setAccountNameInput] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [qaSandbox, setQaSandbox] = React.useState(false);

  // Step 2 — infrastructure
  const [cloud, setCloud] = React.useState<Cloud>('AWS');
  const [region, setRegion] = React.useState<string>(REGIONS_BY_CLOUD.AWS[0]);
  const [edition, setEdition] = React.useState<Edition>('ENTERPRISE');

  // Step 3 — admin
  const [adminName, setAdminName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminUsername, setAdminUsername] = React.useState('');
  const [generatePassword, setGeneratePassword] = React.useState(true);
  const [pwd1, setPwd1] = React.useState('');
  const [pwd2, setPwd2] = React.useState('');
  const [generatedPwd, setGeneratedPwd] = React.useState(generateStrongPassword());
  const [showPwd, setShowPwd] = React.useState(false);

  // Submission
  const [submitting, setSubmitting] = React.useState(false);
  const [backendGap, setBackendGap] = React.useState<null | {
    endpoint: string;
    payload: string;
  }>(null);

  // Cancel-discard confirm
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const accountName = accountNameInput.toUpperCase();

  // Reset everything when the dialog reopens.
  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setAccountNameInput('');
    setComment('');
    setQaSandbox(false);
    setCloud('AWS');
    setRegion(REGIONS_BY_CLOUD.AWS[0]);
    setEdition('ENTERPRISE');
    setAdminName('');
    setAdminEmail('');
    setAdminUsername('');
    setGeneratePassword(true);
    setPwd1('');
    setPwd2('');
    setGeneratedPwd(generateStrongPassword());
    setShowPwd(false);
    setSubmitting(false);
    setBackendGap(null);
  }, [open]);

  // Keep region valid when cloud changes.
  React.useEffect(() => {
    setRegion(REGIONS_BY_CLOUD[cloud][0]);
  }, [cloud]);

  /* --------------------------- Validations --------------------------- */
  const nameCheck = React.useMemo(
    () => validateSnowflakeName(accountNameInput),
    [accountNameInput],
  );
  const adminUsernameCheck = React.useMemo(
    () => validateSnowflakeName(adminUsername),
    [adminUsername],
  );
  const adminEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);
  const adminNameValid = adminName.trim().length > 0;

  const pwdScore = passwordStrength(generatePassword ? generatedPwd : pwd1);
  const pwdValid = generatePassword
    ? generatedPwd.length >= 12
    : pwd1.length >= 12 && pwd1 === pwd2 && pwdScore >= 3;

  const step1Valid = nameCheck.ok;
  const step2Valid = Boolean(cloud && region && edition);
  const step3Valid =
    adminNameValid && adminEmailValid && adminUsernameCheck.ok && pwdValid;

  const dirty =
    accountNameInput.length > 0 ||
    comment.length > 0 ||
    adminName.length > 0 ||
    adminEmail.length > 0 ||
    adminUsername.length > 0;

  /* ---------------------- QA sandbox shortcut ----------------------- */
  React.useEffect(() => {
    if (!qaSandbox) return;
    // Prefix QA_ if not already present and stay editable.
    setAccountNameInput((prev) => {
      const stripped = prev.replace(/^QA_+/i, '');
      return `QA_${stripped}`.toUpperCase();
    });
    setCloud('AWS');
    setRegion('us-east-1');
    setEdition('STANDARD');
    setComment((c) => c || 'QA sandbox account (auto-prefixed).');
  }, [qaSandbox]);

  /* ----------------------- Step navigation ------------------------ */
  function handleClose() {
    if (submitting) return;
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      onOpenChange(false);
    }
  }

  function handleNext() {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
  }

  function handleBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
  }

  /* ----------------------- Submission ----------------------- */
  async function handleSubmit() {
    if (!step3Valid || submitting) return;
    setSubmitting(true);
    setBackendGap(null);

    const payload: CreateAccountRequest = {
      account_name: accountName,
      cloud,
      region,
      edition,
      admin_name: adminName.trim(),
      admin_email: adminEmail.trim(),
      admin_username: adminUsername.toUpperCase(),
      admin_password: generatePassword ? generatedPwd : pwd1,
      generate_password: generatePassword,
      comment: comment.trim() || undefined,
    };

    try {
      const resp: CreateAccountResponse = await createAccount(payload);
      toast.success(`Account ${resp.account_name} created`);
      const created: ClientAccount = {
        account_name: resp.account_name,
        account_locator: resp.account_locator ?? '',
        organization_name: '',
        region,
        region_group: '',
        cloud,
        edition,
        account_url: resp.account_url ?? '',
        created_on: new Date().toISOString(),
        comment: payload.comment ?? null,
        deleted_on: null,
        dropped_on: null,
        scheduled_deletion_time: null,
        is_org_admin: false,
        is_events_account: false,
        is_active: true,
      };
      onCreated?.(created);
      onOpenChange(false);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = e?.response?.status;
      if (status === 404 || status === 405) {
        setBackendGap({
          endpoint: 'POST /org-accounts/accounts',
          payload: JSON.stringify(payload, null, 2),
        });
      } else {
        const detail = e?.response?.data?.detail;
        toast.error(
          detail
            ? `Failed to create account: ${detail}`
            : 'Failed to create account',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------- UI ------------------------------- */
  const baseBtn =
    'inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
          else onOpenChange(next);
        }}
      >
        <DialogContent
          className="max-w-2xl bg-white dark:bg-slate-900"
          // Prevent close on outside click — wizard has its own discard flow.
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <DialogTitle className="text-slate-900 dark:text-white">
                Create new client account
              </DialogTitle>
            </div>
            <DialogDescription asChild>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Provision a new Snowflake account under this organisation.
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Progress bar */}
          <ol className="my-3 flex items-center justify-between gap-2" aria-label="Wizard steps">
            {([1, 2, 3] as const).map((n) => {
              const labelMap = { 1: 'Identity', 2: 'Infrastructure', 3: 'Admin & review' };
              const isActive = step === n;
              const isDone = step > n;
              return (
                <li
                  key={n}
                  aria-current={isActive ? 'step' : undefined}
                  className="flex flex-1 items-center gap-2"
                >
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      isActive && 'bg-primary text-primary-foreground',
                      isDone && 'bg-green-600 text-white',
                      !isActive && !isDone && 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : n}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500',
                    )}
                  >
                    {labelMap[n]}
                  </span>
                  {n < 3 && (
                    <div
                      className={cn(
                        'h-px flex-1',
                        isDone ? 'bg-green-600' : 'bg-slate-200 dark:bg-slate-700',
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {/* Body */}
          <div className="space-y-4">
            {backendGap && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm dark:border-violet-900/40 dark:bg-violet-900/20">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-violet-500" />
                  <p className="font-semibold text-violet-700 dark:text-violet-300">
                    Backend gap — endpoint not yet available
                  </p>
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">{backendGap.endpoint}</dd>
                  </div>
                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
                    <dd>
                      <pre className="overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] leading-snug text-emerald-300">
                        {backendGap.payload}
                      </pre>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {/* ─────── STEP 1 — Identity ─────── */}
            {step === 1 && (
              <div className="space-y-4">
                {currentUserRole === 'orgadmin' && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    <input
                      type="checkbox"
                      checked={qaSandbox}
                      onChange={(e) => setQaSandbox(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>
                      <span className="font-semibold">QA sandbox</span> — auto-prefixes with{' '}
                      <code className="font-mono">QA_</code>, picks STANDARD edition on{' '}
                      <code className="font-mono">us-east-1</code>, fills sensible defaults.
                    </span>
                  </label>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="acct-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Account name
                  </label>
                  <div className="relative">
                    <input
                      id="acct-name"
                      autoFocus
                      value={accountNameInput}
                      onChange={(e) => setAccountNameInput(e.target.value)}
                      onBlur={() => setAccountNameInput((v) => v.toUpperCase())}
                      aria-invalid={accountNameInput.length > 0 && !nameCheck.ok}
                      aria-describedby="acct-name-help"
                      placeholder="my_account"
                      className={cn(
                        'block w-full rounded-md border bg-white px-3 py-2 pr-9 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white',
                        accountNameInput.length === 0
                          ? 'border-slate-300 focus:border-primary focus:ring-primary/30 dark:border-slate-700'
                          : nameCheck.ok
                            ? 'border-green-400 focus:border-green-500 focus:ring-green-200 dark:border-green-700'
                            : 'border-red-400 focus:border-red-500 focus:ring-red-200 dark:border-red-700',
                      )}
                    />
                    {accountNameInput.length > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        {nameCheck.ok ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                      </span>
                    )}
                  </div>
                  <p
                    id="acct-name-help"
                    className={cn(
                      'text-[11px]',
                      nameCheck.ok || accountNameInput.length === 0
                        ? 'text-slate-500'
                        : 'text-red-600',
                    )}
                  >
                    {accountNameInput.length === 0
                      ? 'Uppercase letters, digits, underscores. Must start with a letter. Max 255 chars.'
                      : nameCheck.ok
                        ? `Stored as: ${accountName}`
                        : nameCheck.reason}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="acct-comment"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Comment <span className="text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    id="acct-comment"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Describe the purpose of this account."
                    className="block w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* ─────── STEP 2 — Infrastructure ─────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Cloud provider
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {CLOUD_OPTIONS.map((c) => {
                      const isSelected = cloud === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setCloud(c.value)}
                          aria-pressed={isSelected}
                          className={cn(
                            'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Cloud className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {c.label}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">{c.note}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="acct-region"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Region
                  </label>
                  <select
                    id="acct-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {REGIONS_BY_CLOUD[cloud].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Edition
                  </p>
                  <div className="space-y-2">
                    {EDITIONS.map((e) => {
                      const isSelected = edition === e.value;
                      return (
                        <button
                          key={e.value}
                          type="button"
                          onClick={() => setEdition(e.value)}
                          title={e.tooltip}
                          aria-pressed={isSelected}
                          className={cn(
                            'flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
                          )}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {e.label}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">{e.tooltip}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            ${e.base_cost}/mo
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Est. base cost:{' '}
                  <span className="font-mono font-semibold">
                    ${EDITIONS.find((x) => x.value === edition)?.base_cost}/mo
                  </span>{' '}
                  · excludes credit + storage consumption.
                </div>
              </div>
            )}

            {/* ─────── STEP 3 — Admin & review ─────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Admin contact name
                    </label>
                    <input
                      id="admin-name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      aria-invalid={adminName.length > 0 && !adminNameValid}
                      placeholder="Jane Doe"
                      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-email"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Admin email
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      aria-invalid={adminEmail.length > 0 && !adminEmailValid}
                      placeholder="admin@example.com"
                      className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="admin-username"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Admin username (Snowflake identifier)
                  </label>
                  <input
                    id="admin-username"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value.toUpperCase())}
                    aria-invalid={adminUsername.length > 0 && !adminUsernameCheck.ok}
                    placeholder="ADMIN_USER"
                    className={cn(
                      'block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white',
                      adminUsername.length === 0
                        ? 'border-slate-300 focus:border-primary focus:ring-primary/30 dark:border-slate-700'
                        : adminUsernameCheck.ok
                          ? 'border-green-400 focus:border-green-500 focus:ring-green-200 dark:border-green-700'
                          : 'border-red-400 focus:border-red-500 focus:ring-red-200 dark:border-red-700',
                    )}
                  />
                  {adminUsername.length > 0 && !adminUsernameCheck.ok && (
                    <p className="text-[11px] text-red-600">{adminUsernameCheck.reason}</p>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={generatePassword}
                    onChange={(e) => setGeneratePassword(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span>
                    Generate a strong password and email it via SES.
                  </span>
                </label>

                {generatePassword ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Generated password
                    </label>
                    <div className="flex items-stretch gap-2">
                      <div className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                        {showPwd ? generatedPwd : '•'.repeat(generatedPwd.length)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                        className={cn(baseBtn, 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(generatedPwd);
                            toast.success('Password copied');
                          } catch {
                            toast.error('Copy failed');
                          }
                        }}
                        className={cn(baseBtn, 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGeneratedPwd(generateStrongPassword())}
                        className={cn(baseBtn, 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}
                      >
                        Regenerate
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      The user will receive this password via SES.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="pwd1"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Password
                      </label>
                      <input
                        id="pwd1"
                        type="password"
                        value={pwd1}
                        onChange={(e) => setPwd1(e.target.value)}
                        aria-invalid={pwd1.length > 0 && pwdScore < 3}
                        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={cn('h-full transition-all', STRENGTH_COLOR[pwdScore])}
                          style={{ width: `${(pwdScore / 4) * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Strength: {STRENGTH_LABEL[pwdScore]}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="pwd2"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Confirm password
                      </label>
                      <input
                        id="pwd2"
                        type="password"
                        value={pwd2}
                        onChange={(e) => setPwd2(e.target.value)}
                        aria-invalid={pwd2.length > 0 && pwd2 !== pwd1}
                        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                      {pwd2.length > 0 && pwd2 !== pwd1 && (
                        <p className="text-[11px] text-red-600">Passwords do not match.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Review summary */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Review
                  </p>
                  <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
                    <dt className="text-slate-500">Account name</dt>
                    <dd className="font-mono text-slate-900 dark:text-white">{accountName || '—'}</dd>
                    <dt className="text-slate-500">Cloud / region</dt>
                    <dd className="text-slate-900 dark:text-white">{cloud} · {region}</dd>
                    <dt className="text-slate-500">Edition</dt>
                    <dd className="text-slate-900 dark:text-white">{edition}</dd>
                    <dt className="text-slate-500">Admin</dt>
                    <dd className="text-slate-900 dark:text-white">{adminName || '—'} ({adminEmail || '—'})</dd>
                    <dt className="text-slate-500">Admin username</dt>
                    <dd className="font-mono text-slate-900 dark:text-white">{adminUsername || '—'}</dd>
                    {comment && (
                      <>
                        <dt className="text-slate-500">Comment</dt>
                        <dd className="text-slate-900 dark:text-white">{comment}</dd>
                      </>
                    )}
                  </dl>
                </div>

                {!step3Valid && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Complete every field above before creating the account.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className={cn(
                baseBtn,
                'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
              )}
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={submitting}
                  className={cn(
                    baseBtn,
                    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    (step === 1 && !step1Valid) ||
                    (step === 2 && !step2Valid)
                  }
                  className={cn(
                    baseBtn,
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!step3Valid || submitting}
                  className={cn(
                    baseBtn,
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create account
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard new account?"
        body="You will lose anything you have typed so far."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
