import type { Fields } from '@/core/sync/merge';
import { same } from '@/core/sync/merge';
import { Prisma } from '@/generated/prisma/client';

/**
 * Mapping between client collections and database tables.
 *
 * A typed table is a queryable projection of the record: declared columns are coerced into real
 * column types, everything else is preserved in `extra`. If coercion would change a value (for
 * instance a date-only string stored in a timestamp column) the original is kept in `extra._raw`, and
 * a reference to a row that has not arrived yet is parked in `extra._ref` — so a record always
 * round-trips byte-for-byte no matter what a device sends.
 */

export type ColType = 'string' | 'int' | 'float' | 'bool' | 'date' | 'strings' | 'json' | 'decimal';
export interface RefCol {
  ref: ModelName;
}
export type Col = ColType | RefCol;

export type ModelName =
  | 'workspace' | 'userSetting' | 'modulePreference' | 'project' | 'goal' | 'task' | 'event' | 'habit' | 'habitLog'
  | 'note' | 'transaction' | 'budget' | 'studyRecord' | 'fitnessRecord' | 'fileRecord' | 'notification'
  | 'automation' | 'template' | 'activityLog' | 'record';

export interface ModelCfg {
  cols: Record<string, Col>;
  /** column that stores the collection name when several collections share the table */
  discriminator?: 'kind' | 'collection';
}

export const MODELS: Record<ModelName, ModelCfg> = {
  workspace: { cols: { name: 'string', color: 'string', icon: 'string', position: 'float' } },
  userSetting: { cols: { value: 'json' } },
  modulePreference: { cols: { moduleId: 'string', enabled: 'bool', favorite: 'bool', position: 'float', lastUsedAt: 'date' } },
  project: {
    cols: { name: 'string', description: 'string', status: 'string', color: 'string', startAt: 'date', dueAt: 'date', archived: 'bool', parentId: { ref: 'project' } },
  },
  goal: {
    cols: { title: 'string', description: 'string', kind: 'string', status: 'string', progress: 'float', targetDate: 'date', archived: 'bool', parentId: { ref: 'goal' } },
  },
  task: {
    cols: {
      title: 'string', notes: 'string', status: 'string', priority: 'int', dueAt: 'date', startAt: 'date', completedAt: 'date',
      tags: 'strings', dependsOn: 'strings', recurrence: 'json', position: 'float', estimateMin: 'int', archived: 'bool',
      projectId: { ref: 'project' }, parentId: { ref: 'task' }, goalId: { ref: 'goal' },
    },
  },
  event: {
    cols: {
      title: 'string', description: 'string', startAt: 'date', endAt: 'date', allDay: 'bool', calendarId: 'string', location: 'string',
      category: 'string', timezone: 'string', recurrence: 'json', reminders: 'json',
    },
  },
  habit: {
    cols: { name: 'string', description: 'string', cadence: 'string', target: 'float', unit: 'string', category: 'string', color: 'string', reminderAt: 'string', archived: 'bool' },
  },
  habitLog: { cols: { habitId: { ref: 'habit' }, date: 'string', value: 'float', note: 'string' } },
  note: { cols: { title: 'string', content: 'string', kind: 'string', notebookId: 'string', tags: 'strings', pinned: 'bool', archived: 'bool' } },
  transaction: {
    cols: {
      type: 'string', amount: 'decimal', currency: 'string', category: 'string', accountId: 'string', toAccountId: 'string',
      date: 'date', payee: 'string', note: 'string', tags: 'strings',
    },
  },
  budget: { cols: { category: 'string', period: 'string', amount: 'decimal', currency: 'string' } },
  studyRecord: { cols: { title: 'string', parentId: 'string', status: 'string', dueAt: 'date' }, discriminator: 'kind' },
  fitnessRecord: { cols: { title: 'string', date: 'date', value: 'float', unit: 'string' }, discriminator: 'kind' },
  fileRecord: { cols: { name: 'string', mime: 'string', size: 'int', category: 'string', tags: 'strings', expiresAt: 'date', storage: 'string' } },
  notification: { cols: { title: 'string', body: 'string', kind: 'string', source: 'string', sourceId: 'string', dueAt: 'date', readAt: 'date' } },
  automation: { cols: { name: 'string', enabled: 'bool', trigger: 'json', conditions: 'json', actions: 'json', lastRunAt: 'date', runCount: 'int' } },
  template: { cols: { kind: 'string', name: 'string', payload: 'json' } },
  activityLog: { cols: { action: 'string', collection: 'string', recordId: 'string', summary: 'string', at: 'date' } },
  record: { cols: {}, discriminator: 'collection' },
};

