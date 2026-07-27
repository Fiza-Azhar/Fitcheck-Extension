import { AnalyzeRequest, WorkerResponse } from '@/types/messages';
import { adapters } from '@/content/sites';
import { BadgeState, mountBadge } from '@/content/badge';

// The content script: on a supported product page, scrape the product, show the
// badge in a loading state, ask the worker for a verdict, and render whatever it
// returns. If no adapter matches or no product is found, nothing is injected.

function toBadgeState(resp: WorkerResponse): BadgeState {
  switch (resp.type) {
    case 'VERDICT':
      return { kind: 'verdict', verdict: resp.verdict };
    case 'NOT_GARMENT':
      return { kind: 'not_garment' };
    case 'SIGNED_OUT':
      return { kind: 'signed_out' };
    case 'ERROR':
      return { kind: 'error', message: resp.message };
  }
}

function run(): void {
  const adapter = adapters.find((a) => a.match(location.href));
  if (!adapter) return;

  const product = adapter.extractProduct(document);
  if (!product) {
    // Not an error the user needs to see — usually the site changed its DOM. The
    // warning points a maintainer at the one file to fix.
    console.warn(`[FitCheck] ${adapter.name}: no product found on`, location.href);
    return;
  }

  const badge = mountBadge();
  badge.update({ kind: 'loading' });

  const request: AnalyzeRequest = {
    type: 'ANALYZE',
    imageUrl: product.imageUrl,
    title: product.title,
    price: product.price,
    pageUrl: location.href,
  };

  chrome.runtime.sendMessage(request, (resp: WorkerResponse | undefined) => {
    if (chrome.runtime.lastError || !resp) {
      badge.update({ kind: 'error', message: 'FitCheck could not complete the check.' });
      return;
    }
    badge.update(toBadgeState(resp));
  });
}

run();
