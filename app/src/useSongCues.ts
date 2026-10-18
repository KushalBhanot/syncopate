import { useEffect, useState } from 'react'
import { api, type Song } from './api'

/** Load the cues for whichever song the show hub says is live. */
export function useSongCues(songId: string | null) {
  const [song, setSong] = useState<Song | null>(null)
  useEffect(() => {
    if (!songId) return
    let cancelled = false
    api.get(songId).then((s) => !cancelled && setSong(s))
    return () => {
      cancelled = true
    }
  }, [songId])
  return song?.id === songId ? song : null
}
