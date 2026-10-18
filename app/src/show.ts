import { useEffect, useRef, useState } from 'react'

/** A position message on the show hub. Today the editor's player sends it; LiveFollow will later. */
export type Position = { type: 'position'; song: string; t: number; playing: boolean; sent: number }

function socketUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/show`
}

/** Connection to the position hub, reconnecting if the API restarts. */
export function useShowSocket(onPosition?: (p: Position) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const handler = useRef(onPosition)
  handler.current = onPosition
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let closed = false
    let retry: number | undefined
    const connect = () => {
      const ws = new WebSocket(socketUrl())
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = window.setTimeout(connect, 1000)
      }
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'position') handler.current?.(msg as Position)
      }
    }
    connect()
    return () => {
      closed = true
      window.clearTimeout(retry)
      wsRef.current?.close()
    }
  }, [])

  const send = (p: Omit<Position, 'type' | 'sent'>) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'position', sent: Date.now(), ...p }))
  }
  return { connected, send }
}

/**
 * Follow the live position: the latest message plus elapsed time while playing,
 * re-rendered every animation frame so word highlights move smoothly.
 */
export function useLivePosition() {
  const last = useRef<{ p: Position; at: number } | null>(null)
  const [song, setSong] = useState<string | null>(null)
  const [t, setT] = useState(0)
  const { connected } = useShowSocket((p) => {
    last.current = { p, at: performance.now() }
    setSong(p.song)
  })

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const l = last.current
      if (l) setT(l.p.playing ? l.p.t + (performance.now() - l.at) / 1000 : l.p.t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return { connected, song, t, playing: last.current?.p.playing ?? false }
}
