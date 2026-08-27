import { defineManifest } from '@crxjs/vite-plugin';

// Single source of truth for the MV3 manifest. crxjs bundles every script this
// references and rewrites the paths in the emitted manifest. The content script
// is injected only on the supported shopping domains; each site adapter then
// narrows to actual product pages.

// Amazon and Daraz storefronts across their common TLDs. Add a TLD here (and a
// nod in the adapter) to support a new marketplace region.
const SHOPPING_MATCHES = [
  'https://*.amazon.com/*',
  'https://*.amazon.co.uk/*',
  'https://*.amazon.in/*',
  'https://*.amazon.de/*',
  'https://*.amazon.ca/*',
  'https://*.daraz.pk/*',
  'https://*.daraz.com.bd/*',
  'https://*.daraz.lk/*',
];

export default defineManifest({
  manifest_version: 3,
  name: 'FitCheck',
  version: '0.1.0',
  description: 'Wardrobe-aware buy/skip suggestions while you shop.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'FitCheck',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: SHOPPING_MATCHES,
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  // `declarativeNetRequest` lets the worker rewrite the Origin header on its calls
  // to the local analyze server — see the DNR rule in background/index.ts.
  permissions: ['storage', 'declarativeNetRequest'],
  // The worker fetches product images from arbitrary CDNs and reaches the
  // FitCheck server (auth, garments, wishlist, shop-checks, analyze-item).
  // `<all_urls>` keeps the demo frictionless across unknown image hosts; a
  // production build would narrow this to the known marketplace image CDNs +
  // the deployed FitCheck origin.
  host_permissions: ['<all_urls>'],
});
