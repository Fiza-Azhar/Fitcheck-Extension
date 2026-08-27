import { apiFetch } from '@/lib/apiClient';
import { WishlistDraft } from '@/types/messages';

// Writes the extension makes back to the FitCheck server — the app half of the
// loop reads these via GET /api/wishlist and GET /api/shop-checks. The server
// assigns id/createdAt/checkedAt and scopes the row to the caller's userId from
// the bearer token, so nothing here sends either. Failures throw; the caller
// decides whether that is fatal (wishlist save) or best-effort (shop-check log).

export type ShopVerdictLabel = 'similar' | 'goes' | 'fresh';

export interface ShopCheckLog {
  title: string;
  productUrl: string;
  imageUrl: string | null;
  price: string | null;
  category: string | null;
  color: string | null;
  verdict: ShopVerdictLabel;
  goesWithCount: number;
  alreadyOwnCount: number;
}

export async function logShopCheck(check: ShopCheckLog): Promise<void> {
  await apiFetch('/api/shop-checks', { method: 'POST', body: JSON.stringify(check) });
}

export async function saveWishlistItem(item: WishlistDraft): Promise<void> {
  await apiFetch('/api/wishlist', { method: 'POST', body: JSON.stringify(item) });
}
