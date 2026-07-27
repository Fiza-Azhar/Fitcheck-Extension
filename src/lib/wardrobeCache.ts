import { Garment } from '@/types/garment';
import { fetchGarments } from '@/lib/wardrobe';

// Caches the wardrobe in chrome.storage.local so we don't refetch (and re-sign
// image URLs) on every product page. Within the TTL, reads are instant; after it,
// the next read refetches. The popup's "refresh wardrobe" and sign-out clear it.

const CACHE_KEY = 'fitcheck.wardrobe';
export const WARDROBE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  items: Garment[];
  fetchedAt: number;
}

export async function getWardrobe(force = false): Promise<Garment[]> {
  if (!force) {
    const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] as CacheEntry | undefined;
    if (stored && Date.now() - stored.fetchedAt < WARDROBE_TTL_MS) {
      return stored.items;
    }
  }
  const items = await fetchGarments();
  const entry: CacheEntry = { items, fetchedAt: Date.now() };
  await chrome.storage.local.set({ [CACHE_KEY]: entry });
  return items;
}

export async function clearWardrobe(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
