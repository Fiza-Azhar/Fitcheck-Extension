// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { amazon } from '@/content/sites/amazon';
import { daraz } from '@/content/sites/daraz';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('amazon adapter', () => {
  test('matches a /dp/ product URL, rejects search and other hosts', () => {
    expect(amazon.match('https://www.amazon.com/Cool-Shirt/dp/B0ABC123/')).toBe(true);
    expect(amazon.match('https://www.amazon.co.uk/gp/product/B0ABC123')).toBe(true);
    expect(amazon.match('https://www.amazon.com/s?k=shirt')).toBe(false);
    expect(amazon.match('https://www.daraz.pk/products/x-i1.html')).toBe(false);
  });

  test('extracts image (full-res), title and price', () => {
    const doc = parse(`
      <html><head><title>Amazon.com</title></head><body>
        <span id="productTitle">  Terracotta Knit Polo </span>
        <div id="imgTagWrapperId">
          <img id="landingImage" src="https://m.media-amazon.com/small.jpg"
               data-old-hires="https://m.media-amazon.com/full.jpg">
        </div>
        <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$68.00</span></span></div>
      </body></html>`);
    expect(amazon.extractProduct(doc)).toEqual({
      imageUrl: 'https://m.media-amazon.com/full.jpg',
      title: 'Terracotta Knit Polo',
      price: '$68.00',
    });
  });

  test('falls back to src when no full-res, and returns null price when absent', () => {
    const doc = parse(`
      <html><head><title>Amazon</title></head><body>
        <span id="productTitle">Shirt</span>
        <img id="landingImage" src="https://img/small.jpg">
      </body></html>`);
    expect(amazon.extractProduct(doc)).toEqual({
      imageUrl: 'https://img/small.jpg',
      title: 'Shirt',
      price: null,
    });
  });

  test('returns null when there is no product image', () => {
    const doc = parse(`<html><body><span id="productTitle">No image</span></body></html>`);
    expect(amazon.extractProduct(doc)).toBeNull();
  });
});

describe('daraz adapter', () => {
  test('matches a /products/ URL, rejects the homepage', () => {
    expect(daraz.match('https://www.daraz.pk/products/nice-shirt-i123.html')).toBe(true);
    expect(daraz.match('https://www.daraz.pk/')).toBe(false);
    expect(daraz.match('https://www.amazon.com/dp/B0')).toBe(false);
  });

  test('extracts image, title and price from pdp markup', () => {
    const doc = parse(`
      <html><head><title>Daraz</title></head><body>
        <h1 class="pdp-mod-product-badge-title">Linen Casual Shirt</h1>
        <img class="pdp-mod-common-image" src="https://static.daraz.pk/shirt.jpg">
        <div class="pdp-price pdp-price_type_normal">Rs. 2,499</div>
      </body></html>`);
    expect(daraz.extractProduct(doc)).toEqual({
      imageUrl: 'https://static.daraz.pk/shirt.jpg',
      title: 'Linen Casual Shirt',
      price: 'Rs. 2,499',
    });
  });

  test('falls back to og:image and document title', () => {
    const doc = parse(`
      <html><head><title>Fallback Shirt | Daraz</title>
        <meta property="og:image" content="https://static.daraz.pk/og.jpg"></head>
        <body></body></html>`);
    const product = daraz.extractProduct(doc);
    expect(product?.imageUrl).toBe('https://static.daraz.pk/og.jpg');
    expect(product?.title).toBe('Fallback Shirt | Daraz');
    expect(product?.price).toBeNull();
  });
});
