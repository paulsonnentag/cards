import type { Board, BoardDoc, Card, Cell } from "../runtime"
import { isLocation, type Location } from "../docs"

const URL_RE = /automerge:[A-Za-z0-9]+/g

/** Every automerge URL inside a value: in fields, and inside text. */
function urlsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const m of value.matchAll(URL_RE)) out.add(m[0])
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) urlsIn(v, out)
  }
  return out
}

export default {
  title: "Locations",
  icon: "🧭",
  description: "Follows every document this board can reach and collects the places in them.",

  mount(board: Board) {
    const root = board.get<BoardDoc>("board")
    const watched = new Map<string, { cell: Cell<unknown>; stop: () => void }>()
    let scheduled = false
    let stopped = false

    const schedule = () => {
      if (scheduled || stopped) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        if (!stopped) rebuild()
      })
    }

    const rebuild = () => {
      const seen = new Set<string>()
      const queue: unknown[] = []
      try {
        queue.push(root.value)
      } catch {
        return
      }
      while (queue.length) {
        const value = queue.pop()
        for (const url of urlsIn(value)) {
          if (seen.has(url)) continue
          seen.add(url)
          let w = watched.get(url)
          if (!w) {
            const cell = board.get<unknown>(url)
            w = { cell, stop: cell.subscribe(schedule) }
            watched.set(url, w)
          }
          try {
            queue.push(w.cell.value)
          } catch {
            /* not loaded yet: subscribe will call back */
          }
        }
      }
      for (const [url, w] of watched) {
        if (!seen.has(url)) {
          w.stop()
          watched.delete(url)
        }
      }
      const found: Record<string, Location> = {}
      for (const [url, w] of watched) {
        try {
          const v = w.cell.value
          if (isLocation(v)) found[url] = { title: String((v as Location).title ?? url), lat: v.lat, lng: v.lng }
        } catch {
          /* pending */
        }
      }
      board.put("locations", found)
    }

    const stop = root.subscribe(schedule)
    return () => {
      stopped = true
      stop()
      for (const w of watched.values()) w.stop()
    }
  },
} satisfies Card
