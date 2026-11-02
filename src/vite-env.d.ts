/// <reference types="vite/client" />

declare const __HALCYON_BUILD_SOURCE__: {revision:string|null;clean:boolean;bundled:boolean};
declare const __HALCYON_APP_VERSION__: string;

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
