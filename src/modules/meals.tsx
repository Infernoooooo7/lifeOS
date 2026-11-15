'use client';

import { useMemo, useState } from 'react';
import { navigate, openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useEnabledModules, useNow, usePrefs, useRecord, useRecords } from '@/core/data/hooks';
import { create, getRec, remove, titleOf, upsert } from '@/core/data/store';
import { addDays, fmtDate, sameDay, startOfWeek, ymd } from '@/core/lib/dates';
import { hash } from '@/core/lib/importers';
import { MEAL_SLOTS, aggregate, describeIngredient, guessAisle, ingredientLines, parseIngredient, scale, type Ingredient, type MealSlot } from '@/core/lib/meals';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { CollectionView } from '@/ui/CollectionView';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Sheet, cx } from '@/ui/kit';
import { Markdown } from '@/ui/Markdown';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'plan', label: 'Week plan', icon: 'calendarDays' as const },
  { value: 'recipes', label: 'Recipes', icon: 'chef' as const },
];
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

/** Ingredients of the planned meals in a week, scaled to each meal's servings and merged. */
function weekIngredients(plans: Rec[], recipes: Map<string, Rec>): { items: Ingredient[]; recipes: number } {
  const all: Ingredient[] = [];
  let count = 0;
  for (const p of plans) {
    const r = p.recipeId ? recipes.get(String(p.recipeId)) : undefined;
    if (!r) continue;
    count++;
    const factor = Number(p.servings) > 0 && Number(r.servings) > 0 ? Number(p.servings) / Number(r.servings) : 1;
    for (const line of ingredientLines(r.ingredients)) all.push(scale(parseIngredient(line), factor));
  }
  return { items: aggregate(all), recipes: count };
}

function PickSheet({ date, slot, onClose }: { date: string; slot: MealSlot; onClose: () => void }) {
  const recipes = useRecords('recipes');
  const [q, setQ] = useState('');
  const list = recipes.filter((r) => !r.archived && (!q || String(r.name).toLowerCase().includes(q.toLowerCase())));
  const add = async (data: Record<string, unknown>) => {
    await create('mealPlans', { date, slot, ...data }, { silent: true });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`${SLOT_LABEL[slot]} · ${fmtDate(date, { weekday: true })}`} width={460}>
      <input className="input mb-3" type="search" aria-label="Find a recipe" placeholder="Find a recipe or type anything…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="-mx-2 max-h-[50dvh] overflow-y-auto">
        {list.map((r) => (
          <button key={r.id} type="button" className="row w-full text-left" onClick={() => void add({ recipeId: r.id })}>
            <Icon name="chef" size={16} className="flex-none text-accent" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{titleOf(r)}</span>
            {r.totalMin ? <span className="flex-none text-xs text-faint">{r.totalMin} min</span> : null}
          </button>
        ))}
      </div>
      {q.trim() && <Button className="mt-2" icon="plus" onClick={() => void add({ title: q.trim() })}>Plan “{q.trim()}”</Button>}
      {!recipes.length && !q && <p className="text-sm text-muted">No recipes yet. Type anything to plan it (“Eating out”), or add recipes in the Recipes tab.</p>}
    </Sheet>
  );
}

