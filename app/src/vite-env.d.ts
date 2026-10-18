/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" builds the static site (no backend). */
  readonly VITE_STATIC?: string
  /** production | preview | local, set from VERCEL_ENV at build time. */
  readonly VITE_DEPLOY_ENV?: string
  /** Build identifier, e.g. the git commit. */
  readonly VITE_VERSION?: string
}
