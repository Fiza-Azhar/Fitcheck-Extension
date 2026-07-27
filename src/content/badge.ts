import { Garment } from '@/types/garment';
import { Verdict } from '@/types/messages';

// The injected badge — a vanilla-DOM rebuild of the app's MatchBadge, rendered
// inside a Shadow DOM so the host page's CSS can't break it and ours can't leak
// out. It mirrors the two states of app/(tabs)/shop.tsx (goes-with / already-own)
// plus the honest loading / not-a-garment / signed-out / error states the design
// requires. One handle is returned; the content script drives it with update().

export type SaveState = 'idle' | 'saving' | 'saved';

export type BadgeState =
  | { kind: 'loading' }
  // onSave, when provided, renders a "Save to FitCheck" action; saveState drives
  // its label. The content script owns the save and re-renders with the result.
  | { kind: 'verdict'; verdict: Verdict; onSave?: () => void; saveState?: SaveState }
  | { kind: 'not_garment' }
  | { kind: 'signed_out' }
  | { kind: 'error'; message: string };

export interface BadgeHandle {
  update(state: BadgeState): void;
  remove(): void;
}

// FitCheck palette, copied from fitcheck/constants/design.ts so the badge reads as
// the same product.
const C = {
  surface: '#FFFDF9',
  text: '#2E2A26',
  muted: '#8A8178',
  border: '#E7DDCD',
  accent: '#C56B4A',
  success: '#4F8A5B',
  successBg: '#E6F1E8',
  warn: '#C98A2E',
  warnBg: '#F7ECD8',
};

const STYLE = `
:host { all: initial; }
@keyframes fc-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes fc-spin { to { transform: rotate(360deg); } }
.card {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  width: 296px; box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: ${C.surface}; color: ${C.text};
  border: 1px solid ${C.border}; border-top: 3px solid ${C.border};
  border-radius: 16px; padding: 15px 16px 16px;
  box-shadow: 0 12px 32px rgba(58, 46, 34, 0.18);
  animation: fc-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }
.card.goes { border-top-color: ${C.success}; }
.card.similar { border-top-color: ${C.warn}; }
.eyebrow { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: ${C.muted}; }
.close {
  position: absolute; top: 11px; right: 11px; width: 22px; height: 22px;
  display: grid; place-items: center; border: 0; border-radius: 50%;
  background: rgba(46, 42, 38, 0.06); color: ${C.muted};
  cursor: pointer; font-size: 11px; line-height: 1; padding: 0;
}
.close:hover { background: rgba(46, 42, 38, 0.12); }
.verdict { display: flex; gap: 11px; align-items: center; margin-top: 10px; }
.chip { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; font-size: 16px; font-weight: 700; }
.chip.goes { background: ${C.successBg}; color: ${C.success}; }
.chip.similar { background: ${C.warnBg}; color: ${C.warn}; }
.chip.neutral { background: rgba(46, 42, 38, 0.06); color: ${C.muted}; }
.headline { font-size: 14px; font-weight: 800; line-height: 1.3; margin: 0; }
.headline.lead { margin-top: 10px; }
.headline.goes { color: #3F7A4B; }
.headline.similar { color: #A9741F; }
.note { font-size: 12.5px; font-weight: 500; color: ${C.muted}; margin: 11px 0 0; line-height: 1.45; }
.thumbs { display: flex; gap: 8px; margin-top: 13px; }
.thumb { flex: 0 0 auto; width: 52px; height: 64px; border-radius: 10px; background-size: cover; background-position: center; border: 1px solid ${C.border}; box-shadow: 0 2px 6px rgba(58, 46, 34, 0.10); }
.save { width: 100%; margin-top: 13px; padding: 9px; border: 1px solid ${C.border}; border-radius: 10px; background: transparent; color: ${C.text}; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
.save:hover:not(:disabled) { background: rgba(46, 42, 38, 0.04); border-color: ${C.accent}; }
.save:disabled { cursor: default; color: ${C.success}; border-color: ${C.successBg}; background: ${C.successBg}; }
.spinner { width: 15px; height: 15px; border: 2px solid rgba(46, 42, 38, 0.15); border-top-color: ${C.text}; border-radius: 50%; display: inline-block; animation: fc-spin 0.7s linear infinite; }
`;

