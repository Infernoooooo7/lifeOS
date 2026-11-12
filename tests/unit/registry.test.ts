import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '@/core/collections';
import { ALL_FEATURES, MODULES, MODULE_MAP, featureCounts, recommendedFor } from '@/core/registry';

describe('feature registry', () => {
  it('gives every feature a unique, stable, module-scoped id', () => {
    const ids = ALL_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+\.[a-z][a-z-]*$/);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
  });

  it('only depends on modules that exist, without cycles', () => {
    for (const m of MODULES) for (const d of m.deps ?? []) { expect(MODULE_MAP[d], `${m.id} → ${d}`).toBeDefined(); expect(MODULE_MAP[d].deps ?? []).not.toContain(m.id); }
    for (const f of ALL_FEATURES) for (const d of f.deps ?? []) expect(MODULE_MAP[d], `${f.id} → ${d}`).toBeDefined();
  });

  it('explains every capability that is not fully implemented', () => {
    for (const f of ALL_FEATURES) if (f.status !== 'implemented') expect(f.note, f.id).toBeTruthy();
  });

  it('meets the initial target of 150+ implemented capabilities', () => {
    const counts = featureCounts();
    expect(counts.implemented).toBeGreaterThanOrEqual(150);
    expect(counts.implemented + counts.partial + counts.integration + counts.planned).toBe(counts.total);
  });

  it('has a lazily loaded component for every module', () => {
    const loaders = readFileSync('src/shell/modules.ts', 'utf8');
    for (const m of MODULES) expect(loaders, m.id).toMatch(new RegExp(`\\b${m.id}: \\(\\) => import`));
    for (const file of ['home', 'tasks', 'calendar', 'projects', 'notes', 'habits', 'goals', 'finance', 'learning', 'health', 'journal', 'focus', 'lifestyle', 'utilities', 'automation', 'insights', 'spatial', 'marketplace', 'settings']) expect(existsSync(`src/modules/${file}.tsx`), file).toBe(true);
  });

  it('recommends modules from onboarding interests', () => {
    expect(recommendedFor(['Money'])).toContain('finance');
    expect(recommendedFor(['Money'])).not.toContain('learning');
    expect(recommendedFor([])).toContain('tasks');
  });

  it('keeps the generated feature inventory in sync', () => {
    const doc = readFileSync('docs/FEATURES.md', 'utf8');
    for (const f of ALL_FEATURES) expect(doc, f.id).toContain(`\`${f.id}\``);
  });
});

describe('collection definitions', () => {
  it('are internally consistent', () => {
    for (const def of Object.values(COLLECTIONS)) {
      const keys = def.fields.map((f) => f.k);
      expect(new Set(keys).size, def.id).toBe(keys.length);
      if (def.board) expect(keys, `${def.id}.board`).toContain(def.board);
      if (def.date) expect(keys, `${def.id}.date`).toContain(def.date);
      if (def.done) expect(keys, `${def.id}.done`).toContain(def.done.k);
      for (const f of def.fields) {
        if (f.t === 'relation' || f.t === 'relations') expect(COLLECTIONS[f.rel!], `${def.id}.${f.k} → ${f.rel}`).toBeDefined();
        if (f.t === 'select') expect(!!f.opts || !!f.optsKey, `${def.id}.${f.k} options`).toBe(true);
        if (f.when) expect(keys, `${def.id}.${f.k} when`).toContain(f.when.k);
      }
      for (const view of def.views ?? []) {
        if (view === 'board') expect(def.board, `${def.id} board view`).toBeTruthy();
        if (view === 'calendar') expect(def.date, `${def.id} calendar view`).toBeTruthy();
      }
    }
  });
  it('never defines a password field', () => {
    for (const def of Object.values(COLLECTIONS)) for (const f of def.fields) expect(`${f.k} ${f.label}`.toLowerCase(), `${def.id}.${f.k}`).not.toMatch(/^password|passcode|\bpin\b/);
  });
});
