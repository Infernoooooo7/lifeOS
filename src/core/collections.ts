import { CURRENCIES } from './lib/money';
import { PRIORITIES, TASK_STATUSES } from './lib/tasks';

/**
 * Collection definitions: the single description of every kind of record in LIFEOS.
 * Forms, list/table/board/calendar/gallery views, CSV import/export, search labels and automation
 * pickers are all generated from these definitions, so a new collection needs no bespoke UI.
 */

export type FieldType =
  | 'text' | 'textarea' | 'markdown' | 'number' | 'money' | 'date' | 'datetime' | 'time' | 'select' | 'multi' | 'tags' | 'bool' | 'rating'
  | 'url' | 'relation' | 'relations' | 'color' | 'checklist' | 'progress' | 'recurrence' | 'weekdays' | 'sets' | 'file';

export interface Opt {
  value: string | number;
  label: string;
  color?: string;
}

export interface FieldDef {
  k: string;
  label: string;
  t: FieldType;
  opts?: readonly Opt[];
  /** name of a user-extendable option set (personal categories) */
  optsKey?: string;
  /** target collection for relation fields */
  rel?: string;
  req?: boolean;
  /** default for new records; '@today' and '@now' are resolved when the form opens */
  def?: unknown;
  ph?: string;
  /** shown as a column in table view and as a badge in list view */
  list?: boolean;
  /** takes half the form width on wide screens */
  half?: boolean;
  unit?: string;
  help?: string;
  min?: number;
  max?: number;
  /** only show when another field has one of these values */
  when?: { k: string; in: unknown[] };
  /** date field that also accepts a time */
  timeOptional?: boolean;
  /** use a different option set depending on another field's value */
  optsKeyWhen?: { k: string; map: Record<string, string> };
}

export type ViewKind = 'list' | 'table' | 'board' | 'calendar' | 'gallery';

export interface CollectionDef {
  id: string;
  label: string;
  one: string;
  icon: string;
  fields: FieldDef[];
  /** field used as the record title (default: title, then name) */
  title?: string;
  views?: ViewKind[];
  /** select field that defines board columns */
  board?: string;
  /** date field used by calendar view and "upcoming" ordering */
  date?: string;
  /** field toggled by the row checkbox, with its done / not-done values */
  done?: { k: string; on: unknown; off: unknown };
  sort?: { k: string; dir: 'asc' | 'desc' };
  archive?: boolean;
  /** no generic form (records are managed by a module) */
  system?: boolean;
  hint?: string;
}

// ── field helpers ────────────────────────────────────────────────────────────────────────────────
type Extra = Partial<Omit<FieldDef, 'k' | 'label' | 't'>>;
const mk = (t: FieldType) => (k: string, label: string, extra: Extra = {}): FieldDef => ({ k, label, t, ...extra });
const text = mk('text'), area = mk('textarea'), md = mk('markdown'), num = mk('number'), money = mk('money'), date = mk('date'), datetime = mk('datetime'),
  time = mk('time'), tags = mk('tags'), bool = mk('bool'), rating = mk('rating'), url = mk('url'), color = mk('color'), checklist = mk('checklist'),
  progress = mk('progress'), recurrence = mk('recurrence'), weekdays = mk('weekdays'), sets = mk('sets'), file = mk('file');
const select = (k: string, label: string, opts: readonly (Opt | string)[] | string, extra: Extra = {}): FieldDef =>
  typeof opts === 'string'
    ? { k, label, t: 'select', optsKey: opts, ...extra }
    : { k, label, t: 'select', opts: opts.map((o) => (typeof o === 'string' ? { value: o, label: o.replace(/^./, (c) => c.toUpperCase()).replace(/-/g, ' ') } : o)), ...extra };
const multi = (k: string, label: string, opts: readonly Opt[], extra: Extra = {}): FieldDef => ({ k, label, t: 'multi', opts, ...extra });
const rel = (k: string, label: string, target: string, extra: Extra = {}): FieldDef => ({ k, label, t: 'relation', rel: target, ...extra });
const rels = (k: string, label: string, target: string, extra: Extra = {}): FieldDef => ({ k, label, t: 'relations', rel: target, ...extra });

const currency = (extra: Extra = {}) => select('currency', 'Currency', CURRENCIES as unknown as string[], { def: '@currency', half: true, ...extra });
const notes = (label = 'Notes') => area('notes', label);

/** Built-in option sets. Users can add their own values to any of them (Settings → Categories, or inline). */
export const OPTION_SETS: Record<string, string[]> = {
  expenseCategories: ['Groceries', 'Rent', 'Utilities', 'Transport', 'Dining', 'Shopping', 'Health', 'Education', 'Entertainment', 'Travel', 'Subscriptions', 'Insurance', 'Gifts', 'Other'],
  incomeCategories: ['Salary', 'Freelance', 'Business', 'Interest', 'Dividends', 'Refund', 'Gift', 'Other'],
  eventCategories: ['Personal', 'Work', 'Family', 'Health', 'Appointment', 'Travel', 'Study', 'Social'],
  habitCategories: ['Health', 'Mind', 'Learning', 'Work', 'Home', 'Relationships', 'Finance'],
  lifeAreas: ['Career', 'Health', 'Finance', 'Learning', 'Relationships', 'Personal growth', 'Fitness', 'Fun', 'Home'],
  fileCategories: ['Identity', 'Finance', 'Insurance', 'Medical', 'Education', 'Property', 'Vehicle', 'Work', 'Receipts', 'Other'],
  shoppingCategories: ['Produce', 'Dairy', 'Bakery', 'Pantry', 'Meat & fish', 'Frozen', 'Beverages', 'Household', 'Personal care', 'Other'],
  inventoryLocations: ['Kitchen', 'Bedroom', 'Living room', 'Bathroom', 'Garage', 'Storage', 'Office'],
  muscles: ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body', 'Cardio'],
  bookmarkFolders: ['Read later', 'Reference', 'Tools', 'Inspiration', 'Work', 'Learning'],
  accountCategories: ['Email', 'Social', 'Banking', 'Shopping', 'Work', 'Entertainment', 'Utilities', 'Government'],
};

