// Build-time configuration, inlined by Vite from .env. Fails loud at import if
// missing — matching the app's "surface, never hide" rule, so a misconfigured
// build breaks obviously rather than silently pointing at nothing.
export const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081';
