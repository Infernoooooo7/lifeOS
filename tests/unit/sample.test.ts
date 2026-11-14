import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LifeDB, setDb } from '@/core/data/db';
import { create, getRec } from '@/core/data/store';
import { countSampleData, loadSampleData, removeSampleData } from '@/core/lib/sample';

beforeEach(() => setDb(new LifeDB(`sample-${Math.random()}`)));

describe('example data', () => {
  it('loads a marked example week and removes only that, leaving the person\'s own records', async () => {
    const mine = await create('tasks', { title: 'My own task' });
    const added = await loadSampleData(new Date('2026-11-14T10:00:00'));
    expect(added).toBeGreaterThan(40);
    const live = await countSampleData(); // the example week includes one item already in the trash
    expect(live).toBeGreaterThanOrEqual(added - 2);
    expect((await getRec('t-1'))?.sample).toBe(true);
    expect(await removeSampleData()).toBe(live);
    expect(await countSampleData()).toBe(0);
    expect((await getRec('t-1'))?.deletedAt).toBeTruthy();
    expect((await getRec(mine.id))?.deletedAt).toBeFalsy();
  });

  it('does not overwrite records that already exist when loaded twice', async () => {
    await loadSampleData();
    expect(await loadSampleData()).toBe(0);
  });
});
