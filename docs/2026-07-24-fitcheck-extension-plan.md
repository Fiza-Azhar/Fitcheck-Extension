# FitCheck Shopping Extension — Implementation Plan

**Date:** 2026-07-24 (revised)
**Design:** [2026-07-24-fitcheck-extension-design.md](./2026-07-24-fitcheck-extension-design.md)
**Scope:** Portfolio demo, real multi-user via Supabase Auth. Manifest V3, TypeScript,
Vite + `@crxjs/vite-plugin`.

> **Revision note.** Rewritten alongside the design after the app moved to Supabase
> Auth + RLS. The extension now **signs in with the same account** and reads the
> wardrobe **directly from Supabase** (anon key + JWT), so the "add on phone → see in
> extension" flow works for real. There is no `/api/garments` or `/api/images/[id]`
> route — those never existed in the current app. The only server dependency is
> `/api/analyze-item`.

Build order is bottom-up: the pure, testable core first, then auth + data, then the
browser wiring, then the sites. Each phase ends in something you can verify.

---

## Phase 0 — Project scaffold

**Goal:** an installable empty MV3 extension that builds.

- [ ] `npm init` in `portfolio-fitcheck-extension/`; add TypeScript, Vite,
      `@crxjs/vite-plugin`, `@supabase/supabase-js`, Vitest.
- [ ] `manifest.config.ts` (MV3): name, version, service worker, popup, placeholder
      `content_scripts`, `host_permissions` (Supabase URL, analyze host, shopping domains).
- [ ] `src/` layout: `content/`, `content/sites/`, `background/`, `lib/`, `popup/`, `types/`.
- [ ] Copy the shared vocabulary + types from the app into `src/types/garment.ts`
      (`Garment`, `Category` = top|bottom|footwear, `Occasion` = office|casual|wedding|winter,
      `SeasonName`, `Formality`) so candidate and wardrobe share one shape.
