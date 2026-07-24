# FitCheck Shopping Extension — Design

**Date:** 2026-07-24
**Scope:** Portfolio demo (single user)
**Status:** Approved design, ready for implementation planning

---

## 1. Purpose

A browser extension that helps the user make smarter clothing purchases. While the
user browses a product on a shopping site (Amazon, Daraz), a floating **FitCheck
badge** appears over the product and tells them, based on their existing FitCheck
wardrobe, either:

- **✓ Positive** — "Goes with N items you already own" (buy it, it complements your wardrobe)
- **⚠ Caution** — "You already own N similar items" (reconsider, it duplicates something)

This is the browser counterpart of the mobile app's `app/(tabs)/shop.tsx` tab, which
already exists as a hardcoded dummy of the same experience.

## 2. Non-goals (demo scope)

- **No multi-user auth.** The extension talks to the same single-user backend the
  mobile app uses. Structuring for multi-user is a later upgrade, not this project.
- **No new database.** Reuses the existing Supabase `garments` table via the existing
  Expo API routes.
- **No deployment required.** The demo runs against the developer's local Expo server.
  Deploying that server is the only change needed to make the extension work off the
  local machine — but that is out of scope here.

## 3. Reuse of existing system

The mobile app (`fitcheck/`) already provides everything the extension needs on the
server side. The extension is a **new untrusted client** of the *same* API surface.

| Existing asset | Reused for |
|---|---|
| `POST /api/analyze-item` (Groq vision) | Turn a product photo into a structured `Garment` |
| `GET /api/garments` | Load the user's wardrobe |
| `GET /api/images/[id]` | Render wardrobe thumbnails in the badge |
| `lib/matching.ts` (`shopMatches`) logic | Basis for the extension's matcher |
| `MatchBadge` component + `app/(tabs)/shop.tsx` | Visual/UX reference for the injected badge |
| `Garment` / `GarmentRecord` interfaces | Shared data shape (candidate == wardrobe item) |

### Security boundary (critical)

The Supabase **service_role key lives only in `lib/server/db.ts`** and never leaves the
server. A browser extension is untrusted, so it **must not** hold that key. The
extension therefore only ever calls the Expo **API routes** — exactly the same
boundary the mobile app's client respects. No Supabase credentials ship in the
extension.

## 4. Architecture

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
                                          ┌─────────────────────────┐
                                          │  Service worker         │
                                          │  - fetch image → base64 │
                                          │  - call API client      │
                                          │  - run matcher          │
                                          │  - cache wardrobe       │
                                          └─────────────────────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────────┐
                                          │  FitCheck Expo server   │
                                          │  /api/analyze-item      │
                                          │  /api/garments          │
                                          │  /api/images/[id]       │
                                          │  (holds Supabase key)   │
                                          └─────────────────────────┘
