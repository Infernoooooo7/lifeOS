'use client';

import { useMemo, type ReactNode } from 'react';
import { navigate, openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useNow, useRecord, useRecords } from '@/core/data/hooks';
import { create, titleOf, update } from '@/core/data/store';
import { fmtDate, relativeDay, ymd } from '@/core/lib/dates';
import { CADENCES, contactStatus, lastContacts, reconnectQueue, upcomingBirthdays, type ContactStatus } from '@/core/lib/people';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { CollectionView } from '@/ui/CollectionView';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, IconButton, Section, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'overview', label: 'Overview', icon: 'heart' as const },
  { value: 'people', label: 'People', icon: 'users' as const },
  { value: 'log', label: 'Interactions', icon: 'history' as const },
];

const KIND: Record<string, { label: string; icon: IconName; past: string }> = {
  call: { label: 'Call', icon: 'phone', past: 'Called' },
  message: { label: 'Message', icon: 'mail', past: 'Messaged' },
  meet: { label: 'Met', icon: 'users', past: 'Met up' },
  video: { label: 'Video', icon: 'monitor', past: 'Video call' },
  email: { label: 'E-mail', icon: 'mail', past: 'E-mailed' },
  gift: { label: 'Gift', icon: 'sparkles', past: 'Gave a gift' },
  other: { label: 'Other', icon: 'circle', past: 'In touch' },
};

/** Log a catch-up today; the keep-in-touch clock resets from it. */
export async function logInteraction(person: Rec, kind: string, summary?: string) {
  await create('interactions', { personId: person.id, kind, date: ymd(new Date()), summary: summary ?? KIND[kind]?.past ?? 'In touch' });
  toast(`${KIND[kind]?.past ?? 'Logged'} · ${titleOf(person)}`, { tone: 'good', icon: 'checkCircle' });
}

const ago = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const inDays = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

