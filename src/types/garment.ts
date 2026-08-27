// The garment vocabulary, copied verbatim from the FitCheck app
// (fitcheck/constants/garment.ts + types/garment.ts). Keeping it identical is
// what lets a scraped product (the "candidate") and a wardrobe row share one
// shape and be compared by the matcher. A value not in these lists cannot come
// out of the app, so the matcher only ever sees these.
export const CATEGORIES = ['top', 'bottom', 'footwear'] as const;
export const OCCASIONS = ['office', 'casual', 'wedding', 'winter'] as const;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Occasion = (typeof OCCASIONS)[number];
export type SeasonName = (typeof SEASONS)[number];
export type Formality = 1 | 2 | 3 | 4 | 5;

// The garment as the extension works with it — mirrors fitcheck/interfaces/garment.ts.
// `imageUrl` is an absolute (signed) URL or null; the badge falls back to `color`
// when it is null.
export interface Garment {
  id: string;
  name: string;
  category: Category;
  color: string; // hex, e.g. "#C56B4A"
  formality: Formality;
  pattern: string;
  seasons: SeasonName[];
  occasions: Occasion[];
  imageUrl: string | null;
  cutoutUrl: string | null;
}

// The fields the AI proposes for a product before it is a real garment — the
// candidate the matcher compares against the wardrobe. Mirrors GarmentDraft in
// the app (Garment minus the server-assigned/display fields).
export type GarmentDraft = Omit<Garment, 'id' | 'imageUrl' | 'cutoutUrl'>;
