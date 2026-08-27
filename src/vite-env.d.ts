/// <reference types="vite/client" />

// The build-time config the extension is compiled with. There's nothing secret
// here — the API base URL is just a hostname, and every request is authorized
// by the bearer token stored in chrome.storage, not by anything baked into
// the build.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
