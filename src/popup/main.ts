import { getSession, getUserEmail, signIn, signOut } from '@/lib/auth';
import { getApiBaseUrl, setApiBaseUrl } from '@/lib/options';
import { clearWardrobe, getWardrobe } from '@/lib/wardrobeCache';

// The popup: the one place the user signs in (the "same email" link) and points
// the extension at the FitCheck server. Rendered from scratch on each state change
// so the signed-in and signed-out views never drift out of sync with reality.

const root = document.getElementById('root')!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}

function message(text: string, kind: 'err' | 'ok' | '' = ''): HTMLElement {
  return el('div', { className: `msg ${kind}`, textContent: text });
}

// --- Settings block (shared by both views) -------------------------------------

async function settingsBlock(): Promise<HTMLElement> {
  const baseUrl = await getApiBaseUrl();
  const input = el('input', { value: baseUrl, spellcheck: false });
  const status = message('');

  const save = el('button', { className: 'secondary', textContent: 'Save & test connection' });
  save.addEventListener('click', async () => {
    save.disabled = true;
    await setApiBaseUrl(input.value);
    status.className = 'msg';
    status.textContent = 'Testing…';
    const reachable = await testConnection(input.value);
    status.className = `msg ${reachable ? 'ok' : 'err'}`;
    status.textContent = reachable
      ? 'FitCheck server reachable.'
      : 'Could not reach the FitCheck server — is it running?';
    save.disabled = false;
  });

  return el('div', {}, [
    el('hr'),
    el('div', { className: 'settings-title', textContent: 'FitCheck server' }),
    el('label', { textContent: 'Base URL of the FitCheck server (auth, wardrobe, analyze-item)' }),
    input,
    save,
    status,
  ]);
}

// Any HTTP response (even 400) means the server is reachable; only a network
// failure means it is not.
async function testConnection(base: string): Promise<boolean> {
  try {
    await fetch(`${base.replace(/\/+$/, '')}/api/analyze-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return true;
  } catch {
    return false;
  }
}

// --- Signed-out view -----------------------------------------------------------

async function renderSignedOut(): Promise<void> {
  const email = el('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username' });
  const password = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
  const status = message('');
  const submit = el('button', { textContent: 'Sign in' });

  submit.addEventListener('click', async () => {
    status.className = 'msg';
    status.textContent = '';
    submit.disabled = true;
    try {
      await signIn(email.value.trim(), password.value);
      await render();
    } catch (e) {
      status.className = 'msg err';
      status.textContent = e instanceof Error ? e.message : 'Sign in failed.';
      submit.disabled = false;
    }
  });

  root.replaceChildren(
    el('div', { className: 'card' }, [
      el('label', { textContent: 'Email' }),
      email,
      el('label', { textContent: 'Password' }),
      password,
      submit,
      status,
      message('Use the same email you use in the FitCheck app.', ''),
    ]),
    await settingsBlock(),
  );
}

// --- Signed-in view ------------------------------------------------------------

async function renderSignedIn(userEmail: string): Promise<void> {
  const count = el('div', { className: 'count', textContent: 'Loading wardrobe…' });
  const status = message('');

  const signOutBtn = el('button', { className: 'secondary', textContent: 'Sign out' });
  signOutBtn.addEventListener('click', async () => {
    await signOut();
    await clearWardrobe();
    await render();
  });

  const refresh = el('button', { className: 'secondary', textContent: 'Refresh wardrobe' });
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    status.className = 'msg';
    status.textContent = 'Refreshing…';
    await clearWardrobe();
    await loadCount(count, status);
    refresh.disabled = false;
  });

  root.replaceChildren(
    el('div', { className: 'card' }, [
      el('div', { className: 'who', textContent: `Signed in as ${userEmail}` }),
      count,
      refresh,
      signOutBtn,
      status,
    ]),
    await settingsBlock(),
  );

  await loadCount(count, status);
}

async function loadCount(count: HTMLElement, status: HTMLElement): Promise<void> {
  try {
    const items = await getWardrobe(true);
    count.textContent = `${items.length} item${items.length === 1 ? '' : 's'} in your wardrobe.`;
    status.className = 'msg ok';
    status.textContent = 'Wardrobe loaded.';
  } catch (e) {
    count.textContent = '';
    status.className = 'msg err';
    status.textContent = e instanceof Error ? e.message : 'Could not load your wardrobe.';
  }
}

// --- Entry ---------------------------------------------------------------------

async function render(): Promise<void> {
  const session = await getSession();
  if (session) {
    await renderSignedIn((await getUserEmail()) ?? session.user.email ?? 'your account');
  } else {
    await renderSignedOut();
  }
}

render();