/** Tables are written in this order so that referenced rows exist before the rows that point at them. */
export const MODEL_ORDER: ModelName[] = [
  'workspace', 'userSetting', 'modulePreference', 'project', 'goal', 'habit', 'task', 'habitLog', 'event', 'note',
  'transaction', 'budget', 'studyRecord', 'fitnessRecord', 'fileRecord', 'notification', 'automation', 'template',
  'activityLog', 'record',
];

const DIRECT: Record<string, ModelName> = {
  workspaces: 'workspace', settings: 'userSetting', modulePrefs: 'modulePreference', projects: 'project', goals: 'goal',
  tasks: 'task', events: 'event', habits: 'habit', habitLogs: 'habitLog', notes: 'note', transactions: 'transaction',
  budgets: 'budget', files: 'fileRecord', notifications: 'notification', automations: 'automation', templates: 'template',
  activity: 'activityLog',
};
const STUDY = ['subjects', 'courses', 'lectures', 'decks', 'flashcards', 'assignments', 'exams', 'readings', 'studySessions', 'questions'];
const FITNESS = ['workouts', 'exercises', 'workoutPlans', 'bodyLogs', 'waterLogs', 'sleepLogs', 'meals', 'cardio'];

/** Any other well-formed collection name lands in the document table — new modules need no migration. */
export function modelFor(collection: string): ModelName {
  if (DIRECT[collection]) return DIRECT[collection];
  if (STUDY.includes(collection)) return 'studyRecord';
  if (FITNESS.includes(collection)) return 'fitnessRecord';
  return 'record';
}

const COLLECTION_OF: Partial<Record<ModelName, string>> = Object.fromEntries(Object.entries(DIRECT).map(([c, m]) => [m, c]));

const NON_NULL_DEFAULTS: Record<ColType, unknown> = { string: '', int: 0, float: 0, bool: false, date: null, strings: [], json: null, decimal: 0 };

/** Columns that are NOT NULL in the schema (they have defaults) — a nil client value falls back to the default. */
const NULLABLE = new Set([
  'color', 'icon', 'lastUsedAt', 'startAt', 'dueAt', 'targetDate', 'completedAt', 'recurrence', 'estimateMin', 'endAt', 'calendarId',
  'category', 'timezone', 'reminders', 'unit', 'reminderAt', 'notebookId', 'accountId', 'toAccountId', 'date', 'status', 'value',
  'mime', 'expiresAt', 'source', 'sourceId', 'readAt', 'recordId', 'parentId', 'projectId', 'goalId', 'habitId',
]);
// A few names are nullable in one table and required in another.
const REQUIRED_OVERRIDES: Partial<Record<ModelName, string[]>> = {
  project: ['status'], goal: ['status'], task: ['status'], habitLog: ['date', 'value'], budget: ['category'],
};

function nullable(model: ModelName, col: string): boolean {
  if (REQUIRED_OVERRIDES[model]?.includes(col)) return false;
  return NULLABLE.has(col);
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(v as string | number);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y < 1 || y > 9999 ? null : d;
}

