# FitCheck Shopping Extension — Design

**Date:** 2026-07-24 (revised)
**Scope:** Portfolio demo — real multi-user via Supabase Auth
**Status:** Approved design, ready for implementation planning

> **Revision note.** An earlier draft of this design assumed a single-user backend
> where the extension called Expo API routes (`/api/garments`, `/api/images/[id]`)
> that fronted a service-role Supabase key. **The app no longer works that way.**
> FitCheck moved to Supabase Auth + Row-Level Security: the mobile client talks
> straight to Supabase with the **anon key**, RLS scopes every query to the
> signed-in user's JWT, and images come from a private Storage bucket via
> short-lived **signed URLs** (see `fitcheck/lib/wardrobeApi.ts`,
> `fitcheck/lib/supabase.ts`, `fitcheck/supabase/schema.sql`). Those `/api/garments`
> and `/api/images/[id]` routes do not exist. This design is rewritten to match
> reality and to deliver the actual goal: **the same email that adds items on the
> phone sees those items in the extension while shopping.**

---

## 1. Purpose

A browser extension that helps the user make smarter clothing purchases. While the
user browses a product on a shopping site (Amazon, Daraz), a floating **FitCheck
badge** appears over the product and tells them, based on **their own FitCheck
wardrobe** (the one they built in the mobile app under the same account), either:

- **✓ Positive** — "Goes with N items you already own" (buy it, it complements your wardrobe)
- **⚠ Caution** — "You already own N similar items" (reconsider, you own something like this)

This is the browser counterpart of the mobile app's `app/(tabs)/shop.tsx` tab, which
today is a hardcoded dummy of the same experience and serves as the visual reference.

## 2. The core mechanism: "same email = same wardrobe"

The mobile app and the extension are **two clients of one Supabase project**:

1. On the phone, the user signs in and adds garments. Each row is written with
   `userId = auth.uid()` and photos are stored under `<uid>/…` in the private
   `garment-images` bucket (`fitcheck/supabase/schema.sql`).
2. In the extension, the user signs in **with the same email/password**. Supabase
   returns a session JWT for the **same `uid`**.
3. Every wardrobe query the extension makes carries that JWT. RLS returns exactly
   that user's rows — the same garments the phone wrote. Signed image URLs for the
   badge thumbnails are minted against the same session.

No user-id is ever passed by hand and no cross-user access is possible: identity is
the JWT, and RLS is the gate. This is the whole feature, and it needs **no new
backend** — the extension is simply another Supabase client, exactly like the app.

## 3. Non-goals (demo scope)

- **No new database, no new tables.** Reuses the existing `garments` table, RLS
  policies, and `garment-images` bucket unchanged.
- **No service-role key anywhere in the extension.** It ships only the **anon** key
  (safe by design — RLS, not key secrecy, protects data) plus the Supabase URL.
- **No deployment required for the wardrobe path.** Supabase is already hosted, so
  wardrobe reads work from any machine. The one server dependency is the Expo
  `/api/analyze-item` route (below); for the demo it runs on the local dev server.

## 4. Reuse of the existing system

| Existing asset | Reused for |
|---|---|
| Supabase Auth (`signInWithPassword`) | Extension login — same accounts as the app (`fitcheck/lib/AuthSession.tsx`) |
| `garments` table + RLS | The wardrobe the extension reads, scoped by JWT |
| `garment-images` bucket + signed URLs | Badge thumbnails (`fitcheck/lib/wardrobeApi.ts` `signedUrl`/`toGarment`) |
| `POST /api/analyze-item` (Groq vision) | Turn a product photo into a structured candidate `Garment` |
| `Garment` interface + garment vocabulary | Shared data shape (candidate == wardrobe item) |
| `MatchBadge` component + `app/(tabs)/shop.tsx` | Visual/UX reference for the injected badge |

**Garment vocabulary** is fixed and small (`fitcheck/constants/garment.ts`): categories
`top | bottom | footwear`, occasions `office | casual | wedding | winter`, seasons
`spring | summer | autumn | winter`, formality `1–5`. The matcher is built against
exactly this vocabulary.

### What must be built new (not reusable as-is)

