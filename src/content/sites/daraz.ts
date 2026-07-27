import { firstAttr, firstText, ScrapedProduct, SiteAdapter } from '@/content/sites/types';

// Daraz product pages live under /products/…-i<id>.html on any Daraz TLD. The PDP
// gallery image and title use pdp-* classes; og:image is a reliable fallback. The
// price block is .pdp-price.
export const daraz: SiteAdapter = {
  name: 'daraz',

  match(url) {
    try {
      const u = new URL(url);
      return /(^|\.)daraz\./.test(u.hostname) && u.pathname.includes('/products/');
    } catch {
      return false;
    }
  },

  extractProduct(doc): ScrapedProduct | null {
    const imageUrl =
      firstAttr(doc, ['img.pdp-mod-common-image', '.gallery-preview-panel__image'], ['src']) ??
      firstAttr(doc, ['meta[property="og:image"]'], ['content']);
    if (!imageUrl) return null;

    const title =
      firstText(doc, ['.pdp-mod-product-badge-title', '.pdp-product-title']) ?? doc.title.trim();
    const price = firstText(doc, ['.pdp-price_type_normal', '.pdp-price']);

    return { imageUrl, title, price };
  },
};
