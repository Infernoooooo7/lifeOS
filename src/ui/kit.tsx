'use client';

import clsx, { type ClassValue } from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';

export const cx = (...values: ClassValue[]) => clsx(values);

// ── Buttons ───────────────────────────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName;
}
export function Button({ variant = 'default', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx('btn', variant === 'primary' && 'btn-primary', variant === 'ghost' && 'btn-ghost', variant === 'danger' && 'btn-danger', size === 'sm' && 'btn-sm', className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: number;
}
export function IconButton({ icon, label, active, size = 18, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} aria-pressed={active} className={cx('icon-btn', active && 'bg-accent-soft !text-accent', className)} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────────────────────────

export function Field({ label, hint, children, className }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block min-w-0', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 flex-none rounded-full border transition-colors', checked ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-3')}
    >
      <span className={cx('absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function Checkbox({ checked, onChange, label, color }: { checked: boolean; onChange: (v: boolean) => void; label: string; color?: string }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="grid size-11 flex-none place-items-center -m-2.5"
    >
      <span
        className={cx('grid size-[21px] place-items-center rounded-[7px] border-2 transition-all', checked ? 'border-transparent text-accent-ink' : 'border-line-strong hover:border-accent')}
        style={checked ? { background: color ?? 'var(--accent)' } : color ? { borderColor: color } : undefined}
      >
        {checked && <Icon name="check" size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

export interface Option<T extends string = string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[11px] border border-line bg-surface p-0.5 no-scrollbar">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.label} title={o.label} onClick={() => onChange(o.value)}
          className={cx('inline-flex flex-none items-center gap-1.5 rounded-[9px] px-2.5 text-[0.83rem] font-medium transition-colors', size === 'sm' ? 'h-7' : 'h-8 pointer-coarse:h-10', value === o.value ? 'bg-surface-3 text-text shadow-sm' : 'text-muted hover:text-text')}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          <span className={cx(o.icon && 'max-sm:sr-only')}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: (Option<T> & { count?: number })[]; className?: string }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-line no-scrollbar', className)}>
      {tabs.map((t) => (
        <button
          key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('relative inline-flex h-11 flex-none items-center gap-2 px-3 text-[0.9rem] font-medium transition-colors', value === t.value ? 'text-text' : 'text-muted hover:text-text')}
        >
          {t.icon && <Icon name={t.icon} size={16} />}
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="chip h-5 px-1.5 text-[0.68rem]">{t.count}</span>}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

// ── Sheet (modal dialog / bottom sheet) ───────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** slide-over panel on desktop */
  side?: boolean;
  /** full-screen on phones */
  full?: boolean;
  width?: number;
  actions?: ReactNode;
  label?: string;
}

/**
 * Built on the native <dialog>: focus trapping, Escape handling and the top layer come from the
 * platform. It renders as a centred dialog or slide-over on desktop and as a bottom sheet on phones.
 */
export function Sheet({ open, onClose, title, children, footer, side, full, width, actions, label }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref} className={cx('sheet', side && 'side', full && 'full')} style={width ? ({ '--sheet-w': `${width}px` } as CSSProperties) : undefined}
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="panel">
        {(title || actions) && (
          <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-2.5 sm:px-5">
            <h2 className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold">{title}</h2>
            {actions}
            <IconButton icon="x" label="Close" onClick={onClose} />
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && <footer className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</footer>}
      </div>
    </dialog>
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────────────────────────

export interface MenuItem {
  label: string;
  icon?: IconName;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  hint?: string;
}

export function Menu({ trigger, items, align = 'end', label }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode; items: MenuItem[]; align?: 'start' | 'end'; label?: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });

  const place = useCallback(() => {
    if (!anchor.current || !panel.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'end' ? a.right - p.width : a.left;
    left = Math.max(8, Math.min(left, vw - p.width - 8));
    const below = a.bottom + 6;
    const top = below + p.height > vh - 8 ? Math.max(8, a.top - p.height - 6) : below;
    setPos({ left, top, visibility: 'visible' });
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (panel.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    // The menu follows its trigger when the page scrolls or resizes instead of vanishing.
    const follow = (e: Event) => {
      if (e.target instanceof Node && panel.current?.contains(e.target)) return;
      place();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open, place]);

  // Menus opened from inside a <dialog> must render inside it to stay in the top layer.
  const host = open ? (anchor.current?.closest('dialog') ?? document.body) : null;
  return (
    <span ref={anchor} className="inline-flex">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && host &&
        createPortal(
          <div ref={panel} role="menu" aria-label={label} style={pos} className="panel fixed z-[80] max-h-[70dvh] min-w-48 max-w-[min(20rem,calc(100vw-16px))] overflow-y-auto p-1.5 fade-up">
            {items.map((item, i) =>
              item.separator ? (
                <div key={i} className="my-1 h-px bg-line" />
              ) : (
                <button
                  key={i} role="menuitem" type="button" disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                  className={cx('flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.9rem] hover:bg-surface-2 pointer-coarse:min-h-11', item.danger && 'text-bad')}
                >
                  {item.icon && <Icon name={item.icon} size={16} className={item.danger ? '' : 'text-muted'} />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-faint">{item.hint}</span>}
                  {item.checked && <Icon name="check" size={15} className="text-accent" />}
                </button>
              ),
            )}
          </div>,
          host,
        )}
    </span>
  );
}

// ── Display ───────────────────────────────────────────────────────────────────────────────────────

export function Empty({ icon = 'inbox', title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
        <Icon name={icon} size={22} />
      </span>
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Progress({ value, color, className, label }: { value: number; color?: string; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'} className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }} />
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 5, color, children, label }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="relative grid flex-none place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: IconName; tone?: 'good' | 'bad' | 'warn' | 'accent'; onClick?: () => void }) {
  const color = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : tone === 'accent' ? 'var(--accent)' : undefined;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('card min-w-0 text-left', onClick && 'card-hover')}>
      <div className="flex items-center gap-2 text-[0.8rem] text-muted">
        {icon && <Icon name={icon} size={15} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="num mt-1.5 truncate text-[1.55rem] font-semibold leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-faint">{sub}</div>}
    </Tag>
  );
}

export function Section({ title, action, children, className, icon }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; icon?: IconName }) {
  return (
    <section className={cx('min-w-0', className)}>
      {(title || action) && (
        <div className="mb-2.5 flex min-h-8 items-center gap-2">
          {icon && <Icon name={icon} size={16} className="text-muted" />}
          <h3 className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span role="status" aria-label="Loading" className="inline-block rounded-full border-2 border-line-strong border-t-accent" style={{ width: size, height: size, animation: 'spin 0.7s linear infinite' }} />;
}

export function Dot({ color, size = 8 }: { color?: string; size?: number }) {
  return <span className="inline-block flex-none rounded-full" style={{ width: size, height: size, background: color ?? 'var(--accent)' }} />;
}

/** Runs `fn` when the element scrolls into view — incremental rendering for long lists. */
export function useInView(fn: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Shows the first `step` items and reveals more as the sentinel scrolls into view. */
export function useWindowed<T>(items: T[], step = 60): { visible: T[]; sentinel: ReactNode } {
  const [count, setCount] = useState(step);
  const more = useCallback(() => setCount((c) => c + step), [step]);
  const ref = useInView(more);
  useEffect(() => setCount(step), [items.length === 0, step]); // eslint-disable-line react-hooks/exhaustive-deps
  return { visible: items.length > count ? items.slice(0, count) : items, sentinel: items.length > count ? <div ref={ref} className="h-8" aria-hidden /> : null };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