function coerce(type: ColType, v: unknown): unknown {
  if (v == null || v === '') return null;
  switch (type) {
    case 'string':
      return typeof v === 'string' ? v.replace(/\u0000/g, '') : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
    case 'int': {
      const n = Number(v);
      return Number.isFinite(n) && Math.abs(n) < 2 ** 31 ? Math.trunc(n) : null;
    }
    case 'float': {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case 'decimal': {
      const n = Number(v);
      return Number.isFinite(n) && Math.abs(n) < 1e13 ? Math.round(n * 100) / 100 : null;
    }
    case 'bool':
      return typeof v === 'boolean' ? v : null;
    case 'date':
      return toDate(v);
    case 'strings':
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v.map((x: string) => x.replace(/\u0000/g, '')) : null;
    case 'json':
      return v;
  }
}

function serialize(type: ColType, v: unknown): unknown {
  if (v == null) return null;
  if (type === 'date') return (v as Date).toISOString();
  if (type === 'decimal') return Number(v);
  return v;
}

export interface RowLike {
  id: string;
  workspaceId: string | null;
  seq: bigint;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  extra: unknown;
  [col: string]: unknown;
}

/** Database row → client fields. */
export function fromRow(model: ModelName, row: RowLike): { c: string; data: Fields } {
  const cfg = MODELS[model];
  const extra = { ...((row.extra as Fields) ?? {}) };
  const raw = (extra._raw as Fields) ?? {};
  const refs = (extra._ref as Fields) ?? {};
  const unset = new Set((extra._unset as string[]) ?? []);
  delete extra._raw;
  delete extra._ref;
  delete extra._unset;
  const data: Fields = { ...extra };
  for (const [col, def] of Object.entries(cfg.cols)) {
    if (unset.has(col)) continue;
    const value = typeof def === 'string' ? serialize(def, row[col]) : row[col];
    if (col in raw) data[col] = raw[col];
    else if (col in refs) data[col] = refs[col];
    else if (value != null) data[col] = value;
  }
  if (row.workspaceId) data.ws = row.workspaceId;
  if (row.deletedAt) data.deletedAt = row.deletedAt.toISOString();
  const c = cfg.discriminator ? String(row[cfg.discriminator]) : (COLLECTION_OF[model] as string);
  return { c, data };
}

/**
 * Client fields → column values. `refExists(model, id)` answers whether a referenced row is present
 * for this user; missing references are parked in `extra._ref` instead of violating a foreign key.
 */
export function toRow(
  model: ModelName,
  collection: string,
  data: Fields,
  refExists: (model: ModelName, id: string) => boolean,
): Record<string, unknown> {
  const cfg = MODELS[model];
  const row: Record<string, unknown> = {};
  const extra: Fields = {};
  const raw: Fields = {};
  const refs: Fields = {};
  const unset: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'ws' || key === 'deletedAt' || key === 'id' || key.startsWith('_')) continue;
    if (!(key in cfg.cols) && value !== undefined && value !== null) extra[key] = value;
  }
  for (const [col, def] of Object.entries(cfg.cols)) {
    const value = data[col];
    if (typeof def !== 'string') {
      const id = typeof value === 'string' && value ? value : null;
      if (id && refExists(def.ref, id)) row[col] = id;
      else {
        row[col] = null;
        if (value != null && value !== '') refs[col] = value;
      }
      continue;
    }
    const coerced = coerce(def, value);
    if (coerced == null) {
      if (value != null && value !== '') raw[col] = value;
      if (nullable(model, col)) row[col] = def === 'json' ? Prisma.DbNull : null;
      else {
        // NOT NULL column the device left unset: store the column default, remember that it was unset.
        row[col] = def === 'json' ? (col === 'conditions' || col === 'actions' ? [] : {}) : def === 'date' ? new Date() : NON_NULL_DEFAULTS[def];
        if (!(col in raw)) unset.push(col);
      }
    } else {
      row[col] = coerced;
      if (!same(serialize(def, coerced), value)) raw[col] = value;
    }
  }
  if (Object.keys(raw).length) extra._raw = raw;
  if (Object.keys(refs).length) extra._ref = refs;
  if (unset.length) extra._unset = unset;
  row.extra = extra;
  row.workspaceId = typeof data.ws === 'string' && data.ws ? data.ws.slice(0, 64) : null;
  row.deletedAt = toDate(data.deletedAt);
  if (cfg.discriminator) row[cfg.discriminator] = collection;
  return row;
}
