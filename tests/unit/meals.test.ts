import { describe, expect, it } from 'vitest';
import { aggregate, describeIngredient, formatQty, guessAisle, ingredientLines, parseIngredient, scale } from '@/core/lib/meals';

describe('reading ingredient lines', () => {
  it('understands amounts, units and names as recipes write them', () => {
    expect(parseIngredient('200 g basmati rice')).toMatchObject({ qty: 200, unit: 'g', name: 'basmati rice' });
    expect(parseIngredient('1½ cups flour')).toMatchObject({ qty: 1.5, unit: 'cup', name: 'flour' });
    expect(parseIngredient('1 1/2 tsp salt')).toMatchObject({ qty: 1.5, unit: 'tsp', name: 'salt' });
    expect(parseIngredient('1/4 cup milk')).toMatchObject({ qty: 0.25, unit: 'cup', name: 'milk' });
    expect(parseIngredient('2-3 cloves garlic, minced')).toMatchObject({ qty: 2, unit: 'clove', name: 'garlic' });
    expect(parseIngredient('3 eggs')).toMatchObject({ qty: 3, unit: '', name: 'eggs' });
    expect(parseIngredient('- 500ml stock')).toMatchObject({ qty: 500, unit: 'ml', name: 'stock' });
    expect(parseIngredient('Salt to taste')).toMatchObject({ qty: null, unit: '', name: 'salt' });
    expect(parseIngredient('2 tbsp. olive oil (extra virgin)')).toMatchObject({ qty: 2, unit: 'tbsp', name: 'olive oil' });
  });

  it('skips headings and blank lines in an ingredient list', () => {
    expect(ingredientLines('For the dough:\n2 cups flour\n\n1 tsp yeast')).toEqual(['2 cups flour', '1 tsp yeast']);
  });
});

describe('scaling and merging', () => {
  it('scales to servings and writes friendly fractions', () => {
    expect(describeIngredient(scale(parseIngredient('1 cup rice'), 0.5))).toBe('½ cup rice');
    expect(formatQty(2.333)).toBe('2⅓');
    expect(describeIngredient(parseIngredient('3 cloves garlic'))).toBe('3 cloves garlic');
    expect(describeIngredient(parseIngredient('2 bunches coriander'))).toBe('2 bunches coriander');
    expect(formatQty(250)).toBe('250');
  });

  it('merges the same ingredient across recipes, converting compatible units', () => {
    const merged = aggregate(['200 g rice', '1 kg rice', '2 onions', '1 onion', 'salt to taste', 'salt', '300 ml milk', '1 l milk'].map(parseIngredient));
    const by = Object.fromEntries(merged.map((m) => [m.name, describeIngredient(m)]));
    expect(by['rice']).toBe('1.2 kg rice');
    expect(by['onions']).toBe('3 onions');
    expect(by['salt']).toBe('salt');
    expect(by['milk']).toBe('1.3 l milk');
    expect(merged).toHaveLength(4);
  });

  it('keeps incompatible units apart', () => {
    expect(aggregate(['1 cup sugar', '100 g sugar'].map(parseIngredient))).toHaveLength(2);
  });
});

describe('aisles', () => {
  it('guesses where things are in the shop', () => {
    expect(guessAisle('paneer')).toBe('Dairy');
    expect(guessAisle('red onions')).toBe('Produce');
    expect(guessAisle('chicken thighs')).toBe('Meat & fish');
    expect(guessAisle('basmati rice')).toBe('Pantry');
  });
});
