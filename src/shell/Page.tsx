'use client';

import { m } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { navigate } from '@/core/app';
import { moduleDef } from '@/core/registry';
import { Icon } from '@/ui/icons';
import { Tabs, cx, type Option } from '@/ui/kit';

export interface ModuleProps {
  /** path segments after the module id, e.g. ["board"] for /tasks/board */
  sub: string[];
}

/** Standard module page: tinted header, optional tabs that map to sub-routes, then content. */
export function Page<T extends string>({ module, title, subtitle, actions, tabs, tab, children, wide }: {
  module: string;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs?: (Option<T> & { count?: number })[];
  tab?: T;
  children: ReactNode;
  wide?: boolean;
}) {
  const def = moduleDef(module);
  return (
    <div className={cx('mx-auto w-full px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6', wide ? 'max-w-[1500px]' : 'max-w-6xl')} style={{ '--mh': def?.hue ?? 215 } as CSSProperties}>
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="tile size-12">
          <Icon name={def?.icon ?? 'circle'} size={21} />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="truncate text-[1.55rem] font-semibold leading-tight tracking-tight">{title ?? def?.name}</h1>
          {(subtitle ?? def?.tagline) && <p className="truncate text-sm text-muted">{subtitle ?? def?.tagline}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {tabs && tab !== undefined && <Tabs className="mb-4" tabs={tabs} value={tab} onChange={(v) => navigate(`/${module}${v === tabs[0].value ? '' : `/${v}`}`)} />}
      <m.div key={tab ?? 'page'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>{children}</m.div>
    </div>
  );
}

/** Picks the active tab from the first sub-segment. */
export function tabFrom<T extends string>(sub: string[], tabs: { value: T }[]): T {
  return (tabs.find((t) => t.value === sub[0])?.value ?? tabs[0].value) as T;
}
