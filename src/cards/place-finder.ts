import type { Board, Card } from "../runtime"
import type { Place } from "../docs"

const cache = new Map<string, Promise<Place[]>>()

async function nominatim(text: string): Promise<Place[]> {
  let p = cache.get(text)
  if (!p) {
    p = fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(text)}`, {
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { display_name: string; lat: string; lon: string }[]) =>
        rows.map((r) => ({ title: r.display_name, lat: Number(r.lat), lng: Number(r.lon) })),
      )
      .catch(() => [])
    cache.set(text, p)
  }
  return p
}

export default {
  title: "Place finder",
  icon: "📍",
  description: "Answers searches on this board with places from OpenStreetMap.",

  mount(board: Board) {
    const queries = board.get<Record<string, true>>("search/queries", {})
    let timer: ReturnType<typeof setTimeout> | undefined
    let generation = 0
    const stop = queries.subscribe((q) => {
      clearTimeout(timer)
      const texts = Object.keys(q).filter((t) => t.trim().length >= 2)
      const gen = ++generation
      timer = setTimeout(async () => {
        const answers: Record<string, Place[]> = {}
        for (const text of texts) answers[text] = await nominatim(text.trim())
        if (gen !== generation) return
        board.put("search/results/nominatim", answers)
      }, 350)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  },
} satisfies Card
