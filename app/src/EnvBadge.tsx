import { useEffect, useState } from 'react'

type Config = { env: string; version: string; max_upload_mb: number; max_audio_minutes: number }

let cached: Promise<Config> | null = null
export function getConfig(): Promise<Config> {
  cached ??= fetch('/api/config').then((r) => r.json())
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
