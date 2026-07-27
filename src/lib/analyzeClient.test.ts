import { afterEach, describe, expect, test, vi } from 'vitest';
import { analyzeItem } from '@/lib/analyzeClient';
import { GarmentDraft } from '@/types/garment';

const DRAFT: GarmentDraft = {
  name: 'Terracotta Knit Polo',
  category: 'top',
  color: '#C56B4A',
  formality: 3,
  pattern: 'solid',
  seasons: ['spring', 'autumn'],
  occasions: ['office', 'casual'],
};

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('analyzeItem', () => {
  test('POSTs the image to /api/analyze-item on the given base URL', async () => {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ draft: DRAFT }), { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);

    await analyzeItem('BASE64DATA', 'http://localhost:8081');

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:8081/api/analyze-item');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ imageBase64: 'BASE64DATA' });
  });

  test('strips a trailing slash from the base URL', async () => {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ draft: DRAFT }), { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    await analyzeItem('X', 'http://localhost:8081/');
    expect(spy.mock.calls[0][0]).toBe('http://localhost:8081/api/analyze-item');
  });

  test('maps a 200 response to a garment draft', async () => {
    mockFetch(200, { draft: DRAFT });
    const result = await analyzeItem('X', 'http://h');
    expect(result).toEqual({ kind: 'garment', draft: DRAFT });
  });

  test('maps 422 to not_garment', async () => {
    mockFetch(422, { error: 'not_garment' });
    expect(await analyzeItem('X', 'http://h')).toEqual({ kind: 'not_garment' });
  });

  test('maps 503 to no_key', async () => {
    mockFetch(503, { error: 'no_key' });
    expect(await analyzeItem('X', 'http://h')).toEqual({ kind: 'no_key' });
  });

  test('throws on other non-ok statuses', async () => {
    mockFetch(502, { error: 'groq_failed' });
    await expect(analyzeItem('X', 'http://h')).rejects.toThrow();
  });
});
