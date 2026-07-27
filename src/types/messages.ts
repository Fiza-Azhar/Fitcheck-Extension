import { Garment, GarmentDraft } from '@/types/garment';

// The message contract between the content script and the service worker. The
// content script scrapes a product and asks the worker for a verdict; the worker
// replies with exactly one typed outcome. Keeping every outcome explicit is what
// lets the badge render an honest state for each failure instead of a blank or a
// faked verdict.

export type ShopVariant = 'goes' | 'similar';

export interface AnalyzeRequest {
  type: 'ANALYZE';
  imageUrl: string;
  title: string;
  price: string | null;
  pageUrl: string;
}

// A computed verdict: both lists are always present so the badge's toggle is
// instant. `variant` is the default view (caution-first when a duplicate exists).
export interface Verdict {
  variant: ShopVariant;
  goesWith: Garment[];
  alreadyOwn: Garment[];
}

export type WorkerResponse =
  // `candidate` is the analyzed product garment — carried so the badge can save
  // it to the wishlist without re-analyzing.
  | { type: 'VERDICT'; verdict: Verdict; candidate: GarmentDraft }
  | { type: 'NOT_GARMENT' }
  | { type: 'SIGNED_OUT' }
  | { type: 'ERROR'; code: WorkerErrorCode; message: string };

// A candidate garment plus the product context it came from — what "Save to
// FitCheck" persists as a wishlist item.
export interface WishlistDraft extends GarmentDraft {
  productUrl: string | null;
  imageUrl: string | null;
  price: string | null;
}

export interface SaveWishlistRequest {
  type: 'SAVE_WISHLIST';
  item: WishlistDraft;
}

// Everything the service worker accepts over chrome.runtime.
export type IncomingMessage = AnalyzeRequest | SaveWishlistRequest;

// Reply to SAVE_WISHLIST. Errors reuse the WorkerResponse ERROR shape.
export type SaveResponse = { type: 'WISHLIST_SAVED' } | { type: 'ERROR'; code: WorkerErrorCode; message: string };

// The failure taxonomy from the design's error table. The badge maps each to a
// specific message; nothing degrades to a silent empty state.
export type WorkerErrorCode =
  | 'wardrobe_unreachable'
  | 'analyze_unreachable' // couldn't connect to the analyze server at all
  | 'analyze_failed' //      connected, but the server returned an error
  | 'analyze_no_key'
  | 'image_unreadable'
  | 'unknown';
