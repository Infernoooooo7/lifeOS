'use client';

import { useState, type ReactNode } from 'react';
import { navigate } from '@/core/app';
import { collection as collectionDef } from '@/core/collections';
import { getDb } from '@/core/data/db';
import { usePrefs } from '@/core/data/hooks';
import { upsert } from '@/core/data/store';
import { importKeepNotes, importMarkdownNotes, importOfx, importQif, importTodoistCsv, type ImportResult } from '@/core/lib/importers';
import { Icon, type IconName } from '@/ui/icons';
import { Button, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

type Source = 'todoist' | 'keep' | 'markdown' | 'bank';

const SOURCES: { value: Source; label: string; icon: IconName; accept: string; multiple: boolean; how: ReactNode; open: string }[] = [
  {
    value: 'todoist', label: 'Todoist', icon: 'tasks', accept: '.csv,text/csv', multiple: true, open: '/tasks',
    how: <>In Todoist, open a project → ⋯ → <b>Export as a template</b> → <b>Download as CSV file</b>. Choose one or more of those files. Each file becomes a project.</>,
  },
  {
    value: 'keep', label: 'Google Keep', icon: 'sticky', accept: '.json,application/json', multiple: true, open: '/notes',
    how: <>Download Keep from <b>takeout.google.com</b>, unzip it, open <b>Takeout/Keep</b> and select all the <b>.json</b> files. Checklists, labels, pins and archived notes come across; the trash does not.</>,
  },
  {
    value: 'markdown', label: 'Markdown', icon: 'notes', accept: '.md,.markdown,.txt,text/markdown,text/plain', multiple: true, open: '/notes',
    how: <>From Notion (Export → Markdown &amp; CSV, then unzip), Obsidian, Bear or any folder of <b>.md</b> files. Titles and tags in front matter are kept.</>,
  },
  {
    value: 'bank', label: 'Bank statement', icon: 'bank', accept: '.ofx,.qfx,.qif', multiple: true, open: '/finance/transactions',
    how: <>Download a statement from your bank’s website as <b>OFX</b>, <b>QFX</b> or <b>QIF</b>. Each line becomes a transaction with a suggested category; downloading an overlapping period again is safe.</>,
  },
];

interface Preview {
  result: ImportResult;
  existing: Set<string>;
  files: number;
}

export function AppImport() {
  const [prefs] = usePrefs();
  const [source, setSource] = useState<Source>('todoist');
  const [order, setOrder] = useState<'dmy' | 'mdy'>(prefs.dateStyle === 'mdy' ? 'mdy' : 'dmy');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const def = SOURCES.find((s) => s.value === source)!;

  const read = async (list: FileList) => {
    const files = await Promise.all([...list].map(async (f) => ({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, text: await f.text() })));
    let result: ImportResult = { records: [], warnings: [] };
    if (source === 'todoist') {
      for (const f of files) {
        const r = importTodoistCsv(f.text, f.name.replace(/^.*[\\/]/, ''));
        result = { records: [...result.records, ...r.records], warnings: [...result.warnings, ...r.warnings.map((w) => (files.length > 1 ? `${f.name}: ${w}` : w))] };
      }
    } else if (source === 'keep') result = importKeepNotes(files);
    else if (source === 'markdown') result = importMarkdownNotes(files);
    else {
      for (const f of files) {
        const r = /\.qif$/i.test(f.name) ? importQif(f.text, order) : importOfx(f.text);
        result = { records: [...result.records, ...r.records], warnings: [...result.warnings, ...r.warnings] };
      }
    }
    const found = await getDb().records.bulkGet(result.records.map((r) => r.id));
    setPreview({ result, existing: new Set(found.filter((r) => r && !r.deletedAt).map((r) => r!.id)), files: files.length });
  };

  const run = async () => {
    if (!preview) return;
    setBusy(true);
    let written = 0;
    try {
      for (const r of preview.result.records) {
        if (preview.existing.has(r.id) && !updateExisting) continue;
        await upsert(r.collection, r.id, r.data, { silent: true });
        written++;
      }
      toast(`Imported ${written} item${written === 1 ? '' : 's'} from ${def.label}`, { tone: 'good', action: { label: 'Open', run: () => navigate(def.open) } });
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const counts = new Map<string, { total: number; existing: number }>();
  for (const r of preview?.result.records ?? []) {
    const c = counts.get(r.collection) ?? { total: 0, existing: 0 };
    c.total++;
    if (preview!.existing.has(r.id)) c.existing++;
    counts.set(r.collection, c);
  }
  const newCount = preview ? preview.result.records.filter((r) => !preview.existing.has(r.id)).length : 0;
  const existingCount = preview ? preview.result.records.length - newCount : 0;
  const willWrite = newCount + (updateExisting ? existingCount : 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Bring your tasks, notes and bank transactions with you. Files are read on this device; nothing is uploaded except through your normal sync.</p>
      <div role="radiogroup" aria-label="Import from" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SOURCES.map((s) => (
          <button
            key={s.value} type="button" role="radio" aria-checked={source === s.value} onClick={() => { setSource(s.value); setPreview(null); }}
            className={cx('glass flex items-center gap-2 !rounded-[14px] px-3 py-2.5 text-left text-sm font-medium', source === s.value && '!border-accent !bg-accent-soft')}
          >
            <Icon name={s.icon} size={17} className="flex-none text-accent" />{s.label}
          </button>
        ))}
      </div>
      <p className="text-sm">{def.how}</p>
      {source === 'bank' && (
        <label className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Dates in QIF files are written</span>
          <select className="input !w-auto" aria-label="QIF date order" value={order} onChange={(e) => { setOrder(e.target.value as 'dmy' | 'mdy'); setPreview(null); }}>
            <option value="dmy">day/month/year</option><option value="mdy">month/day/year</option>
          </select>
        </label>
      )}
      {!preview ? (
        <input key={source + order} type="file" className="input" aria-label={`${def.label} files`} accept={def.accept} multiple={def.multiple} onChange={(e) => e.target.files?.length && void read(e.target.files)} />
      ) : (
        <div className="space-y-3 rounded-xl border border-line p-3">
          {preview.result.records.length === 0 ? (
            <p className="text-sm">Nothing to import was found in {preview.files === 1 ? 'that file' : `those ${preview.files} files`}.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {[...counts].map(([c, v]) => (
                <li key={c} className="flex items-center gap-2"><Icon name={collectionDef(c).icon} size={15} className="text-accent" /><b>{v.total}</b> {(v.total === 1 ? collectionDef(c).one : collectionDef(c).label).toLowerCase()}{v.existing ? <span className="text-muted"> · {v.existing} already imported</span> : null}</li>
              ))}
            </ul>
          )}
          {preview.result.warnings.length > 0 && <ul className="space-y-1 text-sm text-warn">{preview.result.warnings.map((w) => <li key={w} className="flex gap-2"><Icon name="info" size={15} className="mt-0.5 flex-none" />{w}</li>)}</ul>}
          {existingCount > 0 && (
            <label className={cx('flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-sm', updateExisting ? 'border-accent bg-accent-soft' : 'border-line')}>
              <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              <span><b>Update the {existingCount} already imported</b><span className="block text-muted">Off: they are left exactly as they are now, including any changes you made after the last import.</span></span>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setPreview(null)}>Choose other files</Button>
            <Button variant="primary" icon="download" disabled={busy || willWrite === 0} onClick={() => void run()}>{willWrite === 0 ? 'Nothing new to import' : `Import ${willWrite} item${willWrite === 1 ? '' : 's'}`}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
