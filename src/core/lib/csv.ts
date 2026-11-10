/** RFC 4180 CSV: quoted fields, escaped quotes, embedded newlines, CRLF or LF. */

export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

/** Parse with a header row into objects keyed by (trimmed) header. */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function cell(value: unknown): string {
  if (value == null) return '';
  let s = Array.isArray(value) ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('; ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Neutralise spreadsheet formula injection in exported data.
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...rows.reduce((set, r) => (Object.keys(r).forEach((k) => set.add(k)), set), new Set<string>())];
  return [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

/** Tolerant number parsing for imported amounts: "₹1,499.50", "(200)", "-45". */
export function parseAmount(text: string): number | null {
  const negative = /^\(.*\)$/.test(text.trim()) || /^-/.test(text.trim());
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}
