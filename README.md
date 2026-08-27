# FitCheck Shopping Extension

A Manifest V3 Chrome extension that gives **wardrobe-aware buy/skip suggestions
while you shop**. On a product page (Amazon, Daraz) it shows a floating badge:

- **✓ Goes with N items you already own** — it complements your wardrobe, and
- **⚠ You already own N similar items** — you own something like this, reconsider.

It reads the **same wardrobe** you build in the [FitCheck mobile app](../fitcheck):
you sign in with the **same email**, and the FitCheck server's `/api/**` routes
return only your items, scoped by the JWT you get back from signing in. See
[docs/](docs/) for the full design and implementation plan (predates the move
off Supabase — see the app's own README for the current Neon-backed setup).

## How it works

- **Auth** — the extension signs in against `POST /api/auth/login` on the same
  FitCheck server the app uses, getting back a JWT. That token (not a database
  credential) is what's stored in `chrome.storage.local` and sent as a bearer
  header on every request — there's no direct database access from the
  extension at all.
- **Wardrobe / wishlist / shop-checks** — `GET /api/garments`, `POST /api/wishlist`,
  and `POST /api/shop-checks` on that same server. The server enforces that a
  request only ever sees or writes the signed-in user's own rows.
- **Analysis** — `POST /api/analyze-item` (Groq vision) turns a product photo
  into a structured garment.
- **Matcher** — pure, deterministic logic ([src/lib/matcher.ts](src/lib/matcher.ts))
  compares the product to your wardrobe. No AI in the verdict.

## Develop

```bash
npm install
npm run build      # typecheck + emit dist/
npm test           # matcher, analyze client, and site adapters
npm run dev        # watch build
```

Config lives in `.env` (copy from `.env.example`): just `VITE_API_BASE_URL`
(default FitCheck server host). **Never** put the Groq key or the server's
`JWT_SECRET`/`DATABASE_URL` here — the extension only ever holds a per-user
JWT it gets back from signing in.

## Demo runbook

1. **Start the FitCheck server** (in `../fitcheck`): `npx expo start` — this serves
   `/api/analyze-item` plus auth/garments/wishlist/shop-checks, and needs
   `GROQ_API_KEY`, `DATABASE_URL`, and `JWT_SECRET` set. Note the port (default 8081).
2. **Add a few items in the app** under an account, so verdicts are meaningful.
3. **Build & load the extension**: `npm run build`, then in Chrome →
   `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
   `dist/`.
4. **Sign in**: click the FitCheck toolbar icon → sign in with the **same email**
   you used in the app. The popup shows your wardrobe item count. If the analyze
   port isn't 8081, set the base URL there and **Save & test connection**.
5. **Shop**: open a clothing product on Amazon or Daraz. The FitCheck badge appears
   bottom-right, checks your wardrobe, and shows the verdict. Toggle between
   **Goes with** and **Already own**.

### What each state means

| Badge | Meaning |
|---|---|
| Spinner "Checking your wardrobe…" | Vision analysis + match in progress. |
| Green ✓ Goes with | The product complements items you own. |
| Amber ⚠ Already own | You own something similar — reconsider. |
| "Sign in to FitCheck" | Not signed in — open the toolbar icon and log in. |
| "Not a clothing item" | The page isn't clothing; nothing to check. |
| An error note | Server unreachable, no Groq key, or image unreadable (see the popup). |

## Project layout

```
src/
  background/   service worker — orchestrates image → analyze → matcher → verdict
  content/      content script, Shadow-DOM badge, and per-site adapters
    sites/      amazon.ts, daraz.ts (one file per marketplace)
  lib/          auth, apiClient, wardrobe reader + cache, analyze client, matcher, options
  popup/        sign-in + settings UI
  types/        shared garment vocabulary and message contract
```
