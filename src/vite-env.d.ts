/// <reference types="vite/client" />

// The build-time config the extension is compiled with. Only non-secret values
// (Supabase URL + anon key, the default analyze host) are ever inlined here.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ANALYZE_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