function initials(name: unknown) {
  return String(name ?? '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

/** A soft, stable tint per person so avatars are easy to tell apart. */
function Avatar({ person, size = 40 }: { person: Rec; size?: number }) {
  let h = 0;
  for (const ch of person.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-semibold text-[#0b0d12] shadow-[inset_0_1px_0_rgb(255_255_255/0.45)]"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(150deg, oklch(0.86 0.1 ${h}), oklch(0.72 0.14 ${(h + 40) % 360}))` }}
      aria-hidden
    >
      {initials(person.name)}
    </span>
  );
}

function StatusChip({ status }: { status: ContactStatus }) {
  if (status.state === 'none') return null;
  const d = status.daysLeft ?? 0;
  const text = status.state === 'overdue' ? `${-d} day${d === -1 ? '' : 's'} overdue` : status.state === 'due' ? 'Due today' : `In ${d} day${d === 1 ? '' : 's'}`;
  return <span className={cx('chip', status.state === 'overdue' ? '!border-bad/40 !text-bad' : status.state === 'due' ? '!border-warn/40 !text-warn' : status.state === 'soon' ? 'chip-accent' : '')}>{text}</span>;
}

function QuickLog({ person, compact }: { person: Rec; compact?: boolean }) {
  return (
    <span className="flex flex-none items-center gap-1">
      {(['call', 'message', 'meet'] as const).map((k) =>
        compact ? (
          <IconButton key={k} icon={KIND[k].icon} label={`Log ${KIND[k].label.toLowerCase()} with ${titleOf(person)}`} onClick={() => void logInteraction(person, k)} />
        ) : (
          <Button key={k} size="sm" icon={KIND[k].icon} onClick={() => void logInteraction(person, k)}>{KIND[k].label}</Button>
        ),
      )}
    </span>
  );
}

function usePeopleData() {
  const people = useRecords('people');
  const interactions = useRecords('interactions');
  const now = useNow();
  const active = useMemo(() => people.filter((p) => !p.archived), [people]);
  const last = useMemo(() => lastContacts(active, interactions), [active, interactions]);
  return { people: active, interactions, last, now };
}

function Overview() {
  const { people, interactions, last, now } = usePeopleData();
  const queue = useMemo(() => reconnectQueue(people, last, now), [people, last, now]);
  const birthdays = useMemo(() => upcomingBirthdays(people, now, 45), [people, now]);
  const recent = useMemo(() => [...interactions].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b._ca - a._ca).slice(0, 8), [interactions]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const thisMonth = interactions.filter((i) => String(i.date) >= monthStart).length;

  if (!people.length) {
    return (
      <Empty
        icon="users" title="Who matters to you?"
        hint="Add the people you want to stay close to, choose how often you'd like to be in touch, and LIFEOS reminds you when a catch-up is due — and before their birthdays."
        action={<Button variant="primary" icon="plus" onClick={() => openEditor('people')}>Add someone</Button>}
      />
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="People" value={people.length} icon="users" onClick={() => navigate('/people/people')} />
        <Stat label="Due to reconnect" value={queue.filter((q) => q.status.state !== 'soon').length} icon="refresh" tone={queue.some((q) => q.status.state === 'overdue') ? 'warn' : undefined} />
        <Stat label="Birthdays, 45 days" value={birthdays.length} icon="sparkles" />
        <Stat label="Catch-ups this month" value={thisMonth} icon="heart" tone="good" onClick={() => navigate('/people/log')} />
      </div>

      <Section title="Reconnect" icon="refresh">
        {queue.length === 0 ? (
          <p className="card text-sm text-muted">Nobody is due a catch-up. People with a keep-in-touch rhythm appear here as their next catch-up approaches.</p>
        ) : (
          <div className="card !p-1.5">
            {queue.map(({ person, status }) => (
              <div key={person.id} className="row">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/people/${person.id}`)}>
                  <Avatar person={person} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{titleOf(person)}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <StatusChip status={status} />
                      <span className="truncate text-xs text-faint">{status.sinceDays === null ? 'none logged yet' : `last ${ago(status.sinceDays)}`}</span>
                    </span>
                  </span>
                </button>
                <QuickLog person={person} compact />
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Birthdays coming up" icon="sparkles">
          {birthdays.length === 0 ? <p className="card text-sm text-muted">No birthdays in the next 45 days. Add a birthday to a person to see it here.</p> : (
            <div className="card !p-1.5">
              {birthdays.map((b) => (
                <button key={b.person.id} type="button" className="row w-full text-left" onClick={() => navigate(`/people/${b.person.id}`)}>
                  <Avatar person={b.person} size={32} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{titleOf(b.person)}</span><span className="block text-xs text-faint">{fmtDate(b.date, { weekday: true })}{b.turning ? ` · turns ${b.turning}` : ''}</span></span>
                  <span className={cx('chip', b.daysLeft <= 3 && 'chip-accent')}>{b.daysLeft === 0 ? 'Today' : b.daysLeft === 1 ? 'Tomorrow' : `${b.daysLeft} days`}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
        <Section title="Recently in touch" icon="history" action={<button type="button" className="text-xs text-accent" onClick={() => navigate('/people/log')}>All</button>}>
          {recent.length === 0 ? <p className="card text-sm text-muted">Log a call, message or meeting and it shows up here.</p> : (
            <div className="card !p-1.5">
              {recent.map((i) => {
                const p = byId.get(String(i.personId));
                return (
                  <button key={i.id} type="button" className="row w-full text-left" onClick={() => (p ? navigate(`/people/${p.id}`) : openEditor('interactions', i.id))}>
                    <Icon name={KIND[String(i.kind)]?.icon ?? 'circle'} size={16} className="flex-none text-accent" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm">{p ? titleOf(p) : 'Someone'}<span className="text-muted"> · {String(i.summary || KIND[String(i.kind)]?.past || '')}</span></span></span>
                    <span className="flex-none text-xs text-faint">{relativeDay(i.date, now)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon name={icon} size={16} className="mt-0.5 flex-none text-muted" />
      <span className="min-w-0"><span className="block text-xs text-faint">{label}</span><span className="block break-words">{children}</span></span>
    </div>
  );
}

function PersonDetail({ id }: { id: string }) {
  const person = useRecord(id);
  const { interactions, last, now } = usePeopleData();
  if (person === undefined) return null;
  if (!person || person.deletedAt) {
    return <Page module="people" title="Not found"><Empty icon="users" title="This person was deleted" action={<Button onClick={() => navigate('/people/people')}>All people</Button>} /></Page>;
  }
  const status = contactStatus(person, last.get(person.id), now);
  const birthday = upcomingBirthdays([person], now, 366)[0];
  const cadence = CADENCES.find((c) => c.value === Number(person.cadenceDays))?.label ?? 'No reminder';
  const mine = interactions.filter((i) => i.personId === person.id);
  return (
    <Page
      module="people" title={titleOf(person)} subtitle={[person.circle, person.company && `at ${person.company}`, person.city].filter(Boolean).join(' · ') || 'Person'}
      actions={<><Button size="sm" icon="arrowLeft" variant="ghost" onClick={() => navigate('/people/people')}>People</Button><Button size="sm" icon="pencil" onClick={() => openEditor('people', person.id)}>Edit</Button></>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="card flex flex-wrap items-center gap-4">
            <Avatar person={person} size={56} />
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted">Keep in touch: {cadence.toLowerCase()}</span><StatusChip status={status} /></div>
              <div className="mt-0.5 text-sm text-faint">{status.sinceDays === null ? 'No catch-up logged yet' : `Last in touch ${ago(status.sinceDays)}`}{status.daysLeft !== null ? ` · next catch-up ${status.daysLeft < 0 ? 'was due ' : ''}${inDays(status.daysLeft)}` : ''}.</div>
            </div>
            <QuickLog person={person} />
          </div>
          <Section title="History" icon="history">
            <CollectionView
              collection="interactions" viewKey={`person-${person.id}`} views={['list', 'table']} filter={(r) => r.personId === person.id} defaults={{ personId: person.id }}
              addLabel="Log interaction" emptyHint={`Every call, message and meeting with ${titleOf(person)} — logged here, newest first.`}
            />
          </Section>
        </div>
        <aside className="card h-fit space-y-3" aria-label="About">
          {(person.phone || person.email) && (
            <div className="flex flex-wrap gap-2">
              {person.phone && <a className="btn btn-sm" href={`tel:${String(person.phone).replace(/[^+\d]/g, '')}`}><Icon name="phone" size={15} />Call</a>}
              {person.phone && <a className="btn btn-sm" href={`sms:${String(person.phone).replace(/[^+\d]/g, '')}`}><Icon name="mail" size={15} />Text</a>}
              {person.email && <a className="btn btn-sm" href={`mailto:${String(person.email)}`}><Icon name="mail" size={15} />E-mail</a>}
            </div>
          )}
          {birthday && <Fact icon="sparkles" label="Birthday">{fmtDate(person.birthday)}{birthday.turning ? ` · turns ${birthday.turning}` : ''} · {birthday.daysLeft === 0 ? 'today' : `in ${birthday.daysLeft} days`}</Fact>}
          {person.howMet && <Fact icon="pin" label="How you met">{String(person.howMet)}</Fact>}
          {Array.isArray(person.tags) && person.tags.length > 0 && <Fact icon="tag" label="Interests"><span className="mt-1 flex flex-wrap gap-1">{(person.tags as string[]).map((t) => <span key={t} className="chip">{t}</span>)}</span></Fact>}
          {person.giftIdeas && <Fact icon="sparkles" label="Gift ideas"><span className="whitespace-pre-line">{String(person.giftIdeas)}</span></Fact>}
          {person.notes && <Fact icon="notes" label="Notes"><span className="whitespace-pre-line">{String(person.notes)}</span></Fact>}
          <Fact icon="heart" label="Catch-ups logged">{mine.length}</Fact>
          {!person.archived && <button type="button" className="text-xs text-faint hover:text-text" onClick={() => void update(person.id, { archived: true }).then(() => { toast(`${titleOf(person)} archived`); navigate('/people/people'); })}>Archive this person</button>}
        </aside>
      </div>
    </Page>
  );
}

export default function People({ sub }: ModuleProps) {
  const isTab = !sub[0] || TABS.some((t) => t.value === sub[0]);
  const tab = tabFrom(sub, TABS);
  const { last, now } = usePeopleData();
  if (!isTab) return <PersonDetail id={sub[0]} />;
  return (
    <Page
      module="people" tabs={TABS} tab={tab}
      actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(tab === 'log' ? 'interactions' : 'people')}>{tab === 'log' ? 'Log' : 'Person'}</Button>}
    >
      {tab === 'overview' && <Overview />}
      {tab === 'people' && (
        <CollectionView
          collection="people" viewKey="people" onOpen={(r) => navigate(`/people/${r.id}`)} addLabel="New person"
          emptyHint="Family, friends and colleagues you want to keep close. Import a CSV of contacts with the ⋯ menu."
          rowExtra={(r) => <StatusChip status={contactStatus(r, last.get(r.id), now)} />}
        />
      )}
      {tab === 'log' && <CollectionView collection="interactions" viewKey="people-log" addLabel="Log interaction" emptyHint="Calls, messages, meetings and gifts, newest first." />}
    </Page>
  );
}