- [ ] `.env`/build config for `SUPABASE_URL` and `SUPABASE_ANON_KEY` (from the app's `.env`).
- [ ] `npm run build` → `dist/` loads in Chrome (Load unpacked) with no errors.

**Verify:** extension loads; popup opens; service worker registers.

## Phase 1 — Matcher (pure core, TDD)

**Goal:** deterministic verdict logic, fully unit-tested, no browser or network. This
is the heart of the product and does not exist yet.

- [ ] `src/lib/matcher.ts` with named threshold constants (color distance, formality
      window, category-pairing table over top/bottom/footwear).
- [ ] `colorDistance(hexA, hexB)` (hex → RGB → Euclidean) + tests.
- [ ] `alreadyOwn(candidate, wardrobe)` — same category + color within threshold +
      formality within 1.
- [ ] `goesWith(candidate, wardrobe)` — shared occasion + formality within 1 + pairable category.
- [ ] `verdict(candidate, wardrobe)` — `{ variant, goesWith, alreadyOwn }`, caution-first
      when a duplicate exists.
- [ ] Tests: duplicate, complement, empty wardrobe, boundary formality, non-pairable
      category, no matches.

**Verify:** `npm test` green for all matcher cases. **← review gate.**

## Phase 2 — Auth (the "same email" link)

**Goal:** the extension signs in with the same accounts as the app.

- [ ] `src/lib/supabaseClient.ts` — `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` with a
      **`chrome.storage` session storage adapter** (service worker has no `localStorage`),
      `autoRefreshToken: true`, `persistSession: true`.
- [ ] `src/lib/auth.ts` — `signIn(email, password)` (`signInWithPassword`), `signOut()`,
      `getSession()`, `onAuthChange()`. Failures throw. Mirrors `fitcheck/lib/AuthSession.tsx`.

**Verify:** sign in from the popup with a known demo account; `getSession()` returns a
session that survives a service-worker restart.

## Phase 3 — Wardrobe reader + cache

**Goal:** read the signed-in user's real wardrobe.

- [ ] `src/lib/wardrobe.ts` — port the read half of `fitcheck/lib/wardrobeApi.ts`:
      `fetchGarments()` (`from('garments').select('*')`, RLS-scoped) mapping rows →
      `Garment`, and `signedUrl(path)` for thumbnails. Failures throw.
- [ ] `src/lib/wardrobeCache.ts` over `chrome.storage.local`: `get()` returns fresh data
      or refetches; TTL constant; `clear()` for manual refresh and on sign-out.

**Verify:** signed in as the demo account, `fetchGarments()` returns exactly the items
that account added on the phone; second call within TTL skips the network.

## Phase 4 — Analyze client

**Goal:** turn a product image into a candidate garment.

- [ ] `src/lib/analyzeClient.ts`: `analyzeItem(base64) → GarmentDraft | NotGarment | NoKey`.
      Base URL from options (default dev host). Maps 422 `not_garment` and 503 `no_key`.
- [ ] Tests with mocked `fetch`: request shape, success mapping, error throwing.

**Verify:** a manual call against the running server returns a real draft for a shirt photo.

## Phase 5 — Service worker orchestration

**Goal:** end-to-end verdict from an image URL, no UI yet.

- [ ] `src/background/index.ts`: message handler for `ANALYZE`.
- [ ] Guard: no session → reply `SIGNED_OUT`.
- [ ] Fetch image bytes → base64; `analyzeClient.analyzeItem`; on `not_garment` reply `NOT_GARMENT`.
- [ ] Load wardrobe from cache/Supabase; run `matcher.verdict`; reply `VERDICT`.
- [ ] Errors → typed messages matching the design's error table.

**Verify:** from the service-worker console, post a real product image URL and see a
correct verdict object (and `SIGNED_OUT` when logged out).

## Phase 6 — Badge UI (Shadow DOM)

**Goal:** the injected badge, rendered from a verdict, mirroring `MatchBadge`.

- [ ] `src/content/badge.ts`: Shadow DOM host; render signed-out / loading / goes-with /
      already-own / not-garment / error states.
- [ ] Port `MatchBadge` styling (green vs amber, headline copy, up to 3 thumbnails from
      signed URLs).
- [ ] Toggle between "Goes with" and "Already own" (both lists precomputed); dismiss/re-open.

**Verify:** feed the badge a hardcoded verdict on any page; both states render and are
visually isolated from the host page.

## Phase 7 — Site adapters + content script wiring

**Goal:** real product pages drive the badge.

- [ ] `src/content/sites/amazon.ts` and `daraz.ts`: `match(url)` + `extractProduct(document)`.
- [ ] `src/content/index.ts`: pick adapter, extract product, inject badge (loading), send
      `ANALYZE`, render verdict.
- [ ] Finalize `content_scripts` matches and `host_permissions`.
- [ ] Adapter tests against saved HTML fixtures per site.

**Verify:** with the analyze server running and signed in, open a real shirt on Amazon and
Daraz → badge loads → verdict matches the account's wardrobe. **← review gate.**

## Phase 8 — Popup + polish

**Goal:** configurable and demo-ready.

- [ ] Popup: email/password login, "Signed in as X" + sign out, `apiBaseUrl` field,
      "test connection" (hits `/api/analyze-item` or a Supabase ping), "refresh wardrobe".
- [ ] Signed-out, empty-wardrobe, and unreachable messaging per the error table.
- [ ] README demo runbook: add item on phone → load extension → sign in same email →
      open a product.

**Verify:** full manual demo checklist from the design passes end to end.

---

## Dependencies / preconditions

- A Supabase project with the app's schema applied and at least one demo account that
  has added a few garments (so verdicts are meaningful).
- The Expo `/api/analyze-item` route reachable (local dev server for the demo) with
  `GROQ_API_KEY` set. Wardrobe reads need only hosted Supabase, not the Expo server.
- The extension ships the **anon** key only — never the service_role key.

## Review gates

Stop for review after **Phase 1** (matcher logic is the heart) and after **Phase 7**
(first real end-to-end result), before final polish.