const STATUS = (list: [string, string, string][]): Opt[] => list.map(([value, label, c]) => ({ value, label, color: c }));
const C = { slate: '#94a3b8', sky: '#38bdf8', amber: '#fbbf24', green: '#34d399', rose: '#fb7185', violet: '#a78bfa', cyan: '#22d3ee', orange: '#fb923c' };

export const PROJECT_STATUSES = STATUS([['planning', 'Planning', C.violet], ['active', 'Active', C.sky], ['paused', 'Paused', C.amber], ['done', 'Done', C.green]]);
export const GOAL_STATUSES = STATUS([['active', 'Active', C.sky], ['achieved', 'Achieved', C.green], ['paused', 'Paused', C.amber], ['dropped', 'Dropped', C.slate]]);
export const MEDIA_STATUSES = STATUS([['backlog', 'Backlog', C.slate], ['in-progress', 'In progress', C.sky], ['completed', 'Completed', C.green], ['dropped', 'Dropped', C.rose]]);
export const TRIP_STATUSES = STATUS([['idea', 'Idea', C.slate], ['planned', 'Planned', C.violet], ['booked', 'Booked', C.sky], ['ongoing', 'Ongoing', C.amber], ['completed', 'Completed', C.green]]);
export const MOODS: Opt[] = [{ value: 1, label: '😞 Awful' }, { value: 2, label: '😕 Low' }, { value: 3, label: '😐 Okay' }, { value: 4, label: '🙂 Good' }, { value: 5, label: '😄 Great' }];
export const REMINDER_OPTS: Opt[] = [{ value: 0, label: 'At start' }, { value: 5, label: '5 min' }, { value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hour' }, { value: 1440, label: '1 day' }];

const defs: CollectionDef[] = [
  // ── Productivity ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'tasks', label: 'Tasks', one: 'Task', icon: 'tasks', views: ['list', 'board', 'table', 'calendar'], board: 'status', date: 'dueAt', archive: true,
    done: { k: 'status', on: 'done', off: 'todo' },
    fields: [
      text('title', 'Title', { req: true, ph: 'What needs doing?' }),
      select('status', 'Status', TASK_STATUSES, { def: 'todo', list: true, half: true }),
      { k: 'priority', label: 'Priority', t: 'select', opts: PRIORITIES, def: 0, list: true, half: true },
      date('dueAt', 'Due', { list: true, half: true, timeOptional: true }),
      date('startAt', 'Start', { half: true }),
      rel('projectId', 'Project', 'projects', { list: true, half: true }),
      rel('goalId', 'Goal', 'goals', { half: true }),
      rel('parentId', 'Subtask of', 'tasks', { half: true }),
      num('estimateMin', 'Estimate', { unit: 'min', half: true, min: 0 }),
      tags('tags', 'Tags', { list: true }),
      recurrence('recurrence', 'Repeat'),
      rels('dependsOn', 'Blocked by', 'tasks', { help: 'This task waits until these are done.' }),
      area('notes', 'Notes'),
    ],
  },
  {
    id: 'projects', label: 'Projects', one: 'Project', icon: 'projects', title: 'name', views: ['gallery', 'board', 'table'], board: 'status', date: 'dueAt', archive: true,
    fields: [
      text('name', 'Name', { req: true }), select('status', 'Status', PROJECT_STATUSES, { def: 'active', list: true, half: true }), color('color', 'Colour', { half: true }),
      date('startAt', 'Start', { half: true }), date('dueAt', 'Deadline', { list: true, half: true }), rel('parentId', 'Part of', 'projects'), area('description', 'Description'), md('notes', 'Project notes'),
    ],
  },
  {
    id: 'milestones', label: 'Milestones', one: 'Milestone', icon: 'flag', views: ['list', 'table', 'calendar'], date: 'dueAt', done: { k: 'done', on: true, off: false }, sort: { k: 'dueAt', dir: 'asc' },
    fields: [text('title', 'Title', { req: true }), rel('projectId', 'Project', 'projects', { list: true, half: true }), rel('goalId', 'Goal', 'goals', { list: true, half: true }), date('dueAt', 'Target date', { list: true, half: true }), bool('done', 'Reached', { half: true }), notes()],
  },
  {
    id: 'timeEntries', label: 'Time entries', one: 'Time entry', icon: 'clock', views: ['table', 'list'], date: 'date', sort: { k: 'date', dir: 'desc' },
    fields: [text('title', 'What did you work on?'), rel('projectId', 'Project', 'projects', { list: true, half: true }), rel('taskId', 'Task', 'tasks', { half: true }), date('date', 'Date', { def: '@today', list: true, half: true }), num('minutes', 'Minutes', { req: true, list: true, half: true, min: 0, unit: 'min' }), notes()],
  },
  { id: 'calendars', label: 'Calendars', one: 'Calendar', icon: 'calendarDays', title: 'name', fields: [text('name', 'Name', { req: true }), color('color', 'Colour')] },
  {
    id: 'events', label: 'Events', one: 'Event', icon: 'calendar', views: ['calendar', 'list', 'table'], date: 'startAt', sort: { k: 'startAt', dir: 'asc' },
    fields: [
      text('title', 'Title', { req: true }), bool('allDay', 'All day'),
      datetime('startAt', 'Starts', { req: true, def: '@nextHour', list: true, half: true }), datetime('endAt', 'Ends', { half: true }),
      rel('calendarId', 'Calendar', 'calendars', { list: true, half: true }), select('category', 'Category', 'eventCategories', { list: true, half: true }),
      text('location', 'Location'), recurrence('recurrence', 'Repeat'), multi('reminders', 'Remind me before', REMINDER_OPTS),
      text('timezone', 'Time zone', { ph: 'e.g. Asia/Kolkata — leave empty for local time', help: 'Shown alongside your local time.' }), area('description', 'Notes'),
    ],
  },
  {
    id: 'habits', label: 'Habits', one: 'Habit', icon: 'repeat', title: 'name', archive: true, views: ['list', 'table'],
    fields: [
      text('name', 'Habit', { req: true, ph: 'e.g. Read 20 pages' }),
      select('cadence', 'Frequency', [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly target' }, { value: 'monthly', label: 'Monthly target' }], { def: 'daily', list: true, half: true }),
      num('target', 'Target', { def: 1, half: true, min: 1, help: 'Daily: amount per day. Weekly/monthly: check-ins per period.' }),
      text('unit', 'Unit', { ph: 'times, pages, minutes…', half: true }), select('category', 'Category', 'habitCategories', { list: true, half: true }),
      weekdays('days', 'Scheduled days', { when: { k: 'cadence', in: ['daily'] }, help: 'Leave empty for every day.' }),
      time('reminderAt', 'Reminder', { half: true }), color('color', 'Colour', { half: true }), area('description', 'Why it matters'),
    ],
  },
  { id: 'habitLogs', label: 'Habit check-ins', one: 'Check-in', icon: 'check', system: true, fields: [] },
  {
    id: 'routines', label: 'Routines', one: 'Routine', icon: 'sun', title: 'name', views: ['gallery', 'list'],
    fields: [text('name', 'Name', { req: true }), select('kind', 'Type', ['morning', 'evening', 'custom'], { def: 'morning', list: true }), checklist('steps', 'Steps', { help: 'Checked off fresh each day.' }), notes()],
  },
  { id: 'routineLogs', label: 'Routine runs', one: 'Routine run', icon: 'check', system: true, fields: [] },

  // ── Goals ──────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'goals', label: 'Goals', one: 'Goal', icon: 'target', views: ['gallery', 'board', 'table'], board: 'status', date: 'targetDate', archive: true,
    fields: [
      text('title', 'Goal', { req: true }),
      select('kind', 'Type', [{ value: 'long', label: 'Long-term goal' }, { value: 'short', label: 'Short-term goal' }, { value: 'objective', label: 'Objective (OKR)' }, { value: 'keyResult', label: 'Key result (OKR)' }, { value: 'plan', label: 'Improvement plan' }], { def: 'short', list: true, half: true }),
      select('status', 'Status', GOAL_STATUSES, { def: 'active', list: true, half: true }), select('area', 'Life area', 'lifeAreas', { list: true, half: true }),
      date('targetDate', 'Target date', { list: true, half: true }), rel('parentId', 'Supports', 'goals', { help: 'Parent goal or objective this one depends on.' }),
      num('targetValue', 'Target value', { half: true }), num('currentValue', 'Current value', { half: true }), text('unit', 'Unit', { half: true }),
      progress('progress', 'Progress', { help: 'Used when no target value, milestones or key results are set.' }), area('description', 'Why this matters'),
    ],
  },
  { id: 'visionItems', label: 'Vision board', one: 'Vision card', icon: 'sparkles', views: ['gallery'], fields: [text('title', 'Vision', { req: true }), text('emoji', 'Emoji', { ph: '🏔️', half: true }), color('color', 'Colour', { half: true }), select('area', 'Life area', 'lifeAreas'), area('description', 'What does it look like?')] },
  {
    id: 'reviews', label: 'Reviews', one: 'Review', icon: 'history', views: ['list', 'table'], date: 'date', sort: { k: 'date', dir: 'desc' },
    fields: [select('period', 'Period', ['weekly', 'monthly', 'yearly'], { def: 'monthly', list: true, half: true }), date('date', 'Date', { def: '@today', list: true, half: true }), text('title', 'Title', { ph: 'e.g. October review' }), area('wins', 'Wins'), area('challenges', 'Challenges'), area('lessons', 'Lessons'), area('nextFocus', 'Focus for next period'), rating('rating', 'Overall')],
  },
  { id: 'achievements', label: 'Achievements', one: 'Achievement', icon: 'trophy', views: ['gallery', 'list'], date: 'date', sort: { k: 'date', dir: 'desc' }, fields: [text('title', 'Achievement', { req: true }), date('date', 'Date', { def: '@today', list: true, half: true }), select('area', 'Life area', 'lifeAreas', { list: true, half: true }), rel('goalId', 'Goal', 'goals'), area('description', 'Story')] },

  // ── Knowledge ──────────────────────────────────────────────────────────────────────────────────
  {
    id: 'notes', label: 'Notes', one: 'Note', icon: 'notes', views: ['list', 'gallery', 'table'], archive: true, sort: { k: '_ua', dir: 'desc' },
    fields: [text('title', 'Title'), md('content', 'Content'), rel('notebookId', 'Notebook', 'notebooks', { list: true, half: true }), tags('tags', 'Tags', { list: true }), bool('pinned', 'Pinned', { half: true })],
  },
  { id: 'notebooks', label: 'Notebooks', one: 'Notebook', icon: 'folder', title: 'name', fields: [text('name', 'Name', { req: true }), rel('parentId', 'Inside', 'notebooks'), color('color', 'Colour')] },
  { id: 'noteVersions', label: 'Note versions', one: 'Version', icon: 'history', system: true, fields: [] },
  {
    id: 'journal', label: 'Journal', one: 'Journal entry', icon: 'journal', views: ['list', 'calendar'], date: 'date', sort: { k: 'date', dir: 'desc' },
    fields: [
      date('date', 'Date', { def: '@today', list: true, half: true }),
      select('kind', 'Type', [{ value: 'daily', label: 'Daily journal' }, { value: 'gratitude', label: 'Gratitude' }, { value: 'reflection', label: 'Reflection' }, { value: 'weekly', label: 'Weekly reflection' }, { value: 'monthly', label: 'Monthly reflection' }, { value: 'milestone', label: 'Milestone' }], { def: 'daily', list: true, half: true }),
      { k: 'mood', label: 'Mood', t: 'select', opts: MOODS, list: true, half: true }, bool('private', 'Private', { half: true, help: 'Hidden behind a tap in lists and excluded from search previews.' }),
      text('title', 'Title'), text('prompt', 'Prompt'), area('content', 'Entry'), tags('tags', 'Tags'),
    ],
  },

  // ── Finance ────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'accounts', label: 'Accounts', one: 'Account', icon: 'bank', title: 'name', archive: true, views: ['list', 'table'],
    fields: [text('name', 'Name', { req: true }), select('type', 'Type', ['bank', 'cash', 'card', 'wallet', 'investment'], { def: 'bank', list: true, half: true }), currency({ list: true }), money('openingBalance', 'Opening balance', { def: 0 }), color('color', 'Colour')],
  },
  {
    id: 'transactions', label: 'Transactions', one: 'Transaction', icon: 'wallet', title: 'payee', views: ['table', 'list', 'calendar'], date: 'date', sort: { k: 'date', dir: 'desc' },
    fields: [
      select('type', 'Type', [{ value: 'expense', label: 'Expense', color: C.rose }, { value: 'income', label: 'Income', color: C.green }, { value: 'transfer', label: 'Transfer', color: C.sky }], { def: 'expense', list: true, half: true }),
      money('amount', 'Amount', { req: true, list: true, half: true, min: 0 }), date('date', 'Date', { def: '@today', list: true, half: true }), currency(),
      select('category', 'Category', 'expenseCategories', { list: true, half: true, when: { k: 'type', in: ['expense', 'income'] }, optsKeyWhen: { k: 'type', map: { income: 'incomeCategories' } } }),
      rel('accountId', 'Account', 'accounts', { list: true, half: true }), rel('toAccountId', 'To account', 'accounts', { half: true, when: { k: 'type', in: ['transfer'] } }),
      text('payee', 'Payee / description'), rel('tripId', 'Trip', 'trips', { half: true }), tags('tags', 'Tags'), area('note', 'Note'),
    ],
  },
  { id: 'budgets', label: 'Budgets', one: 'Budget', icon: 'gauge', title: 'category', fields: [select('category', 'Category', 'expenseCategories', { req: true }), money('amount', 'Monthly limit', { req: true, min: 0 }), currency()] },
  {
    id: 'subscriptions', label: 'Subscriptions', one: 'Subscription', icon: 'repeat', title: 'name', views: ['list', 'table', 'calendar'], date: 'nextBillingDate', sort: { k: 'nextBillingDate', dir: 'asc' },
    fields: [
      text('name', 'Service', { req: true }), money('amount', 'Price', { req: true, list: true, half: true, min: 0 }), currency(),
      select('cycle', 'Billing cycle', ['weekly', 'monthly', 'quarterly', 'yearly'], { def: 'monthly', list: true, half: true }), date('nextBillingDate', 'Next renewal', { list: true, half: true }),
      select('status', 'Status', STATUS([['active', 'Active', C.green], ['paused', 'Paused', C.amber], ['cancelled', 'Cancelled', C.slate]]), { def: 'active', list: true, half: true }), num('remindDays', 'Remind days before', { def: 3, half: true, min: 0 }),
      select('category', 'Category', 'expenseCategories', { half: true }), rel('accountId', 'Paid from', 'accounts', { half: true }), url('url', 'Manage link'), notes(),
    ],
  },
  {
    id: 'debts', label: 'Debts & loans', one: 'Debt', icon: 'card', title: 'name', views: ['list', 'table'],
    fields: [text('name', 'Name', { req: true }), select('kind', 'Direction', [{ value: 'owe', label: 'I owe' }, { value: 'owed', label: 'Owed to me' }], { def: 'owe', list: true, half: true }), text('person', 'Lender / person', { half: true }), money('principal', 'Original amount', { half: true, min: 0 }), money('balance', 'Balance left', { req: true, list: true, half: true, min: 0 }), num('rate', 'Interest rate', { unit: '% / year', half: true, min: 0 }), money('payment', 'Monthly payment', { half: true, min: 0 }), date('dueDate', 'Due date', { list: true, half: true }), currency(), notes()],
  },
  { id: 'savingsGoals', label: 'Savings goals', one: 'Savings goal', icon: 'piggy', title: 'name', views: ['gallery', 'list'], fields: [text('name', 'Saving for', { req: true }), money('target', 'Target', { req: true, min: 0, half: true }), money('saved', 'Saved so far', { def: 0, min: 0, half: true }), date('targetDate', 'By', { half: true }), currency(), color('color', 'Colour'), notes()] },

  // ── Learning ───────────────────────────────────────────────────────────────────────────────────
  { id: 'subjects', label: 'Subjects', one: 'Subject', icon: 'book', views: ['gallery', 'list'], fields: [text('title', 'Subject', { req: true }), color('color', 'Colour'), text('teacher', 'Teacher / source'), checklist('syllabus', 'Syllabus topics', { help: 'Tick topics off as you cover them.' }), notes()] },
  {
    id: 'courses', label: 'Courses', one: 'Course', icon: 'learning', views: ['list', 'board', 'table'], board: 'status',
    fields: [text('title', 'Course', { req: true }), rel('parentId', 'Subject', 'subjects', { list: true, half: true }), select('status', 'Status', STATUS([['planned', 'Planned', C.slate], ['active', 'In progress', C.sky], ['completed', 'Completed', C.green]]), { def: 'active', list: true, half: true }), text('provider', 'Provider', { half: true }), progress('progress', 'Progress'), url('url', 'Link'), notes()],
  },
  {
    id: 'lectures', label: 'Lectures', one: 'Lecture', icon: 'play', views: ['list', 'table'], date: 'date', done: { k: 'status', on: 'done', off: 'todo' },
    fields: [text('title', 'Lecture', { req: true }), rel('parentId', 'Course', 'courses', { list: true, half: true }), date('date', 'Date', { list: true, half: true }), select('status', 'Status', STATUS([['todo', 'To watch', C.slate], ['done', 'Done', C.green], ['review', 'Needs review', C.amber]]), { def: 'todo', list: true, half: true }), num('duration', 'Length', { unit: 'min', half: true, min: 0 }), md('notes', 'Lecture notes')],
  },
  { id: 'decks', label: 'Decks', one: 'Deck', icon: 'layers', fields: [text('title', 'Deck', { req: true }), rel('parentId', 'Subject', 'subjects'), area('description', 'Description')] },
  { id: 'flashcards', label: 'Flashcards', one: 'Flashcard', icon: 'copy', views: ['list', 'table'], fields: [area('title', 'Front', { req: true }), area('back', 'Back', { req: true }), rel('parentId', 'Deck', 'decks', { list: true }), tags('tags', 'Tags')] },
  {
    id: 'assignments', label: 'Assignments', one: 'Assignment', icon: 'file', views: ['list', 'board', 'table', 'calendar'], board: 'status', date: 'dueAt', done: { k: 'status', on: 'submitted', off: 'todo' }, sort: { k: 'dueAt', dir: 'asc' },
    fields: [text('title', 'Assignment', { req: true }), rel('parentId', 'Subject', 'subjects', { list: true, half: true }), date('dueAt', 'Due', { list: true, half: true }), select('status', 'Status', STATUS([['todo', 'To do', C.slate], ['doing', 'Working', C.sky], ['submitted', 'Submitted', C.green], ['graded', 'Graded', C.violet]]), { def: 'todo', list: true, half: true }), text('grade', 'Grade', { half: true }), notes()],
  },
  { id: 'exams', label: 'Exams', one: 'Exam', icon: 'alarm', views: ['list', 'calendar'], date: 'dueAt', sort: { k: 'dueAt', dir: 'asc' }, fields: [text('title', 'Exam', { req: true }), rel('parentId', 'Subject', 'subjects', { list: true, half: true }), date('dueAt', 'Date', { req: true, list: true, half: true, timeOptional: true }), text('location', 'Location'), checklist('syllabus', 'Syllabus to revise'), notes()] },
  {
    id: 'readings', label: 'Reading list', one: 'Reading', icon: 'bookmark', views: ['list', 'board', 'table'], board: 'status',
    fields: [text('title', 'Title', { req: true }), text('author', 'Author', { list: true, half: true }), rel('parentId', 'Subject', 'subjects', { half: true }), select('status', 'Status', STATUS([['to-read', 'To read', C.slate], ['reading', 'Reading', C.sky], ['finished', 'Finished', C.green]]), { def: 'to-read', list: true, half: true }), num('pages', 'Pages', { half: true, min: 0 }), num('currentPage', 'Current page', { half: true, min: 0 }), url('url', 'Link'), notes()],
  },
  { id: 'studySessions', label: 'Study sessions', one: 'Study session', icon: 'timer', views: ['table', 'list'], date: 'date', sort: { k: 'date', dir: 'desc' }, fields: [text('title', 'What did you study?'), rel('parentId', 'Subject', 'subjects', { list: true, half: true }), date('date', 'Date', { def: '@today', list: true, half: true }), num('minutes', 'Minutes', { req: true, list: true, min: 0, unit: 'min' }), notes()] },
  { id: 'questions', label: 'Practice questions', one: 'Question', icon: 'idea', views: ['list', 'table'], fields: [area('title', 'Question', { req: true }), area('answer', 'Answer', { req: true }), rel('parentId', 'Subject', 'subjects', { list: true, half: true }), select('difficulty', 'Difficulty', ['easy', 'medium', 'hard'], { def: 'medium', list: true, half: true })] },

  // ── Health ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'workouts', label: 'Workouts', one: 'Workout', icon: 'dumbbell', views: ['list', 'calendar', 'table'], date: 'date', sort: { k: 'date', dir: 'desc' },
    fields: [text('title', 'Workout', { req: true, ph: 'e.g. Push day' }), date('date', 'Date', { def: '@today', list: true, half: true }), select('type', 'Type', [{ value: 'workout', label: 'Workout' }, { value: 'rest', label: 'Rest day' }], { def: 'workout', list: true, half: true }), num('minutes', 'Duration', { unit: 'min', list: true, half: true, min: 0 }), rating('feeling', 'How it felt', { half: true }), rel('planId', 'From plan', 'workoutPlans'), sets('sets', 'Exercises'), notes()],
  },
  { id: 'exercises', label: 'Exercise library', one: 'Exercise', icon: 'activity', views: ['list', 'table'], fields: [text('title', 'Exercise', { req: true }), select('muscle', 'Muscle group', 'muscles', { list: true, half: true }), text('equipment', 'Equipment', { list: true, half: true }), notes('Form cues')] },
  { id: 'workoutPlans', label: 'Workout plans', one: 'Workout plan', icon: 'checklist', views: ['gallery', 'list'], fields: [text('title', 'Plan', { req: true }), weekdays('days', 'Training days'), sets('sets', 'Exercises'), notes()] },
  {
    id: 'bodyLogs', label: 'Body measurements', one: 'Measurement', icon: 'gauge', title: 'kind', views: ['table', 'list'], date: 'date', sort: { k: 'date', dir: 'desc' },
    fields: [date('date', 'Date', { def: '@today', list: true, half: true }), select('kind', 'Measurement', [{ value: 'weight', label: 'Weight' }, { value: 'bodyFat', label: 'Body fat' }, { value: 'waist', label: 'Waist' }, { value: 'chest', label: 'Chest' }, { value: 'hips', label: 'Hips' }, { value: 'arm', label: 'Arm' }, { value: 'thigh', label: 'Thigh' }], { def: 'weight', list: true, half: true }), num('value', 'Value', { req: true, list: true, half: true }), text('unit', 'Unit', { def: 'kg', half: true })],
  },
  { id: 'waterLogs', label: 'Water intake', one: 'Water log', icon: 'droplets', system: true, fields: [] },
  { id: 'sleepLogs', label: 'Sleep journal', one: 'Sleep entry', icon: 'moon', title: 'date', views: ['table', 'list', 'calendar'], date: 'date', sort: { k: 'date', dir: 'desc' }, fields: [date('date', 'Night of', { def: '@today', list: true, half: true }), num('value', 'Hours slept', { req: true, list: true, half: true, min: 0, max: 24 }), time('bedtime', 'Bedtime', { half: true }), time('wake', 'Woke up', { half: true }), rating('quality', 'Quality', { list: true }), notes()] },
  { id: 'meals', label: 'Meal journal', one: 'Meal', icon: 'heart', views: ['list', 'table', 'calendar'], date: 'date', sort: { k: 'date', dir: 'desc' }, fields: [text('title', 'What did you eat?', { req: true }), date('date', 'Date', { def: '@today', list: true, half: true }), select('meal', 'Meal', ['breakfast', 'lunch', 'dinner', 'snack'], { def: 'lunch', list: true, half: true }), num('calories', 'Calories', { unit: 'kcal', list: true, half: true, min: 0 }), num('protein', 'Protein', { unit: 'g', half: true, min: 0 }), notes()] },
  { id: 'cardio', label: 'Walks & runs', one: 'Activity', icon: 'trending', title: 'kind', views: ['table', 'list', 'calendar'], date: 'date', sort: { k: 'date', dir: 'desc' }, fields: [select('kind', 'Activity', ['walk', 'run', 'cycle', 'swim', 'hike'], { def: 'walk', list: true, half: true }), date('date', 'Date', { def: '@today', list: true, half: true }), num('value', 'Distance', { unit: 'km', list: true, half: true, min: 0 }), num('minutes', 'Duration', { unit: 'min', list: true, half: true, min: 0 }), num('steps', 'Steps', { half: true, min: 0 }), notes()] },

  // ── Focus ──────────────────────────────────────────────────────────────────────────────────────
  { id: 'focusSessions', label: 'Focus sessions', one: 'Focus session', icon: 'timer', title: 'label', views: ['table', 'list'], date: 'startedAt', sort: { k: 'startedAt', dir: 'desc' }, fields: [text('label', 'Focus on'), datetime('startedAt', 'Started', { list: true, half: true }), num('minutes', 'Minutes', { list: true, half: true, min: 0 }), select('kind', 'Type', ['focus', 'deep', 'break'], { def: 'focus', list: true, half: true }), rel('taskId', 'Task', 'tasks', { half: true })] },
  { id: 'distractions', label: 'Distraction log', one: 'Distraction', icon: 'zap', title: 'text', views: ['list', 'table'], sort: { k: 'at', dir: 'desc' }, fields: [text('text', 'What pulled you away?', { req: true }), datetime('at', 'When', { def: '@now', list: true })] },

  // ── Lifestyle ──────────────────────────────────────────────────────────────────────────────────
  { id: 'shoppingLists', label: 'Shopping lists', one: 'Shopping list', icon: 'cart', title: 'name', fields: [text('name', 'List', { req: true }), select('kind', 'Type', ['groceries', 'general'], { def: 'groceries', half: true }), money('budget', 'Budget', { half: true, min: 0 }), notes()] },
  {
    id: 'shoppingItems', label: 'Shopping items', one: 'Item', icon: 'cart', views: ['list', 'table'], done: { k: 'done', on: true, off: false },
    fields: [text('title', 'Item', { req: true }), rel('listId', 'List', 'shoppingLists', { list: true, half: true }), select('category', 'Aisle', 'shoppingCategories', { list: true, half: true }), num('qty', 'Quantity', { def: 1, half: true, min: 0 }), text('unit', 'Unit', { half: true, ph: 'kg, pack…' }), money('price', 'Est. price', { list: true, half: true, min: 0 }), bool('done', 'Bought', { half: true }), area('notes', 'Price notes')],
  },
  { id: 'wishlist', label: 'Wishlist', one: 'Wish', icon: 'star', views: ['gallery', 'list', 'table'], fields: [text('title', 'Item', { req: true }), money('price', 'Price', { list: true, half: true, min: 0 }), select('priority', 'Want level', ['low', 'medium', 'high'], { def: 'medium', list: true, half: true }), select('status', 'Status', ['wanted', 'purchased'], { def: 'wanted', list: true, half: true }), url('url', 'Link'), area('notes', 'Price notes')] },
  { id: 'purchases', label: 'Purchase history', one: 'Purchase', icon: 'package', views: ['table', 'list'], date: 'date', sort: { k: 'date', dir: 'desc' }, fields: [text('title', 'Item', { req: true }), date('date', 'Bought on', { def: '@today', list: true, half: true }), money('price', 'Price', { list: true, half: true, min: 0 }), text('store', 'Store', { list: true, half: true }), date('warrantyUntil', 'Warranty until', { list: true, half: true }), url('url', 'Receipt / order link'), notes()] },
  {
    id: 'inventory', label: 'Household inventory', one: 'Inventory item', icon: 'boxes', title: 'name', views: ['table', 'list', 'gallery'],
    fields: [text('name', 'Item', { req: true }), num('qty', 'Quantity', { def: 1, list: true, half: true, min: 0 }), text('unit', 'Unit', { half: true }), num('minQty', 'Restock below', { half: true, min: 0, help: 'Flags the item for your shopping list when quantity drops below this.' }), select('location', 'Location', 'inventoryLocations', { list: true, half: true }), money('value', 'Value', { half: true, min: 0 }), date('purchaseDate', 'Purchased', { half: true }), date('warrantyUntil', 'Warranty until', { list: true, half: true }), notes()],
  },
  {
    id: 'trips', label: 'Trips', one: 'Trip', icon: 'plane', title: 'name', views: ['gallery', 'board', 'table'], board: 'status', date: 'startDate', archive: true,
    fields: [text('name', 'Trip', { req: true }), text('destination', 'Destination', { list: true }), date('startDate', 'From', { list: true, half: true }), date('endDate', 'To', { list: true, half: true }), select('status', 'Status', TRIP_STATUSES, { def: 'planned', list: true, half: true }), money('budget', 'Budget', { half: true, min: 0 }), currency(), checklist('packing', 'Packing list'), checklist('documents', 'Documents'), checklist('checklist', 'Before you go'), md('notes', 'Destination notes')],
  },
  { id: 'itinerary', label: 'Itinerary', one: 'Itinerary item', icon: 'map', views: ['list', 'calendar', 'table'], date: 'date', sort: { k: 'date', dir: 'asc' }, fields: [text('title', 'Plan', { req: true }), rel('tripId', 'Trip', 'trips', { list: true, half: true }), datetime('date', 'When', { list: true, half: true }), select('kind', 'Type', ['activity', 'transport', 'stay', 'food'], { def: 'activity', list: true, half: true }), money('cost', 'Cost', { half: true, min: 0 }), text('location', 'Location'), notes()] },
  { id: 'reservations', label: 'Reservations', one: 'Reservation', icon: 'bookmark', views: ['list', 'table'], date: 'startAt', sort: { k: 'startAt', dir: 'asc' }, fields: [text('title', 'Reservation', { req: true }), rel('tripId', 'Trip', 'trips', { list: true, half: true }), select('kind', 'Type', ['flight', 'train', 'bus', 'hotel', 'car', 'activity'], { def: 'flight', list: true, half: true }), text('provider', 'Provider', { half: true }), text('confirmation', 'Confirmation no.', { list: true, half: true }), datetime('startAt', 'From', { list: true, half: true }), datetime('endAt', 'To', { half: true }), money('cost', 'Cost', { half: true, min: 0 }), notes()] },
  { id: 'places', label: 'Saved places', one: 'Place', icon: 'pin', title: 'name', views: ['list', 'gallery', 'table'], done: { k: 'visited', on: true, off: false }, fields: [text('name', 'Place', { req: true }), rel('tripId', 'Trip', 'trips', { list: true, half: true }), select('kind', 'Type', ['sight', 'food', 'stay', 'nature', 'shopping', 'other'], { def: 'sight', list: true, half: true }), text('address', 'Address'), url('url', 'Map link'), rating('rating', 'Rating', { half: true }), bool('visited', 'Visited', { half: true }), notes()] },
  {
    id: 'files', label: 'Documents', one: 'Document', icon: 'file', title: 'name', views: ['table', 'list', 'gallery'], date: 'expiresAt',
    fields: [text('name', 'Document', { req: true }), select('category', 'Category', 'fileCategories', { list: true, half: true }), date('expiresAt', 'Expires', { list: true, half: true }), num('remindDays', 'Remind days before', { def: 30, half: true, min: 0 }), text('reference', 'Where is it kept?', { ph: 'Drawer, cloud folder…', half: true }), url('url', 'Link'), rel('projectId', 'Project', 'projects', { half: true }), rel('tripId', 'Trip', 'trips', { half: true }), file('attachment', 'Attachment', { help: 'Stored on this device only (not uploaded).' }), tags('tags', 'Tags', { list: true }), notes()],
  },
  {
    id: 'media', label: 'Library', one: 'Title', icon: 'film', views: ['gallery', 'board', 'table', 'list'], board: 'status',
    fields: [
      text('title', 'Title', { req: true }), select('kind', 'Type', [{ value: 'movie', label: 'Movie' }, { value: 'series', label: 'Series' }, { value: 'book', label: 'Book' }, { value: 'game', label: 'Game' }, { value: 'podcast', label: 'Podcast' }], { def: 'movie', list: true, half: true }),
      select('status', 'Status', MEDIA_STATUSES, { def: 'backlog', list: true, half: true }), text('creator', 'Author / director / studio', { half: true }), num('year', 'Year', { half: true }),
      num('current', 'Progress', { half: true, min: 0, help: 'Page, episode or hours so far.' }), num('total', 'Out of', { half: true, min: 0 }), rating('rating', 'My rating', { list: true, half: true }), bool('favorite', 'Favourite', { half: true }),
      tags('genre', 'Genres'), text('recommendedBy', 'Recommended by'), date('finishedAt', 'Finished on', { half: true }), area('review', 'Review'),
    ],
  },
  { id: 'bookmarks', label: 'Bookmarks', one: 'Bookmark', icon: 'bookmark', views: ['list', 'table', 'gallery'], fields: [text('title', 'Title', { req: true }), url('url', 'URL', { req: true }), select('folder', 'Folder', 'bookmarkFolders', { list: true, half: true }), bool('favorite', 'Favourite', { half: true }), tags('tags', 'Tags', { list: true }), notes()] },
  { id: 'apps', label: 'Applications', one: 'Application', icon: 'grid', title: 'name', views: ['table', 'list'], fields: [text('name', 'Application', { req: true }), select('platform', 'Platform', ['windows', 'macos', 'linux', 'android', 'ios', 'web'], { list: true, half: true }), select('license', 'Licence', ['free', 'paid', 'subscription'], { def: 'free', list: true, half: true }), text('purpose', 'What I use it for'), area('notes', 'Software notes', { help: 'Settings, shortcuts, how-tos.' })] },
  { id: 'devices', label: 'Devices', one: 'Device', icon: 'phone', title: 'name', views: ['list', 'table', 'gallery'], fields: [text('name', 'Device', { req: true }), select('kind', 'Type', ['phone', 'laptop', 'desktop', 'tablet', 'wearable', 'other'], { def: 'phone', list: true, half: true }), text('brand', 'Brand', { half: true }), text('model', 'Model', { list: true, half: true }), text('serial', 'Serial number', { half: true }), text('os', 'OS version', { half: true }), date('purchaseDate', 'Purchased', { half: true }), date('warrantyUntil', 'Warranty until', { list: true, half: true }), notes()] },
  { id: 'licenses', label: 'Licences', one: 'Licence', icon: 'key', title: 'name', views: ['table', 'list'], date: 'renewalDate', sort: { k: 'renewalDate', dir: 'asc' }, fields: [text('name', 'Licence', { req: true }), text('product', 'Product', { list: true, half: true }), num('seats', 'Seats', { half: true, min: 0 }), date('renewalDate', 'Renews on', { list: true, half: true }), money('cost', 'Cost', { list: true, half: true, min: 0 }), text('keyLocation', 'Where the key is stored', { help: 'Point to your password manager — do not paste the key here.' }), notes()] },
  {
    id: 'digitalAccounts', label: 'Online accounts', one: 'Online account', icon: 'user', title: 'service', views: ['table', 'list'],
    hint: 'An index of where you have accounts. LIFEOS never stores passwords — link to your password manager instead.',
    fields: [text('service', 'Service', { req: true }), text('login', 'Username / e-mail', { list: true, half: true }), select('category', 'Category', 'accountCategories', { list: true, half: true }), url('url', 'Sign-in page'), url('managerLink', 'Password manager link', { help: 'Deep link to this item in your password manager. Passwords are never stored in LIFEOS.' }), bool('twoFactor', 'Two-factor enabled', { list: true }), notes()],
  },
  {
    id: 'dates', label: 'Important dates', one: 'Important date', icon: 'calendarDays', title: 'name', views: ['list', 'table'], date: 'date',
    fields: [text('name', 'Who / what', { req: true }), select('kind', 'Type', ['birthday', 'anniversary', 'renewal', 'other'], { def: 'birthday', list: true, half: true }), date('date', 'Date', { req: true, list: true, half: true }), bool('repeatYearly', 'Repeats every year', { def: true, half: true }), num('remindDays', 'Remind days before', { def: 3, half: true, min: 0 }), notes('Gift ideas / notes')],
  },
  { id: 'contacts', label: 'Contacts', one: 'Contact', icon: 'users', title: 'name', views: ['list', 'table'], fields: [text('name', 'Name', { req: true }), select('relation', 'Relation', ['family', 'friend', 'work', 'service', 'doctor', 'other'], { def: 'friend', list: true, half: true }), bool('emergency', 'Emergency contact', { half: true, list: true }), text('phone', 'Phone', { list: true, half: true }), text('email', 'E-mail', { half: true }), text('address', 'Address'), notes('Important notes')] },
  {
    id: 'maintenance', label: 'Maintenance', one: 'Maintenance item', icon: 'wrench', title: 'name', views: ['list', 'table', 'calendar'], date: 'nextDue', sort: { k: 'nextDue', dir: 'asc' },
    fields: [text('name', 'Job', { req: true, ph: 'e.g. Car service' }), select('kind', 'Type', ['vehicle', 'household', 'other'], { def: 'vehicle', list: true, half: true }), text('asset', 'Vehicle / appliance', { list: true, half: true }), date('lastDone', 'Last done', { half: true }), num('intervalDays', 'Repeat every', { unit: 'days', half: true, min: 0 }), date('nextDue', 'Next due', { list: true, half: true }), money('cost', 'Typical cost', { half: true, min: 0 }), notes()],
  },
  { id: 'checklists', label: 'Checklists', one: 'Checklist', icon: 'checklist', views: ['gallery', 'list'], fields: [text('title', 'Checklist', { req: true }), checklist('items', 'Items'), tags('tags', 'Tags')] },
  { id: 'countdowns', label: 'Countdowns', one: 'Countdown', icon: 'alarm', views: ['gallery', 'list'], date: 'date', fields: [text('title', 'Counting down to', { req: true }), date('date', 'Date', { req: true, timeOptional: true }), color('color', 'Colour')] },

  // ── System ─────────────────────────────────────────────────────────────────────────────────────
  { id: 'workspaces', label: 'Workspaces', one: 'Workspace', icon: 'layers', title: 'name', fields: [text('name', 'Name', { req: true }), color('color', 'Colour')] },
  { id: 'automations', label: 'Automations', one: 'Automation', icon: 'workflow', title: 'name', system: true, fields: [] },
  { id: 'templates', label: 'Templates', one: 'Template', icon: 'copy', title: 'name', system: true, fields: [] },
  { id: 'notifications', label: 'Notifications', one: 'Notification', icon: 'bell', system: true, fields: [] },
  { id: 'activity', label: 'Activity', one: 'Activity', icon: 'activity', title: 'summary', system: true, fields: [] },
  { id: 'dashboards', label: 'Dashboards', one: 'Dashboard', icon: 'dashboard', title: 'name', system: true, fields: [] },
  { id: 'settings', label: 'Settings', one: 'Setting', icon: 'settings', system: true, fields: [] },
  { id: 'modulePrefs', label: 'Module preferences', one: 'Module preference', icon: 'puzzle', system: true, fields: [] },
];

export const COLLECTIONS: Record<string, CollectionDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const collection = (id: string): CollectionDef => COLLECTIONS[id] ?? { id, label: id, one: id, icon: 'file', fields: [], system: true };
export const titleField = (def: CollectionDef): string => def.title ?? (def.fields.some((f) => f.k === 'title') ? 'title' : def.fields.some((f) => f.k === 'name') ? 'name' : def.fields[0]?.k ?? 'title');
export const singular = (id: string): string => collection(id).one;
