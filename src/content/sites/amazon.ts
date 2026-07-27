import { firstAttr, firstText, ScrapedProduct, SiteAdapter } from '@/content/sites/types';

// Amazon product pages live under /dp/<ASIN> or /gp/product/<ASIN> on any Amazon
// TLD. The main image is #landingImage (data-old-hires is the full-res source);
// price is the visually-hidden .a-offscreen inside the price block.
export const amazon: SiteAdapter = {
  name: 'amazon',

  match(url) {
    try {
      const u = new URL(url);
      return /(^|\.)amazon\./.test(u.hostname) && /\/(dp|gp\/product)\//.test(u.pathname);
    } catch {
      return false;
    }
  },

  extractProduct(doc): ScrapedProduct | null {
    const imageUrl =
      firstAttr(doc, ['#landingImage', '#imgTagWrapperId img'], ['data-old-hires', 'src']) ??
      firstAttr(doc, ['meta[property="og:image"]'], ['content']);
    if (!imageUrl) return null;

    const title = firstText(doc, ['#productTitle']) ?? doc.title.trim();
    const price = firstText(doc, [
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '.a-price .a-offscreen',
    ]);

    return { imageUrl, title, price };
  },
};
