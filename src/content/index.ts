import { AnalyzeRequest, SaveResponse, SaveWishlistRequest, WorkerResponse } from '@/types/messages';
import { adapters } from '@/content/sites';
import { BadgeHandle, mountBadge, SaveState } from '@/content/badge';
import { ScrapedProduct } from '@/content/sites/types';

// The content script: on a supported product page, scrape the product, show the
// badge in a loading state, ask the worker for a verdict, and render whatever it
// returns. On a verdict it also offers "Save to FitCheck", which persists the
// analyzed item to the wishlist the app reads. If no adapter matches or no
// product is found, nothing is injected.

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
    renderResponse(badge, product, resp);
  });
}

function renderResponse(badge: BadgeHandle, product: ScrapedProduct, resp: WorkerResponse): void {
  switch (resp.type) {
    case 'VERDICT':
      // The candidate (analyzed garment) plus the scraped product is exactly a
      // wishlist item. Wire the save action and drive its state from the ack.
      renderVerdict(badge, resp, product, 'idle');
      break;
    case 'NOT_GARMENT':
      badge.update({ kind: 'not_garment' });
      break;
    case 'SIGNED_OUT':
      badge.update({ kind: 'signed_out' });
      break;
    case 'ERROR':
      badge.update({ kind: 'error', message: resp.message });
      break;
  }
}

function renderVerdict(
  badge: BadgeHandle,
  resp: Extract<WorkerResponse, { type: 'VERDICT' }>,
  product: ScrapedProduct,
  saveState: SaveState,
): void {
  const onSave = () => {
    renderVerdict(badge, resp, product, 'saving');
    const save: SaveWishlistRequest = {
      type: 'SAVE_WISHLIST',
      item: {
        ...resp.candidate,
        productUrl: location.href,
        imageUrl: product.imageUrl,
        price: product.price,
      },
    };
    chrome.runtime.sendMessage(save, (ack: SaveResponse | undefined) => {
      const saved = !chrome.runtime.lastError && ack?.type === 'WISHLIST_SAVED';
      renderVerdict(badge, resp, product, saved ? 'saved' : 'idle');
    });
  };

  badge.update({ kind: 'verdict', verdict: resp.verdict, onSave, saveState });
}

run();
