import type { Repo } from "@automerge/automerge-repo"
import type { AutomergeUrl } from "@automerge/automerge-repo"
import type { BoardDoc } from "./runtime"
import type { MapDoc, MarkdownDoc } from "./docs"

const KEY = "cards:whiteboard"
export const DB = "cards"

/** The whiteboard board document's URL: the stored one if it loads, else a fresh demo. */
export async function seed(repo: Repo): Promise<string> {
  const stored = localStorage.getItem(KEY)
  if (stored) {
    try {
      await repo.find(stored as AutomergeUrl, { signal: AbortSignal.timeout(3000) })
      return stored
    } catch {
      /* fall through and reseed */
    }
  }
  const url = create(repo)
  localStorage.setItem(KEY, url)
  return url
}

function create(repo: Repo): string {
  const mapDoc = repo.create<MapDoc>({ center: [10, 48], zoom: 3 })
  const notesDoc = repo.create<MarkdownDoc>({
    content: "# Notes\n\nType @ and the start of a place name, for example @Paris, to mention a place. Pick one and a pin appears on the map.\n",
  })
  const map = repo.create<BoardDoc>({
    cards: {
      map: { url: "card:map", x: 40, y: 40, faceUp: true },
      markers: { url: "card:markers", x: 260, y: 40, faceUp: true },
    },
    boards: {},
    stickers: { document: mapDoc.url },
  })
  const notes = repo.create<BoardDoc>({
    cards: {
      markdown: { url: "card:markdown", x: 40, y: 40, faceUp: true },
    },
    boards: {},
    stickers: { document: notesDoc.url },
  })
  const whiteboard = repo.create<BoardDoc>({
    cards: {
      whiteboard: { url: "card:whiteboard", x: 40, y: 40, faceUp: true },
      mentions: { url: "card:mentions", x: 260, y: 40, faceUp: true },
      finder: { url: "card:place-finder", x: 480, y: 40, faceUp: true },
      locations: { url: "card:locations", x: 700, y: 40, faceUp: true },
    },
    boards: {
      notes: { url: notes.url, x: 40, y: 40, w: 420, h: 360 },
      map: { url: map.url, x: 500, y: 40, w: 560, h: 360 },
    },
    stickers: { selection: {}, "search/queries": {} },
  })
  return whiteboard.url
}

export async function reset() {
  localStorage.removeItem(KEY)
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  location.reload()
}
