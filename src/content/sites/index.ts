import { SiteAdapter } from '@/content/sites/types';
import { amazon } from '@/content/sites/amazon';
import { daraz } from '@/content/sites/daraz';

// The registry the content script walks to find the adapter for the current page.
// Adding a site is: write the adapter file, add it here, add its match pattern to
// the manifest. Nothing else changes.
export const adapters: SiteAdapter[] = [amazon, daraz];
