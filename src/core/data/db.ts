import Dexie, { type Table } from 'dexie';
import type { Fields } from '@/core/sync/merge';

/**
 * A record as stored on the device. User fields are flat on the object; bookkeeping keys start
 * with an underscore and never leave the device as data.
 */
export interface Rec {
  id: string;
  /** collection */
  _c: string;
  /** created / modified (epoch ms) */
  _ca: number;
  _ua: number;
  /** 1 while there are changes the server has not acknowledged */
  _dirty?: 1;
  /** last synced version, kept while dirty (null: created on this device) */
  _base?: Fields | null;
  _seq?: number;
  /** lower-cased text for universal search */
  _s?: string;
  /** set when the server refused this record */
  _rejected?: string;
  ws?: string;
  deletedAt?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
}

export interface ConflictRow {
  key?: number;
  id: string;
  c: string;
  field: string;
  kept: unknown;
  discarded: unknown;
  /** whose value was discarded */
  loser: 'local' | 'remote';
  at: number;
  resolved?: 1;
}

export interface BlobRow {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
}

export class LifeDB extends Dexie {
  records!: Table<Rec, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  conflicts!: Table<ConflictRow, number>;
  blobs!: Table<BlobRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: 'id, _c, [_c+ws], _dirty, _ua',
      meta: 'key',
      conflicts: '++key, id, at',
      blobs: 'id',
    });
  }
}

let current: LifeDB | null = null;

/** One database per identity, so accounts sharing a browser never see each other's data. */
export const dbNameFor = (identity: { mode: 'local' } | { mode: 'account'; userId: string }) =>
  identity.mode === 'local' ? 'lifeos-local' : `lifeos-${identity.userId}`;

export function openDb(name: string): LifeDB {
  if (current?.name === name) return current;
  current?.close();
  current = new LifeDB(name);
  return current;
}

export function getDb(): LifeDB {
  if (!current) throw new Error('Database is not open yet');
  return current;
}

export const hasDb = () => current !== null;

/** Point the data layer at a specific database instance (tests simulate several devices this way). */
export const setDb = (db: LifeDB) => {
  current = db;
};

/** User-visible fields of a record (what is synced). */
export function fieldsOf(rec: Rec): Fields {
  const out: Fields = {};
  for (const key of Object.keys(rec)) if (key !== 'id' && key[0] !== '_') out[key] = rec[key];
  return out;
}

/** Search text: every string value (and string arrays) of the record, lower-cased and bounded. */
export function searchText(fields: Fields): string {
  const parts: string[] = [];
  let size = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'ws' || key === 'deletedAt' || key.endsWith('Id') || key === 'color') continue;
    const add = (s: string) => {
      if (size > 6000) return;
      parts.push(s);
      size += s.length;
    };
    if (typeof value === 'string') add(value);
    else if (Array.isArray(value)) for (const v of value) if (typeof v === 'string') add(v);
  }
  return parts.join(' \n ').toLowerCase().slice(0, 8000);
}
