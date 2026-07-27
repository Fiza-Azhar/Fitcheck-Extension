import { Garment } from '@/types/garment';
import { GarmentRecord } from '@/types/garment-record';
import { supabase } from '@/lib/supabaseClient';

// The read half of fitcheck/lib/wardrobeApi.ts, ported verbatim in spirit: query
// the garments table (RLS returns only the signed-in user's rows) and turn each
// row's Storage path into a short-lived signed URL for the badge thumbnails.
// Failures throw — a silently-empty wardrobe is a bug, not a state.

const BUCKET = 'garment-images';
// Signed URLs outlive the wardrobe cache TTL, so a cached URL is still valid while
// the cached wardrobe is fresh.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

// Row → the shape the matcher and badge use. Image/cutout paths become signed
// URLs; a missing path stays null and the tile falls back to the garment colour.
async function toGarment(record: GarmentRecord): Promise<Garment> {
  const [imageUrl, cutoutUrl] = await Promise.all([
    signedUrl(record.imagePath),
    signedUrl(record.cutoutPath),
  ]);
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    color: record.color,
    formality: record.formality,
    pattern: record.pattern,
    seasons: record.seasons,
    occasions: record.occasions,
    wearCount: record.wearCount,
    imageUrl,
    cutoutUrl,
  };
}

export async function fetchGarments(): Promise<Garment[]> {
  const { data, error } = await supabase
    .from('garments')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) throw new Error(error.message);
  return Promise.all((data as GarmentRecord[]).map(toGarment));
}
