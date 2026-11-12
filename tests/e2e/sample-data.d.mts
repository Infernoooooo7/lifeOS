export interface SampleBackup {
  format: 'lifeos-backup';
  version: number;
  exportedAt: string;
  app: string;
  counts: Record<string, number>;
  records: { id: string; c: string; ca: number; ua: number; data: Record<string, unknown> }[];
}
export function sampleBackup(now?: Date): SampleBackup;
