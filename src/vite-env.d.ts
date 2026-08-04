/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO?: string;
  readonly VITE_JELLYFIN_URL?: string;
  readonly VITE_JELLYFIN_USERNAME?: string;
  readonly VITE_JELLYFIN_PASSWORD?: string;
  readonly VITE_JELLYSEERR_URL?: string;
  readonly VITE_JELLYSEERR_APIKEY?: string;
  readonly VITE_ROMM_URL?: string;
  readonly VITE_ROMM_APIKEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

