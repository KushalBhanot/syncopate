import { useCallback, useEffect, useRef, useState } from 'react'
import { STATIC } from './mode'

/** A position message. Today the editor's player sends it; LiveFollow will later. */
export type Position = { type: 'position'; song: string; t: number; playing: boolean; sent: number }
type Hello = { type: 'hello' }
type Message = Position | Hello

/**
 * How screens talk to each other:
 * - server mode: the API's WebSocket hub, so screens on different devices stay in sync.
 * - static mode: a BroadcastChannel, so windows of the same browser stay in sync with no server.
 */
type Transport = { send: (m: Message) => void; close: () => void }

function openTransport(onMessage: (m: Message) => void, onState: (connected: boolean) => void): Transport {
  if (STATIC) {
    const ch = new BroadcastChannel('syncopate-show')
    ch.onmessage = (e) => onMessage(e.data as Message)
    onState(true)
    return { send: (m) => ch.postMessage(m), close: () => ch.close() }
  }

  let ws: WebSocket | null = null
  let closed = false
  let retry: number | undefined
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const connect = () => {
    ws = new WebSocket(`${proto}://${location.host}/ws/show`)
    ws.onopen = () => onState(true)
    ws.onclose = () => {
      onState(false)
      if (!closed) retry = window.setTimeout(connect, 1000) // reconnect if the API restarts
    }
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  }
  connect()
  return {
    send: (m) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m)),
    close: () => {
      closed = true
      window.clearTimeout(retry)
      ws?.close()
    },
  }
}

/** Connection to the other screens. The sender answers a newly opened screen's "hello" with its position. */
export function useShowSocket(onPosition?: (p: Position) => void) {
  const handler = useRef(onPosition)
  handler.current = onPosition
  const transport = useRef<Transport | null>(null)
  const lastSent = useRef<Position | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const t = openTransport((m) => {
      if (m.type === 'position') handler.current?.(m)
      else if (m.type === 'hello' && lastSent.current) t.send(lastSent.current)
    }, setConnected)
    transport.current = t
    if (onPosition) t.send({ type: 'hello' }) // a follower asks the current position
    return () => t.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = useCallback((p: Omit<Position, 'type' | 'sent'>) => {
    const msg: Position = { type: 'position', sent: Date.now(), ...p }
    lastSent.current = msg
    transport.current?.send(msg)
  }, [])
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

  return { connected, song, t }
}
