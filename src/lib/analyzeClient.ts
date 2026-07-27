import { GarmentDraft } from '@/types/garment';

// Thin, typed wrapper over the one server route the extension still needs:
// POST /api/analyze-item (Groq vision). It turns a product photo (raw base64, no
// data: prefix — the route adds that) into a structured candidate garment. The
// route's two "expected" failures map to typed results the worker branches on;
// anything else throws, so a real outage is never mistaken for "not a garment".

export type AnalyzeResult =
  | { kind: 'garment'; draft: GarmentDraft }
  | { kind: 'not_garment' } // 422: the model says this photo isn't clothing
  | { kind: 'no_key' }; //     503: the server has no Groq key configured

export async function analyzeItem(imageBase64: string, baseUrl: string): Promise<AnalyzeResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/analyze-item`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });

  if (res.status === 422) return { kind: 'not_garment' };
  if (res.status === 503) return { kind: 'no_key' };
  if (!res.ok) throw new Error(`analyze-item failed: ${res.status}`);

  const data = (await res.json()) as { draft: GarmentDraft };
  return { kind: 'garment', draft: data.draft };
}
