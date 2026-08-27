import { apiFetch, setToken } from '@/lib/apiClient';

// The "same email = same wardrobe" link. The popup calls signIn with the exact
// credentials the user created in the app; the server returns a JWT for the
// same user id, and every /api/** call made with that token is scoped to them.
// Mirrors fitcheck/lib/AuthSession.tsx. Failures throw — the popup surfaces the
// message rather than pretending to be signed in.

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  user: SessionUser;
}

// Stored alongside the token so getSession() can answer from chrome.storage
// with no network round trip — the same "no network" contract the old
// Supabase-backed version had.
const SESSION_USER_KEY = 'fitcheck.sessionUser';

export async function signIn(email: string, password: string): Promise<void> {
  const res = await apiFetch<{ token: string; user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await setToken(res.token);
  await chrome.storage.local.set({ [SESSION_USER_KEY]: res.user });
}

export async function signOut(): Promise<void> {
  await setToken(null);
  await chrome.storage.local.remove(SESSION_USER_KEY);
}

// Reads the persisted session from chrome.storage (no network). Null when
// signed out — the service worker uses this to answer SIGNED_OUT before doing
// any work.
export async function getSession(): Promise<Session | null> {
  const result = await chrome.storage.local.get(SESSION_USER_KEY);
  const user = result[SESSION_USER_KEY] as SessionUser | undefined;
  return user ? { user } : null;
}

export async function getUserEmail(): Promise<string | null> {
  const session = await getSession();
  return session?.user.email ?? null;
}
