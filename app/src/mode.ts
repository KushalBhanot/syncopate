/**
 * Two ways the app can run:
 * - server: talks to the Python API (uploads, AI alignment, WebSocket sync across devices).
 * - static: a plain website with no backend (Vercel). Demo songs ship with the site, people can
 *   open their own audio + cue file, edits stay in their browser, and screens sync between
 *   windows of the same browser.
 */
export const STATIC = import.meta.env.VITE_STATIC === '1'

/** Which deployment this is, for the environment badge. Vercel sets VERCEL_ENV at build time. */
export const DEPLOY_ENV: string = import.meta.env.VITE_DEPLOY_ENV || 'local'