function ShoppingSheet({ week, plans, onClose }: { week: Date; plans: Rec[]; onClose: () => void }) {
  const recipes = useRecords('recipes');
  const lists = useRecords('shoppingLists');
  const [prefs, setPrefs] = usePrefs();
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const { items, recipes: count } = useMemo(() => weekIngredients(plans, byId), [plans, byId]);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const key = (it: Ingredient) => `${it.name}|${it.unit}`;
  const weekKey = ymd(week);
  const listId = `sl:meals:${weekKey}`;
  const [target, setTarget] = useState<string>(listId);
  const add = async () => {
    if (target === listId) await upsert('shoppingLists', listId, { name: `Groceries · week of ${fmtDate(week)}`, kind: 'groceries' });
    let n = 0;
    for (const it of items) {
      if (skip.has(key(it))) continue;
      const id = `si:meals:${weekKey}:${target === listId ? '' : `${target}:`}${hash(key(it))}`;
      const existing = await getRec(id);
      // Regenerating updates amounts; it never un-ticks something already bought.
      await upsert('shoppingItems', id, { title: it.name, qty: it.qty === null ? null : Math.round(it.qty * 100) / 100, unit: it.unit, category: guessAisle(it.name), listId: target, ...(existing ? {} : { done: false }) });
      n++;
    }
    setPrefs({ views: { ...prefs.views, shoppingList: target } }); // Shopping opens on this list
    toast(`Added ${n} item${n === 1 ? '' : 's'} to your shopping list`, { tone: 'good', action: { label: 'Open', run: () => navigate('/shopping') } });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Shopping list from the plan" width={480}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="cart" disabled={!items.length} onClick={() => void add()}>Add {items.length - skip.size} item{items.length - skip.size === 1 ? '' : 's'}</Button></>}
    >
      {!count ? <Empty icon="chef" title="No recipes planned this week" hint="Plan recipes (not just notes like “eating out”) and their ingredients are gathered here." /> : (
        <>
          <p className="mb-2 text-sm text-muted">From {count} planned recipe{count === 1 ? '' : 's'}, scaled to the servings you planned and merged. Untick what you already have.</p>
          <label className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Add to</span>
            <select className="input !w-auto" aria-label="Shopping list" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value={listId}>A new list for this week</option>
              {lists.filter((l) => l.id !== listId).map((l) => <option key={l.id} value={l.id}>{titleOf(l)}</option>)}
            </select>
          </label>
          <ul className="-mx-2" aria-label="Ingredients">
            {items.map((it) => {
              const k = key(it);
              const on = !skip.has(k);
              return (
                <li key={k} className="row !py-1">
                  <input type="checkbox" className="size-4 flex-none accent-[var(--accent)]" checked={on} aria-label={`Buy ${it.name}`} onChange={() => { const n = new Set(skip); if (on) n.add(k); else n.delete(k); setSkip(n); }} />
                  <span className={cx('min-w-0 flex-1 truncate text-sm', !on && 'text-faint line-through')}>{describeIngredient(it)}</span>
                  <span className="flex-none text-xs text-faint">{guessAisle(it.name)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function WeekPlan() {
  const [prefs] = usePrefs();
  const now = useNow();
  const enabled = useEnabledModules();
  const [offset, setOffset] = useState(0);
  const week = addDays(startOfWeek(now, prefs.weekStart), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const plans = useRecords('mealPlans');
  const recipes = useRecords('recipes');
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const from = ymd(week);
  const to = ymd(addDays(week, 6));
  const inWeek = useMemo(() => plans.filter((p) => String(p.date) >= from && String(p.date) <= to), [plans, from, to]);
  const [pick, setPick] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [shop, setShop] = useState(false);
  const planned = inWeek.filter((p) => p.recipeId).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon="chevronLeft" label="Previous week" onClick={() => setOffset(offset - 1)} />
        <IconButton icon="chevronRight" label="Next week" onClick={() => setOffset(offset + 1)} />
        {offset !== 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOffset(0)}>This week</button>}
        <h2 className="min-w-0 flex-1 basis-40 truncate text-[1.05rem] font-semibold">{fmtDate(week)} – {fmtDate(addDays(week, 6), { year: true })}</h2>
        {enabled.has('shopping') && <Button size="sm" variant={planned ? 'primary' : undefined} icon="cart" onClick={() => setShop(true)}>Shopping list</Button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {days.map((d) => {
          const date = ymd(d);
          const today = sameDay(d, now);
          return (
            <section key={date} className={cx('card !p-2.5', today && '!border-accent/50')} aria-label={fmtDate(d, { weekday: true })}>
              <h3 className={cx('mb-1 px-1 text-sm font-semibold', today && 'text-accent')}>{fmtDate(d, { weekday: true })}{today && ' · today'}</h3>
              {MEAL_SLOTS.map((slot) => {
                const here = inWeek.filter((p) => p.date === date && p.slot === slot);
                return (
                  <div key={slot} className="flex min-h-9 items-start gap-2 border-t border-line/60 px-1 py-1 first-of-type:border-t-0">
                    <span className="w-16 flex-none pt-1 text-xs text-faint">{SLOT_LABEL[slot]}</span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {here.map((p) => {
                        const r = p.recipeId ? byId.get(String(p.recipeId)) : undefined;
                        return (
                          <div key={p.id} className="group flex items-center gap-1">
                            <button type="button" className="min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left text-sm hover:bg-surface-2" onClick={() => (r ? navigate(`/meals/${r.id}`) : openEditor('mealPlans', p.id))}>
                              {r ? titleOf(r) : String(p.title || 'Planned meal')}{p.servings ? <span className="text-faint"> · {String(p.servings)}</span> : null}
                            </button>
                            <IconButton icon="x" label={`Remove ${r ? titleOf(r) : String(p.title || 'meal')} from ${SLOT_LABEL[slot].toLowerCase()}`} className="!size-7 opacity-60 hover:opacity-100" onClick={() => void remove(p.id)} />
                          </div>
                        );
                      })}
                      <button type="button" className="rounded-md px-1 py-0.5 text-xs text-faint hover:bg-surface-2 hover:text-text" aria-label={`Plan ${SLOT_LABEL[slot].toLowerCase()} on ${fmtDate(d, { weekday: true })}`} onClick={() => setPick({ date, slot })}>
                        <Icon name="plus" size={12} className="mr-0.5 inline" />Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {pick && <PickSheet date={pick.date} slot={pick.slot} onClose={() => setPick(null)} />}
      {shop && <ShoppingSheet week={week} plans={inWeek} onClose={() => setShop(false)} />}
    </div>
  );
}

function RecipeDetail({ id }: { id: string }) {
  const recipe = useRecord(id);
  const [servings, setServings] = useState<number | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const now = useNow();
  if (recipe === undefined) return null;
  if (!recipe || recipe.deletedAt) return <Page module="meals" title="Not found"><Empty icon="chef" title="This recipe was deleted" action={<Button onClick={() => navigate('/meals/recipes')}>All recipes</Button>} /></Page>;
  const base = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const want = servings ?? base;
  const lines = ingredientLines(recipe.ingredients).map((l) => parseIngredient(l));
  return (
    <Page
      module="meals" title={titleOf(recipe)} subtitle={[recipe.totalMin && `Ready in ${recipe.totalMin} min`, Array.isArray(recipe.tags) && (recipe.tags as string[]).join(' · ')].filter(Boolean).join(' · ') || 'Recipe'}
      actions={<><Button size="sm" variant="ghost" icon="arrowLeft" onClick={() => navigate('/meals/recipes')}>Recipes</Button><Button size="sm" icon="pencil" onClick={() => openEditor('recipes', recipe.id)}>Edit</Button><Button size="sm" variant="primary" icon="calendarDays" onClick={() => setPlanOpen(true)}>Plan it</Button></>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section className="card h-fit" aria-labelledby="ing-title">
          <div className="mb-2 flex items-center gap-2">
            <h2 id="ing-title" className="flex-1 font-semibold">Ingredients</h2>
            <IconButton icon="minus" label="Fewer servings" disabled={want <= 1} onClick={() => setServings(Math.max(1, want - 1))} />
            <span className="num w-20 text-center text-sm" aria-live="polite">{want} serving{want === 1 ? '' : 's'}</span>
            <IconButton icon="plus" label="More servings" onClick={() => setServings(want + 1)} />
          </div>
          {lines.length ? (
            <ul className="space-y-1 text-sm">{lines.map((it, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 flex-none rounded-full bg-accent" />{it.qty === null ? it.raw : describeIngredient(scale(it, want / base))}</li>)}</ul>
          ) : <p className="text-sm text-faint">No ingredients yet. Add them one per line with Edit.</p>}
        </section>
        <section className="card min-w-0" aria-label="Method">
          <h2 className="mb-2 font-semibold">Method</h2>
          {recipe.steps ? <Markdown text={String(recipe.steps)} /> : <p className="text-sm text-faint">No method written yet.</p>}
          {recipe.sourceUrl && <a className="mt-3 inline-block text-sm text-accent underline" href={String(recipe.sourceUrl)} target="_blank" rel="noopener noreferrer">Original recipe</a>}
        </section>
      </div>
      {planOpen && <PlanRecipeSheet recipe={recipe} servings={servings} now={now} onClose={() => setPlanOpen(false)} />}
    </Page>
  );
}

function PlanRecipeSheet({ recipe, servings, now, onClose }: { recipe: Rec; servings: number | null; now: Date; onClose: () => void }) {
  const [date, setDate] = useState(ymd(now));
  const [slot, setSlot] = useState<MealSlot>('dinner');
  return (
    <Sheet open onClose={onClose} title={`Plan ${titleOf(recipe)}`} width={420}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => { await create('mealPlans', { date, slot, recipeId: recipe.id, ...(servings ? { servings } : {}) }, { silent: true }); toast(`Planned for ${SLOT_LABEL[slot].toLowerCase()}, ${fmtDate(date, { weekday: true })}`, { tone: 'good', action: { label: 'Week plan', run: () => navigate('/meals') } }); onClose(); }}>Plan</Button></>}
    >
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">Day</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span className="label">Meal</span><select className="input" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>{MEAL_SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select></label>
      </div>
    </Sheet>
  );
}

export default function Meals({ sub }: ModuleProps) {
  const isTab = !sub[0] || TABS.some((t) => t.value === sub[0]);
  const tab = tabFrom(sub, TABS);
  if (!isTab) return <RecipeDetail id={sub[0]} />;
  return (
    <Page module="meals" tabs={TABS} tab={tab} actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('recipes')}>Recipe</Button>}>
      {tab === 'plan' && <WeekPlan />}
      {tab === 'recipes' && <CollectionView collection="recipes" viewKey="recipes" onOpen={(r) => navigate(`/meals/${r.id}`)} addLabel="New recipe" emptyHint="Your recipe box. Add ingredients one per line (“200 g rice”) and the week plan can build your shopping list." />}
    </Page>
  );
}
