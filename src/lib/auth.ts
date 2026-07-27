import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

// The "same email = same wardrobe" link. The popup calls signIn with the exact
// credentials the user created in the app; Supabase returns a session for the
// same uid, and every wardrobe query made with this client is then RLS-scoped to
// that user. Mirrors fitcheck/lib/AuthSession.tsx. Failures throw — the popup
// surfaces the message rather than pretending to be signed in.

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Reads the persisted session from chrome.storage (no network). Null when signed
// out — the service worker uses this to answer SIGNED_OUT before doing any work.
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUserEmail(): Promise<string | null> {
  const session = await getSession();
  return session?.user.email ?? null;
}

// Subscribe to sign-in / sign-out / token-refresh. Returns an unsubscribe fn.
export function onAuthChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
