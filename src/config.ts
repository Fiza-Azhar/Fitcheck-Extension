// Build-time configuration, inlined by Vite from .env. Fails loud at import if the
// Supabase values are missing — matching the app's "surface, never hide" rule, so
// a misconfigured build breaks obviously rather than silently signing no one in.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The compiled-in default for the analyze host; the popup can override it at
// runtime (stored in chrome.storage). See lib/options.ts.
export const DEFAULT_ANALYZE_BASE_URL = import.meta.env.VITE_ANALYZE_BASE_URL ?? 'http://localhost:8081';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'FitCheck extension not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env',
  );
}
