/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google Cloud Vision API key, injected at build time from a repository
   * secret. Absent in local development unless set — the app then says card
   * reading is not configured rather than failing at the tap.
   */
  readonly VITE_VISION_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
