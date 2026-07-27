import { DEFAULT_ANALYZE_BASE_URL } from '@/config';

// The one runtime-configurable setting: the base URL of the FitCheck Expo server
// that hosts /api/analyze-item. Defaults to the compiled-in dev host; the popup
// lets the user point it elsewhere (e.g. a deployed server). Stored in
// chrome.storage.local so the worker and popup share it.

const KEY = 'fitcheck.analyzeBaseUrl';

export async function getAnalyzeBaseUrl(): Promise<string> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as string | undefined;
  return stored && stored.trim().length > 0 ? stored : DEFAULT_ANALYZE_BASE_URL;
}

export async function setAnalyzeBaseUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: url.trim() });
}
