import { describe, expect, test } from 'vitest';
import { Formality, Garment } from '@/types/garment';
import {
  COLOR_DISTANCE_THRESHOLD,
  FORMALITY_WINDOW,
  alreadyOwn,
  colorDistance,
  goesWith,
  verdict,
} from '@/lib/matcher';

// A wardrobe-item factory: sensible defaults so each test overrides only the
// field it exercises. The candidate reuses the same shape (minus id/urls).
function garment(over: Partial<Garment> = {}): Garment {
  return {
    id: over.id ?? `g-${Math.random().toString(36).slice(2, 7)}`,
    name: 'Item',
    category: 'top',
    color: '#3355aa',
    formality: 3,
    pattern: 'solid',
    seasons: ['spring'],
    occasions: ['office'],
    wearCount: 0,
    imageUrl: null,
    cutoutUrl: null,
    ...over,
  };
}

describe('colorDistance', () => {
  test('is zero for identical colors', () => {
    expect(colorDistance('#c56b4a', '#c56b4a')).toBe(0);
  });

  test('grows with per-channel difference (Euclidean in RGB)', () => {
    // one channel differs by 1 → distance 1
    expect(colorDistance('#000000', '#010000')).toBeCloseTo(1, 5);
    // all channels max → sqrt(255^2 * 3)
    expect(colorDistance('#000000', '#ffffff')).toBeCloseTo(Math.sqrt(255 ** 2 * 3), 3);
  });

  test('accepts hex with or without the leading #, any case', () => {
    expect(colorDistance('#FFFFFF', 'ffffff')).toBe(0);
  });
});

describe('alreadyOwn (near-duplicate / caution)', () => {
  const candidate = garment({ category: 'top', color: '#c56b4a', formality: 3, occasions: ['office'] });

  test('flags a same-category item with a near-identical color and close formality', () => {
    const dupe = garment({ id: 'dupe', category: 'top', color: '#c66c4b', formality: 3 });
    expect(alreadyOwn(candidate, [dupe]).map((g) => g.id)).toEqual(['dupe']);
  });

  test('ignores items in a different category even if the color matches', () => {
    const sameColorBottom = garment({ category: 'bottom', color: '#c56b4a', formality: 3 });
    expect(alreadyOwn(candidate, [sameColorBottom])).toEqual([]);
  });

  test('ignores a same-category item whose color is far away', () => {
    const differentColor = garment({ category: 'top', color: '#1133ff', formality: 3 });
    expect(alreadyOwn(candidate, [differentColor])).toEqual([]);
  });

  test('includes formality difference of exactly the window, excludes beyond it', () => {
    const atEdge = garment({ id: 'edge', category: 'top', color: '#c66c4b', formality: (3 + FORMALITY_WINDOW) as Formality });
    const beyond = garment({ id: 'beyond', category: 'top', color: '#c66c4b', formality: (3 + FORMALITY_WINDOW + 1) as Formality });
    const result = alreadyOwn(candidate, [atEdge, beyond]).map((g) => g.id);
    expect(result).toEqual(['edge']);
  });

  test('color distance exactly at the threshold still counts as similar', () => {
    // Build a color exactly THRESHOLD away on a single channel.
    const base = 20;
    const shifted = base + COLOR_DISTANCE_THRESHOLD;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const cand = garment({ category: 'top', color: `#${toHex(base)}0000`, formality: 3 });
    const edge = garment({ id: 'edge', category: 'top', color: `#${toHex(shifted)}0000`, formality: 3 });
    expect(alreadyOwn(cand, [edge]).map((g) => g.id)).toEqual(['edge']);
  });
});

describe('goesWith (complement / positive)', () => {
  const candidate = garment({ category: 'top', color: '#c56b4a', formality: 3, occasions: ['office', 'casual'] });

  test('flags a pairable category that shares an occasion and has close formality', () => {
    const bottom = garment({ id: 'trousers', category: 'bottom', formality: 3, occasions: ['office'] });
    expect(goesWith(candidate, [bottom]).map((g) => g.id)).toEqual(['trousers']);
  });

  test('does not pair an item in the same category (a top does not "go with" another top)', () => {
    const anotherTop = garment({ category: 'top', formality: 3, occasions: ['office'] });
    expect(goesWith(candidate, [anotherTop])).toEqual([]);
  });

  test('excludes a pairable item that shares no occasion', () => {
    const weddingShoes = garment({ category: 'footwear', formality: 3, occasions: ['wedding'] });
    expect(goesWith(candidate, [weddingShoes])).toEqual([]);
  });

  test('excludes a pairable item whose formality is outside the window', () => {
    const tooFormal = garment({ category: 'footwear', formality: 5, occasions: ['office'] });
    expect(goesWith(candidate, [tooFormal])).toEqual([]);
  });
});

describe('verdict', () => {
  const candidate = garment({ category: 'top', color: '#c56b4a', formality: 3, occasions: ['office'] });

  test('defaults to caution when a near-duplicate exists, and still lists complements', () => {
    const dupe = garment({ id: 'dupe', category: 'top', color: '#c66c4b', formality: 3, occasions: ['office'] });
    const trousers = garment({ id: 'trousers', category: 'bottom', formality: 3, occasions: ['office'] });
    const v = verdict(candidate, [dupe, trousers]);
    expect(v.variant).toBe('similar');
    expect(v.alreadyOwn.map((g) => g.id)).toEqual(['dupe']);
    expect(v.goesWith.map((g) => g.id)).toEqual(['trousers']);
  });

  test('defaults to goes-with when there is no near-duplicate', () => {
    const trousers = garment({ id: 'trousers', category: 'bottom', formality: 3, occasions: ['office'] });
    const v = verdict(candidate, [trousers]);
    expect(v.variant).toBe('goes');
    expect(v.alreadyOwn).toEqual([]);
    expect(v.goesWith.map((g) => g.id)).toEqual(['trousers']);
  });

  test('empty wardrobe yields empty lists and the goes-with default', () => {
    const v = verdict(candidate, []);
    expect(v).toEqual({ variant: 'goes', goesWith: [], alreadyOwn: [] });
  });
});
