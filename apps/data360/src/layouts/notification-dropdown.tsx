'use client';

import { RefObject, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Popover, Title, Badge, Text, ActionIcon } from 'rizzui';
import Link from 'next/link';
import { useMedia } from '@core/hooks/use-media';
import SimpleBar from '@core/ui/simplebar';
import {
  PiCheck,
  PiCheckCircleDuotone,
  PiXCircleDuotone,
  PiClockCountdownDuotone,
  PiBellDuotone,
  PiArrowsClockwiseBold,
  PiRocketLaunchDuotone,
} from 'react-icons/pi';
import { useNotificationsList } from '@/hooks/useNotifications';
import type { NotificationItem } from '@/app/services/notifications';
import {
  fmtDuration,
  stepLabel,
  type DeploymentStep,
} from '@/app/services/deployment-tracking';

dayjs.extend(relativeTime);

type IconAppearance = {
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

const KIND_ICON: Record<string, IconAppearance> = {
  deploy_started: { Icon: PiRocketLaunchDuotone, tone: 'text-blue-500' },
  deploy_step: { Icon: PiRocketLaunchDuotone, tone: 'text-blue-500' },
  deploy_success: { Icon: PiCheckCircleDuotone, tone: 'text-emerald-500' },
  deploy_failure: { Icon: PiXCircleDuotone, tone: 'text-rose-500' },
  deploy_cancelled: { Icon: PiXCircleDuotone, tone: 'text-slate-500' },
  workflow_finished: { Icon: PiCheckCircleDuotone, tone: 'text-emerald-500' },
  workflow_failed: { Icon: PiXCircleDuotone, tone: 'text-rose-500' },
  approval_request: { Icon: PiClockCountdownDuotone, tone: 'text-amber-500' },
  approval_granted: { Icon: PiCheckCircleDuotone, tone: 'text-emerald-500' },
  approval_rejected: { Icon: PiXCircleDuotone, tone: 'text-rose-500' },
  system: { Icon: PiBellDuotone, tone: 'text-slate-500' },
};

/** Extract the deploy payload the backend writes via EMIT_DEPLOYMENT_NOTIFICATION. */
function deployMeta(item: NotificationItem): {
  deployment_id?: string;
  project_name?: string;
  step?: DeploymentStep;
  status?: string;
  duration_ms?: number;
} | null {
  if (!item.kind?.startsWith('deploy_') && item.kind !== 'approval_request')
    return null;
  const p = (item.payload || {}) as Record<string, unknown>;
  return {
    deployment_id:
      typeof p.deployment_id === 'string' ? p.deployment_id : undefined,
    project_name:
      typeof p.project_name === 'string' ? p.project_name : undefined,
    step: typeof p.step === 'string' ? (p.step as DeploymentStep) : undefined,
    status: typeof p.status === 'string' ? p.status : undefined,
    duration_ms: typeof p.duration_ms === 'number' ? p.duration_ms : undefined,
  };
}

function kindAppearance(kind: string): IconAppearance {
  return KIND_ICON[kind] ?? KIND_ICON.system;
}

function deployStatusBadge(status?: string) {
  if (!status) return null;
  const tone: Record<string, string> = {
    RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PENDING_APPROVAL:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    SUCCEEDED:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    FAILED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    CANCELLED:
      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    PENDING:
      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone[status] ?? tone.PENDING}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: () => void;
}) {
  const { Icon, tone } = kindAppearance(item.kind);
  const unread = !item.read_at;
  const body = item.body?.trim();
  const deploy = deployMeta(item);

  return (
    <div
      className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md px-2 py-2 pe-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-50"
      onClick={onClick}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100/70 p-1 dark:bg-slate-800/50 [&>svg]:h-auto [&>svg]:w-5">
        <Icon className={tone} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="w-full min-w-0">
          <Text
            className={`mb-0.5 truncate text-sm ${
              unread
                ? 'font-semibold text-gray-900 dark:text-gray-700'
                : 'font-normal text-slate-600'
            }`}
          >
            {item.title}
          </Text>
          {body && (
            <Text className="mb-0.5 line-clamp-2 text-xs text-slate-500">
              {body}
            </Text>
          )}
          {deploy && (
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {deployStatusBadge(deploy.status)}
              {deploy.step && (
                <span className="text-[10px] text-slate-500">
                  Step:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {stepLabel(deploy.step)}
                  </span>
                </span>
              )}
              {typeof deploy.duration_ms === 'number' &&
                deploy.duration_ms > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {fmtDuration(deploy.duration_ms)}
                  </span>
                )}
            </div>
          )}
          <Text className="whitespace-nowrap text-xs text-slate-400">
            {dayjs(item.created_at).fromNow(true)}
            {item.actor_username ? ` · ${item.actor_username}` : ''}
            {item.ui_origin ? ` · ${item.ui_origin}` : ''}
          </Text>
        </div>
        <div className="ms-auto flex-shrink-0">
          {unread ? (
            <Badge renderAsDot size="lg" color="primary" className="scale-90" />
          ) : (
            <span className="inline-block rounded-full bg-gray-100 p-0.5 dark:bg-slate-800">
              <PiCheck className="h-auto w-[9px]" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationsList({
  setIsOpen,
}: {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { items, unreadCount, loading, refresh, markRead, markAllRead } =
    useNotificationsList({ unread_only: filter === 'unread', page_size: 20 });

  return (
    <div className="w-[320px] text-left sm:w-[360px] 2xl:w-[420px] rtl:text-right">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between pe-2 ps-6">
        <div className="flex items-center gap-2">
          <Title as="h5" fontWeight="semibold">
            Notifications
          </Title>
          {unreadCount > 0 && (
            <Badge size="sm" color="primary">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`rounded px-2 py-0.5 text-xs ${
              filter === 'all'
                ? 'bg-slate-200 dark:bg-slate-700'
                : 'text-slate-500'
            }`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`rounded px-2 py-0.5 text-xs ${
              filter === 'unread'
                ? 'bg-slate-200 dark:bg-slate-700'
                : 'text-slate-500'
            }`}
            onClick={() => setFilter('unread')}
          >
            Unread
          </button>
          <ActionIcon
            size="sm"
            variant="text"
            aria-label="Refresh"
            onClick={() => refresh()}
            className={loading ? 'animate-spin' : ''}
          >
            <PiArrowsClockwiseBold />
          </ActionIcon>
          {unreadCount > 0 && (
            <button
              type="button"
              className="ps-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              onClick={() => markAllRead()}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <SimpleBar className="max-h-[420px]">
        {items.length === 0 && !loading && (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            You&apos;re all caught up.
          </div>
        )}
        {loading && items.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            Loading…
          </div>
        )}
        <div className="grid grid-cols-1 gap-1 ps-4">
          {items.map((item) => {
            const onRowClick = () => {
              if (!item.read_at) void markRead(item.notification_id);
              setIsOpen(false);
            };
            const row = <NotificationRow item={item} onClick={onRowClick} />;
            return item.link ? (
              <Link key={item.notification_id} href={item.link}>
                {row}
              </Link>
            ) : (
              <div key={item.notification_id}>{row}</div>
            );
          })}
        </div>
      </SimpleBar>

      {/* Footer */}
      <Link
        href="/notifications"
        onClick={() => setIsOpen(false)}
        className="-me-6 block px-6 pb-0.5 pt-3 text-center text-sm hover:underline"
      >
        View all activity
      </Link>
    </div>
  );
}

export default function NotificationDropdown({
  children,
}: {
  children: JSX.Element & { ref?: RefObject<any> };
}) {
  const isMobile = useMedia('(max-width: 480px)', false);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement={isMobile ? 'bottom' : 'bottom-end'}
    >
      <Popover.Trigger>{children}</Popover.Trigger>
      <Popover.Content className="z-[9999] px-0 pb-4 pe-6 pt-5 dark:bg-gray-100 [&>svg]:hidden [&>svg]:dark:fill-gray-100 sm:[&>svg]:inline-flex">
        <NotificationsList setIsOpen={setIsOpen} />
      </Popover.Content>
    </Popover>
  );
}
