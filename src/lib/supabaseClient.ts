import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config';

// The extension's Supabase client — the second client of the same project the
// mobile app uses. It ships only the ANON key; RLS scopes every query to the
// signed-in user via the session JWT, exactly as fitcheck/lib/supabase.ts
// describes. Signing in with the same email the app uses yields the same uid, and
// therefore the same wardrobe.

// A service worker has no localStorage, so supabase-js can't persist the session
// its default way. This adapter backs the session on chrome.storage.local, which
// is shared across the worker and popup and survives worker restarts — so a
// sign-in in the popup is immediately visible to the worker.
const chromeStorageAdapter: SupportedStorage = {
  getItem: async (key) => {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  setItem: async (key, value) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key) => {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse in an extension context (not a magic-link/OAuth redirect page).
    detectSessionInUrl: false,
  },
});
