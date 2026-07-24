# FitCheck Shopping Extension — Implementation Plan

**Date:** 2026-07-24
**Design:** [2026-07-24-fitcheck-extension-design.md](./2026-07-24-fitcheck-extension-design.md)
**Scope:** Portfolio demo (single user), Manifest V3, TypeScript, Vite + `@crxjs/vite-plugin`

Build order is bottom-up: the pure, testable core first, then the network layer, then
the browser wiring, then the sites. Each phase ends in something you can verify.

---

## Phase 0 — Project scaffold

**Goal:** an installable empty MV3 extension that builds.

- [ ] `npm init` in `portfolio-fitcheck-extension/`; add TypeScript, Vite,
      `@crxjs/vite-plugin`, a test runner (Vitest).
- [ ] `manifest.config.ts` (MV3): name, version, service worker, options page,
      placeholder `content_scripts`, and `host_permissions`.
- [ ] `src/` layout per design: `content/`, `content/sites/`, `background/`, `lib/`,
      `options/`, `types/`.
- [ ] Copy shared types from the app into `src/types/garment.ts` (Garment, Category,
      Formality, Occasion, SeasonName) so candidate and wardrobe share one shape.
- [ ] `npm run build` produces a `dist/` that loads in Chrome (`chrome://extensions`
      → Load unpacked) with no errors.

**Verify:** extension loads; options page opens; service worker registers.

## Phase 1 — Matcher (pure core, TDD)

**Goal:** deterministic verdict logic, fully unit-tested, no browser or network.

- [ ] `src/lib/matcher.ts` with named threshold constants (color distance, formality
      window, category-pairing table).
- [ ] `colorDistance(hexA, hexB)` helper (hex → RGB → Euclidean) + tests.
- [ ] `alreadyOwn(candidate, wardrobe)` — same category + color within threshold +
      formality within 1.
- [ ] `goesWith(candidate, wardrobe)` — shared occasion + formality within 1 + pairable
      category.
- [ ] `verdict(candidate, wardrobe)` — returns `{ variant, goesWith, alreadyOwn }` with
      caution-first default when a duplicate exists.
- [ ] Tests: duplicate, complement, empty wardrobe, boundary formality, non-pairable
      category, no matches.

**Verify:** `npm test` green for all matcher cases.

## Phase 2 — API client

**Goal:** typed wrapper over the three FitCheck routes.

- [ ] `src/lib/apiClient.ts`: `analyzeItem(base64)`, `fetchGarments()`, `imageUrl(id)`.
- [ ] Base URL read from options storage (default dev host); mirrors `wardrobeApi.ts` —
      failures throw, no fake fallbacks.
- [ ] Map `not_garment` (422) and `no_key` (503) responses to typed results the worker
      can branch on.
- [ ] Tests with mocked `fetch`: request shape, success mapping, error throwing.

**Verify:** unit tests green; a manual node/console call against the running server
returns real garments.

## Phase 3 — Wardrobe cache

**Goal:** avoid refetching the wardrobe on every page.

- [ ] `src/lib/wardrobeCache.ts` over `chrome.storage.local`: `get()` returns fresh data
      or refetches via the API client; TTL constant; `clear()` for manual refresh.

**Verify:** first call hits the network, second within TTL does not (log/observe).

## Phase 4 — Service worker orchestration

**Goal:** end-to-end verdict from an image URL, no UI yet.

- [ ] `src/background/index.ts`: message handler for `ANALYZE`.
- [ ] Fetch image bytes → base64 (worker has host permission for CDNs).
- [ ] Call `apiClient.analyzeItem`; on `not_garment` reply `NOT_GARMENT`.
- [ ] Load wardrobe from cache; run `matcher.verdict`; reply `VERDICT`.
- [ ] Error → typed `ERROR` messages matching the design's error table.

**Verify:** from the service worker console, post a real product image URL and see a
correct verdict object logged.

## Phase 5 — Badge UI (Shadow DOM)

**Goal:** the injected badge, rendered from a verdict, mirroring `MatchBadge`.

- [ ] `src/content/badge.ts`: create a Shadow DOM host; render loading / goes-with /
      already-own / not-garment / error states.
- [ ] Port `MatchBadge` styling (green vs amber, headline copy, up to 3 thumbnails via
      `apiClient.imageUrl(id)`).
- [ ] Toggle between "Goes with" and "Already own" (both lists precomputed).
- [ ] Dismiss / re-open affordance.

**Verify:** feed the badge a hardcoded verdict on any page and confirm it renders both
states correctly and is visually isolated from the host page.

## Phase 6 — Site adapters + content script wiring

**Goal:** real product pages drive the badge.

- [ ] `src/content/sites/amazon.ts` and `daraz.ts`: `match(url)` + `extractProduct(document)`.
- [ ] `src/content/index.ts`: pick the adapter, extract the product, inject the badge in
      loading state, send `ANALYZE`, render the returned verdict.
- [ ] Finalize `content_scripts` matches and `host_permissions` in the manifest.
- [ ] Adapter tests against saved HTML fixtures for each site.

**Verify:** with the FitCheck server running, open a real shirt on Amazon and on Daraz →
badge loads → verdict matches the known wardrobe.

## Phase 7 — Options / popup + polish

**Goal:** configurable and demo-ready.

- [ ] Options page: `apiBaseUrl` field, "test connection" (hits `/api/garments`),
      "refresh wardrobe" (clears cache).
- [ ] Empty-wardrobe and server-unreachable messaging per the error table.
- [ ] README with the demo runbook (start server, load extension, set base URL, open a
      product).

**Verify:** full manual demo checklist from the design passes end to end.

---

## Dependencies / preconditions

- FitCheck Expo server running locally with `GROQ_API_KEY` and Supabase env set (the
  extension does not work without a reachable `/api/*`).
- The `garments` table has a few items so verdicts are meaningful.

## Review gates

Stop for review after **Phase 1** (matcher logic is the heart of the product) and after
**Phase 6** (first real end-to-end result), before final polish.
