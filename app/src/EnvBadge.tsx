import { useEffect, useState } from 'react'
import { DEPLOY_ENV, STATIC } from './mode'

type Config = { env: string; version: string; max_upload_mb: number; max_audio_minutes: number }

// Vercel calls its non-production builds "preview"; for us those are staging.
const staticConfig: Config = {
  env: DEPLOY_ENV === 'preview' ? 'staging' : DEPLOY_ENV,
  version: import.meta.env.VITE_VERSION || 'dev',
  max_upload_mb: 0,
  max_audio_minutes: 0,
}

let cached: Promise<Config> | null = null
export function getConfig(): Promise<Config> {
  cached ??= STATIC ? Promise.resolve(staticConfig) : fetch('/api/config').then((r) => r.json())
  return cached
}

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(null)
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {})
  }, [])
  return config
}

/** Marks non-production deployments so staging is never mistaken for the real thing. */
export default function EnvBadge() {
  const config = useConfig()
  if (!config || config.env === 'production') return null
  return (
    <span className={`env-badge ${config.env}`} title={`Build ${config.version}`}>
      {config.env}
    </span>
  )
}
