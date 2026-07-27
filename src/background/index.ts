import {
  AnalyzeRequest,
  IncomingMessage,
  SaveResponse,
  SaveWishlistRequest,
  WorkerResponse,
} from '@/types/messages';
import { getSession } from '@/lib/auth';
import { analyzeItem } from '@/lib/analyzeClient';
import { getAnalyzeBaseUrl } from '@/lib/options';
import { getWardrobe } from '@/lib/wardrobeCache';
import { verdict } from '@/lib/matcher';
import { logShopCheck, saveWishlistItem, ShopVerdictLabel } from '@/lib/shopSync';

// The orchestrator. A content script sends one ANALYZE per product page; this
// runs the whole pipeline and replies with exactly one typed outcome. Every
// failure is a distinct, honest response — the badge never shows a faked verdict
// or a silent blank.

console.info('[FitCheck] service worker registered');

// Expo's dev server rejects any request whose Origin header isn't localhost or
// same-origin (its CorsMiddleware). Our fetch automatically carries
// Origin: chrome-extension://<id>, which Expo blocks before the route runs. JS
// can't remove/alter Origin on a fetch, so this declarativeNetRequest rule
// rewrites it to a localhost origin — but only for requests to a local analyze
// server. A deployed (non-localhost) server is untouched and must handle CORS
// itself. Registered on every worker start; updateDynamicRules is idempotent.
const ORIGIN_RULE_ID = 1;
async function ensureLocalhostOriginRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ORIGIN_RULE_ID],
    addRules: [
      {
        id: ORIGIN_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: 'http://localhost',
            },
          ],
        },
        condition: {
          requestDomains: ['localhost', '127.0.0.1'],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
            chrome.declarativeNetRequest.ResourceType.OTHER,
          ],
        },
      },
    ],
  });
}
ensureLocalhostOriginRule().catch((e) => console.error('[FitCheck] DNR origin rule setup failed:', e));

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the argument limit of String.fromCharCode on big images.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Fetch a product image and return raw JPEG base64 (no data: prefix — the analyze
// route adds one, hardcoded to image/jpeg). Shopping CDNs serve WebP/PNG/AVIF, so
// we decode whatever we get and re-encode to JPEG via OffscreenCanvas: that makes
// the route's jpeg assumption always true (Groq rejects a jpeg data URL wrapping
// non-jpeg bytes as "invalid image data") and downscales to stay well under the
// server's 4MB cap. Because we draw from a fetched Blob, the canvas isn't tainted.
const MAX_IMAGE_DIM = 1024;
async function fetchImageAsJpegBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return bytesToBase64(new Uint8Array(await jpeg.arrayBuffer()));
}

async function handleAnalyze(req: AnalyzeRequest): Promise<WorkerResponse> {
  // No session → nothing to compare against. Prompt login rather than guess.
  const session = await getSession();
  if (!session) return { type: 'SIGNED_OUT' };

  let imageBase64: string;
  try {
    imageBase64 = await fetchImageAsJpegBase64(req.imageUrl);
  } catch (e) {
    console.error('[FitCheck] image read failed:', e);
    return { type: 'ERROR', code: 'image_unreadable', message: "Couldn't read the product image." };
  }

  let analysis;
  try {
    analysis = await analyzeItem(imageBase64, await getAnalyzeBaseUrl());
  } catch (e) {
    // A fetch() network failure is a TypeError; a non-ok HTTP status is a plain
    // Error. Distinguish them so a server that answered with an error isn't
    // reported as "not running". Log the cause either way.
    console.error('[FitCheck] analyze failed:', e);
    if (e instanceof TypeError) {
      return {
        type: 'ERROR',
        code: 'analyze_unreachable',
        message: 'FitCheck analysis server not reachable — is it running?',
      };
    }
    return {
      type: 'ERROR',
      code: 'analyze_failed',
      message: `Analysis server error: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  if (analysis.kind === 'no_key') {
    return {
      type: 'ERROR',
      code: 'analyze_no_key',
      message: 'Vision analysis unavailable (server has no Groq key).',
    };
  }
  if (analysis.kind === 'not_garment') return { type: 'NOT_GARMENT' };

  let wardrobe;
  try {
    wardrobe = await getWardrobe();
  } catch {
    return {
      type: 'ERROR',
      code: 'wardrobe_unreachable',
      message: "Couldn't reach your FitCheck wardrobe — sign in again.",
    };
  }

  const result = verdict(analysis.draft, wardrobe);

  // Log the check to the app's feed — best-effort, never blocks or fails the
  // verdict the user is waiting on.
  const label: ShopVerdictLabel =
    result.alreadyOwn.length > 0 ? 'similar' : result.goesWith.length > 0 ? 'goes' : 'fresh';
  logShopCheck({
    title: req.title,
    productUrl: req.pageUrl,
    imageUrl: req.imageUrl,
    price: req.price,
    category: analysis.draft.category,
    color: analysis.draft.color,
    verdict: label,
    goesWithCount: result.goesWith.length,
    alreadyOwnCount: result.alreadyOwn.length,
  }).catch((e) => console.error('[FitCheck] shop-check log failed:', e));

  return { type: 'VERDICT', verdict: result, candidate: analysis.draft };
}

async function handleSaveWishlist(req: SaveWishlistRequest): Promise<SaveResponse> {
  if (!(await getSession())) {
    return { type: 'ERROR', code: 'unknown', message: 'Sign in to save to your wishlist.' };
  }
  try {
    await saveWishlistItem(req.item);
    return { type: 'WISHLIST_SAVED' };
  } catch (e) {
    console.error('[FitCheck] wishlist save failed:', e);
    return { type: 'ERROR', code: 'wardrobe_unreachable', message: "Couldn't save to your wishlist." };
  }
}

// chrome.runtime message handlers must return `true` to keep the channel open for
// an async reply. Any unexpected throw still yields a typed ERROR, never a hang.
chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
  const handler =
    message?.type === 'ANALYZE'
      ? handleAnalyze(message)
      : message?.type === 'SAVE_WISHLIST'
        ? handleSaveWishlist(message)
        : null;
  if (!handler) return undefined;

  handler
    .then(sendResponse)
    .catch((e) => sendResponse({ type: 'ERROR', code: 'unknown', message: String(e) }));
  return true;
});
