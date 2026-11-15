/**
 * Recipes and meal plans: reading ingredient lines, scaling them to servings, and turning a week of planned meals
 * into one shopping list with duplicates merged. Pure functions, tested on their own.
 */

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface Ingredient {
  qty: number | null;
  unit: string;
  name: string;
  /** the line as written, for anything we could not read */
  raw: string;
}

const UNITS: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g', gms: 'g', kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml', l: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cup: 'cup', cups: 'cup',
  pinch: 'pinch', pinches: 'pinch', clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', tin: 'can', tins: 'can',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', slice: 'slice', slices: 'slice', bunch: 'bunch', bunches: 'bunch',
  piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', dozen: 'dozen', lb: 'lb', lbs: 'lb', oz: 'oz',
};
const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

function readNumber(text: string): number | null {
  const t = text.trim();
  const uni = /^(\d+)?\s*([¼½¾⅓⅔⅛])$/.exec(t);
  if (uni) return (uni[1] ? Number(uni[1]) : 0) + FRACTIONS[uni[2]];
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && t !== '' ? n : null;
}

/** "200 g basmati rice", "1½ cups flour", "2-3 cloves garlic, minced", "salt to taste". */
export function parseIngredient(line: string): Ingredient {
  const raw = line.trim().replace(/^[-*•]\s*/, '');
  const m = /^((?:\d+\s+)?\d+\/\d+|\d*\s*[¼½¾⅓⅔⅛]|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(?:\d+(?:[.,]\d+)?))?\s*([a-zA-Z]+\.?)?\s*(?:of\s+)?(.*)$/.exec(raw);
  if (!m) return { qty: null, unit: '', name: cleanName(raw), raw };
  const qty = readNumber(m[1]);
  const word = (m[2] ?? '').replace(/\.$/, '').toLowerCase();
  const unit = UNITS[word] ?? '';
  const rest = unit ? m[3] : `${m[2] ?? ''} ${m[3]}`.trim();
  return { qty, unit, name: cleanName(rest) || cleanName(raw), raw };
}

/** "garlic, minced" → "garlic"; "(optional)" and "to taste" are dropped. */
function cleanName(text: string): string {
  return text.replace(/\(.*?\)/g, '').replace(/,.*$/, '').replace(/\bto taste\b/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BASE: Record<string, [string, number]> = { kg: ['g', 1000], l: ['ml', 1000], dozen: ['', 12] };

/** Merge ingredient lines that mean the same thing (same name, compatible unit) and sum their quantities. */
export function aggregate(items: Ingredient[]): Ingredient[] {
  const out = new Map<string, Ingredient>();
  for (const it of items) {
    if (!it.name) continue;
    const [unit, factor] = BASE[it.unit] ?? [it.unit, 1];
    const qty = it.qty === null ? null : it.qty * factor;
    const key = `${singular(it.name)}|${unit}`;
    const prev = out.get(key);
    if (!prev) out.set(key, { ...it, unit, qty, name: it.name });
    else prev.qty = prev.qty === null || qty === null ? (prev.qty ?? qty) : prev.qty + qty;
  }
  // Large metric amounts read better in kg / l.
  return [...out.values()].map((it) => (it.qty !== null && it.qty >= 1000 && (it.unit === 'g' || it.unit === 'ml') ? { ...it, qty: it.qty / 1000, unit: it.unit === 'g' ? 'kg' : 'l' } : it));
}

const singular = (name: string) => name.replace(/(?<=[a-z]{3})(es|s)$/, '');

export const scale = (it: Ingredient, factor: number): Ingredient => ({ ...it, qty: it.qty === null ? null : it.qty * factor });

/** 0.5 → "½", 1.25 → "1¼", 2.333 → "2⅓", 250 → "250". */
export function formatQty(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  for (const [sym, v] of Object.entries(FRACTIONS)) if (Math.abs(frac - v) < 0.02) return `${whole || ''}${sym}`;
  return String(Math.round(n * 100) / 100);
}

const COUNTED = new Set(['cup', 'clove', 'can', 'pack', 'slice', 'bunch', 'piece', 'pinch']);
/** "3 cloves garlic", "½ cup milk", "1.2 kg rice". */
export function describeIngredient(it: Ingredient): string {
  const unit = it.unit && COUNTED.has(it.unit) && it.qty !== null && it.qty > 1 ? (it.unit.endsWith('ch') ? `${it.unit}es` : `${it.unit}s`) : it.unit;
  return [it.qty !== null ? formatQty(it.qty) : '', unit, it.name].filter(Boolean).join(' ');
}

const AISLES: [RegExp, string][] = [
  [/milk|curd|yogh?urt|cheese|paneer|butter|ghee|cream|egg/i, 'Dairy'],
  [/chicken|mutton|lamb|beef|pork|fish|prawn|shrimp|salmon|tuna|meat/i, 'Meat & fish'],
  [/bread|bun|pav|roti|tortilla|bagel|croissant/i, 'Bakery'],
  [/onion|tomato|potato|garlic|ginger|chilli|chili|pepper|carrot|spinach|lettuce|cucumber|lemon|lime|coriander|cilantro|mint|basil|apple|banana|berr|mango|capsicum|cabbage|cauliflower|broccoli|mushroom|beans|peas|avocado|herb|fruit|vegetable|okra|brinjal|eggplant|zucchini|celery/i, 'Produce'],
  [/frozen|ice cream/i, 'Frozen'],
  [/juice|tea|coffee|soda|water/i, 'Beverages'],
];

/** A first guess at the aisle for a shopping item; everything else is pantry. */
export function guessAisle(name: string): string {
  for (const [re, aisle] of AISLES) if (re.test(name)) return aisle;
  return 'Pantry';
}

export const ingredientLines = (text: unknown): string[] => String(text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.endsWith(':'));
