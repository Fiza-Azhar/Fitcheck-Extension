import { getApiBaseUrl } from '@/lib/options';

// Replaces supabaseClient.ts: a bearer-token fetch wrapper against the FitCheck
// server's /api/** routes instead of a Supabase client talking to Postgres
// directly. The token lives in chrome.storage.local — shared across the popup
// and the service worker, and it survives worker restarts.

const TOKEN_KEY = 'fitcheck.authToken';

export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string | undefined) ?? null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await chrome.storage.local.set({ [TOKEN_KEY]: token });
  else await chrome.storage.local.remove(TOKEN_KEY);
}

// Turns a non-2xx response into a thrown Error carrying the server's message,
// so callers keep using try/catch the same way they did around supabase-js
// calls. Never invents a fallback value on failure.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const [token, baseUrl] = await Promise.all([getToken(), getApiBaseUrl()]);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return (await res.json()) as T;
}
