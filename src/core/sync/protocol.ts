import type { FieldConflict, Fields } from './merge';

/** A record as it travels between a device and the server. */
export interface WireRecord {
  id: string;
  /** collection name, e.g. "tasks" */
  c: string;
  /** server change counter; the pull cursor */
  seq: number;
  /** created / last modified, epoch milliseconds (device clocks) */
  ca: number;
  ua: number;
  /** all user-visible fields, including `ws` (workspace) and `deletedAt` (tombstone) */
  data: Fields;
}

/** One local change: only the fields that differ from the last synced version. */
export interface Change {
  id: string;
  c: string;
  /** values the changed fields had when last synced; null if this device created the record */
  base: Fields | null;
  patch: Fields;
  ca: number;
  ua: number;
}

export interface WireConflict extends FieldConflict {
  id: string;
  c: string;
}

export interface SyncRequest {
  cursor: number;
  changes: Change[];
}

export interface SyncResponse {
  /** merged server state of every pushed record */
  applied: WireRecord[];
  conflicts: WireConflict[];
  rejected: { id: string; c: string; reason: string }[];
  /** changes from other devices since `cursor` */
  records: WireRecord[];
  cursor: number;
  more: boolean;
}

export const COLLECTION_NAME = /^[a-z][a-zA-Z0-9]{0,39}$/;
export const MAX_CHANGES_PER_PUSH = 200;
export const MAX_RECORD_BYTES = 512 * 1024;
