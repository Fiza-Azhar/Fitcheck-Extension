// The contract every site adapter implements. Sites change their DOM often, so
// each site lives in its own file behind this interface: a break is a one-file
// fix and a new site is a new file, never an edit to shared logic.

export interface ScrapedProduct {
  imageUrl: string; // required — with no image there is nothing to analyze
  title: string;
  price: string | null;
}

export interface SiteAdapter {
  name: string;
  // Does this adapter handle the given page URL (a product page, not search/home)?
  match(url: string): boolean;
  // Pull the product out of the DOM, or null if this isn't a usable product page.
  extractProduct(doc: Document): ScrapedProduct | null;
}

// Shared helpers so each adapter stays a thin list of selectors.

export function firstText(doc: Document, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = doc.querySelector(sel)?.textContent?.trim();
    if (text) return text;
  }
  return null;
}

export function firstAttr(doc: Document, selectors: string[], attrs: string[]): string | null {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    for (const attr of attrs) {
      const value = el.getAttribute(attr)?.trim();
      if (value) return value;
    }
  }
  return null;
}
