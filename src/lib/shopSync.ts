import { supabase } from '@/lib/supabaseClient';
import { WishlistDraft } from '@/types/messages';

// Writes the extension makes back to Supabase — the app half of the loop reads
// these. Both inserts rely on the tables' `userId default auth.uid()` + RLS, so
// no user id is sent and only the signed-in user's rows are ever created. Failures
// throw; the caller decides whether that is fatal (wishlist save) or best-effort
// (shop-check log).

function newId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

// The verdict the badge showed, as a stored label.
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
  const { error } = await supabase.from('shop_checks').insert({
    id: newId('sc'),
    ...check,
    checkedAt: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function saveWishlistItem(item: WishlistDraft): Promise<void> {
  const { error } = await supabase.from('wishlist_items').insert({
    id: newId('wl'),
    name: item.name,
    category: item.category,
    color: item.color,
    formality: item.formality,
    pattern: item.pattern,
    seasons: item.seasons,
    occasions: item.occasions,
    productUrl: item.productUrl,
    imageUrl: item.imageUrl,
    price: item.price,
    createdAt: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
