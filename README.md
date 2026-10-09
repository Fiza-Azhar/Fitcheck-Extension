# Fitcheck Extension

**A Chrome extension that tells you whether to buy or skip a piece of clothing, based on what's already in your wardrobe.**

Fitcheck Extension is the browser companion to the [Fitcheck mobile app](https://github.com/Fiza-Azhar/Fitcheck). While you browse a product page (Amazon, Daraz), it analyses the product photo with AI, compares it against the wardrobe you've built in the app, and shows a floating badge:

- **✓ Goes with N items you already own** — it complements your wardrobe.
- **⚠ You already own N similar items** — you own something like this, so reconsider.

Products you check and save are synced back to the app's **Shop** tab (recent checks and wishlist).

## Highlights

- **Manifest V3** extension built with TypeScript and Vite ([@crxjs/vite-plugin](https://crxjs.dev)).
- **Shadow-DOM badge** that stays isolated from the host page's styles.
- **Per-site adapters** for Amazon and Daraz; adding a marketplace means adding one file.
- **Deterministic matcher** — AI only reads the product photo; the buy/skip verdict is plain, testable logic with no AI in the loop.
- **Same account as the app** — sign in with the same email and see the same wardrobe.
- **No secrets in the extension** — it only holds a per-user JWT, never a database credential or AI key.
- Unit tests (Vitest) for the matcher, analyze client and site adapters.

## Tech stack

TypeScript, Vite, Chrome Extensions Manifest V3, Vitest, jsdom. Backend is the Fitcheck server (Expo API routes, Neon Postgres, Groq vision).

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

1. **Start the FitCheck server** (in the [Fitcheck app repo](https://github.com/Fiza-Azhar/Fitcheck)): `npx expo start` — this serves
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