- **The matcher.** `fitcheck/lib/matching.ts` is now just
  `shopMatches = items.filter(g => g.occasions.includes(occasion))` — a one-line
  occasion filter. The real "already own / goes with" logic described in §6 does
  **not** exist yet and is the heart of this project.
- **A Supabase client that runs in an MV3 service worker.** No `localStorage` there,
  so the session is persisted via a `chrome.storage` storage adapter.

### Security boundary

The **service_role key never ships** — the extension holds only the anon key and
URL, the same posture as the mobile bundle. `/api/analyze-item` keeps the Groq key
server-side; the extension only POSTs an image to it and receives a draft garment.

## 5. Architecture

Manifest V3 Chrome extension, TypeScript, built with Vite + `@crxjs/vite-plugin`.

```
Shopping product page (Amazon / Daraz)
        │
        ▼
┌─────────────────────┐   product image URL, title, price
│  Content script     │───────────────────────────────────┐
│  - detect product   │                                    │
│  - scrape image/URL │◀── verdict + thumbnails ───┐       │
│  - inject badge     │                            │       │
│    (Shadow DOM)     │                            │       │
└─────────────────────┘                            │       ▼
                                          ┌─────────────────────────────────┐
                                          │  Service worker                 │
                                          │  - fetch image → base64         │
                                          │  - POST /api/analyze-item       │───▶ Expo server
                                          │  - Supabase client (JWT):       │     (Groq key only)
                                          │      read garments, sign URLs   │───▶ Supabase
                                          │  - run matcher                  │     (Auth + RLS + Storage)
                                          │  - cache wardrobe               │
                                          └─────────────────────────────────┘
                                                     ▲
                                          ┌─────────────────────────┐
                                          │  Popup (auth + options) │
                                          │  - email/password login │
                                          │  - session status       │
                                          │  - refresh wardrobe      │
                                          └─────────────────────────┘
```

### Components

1. **Auth module** (`src/lib/auth.ts`) — wraps a Supabase client configured with a
   `chrome.storage` session adapter. `signIn(email, password)`, `signOut()`,
   `getSession()`, `onAuthChange()`. This is the "same email" link and the piece the
   old design omitted. Mirrors `fitcheck/lib/AuthSession.tsx`.

2. **Supabase wardrobe reader** (`src/lib/wardrobe.ts`) — ports the read half of
   `fitcheck/lib/wardrobeApi.ts`: `fetchGarments()` (`select('*')`, RLS-scoped) and
   `signedUrl(path)` for thumbnails. Failures throw; nothing invents a fallback.

3. **Analyze client** (`src/lib/analyzeClient.ts`) — thin wrapper over
   `POST /api/analyze-item`. Base URL from options (default local dev host).
   Maps `not_garment` (422) and `no_key` (503) to typed results the worker branches on.

4. **Matcher** (`src/lib/matcher.ts`) — pure, deterministic, no network/AI. See §6.
   Fully unit-testable. `goesWith`, `alreadyOwn`, `verdict`.

5. **Wardrobe cache** (`src/lib/wardrobeCache.ts`) — stores the fetched wardrobe in
   `chrome.storage.local` with a timestamp; serves it within a TTL, refetches
   otherwise; cleared by the popup's "refresh" and on sign-out.

6. **Service worker** (`src/background/`) — message handler: fetch product image →
   base64 → `/api/analyze-item` → candidate garment → load wardrobe (cache or
   Supabase) → `matcher.verdict` → reply. Requires a signed-in session; if none,
   replies `SIGNED_OUT` so the badge prompts login.

7. **Content script + site adapters** (`src/content/`, `src/content/sites/`) — detect
   product pages, scrape `{ imageUrl, title, price }` per site, inject the badge in a
   **Shadow DOM** root, render verdicts. One file per site (`amazon.ts`, `daraz.ts`)
   so a DOM change is a one-file fix.

8. **Popup** (`src/popup/`) — login form (email/password), signed-in status
   ("Signed in as X"), sign out, API base URL, "test connection", "refresh wardrobe".

### Badge UI

Rebuilds `MatchBadge` in vanilla DOM inside the Shadow DOM. Same two states and copy:

