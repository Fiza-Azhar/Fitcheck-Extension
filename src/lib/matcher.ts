import { Category, Garment } from '@/types/garment';
import { Verdict } from '@/types/messages';

// The deterministic heart of the extension: given a candidate garment (scraped
// from a product and structured by the vision route) and the user's wardrobe,
// decide what to tell them. No network, no AI, no randomness — the same inputs
// always give the same verdict, which is what makes the badge trustworthy and
// the logic unit-testable. Every threshold is a named constant so it can be
// tuned without hunting through the logic.

// Max RGB Euclidean distance is sqrt(255^2 * 3) ≈ 441. Two garments count as the
// "same" colour when they are within this. ~60 keeps shades of one colour
// together (a terracotta and a slightly darker terracotta) while separating
// genuinely different colours.
export const COLOR_DISTANCE_THRESHOLD = 60;

// How far apart two garments' formality (1–5) may be and still be considered a
// match — for both "similar" and "goes with". 1 lets neighbours match (a 3 and a
// 4) while keeping a very casual item from pairing with a very formal one.
export const FORMALITY_WINDOW = 1;

// Which categories complement each other. With the current vocabulary any two
// distinct categories pair, but stating it explicitly documents intent and makes
// adding categories (e.g. outerwear, accessories) a one-line change rather than a
// logic rewrite.
const PAIRS: Record<Category, Category[]> = {
  top: ['bottom', 'footwear'],
  bottom: ['top', 'footwear'],
  footwear: ['top', 'bottom'],
};

// The fields the matcher actually compares. Both a wardrobe `Garment` and a
// candidate `GarmentDraft` satisfy this, so either side can be the candidate.
type Matchable = Pick<Garment, 'category' | 'color' | 'formality' | 'occasions'>;

// Parse a 6-digit hex (with or without '#', any case) into [r, g, b].
function toRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Straight-line distance between two colours in RGB space. Simple and good
// enough to separate "a different shade of the same colour" from "a different
// colour"; perceptual spaces (LAB/CIEDE) are an easy later refinement behind this
// same signature.
export function colorDistance(hexA: string, hexB: string): number {
  const [ar, ag, ab] = toRgb(hexA);
  const [br, bg, bb] = toRgb(hexB);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

function formalityWithinWindow(a: Matchable, b: Matchable): boolean {
  return Math.abs(a.formality - b.formality) <= FORMALITY_WINDOW;
}

// Near-duplicates: things the user effectively already owns. Same category, a
// colour within the threshold, and a close formality. This is the caution list —
// "you already own a similar one".
export function alreadyOwn(candidate: Matchable, wardrobe: Garment[]): Garment[] {
  return wardrobe.filter(
    (g) =>
      g.category === candidate.category &&
      colorDistance(g.color, candidate.color) <= COLOR_DISTANCE_THRESHOLD &&
      formalityWithinWindow(g, candidate),
  );
}

// Complements: things that would pair well with the candidate. A pairable
// category, at least one shared occasion, and a close formality. This is the
// positive list — "goes with N items you already own".
export function goesWith(candidate: Matchable, wardrobe: Garment[]): Garment[] {
  const pairable = PAIRS[candidate.category];
  return wardrobe.filter(
    (g) =>
      pairable.includes(g.category) &&
      g.occasions.some((o) => candidate.occasions.includes(o)) &&
      formalityWithinWindow(g, candidate),
  );
}

// The verdict the badge renders. Both lists are always computed so the toggle is
// instant. When the user already owns something similar, that warning is the more
// valuable one, so it becomes the default view.
export function verdict(candidate: Matchable, wardrobe: Garment[]): Verdict {
  const owned = alreadyOwn(candidate, wardrobe);
  const complements = goesWith(candidate, wardrobe);
  return {
    variant: owned.length > 0 ? 'similar' : 'goes',
    goesWith: complements,
    alreadyOwn: owned,
  };
}
