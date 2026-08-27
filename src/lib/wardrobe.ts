import { Garment } from '@/types/garment';
import { apiFetch } from '@/lib/apiClient';

// The read half of fitcheck/lib/wardrobeApi.ts. GET /api/garments already
// scopes to the signed-in user (via the bearer token) and returns display-ready
// data URIs for imageUrl/cutoutUrl, so there's no row-to-Garment mapping left to
// do here — unlike the Supabase version, which had to mint signed Storage URLs
// itself. Failures throw — a silently-empty wardrobe is a bug, not a state.
export async function fetchGarments(): Promise<Garment[]> {
  return apiFetch<Garment[]>('/api/garments');
}
