/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPATIALREAL_APP_ID: string;
  readonly VITE_SPATIALREAL_AVATAR_ID: string;
  readonly VITE_SPATIALREAL_ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