```

### Components

Each unit has one purpose, a clear interface, and can be tested independently.

1. **Content script** (`src/content/`)
   - **Does:** Detects a product page on a supported site; extracts the main product
     image URL, title, and price using per-site selectors; injects the badge UI into a
     **Shadow DOM** root (so the host page's CSS cannot break it, and ours cannot leak
     into theirs); listens for verdict messages and renders/updates the badge.
   - **Interface:** Sends `{ type: 'ANALYZE', imageUrl, title, price, pageUrl }` to the
     worker; receives `{ type: 'VERDICT', result }`.
   - **Depends on:** per-site selector config, the badge renderer.

2. **Site adapters** (`src/content/sites/`)
   - **Does:** One small module per supported site (`amazon.ts`, `daraz.ts`) exporting
     a `match(url)` predicate and a `extractProduct(document)` function returning
     `{ imageUrl, title, price } | null`.
   - **Why isolated:** Sites change their DOM often. Keeping selectors in one file per
     site means a break is a one-file fix and adding a site is a new file, not an edit
     to shared logic.

3. **Service worker** (`src/background/`)
   - **Does:** Orchestrates a request: fetch the product image bytes, base64-encode
     them, POST to `/api/analyze-item`, receive a candidate `Garment`; ensure the
     wardrobe is loaded (cache or refetch); run the matcher; send the verdict back.
   - **Interface:** message handler over `chrome.runtime`.
   - **Depends on:** API client, matcher, wardrobe cache.

4. **API client** (`src/lib/apiClient.ts`)
   - **Does:** Thin typed wrapper over the three FitCheck routes. Base URL comes from
     options (default: the local dev host). Mirrors the mobile app's `wardrobeApi.ts`
     style — failures throw, nothing invents a fallback.
   - **Interface:** `analyzeItem(base64) → Garment | NotGarment`, `fetchGarments() → Garment[]`,
     `imageUrl(id) → string`.

5. **Matcher** (`src/lib/matcher.ts`)
   - **Does:** Pure, deterministic functions comparing the candidate garment to the
     wardrobe. No network, no AI. Ports and extends `lib/matching.ts`.
   - **Interface:**
     - `goesWith(candidate, wardrobe) → Garment[]`
     - `alreadyOwn(candidate, wardrobe) → Garment[]`
     - `verdict(candidate, wardrobe) → { variant, goesWith, alreadyOwn }`
   - **Depends on:** nothing (pure). Fully unit-testable.

6. **Wardrobe cache** (`src/lib/wardrobeCache.ts`)
   - **Does:** Stores the fetched wardrobe in `chrome.storage.local` with a timestamp;
     serves it if fresh (TTL, e.g. 10 min), refetches otherwise. A manual "refresh"
     action in the popup clears it.

7. **Popup / options page** (`src/options/`)
   - **Does:** Set the API base URL; show connection status (can it reach
     `/api/garments`?); manual "refresh wardrobe" button; short help text
     ("make sure the FitCheck server is running").

### Badge UI

Rebuilds `MatchBadge` in the DOM (vanilla, inside the Shadow DOM). Same two states and
copy as the mobile component:

- **Goes with:** green surface/border, `✓ Goes with {count} items you already own`, up
  to 3 wardrobe thumbnails.
- **Already own:** amber surface/border, `⚠ You already own {count} similar items`, up
  to 3 thumbnails.
- A small toggle switches between the two views, mirroring `shop.tsx`.
- A loading state while the vision call is in flight; a quiet dismissable state when the
  page product isn't clothing (`/api/analyze-item` returns `not_garment`).

## 5. Data flow (happy path)

1. User opens a product page. The content script's site adapter matches the URL and
   extracts `{ imageUrl, title, price }`.
2. Content script injects the badge in a **loading** state and sends `ANALYZE` to the
   worker.
3. Worker fetches the image bytes (host permission covers the CDN), base64-encodes them,
   and POSTs to `/api/analyze-item`.
   - If the response is `not_garment` (422), worker replies with a `NOT_GARMENT` verdict
     and the badge shows a quiet "not a clothing item" note.
4. On success, worker gets a candidate `Garment` (same shape as wardrobe items).
5. Worker loads the wardrobe (cache hit, or `GET /api/garments`).
6. Worker runs `matcher.verdict(candidate, wardrobe)`.
7. Worker sends `VERDICT` back. Content script renders the badge with thumbnails whose
   `src` is `{{apiBase}}/api/images/{id}` for each matched garment.

## 6. Matcher rules (deterministic)

Chosen to match the spirit of `shopMatches` and the mobile UX, while being explainable.
All thresholds live as named constants in `matcher.ts` so they are easy to tune.

**Already own (caution) — near-duplicate detection.** A wardrobe item is "similar" when
**all** hold:
- same `category` as the candidate, and
- color distance below a threshold (compare hex → RGB → Euclidean distance, or a
  simple hue/lightness bucket), and
- `|formality - candidate.formality| <= 1`.

If ≥1 similar item exists, the default badge variant is **caution**.

**Goes with (positive) — complement detection.** A wardrobe item "goes with" the
candidate when:
- it shares **≥1 occasion** with the candidate, and
- `|formality - candidate.formality| <= 1`, and
- it is a **pairable category** (e.g. a top pairs with bottoms/footwear/outerwear — a
  simple category-pairing table), and
- (optional refinement) colors are harmonious (neutral, or not a near-duplicate clash).

**Default variant selection.** If any near-duplicate exists → show **caution** first
(the more valuable warning), with "goes with" available via the toggle. Otherwise show
**goes with** first. Both lists are always computed so the toggle works instantly.

**Empty wardrobe / no matches.** Badge shows a neutral "No wardrobe data yet — add items
in the FitCheck app" message rather than a misleading count.

## 7. Error handling

Follows the mobile app's philosophy: failures are visible, never silently faked.

| Failure | Behavior |
|---|---|
| Server unreachable | Badge shows "FitCheck server not reachable — is it running?" with the configured base URL. |
| `/api/analyze-item` returns 503 (no Groq key) | Badge shows "Vision analysis unavailable (server has no Groq key)." |
| `not_garment` (422) | Quiet, dismissable "Not a clothing item" note; no false verdict. |
| Image can't be fetched/encoded | Badge shows "Couldn't read the product image." |
| Site DOM changed (no image found) | Badge does not appear; a console warning aids the one-file selector fix. |

## 8. Testing

- **Matcher** — pure unit tests: crafted candidate + wardrobe fixtures assert the
  correct `goesWith` / `alreadyOwn` sets and default variant, including duplicate,
  complement, empty-wardrobe, and boundary-formality cases.
- **Site adapters** — parse saved product-page HTML fixtures (Amazon, Daraz) and assert
  the extracted `{ imageUrl, title, price }`.
- **API client** — mock `fetch`; assert request shape and that failures throw.
- **Manual demo checklist** — server running → open a shirt on Amazon → badge loads →
  correct verdict against the known wardrobe; repeat for a near-duplicate item and a
  non-clothing item.

## 9. Configuration & permissions

- **Manifest `host_permissions`:** the FitCheck API base URL (dev host), the supported
  shopping domains, and image CDNs (or `<all_urls>` for the image fetch in the demo).
- **`content_scripts` matches:** Amazon and Daraz product URL patterns.
- **Options-stored settings:** `apiBaseUrl` (default dev host), wardrobe cache TTL.

## 10. Upgrade path to multi-user (future, not this project)

- Deploy the Expo server behind a real origin.
- Add Supabase Auth + RLS; the extension gains a login (options page) and sends a user
  token; API routes scope queries to the user.
- The extension's client/matcher/badge code is unchanged — only the API client's auth
  header and base URL move. This is why the API boundary is kept clean now.
