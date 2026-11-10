'use client';

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Icon, type IconName } from './icons';
import { Button, Sheet, cx } from './kit';

interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'good' | 'bad';
  action?: { label: string; run: () => void };
  icon?: IconName;
}
interface DialogRequest {
  kind: 'confirm' | 'prompt';
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  initial?: string;
  placeholder?: string;
  multiline?: boolean;
  resolve: (value: boolean | string | null) => void;
}

const useOverlays = create<{ toasts: Toast[]; dialog: DialogRequest | null }>(() => ({ toasts: [], dialog: null }));
let nextId = 1;

/** Transient message. `action` adds a button (for example Undo). */
export function toast(message: string, opts: Omit<Toast, 'id' | 'message'> & { duration?: number } = {}): void {
  const id = nextId++;
  useOverlays.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, ...opts }] }));
  setTimeout(() => useOverlays.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), opts.duration ?? (opts.action ? 7000 : 3500));
}

export function confirmDialog(opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useOverlays.setState({ dialog: { kind: 'confirm', ...opts, resolve: (v) => resolve(v === true) } }));
}

export function promptDialog(opts: { title: string; body?: string; initial?: string; placeholder?: string; confirmLabel?: string; multiline?: boolean }): Promise<string | null> {
  return new Promise((resolve) => useOverlays.setState({ dialog: { kind: 'prompt', ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) } }));
}

function DialogHost() {
  const dialog = useOverlays((s) => s.dialog);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    setValue(dialog?.initial ?? '');
    if (dialog?.kind === 'prompt') setTimeout(() => input.current?.focus(), 30);
  }, [dialog]);
  if (!dialog) return null;
  const done = (result: boolean | string | null) => {
    useOverlays.setState({ dialog: null });
    dialog.resolve(result);
  };
  const submit = () => done(dialog.kind === 'prompt' ? value : true);
  return (
    <Sheet
      open onClose={() => done(dialog.kind === 'prompt' ? null : false)} title={dialog.title} width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(dialog.kind === 'prompt' ? null : false)}>Cancel</Button>
          <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={submit}>{dialog.confirmLabel ?? (dialog.kind === 'prompt' ? 'Save' : 'Confirm')}</Button>
        </>
      }
    >
      {dialog.body && <p className="whitespace-pre-line text-[0.93rem] text-muted">{dialog.body}</p>}
      {dialog.kind === 'prompt' &&
        (dialog.multiline ? (
          <textarea ref={input} className="input mt-3 min-h-28" value={value} placeholder={dialog.placeholder} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <input ref={input} className="input mt-3" value={value} placeholder={dialog.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        ))}
    </Sheet>
  );
}

export function OverlayHost() {
  const toasts = useOverlays((s) => s.toasts);
  return (
    <>
      <DialogHost />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={cx('panel pointer-events-auto flex max-w-full items-center gap-3 px-4 py-2.5 text-[0.9rem] fade-up', t.tone === 'bad' && '!border-bad/40')}>
            <Icon name={t.icon ?? (t.tone === 'bad' ? 'warning' : t.tone === 'good' ? 'checkCircle' : 'info')} size={17} className={t.tone === 'bad' ? 'text-bad' : t.tone === 'good' ? 'text-good' : 'text-accent'} />
            <span className="min-w-0 break-words">{t.message}</span>
            {t.action && (
              <button
                className="flex-none font-semibold text-accent" type="button"
                onClick={() => {
                  t.action!.run();
                  useOverlays.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
