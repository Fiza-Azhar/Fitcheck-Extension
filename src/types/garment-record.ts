import { Category, Formality, Occasion, SeasonName } from '@/types/garment';

// A garment row exactly as stored in Supabase and returned by PostgREST — mirrors
// fitcheck/interfaces/garment-record.ts. It holds Storage object *paths*, not URLs;
// the reader mints short-lived signed URLs from them for display.
export interface GarmentRecord {
  id: string;
  userId: string;
  name: string;
  category: Category;
  color: string;
  formality: Formality;
  pattern: string;
  seasons: SeasonName[];
  occasions: Occasion[];
  wearCount: number;
  imagePath: string | null;
  cutoutPath: string | null;
  createdAt: string;
}