- **Goes with:** green surface/border, `✓ Goes with {count} items you already own`, up
  to 3 wardrobe thumbnails (signed URLs).
- **Already own:** amber surface/border, `⚠ You already own {count} similar items`, up
  to 3 thumbnails.
- A toggle switches views (both lists precomputed), mirroring `shop.tsx`.
- States: **signed-out** (prompt to open the popup and log in), **loading** (vision
  call in flight), **not-a-garment** (quiet, dismissable), **error** (per §7).

## 6. Matcher rules (deterministic)

Thresholds live as named constants in `matcher.ts` so they are easy to tune. Built
against the fixed vocabulary in §4.

**Already own (caution) — near-duplicate.** A wardrobe item is "similar" when **all**:
- same `category` as the candidate, and
- color distance below a threshold (hex → RGB → Euclidean), and
- `|formality − candidate.formality| ≤ 1`.

If ≥1 similar item exists, the default variant is **caution** ("you already own a
similar shirt").

**Goes with (positive) — complement.** A wardrobe item "goes with" the candidate when:
- it shares **≥1 occasion**, and
- `|formality − candidate.formality| ≤ 1`, and
- it is a **pairable category** (a top pairs with `bottom`/`footwear`; a bottom with
  `top`/`footwear`; etc. — a small category-pairing table).

**Default variant.** Any near-duplicate → show **caution** first (the more valuable
warning), "goes with" on the toggle. Otherwise **goes with** first. Both always computed.

**Empty wardrobe / no matches.** Neutral "No wardrobe data yet — add items in the
FitCheck app" rather than a misleading count.

## 7. Error handling

Follows the app's philosophy: failures are visible, never silently faked.

| Failure | Behavior |
|---|---|
| Not signed in | Badge: "Sign in to FitCheck to check your wardrobe" → opens popup. |
| Supabase unreachable / auth expired | Badge: "Couldn't reach your FitCheck wardrobe — sign in again." |
| `/api/analyze-item` unreachable | Badge: "FitCheck analysis server not reachable — is it running?" |
| `/api/analyze-item` 503 (`no_key`) | Badge: "Vision analysis unavailable (server has no Groq key)." |
| `not_garment` (422) | Quiet, dismissable "Not a clothing item"; no false verdict. |
| Image can't be fetched/encoded | Badge: "Couldn't read the product image." |
| Site DOM changed (no image) | Badge doesn't appear; console warning aids the one-file selector fix. |

## 8. Testing

- **Matcher** — pure unit tests over crafted candidate + wardrobe fixtures: duplicate,
  complement, empty wardrobe, boundary formality, non-pairable category, no matches.
- **Site adapters** — parse saved product-page HTML fixtures; assert extracted
  `{ imageUrl, title, price }`.
- **Analyze client** — mock `fetch`; assert request shape, success mapping, error throwing.
- **Auth/wardrobe** — sign in as a known demo account against the real Supabase project;
  assert the returned garments match what that account holds.
- **Manual demo checklist** — app: add a shirt under an account → extension: sign in
  with the same email → open that kind of shirt on Amazon → correct verdict; repeat for
  a near-duplicate and a non-clothing item; sign out → badge prompts login.

## 9. Configuration & permissions

- **`host_permissions`:** the Supabase project URL, the `/api/analyze-item` base URL
  (dev host), the supported shopping domains, and image CDNs (or `<all_urls>` for the
  image fetch in the demo).
- **`content_scripts` matches:** Amazon and Daraz product URL patterns.
- **Stored settings:** `apiBaseUrl` (analyze route, default dev host), wardrobe cache
  TTL. Supabase URL + anon key are build-time constants (from the app's `.env`).
- **MV3 note:** the Supabase client's session is persisted through a `chrome.storage`
  adapter because the service worker has no `localStorage`.

## 10. Relationship to the mobile app

The extension does not change the app. It reads the same data through the same anon
key + RLS boundary the app already trusts. The only shared server surface is
`/api/analyze-item`. When the app's server is deployed behind a real origin, the
extension needs only its `apiBaseUrl` updated — everything else already points at
hosted Supabase.