function thumbsHtml(items: Garment[]): string {
  const cells = items.slice(0, 3).map((g) => {
    const bg = g.cutoutUrl ?? g.imageUrl;
    const style = bg
      ? `background-image:url('${bg}')`
      : `background-color:${g.color}`;
    return `<div class="thumb" style="${style}" title="${escapeHtml(g.name)}"></div>`;
  });
  return `<div class="thumbs">${cells.join('')}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

// Every state shares one shell: the brand eyebrow, a dismiss button, and a
// verdict-coloured top accent. `variant` tints that accent; '' leaves it neutral.
function paint(root: ShadowRoot, card: HTMLElement, variant: '' | 'goes' | 'similar', inner: string): void {
  card.className = variant ? `card ${variant}` : 'card';
  card.innerHTML = `<button class="close" title="Dismiss" aria-label="Dismiss">✕</button><div class="eyebrow">FitCheck</div>${inner}`;
  card.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', () => root.host.remove());
}

// A chip + headline pair — the consistent lead line for the verdict states.
function lead(variant: 'goes' | 'similar' | 'neutral', icon: string, headline: string): string {
  const headlineClass = variant === 'neutral' ? '' : variant;
  return `<div class="verdict"><div class="chip ${variant}">${icon}</div><p class="headline ${headlineClass}">${headline}</p></div>`;
}

// Auto-decides the single message to show — no manual toggle. An "already own"
// warning is the most valuable signal, so it wins; a positive "goes with" is
// next; when neither applies the item is genuinely new, which we say plainly
// instead of showing a confusing "goes with 0". The secondary count is surfaced
// as a small line so no information is lost.
// The save action markup for a verdict, driven by saveState. Omitted entirely
// when the caller provides no onSave handler.
function saveButtonHtml(saveState: SaveState): string {
  if (saveState === 'saved') return `<button class="save" disabled>✓ Saved to FitCheck</button>`;
  const label = saveState === 'saving' ? 'Saving…' : '♡ Save to FitCheck';
  return `<button class="save"${saveState === 'saving' ? ' disabled' : ''}>${label}</button>`;
}

function verdictBody(
  root: ShadowRoot,
  card: HTMLElement,
  v: Verdict,
  onSave: (() => void) | undefined,
  saveState: SaveState,
): void {
  const owned = v.alreadyOwn.length;
  const goes = v.goesWith.length;

  let cardVariant: '' | 'goes' | 'similar';
  let inner: string;

  if (owned > 0) {
    cardVariant = 'similar';
    inner =
      lead('similar', '⚠', `You already own ${owned} similar item${plural(owned)}`) +
      thumbsHtml(v.alreadyOwn) +
      (goes > 0 ? `<p class="note">It also goes with ${goes} item${plural(goes)} you own.</p>` : '');
  } else if (goes > 0) {
    cardVariant = 'goes';
    inner = lead('goes', '✓', `Goes with ${goes} item${plural(goes)} you already own`) + thumbsHtml(v.goesWith);
  } else {
    cardVariant = '';
    inner =
      lead('neutral', '✦', 'A fresh addition') +
      `<p class="note">Nothing similar in your wardrobe, and nothing to pair with it yet.</p>`;
  }

  if (onSave) inner += saveButtonHtml(saveState);

  paint(root, card, cardVariant, inner);

  if (onSave && saveState === 'idle') {
    card.querySelector<HTMLButtonElement>('.save')?.addEventListener('click', onSave);
  }
}

export function mountBadge(): BadgeHandle {
  const host = document.createElement('div');
  host.id = 'fitcheck-badge-host';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const card = document.createElement('div');
  card.className = 'card';
  root.append(style, card);
  document.body.appendChild(host);

  function update(state: BadgeState): void {
    switch (state.kind) {
      case 'loading':
        paint(root, card, '', lead('neutral', '<span class="spinner"></span>', 'Checking your wardrobe…'));
        break;
      case 'verdict':
        verdictBody(root, card, state.verdict, state.onSave, state.saveState ?? 'idle');
        break;
      case 'not_garment':
        paint(root, card, '', `<p class="note">Not a clothing item — nothing to check.</p>`);
        break;
      case 'signed_out':
        paint(
          root,
          card,
          '',
          `<p class="headline lead">Sign in to FitCheck</p><p class="note">Open the FitCheck icon in your toolbar and sign in with the same email you use in the app.</p>`,
        );
        break;
      case 'error':
        paint(root, card, '', `<p class="note">${escapeHtml(state.message)}</p>`);
        break;
    }
  }

  return { update, remove: () => host.remove() };
}
