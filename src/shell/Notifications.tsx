'use client';

import { useMemo } from 'react';
import { navigate, useApp } from '@/core/app';
import { usePrefs, useRecords } from '@/core/data/hooks';
import { getRec, remove, update } from '@/core/data/store';
import { timeAgo } from '@/core/lib/dates';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, IconButton, Sheet, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';
import { requestNotificationPermission } from './engines';
import { openHit } from './Palette';

const KIND_ICON: Record<string, IconName> = { task: 'tasks', event: 'calendar', habit: 'repeat', renewal: 'refresh', date: 'calendarDays', document: 'file', automation: 'workflow', budget: 'gauge' };

/** In-app inbox for every reminder. System notifications are opt-in and asked for only from here or Settings. */
export function NotificationCenter() {
  const open = useApp((s) => s.notifications);
  const all = useRecords('notifications');
  const [prefs, setPrefs] = usePrefs();
  const list = useMemo(() => [...all].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b._ca - a._ca).slice(0, 150), [all]);
  const unread = list.filter((n) => !n.readAt);
  const close = () => useApp.setState({ notifications: false });

  const openSource = async (n: (typeof list)[number]) => {
    if (!n.readAt) await update(n.id, { readAt: new Date().toISOString() }, { silent: true });
    if (!n.source || !n.sourceId) return;
    const rec = await getRec(n.sourceId);
    if (!rec || rec.deletedAt) return toast('That item no longer exists.');
    close();
    openHit(rec);
  };
  const enableSystem = async () => {
    const result = await requestNotificationPermission();
    setPrefs({ notify: { ...prefs.notify, asked: true, browser: result === 'granted' } });
    toast(result === 'granted' ? 'System notifications are on.' : result === 'unsupported' ? 'This browser does not support notifications.' : 'Notifications stay inside LIFEOS. You can change this in your browser settings.', { tone: result === 'granted' ? 'good' : 'default' });
  };
  const supported = typeof Notification !== 'undefined';

  return (
    <Sheet
      open={open} onClose={close} side width={420} title={`Notifications${unread.length ? ` · ${unread.length} new` : ''}`}
      actions={<IconButton icon="settings" label="Notification settings" onClick={() => navigate('/settings/notifications')} />}
      footer={list.length > 0 && (
        <>
          <Button variant="ghost" size="sm" icon="trash" onClick={async () => { for (const n of list.filter((x) => x.readAt)) await remove(n.id, { silent: true }); }}>Clear read</Button>
          <Button size="sm" icon="check" disabled={!unread.length} onClick={async () => { const at = new Date().toISOString(); for (const n of unread) await update(n.id, { readAt: at }, { silent: true }); }}>Mark all read</Button>
        </>
      )}
    >
      {supported && !prefs.notify.asked && !prefs.notify.browser && (
        <div className="mb-3 rounded-xl border border-line bg-accent-soft p-3 text-sm">
          <p className="font-medium">Get reminders outside the app?</p>
          <p className="mt-0.5 text-muted">LIFEOS can show system notifications while it is open in the background. We only ask once.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void enableSystem()}>Turn on</Button>
            <Button size="sm" variant="ghost" onClick={() => setPrefs({ notify: { ...prefs.notify, asked: true } })}>Not now</Button>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <Empty icon="bell" title="No notifications" hint="Reminders for tasks, events, habits, renewals and important dates will appear here." />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {list.map((n) => (
            <li key={n.id} className={cx('row items-start', !n.readAt && 'bg-accent-soft/60')}>
              <span className={cx('mt-1 grid size-8 flex-none place-items-center rounded-lg', n.readAt ? 'bg-surface-2 text-faint' : 'bg-accent-soft text-accent')}><Icon name={KIND_ICON[n.kind as string] ?? 'bell'} size={15} /></span>
              <button type="button" className="min-w-0 flex-1 py-0.5 text-left" onClick={() => void openSource(n)}>
                <span className={cx('block text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                {n.body && <span className="block break-words text-sm text-muted">{n.body}</span>}
                <span className="block text-xs text-faint">{timeAgo(n._ca)}</span>
              </button>
              <IconButton icon="x" label="Dismiss notification" className="!size-8" onClick={() => void remove(n.id, { silent: true })} />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
