import type { Card } from "../runtime"

const modules = import.meta.glob<{ default: Card }>(["./*.ts", "./*.tsx", "!./index.ts"])

const toUrl = (file: string) => "card:" + file.replace(/^\.\//, "").replace(/\.tsx?$/, "")

/** Every card module the shell can offer, as `card:<name>` URLs. */
export const cardUrls: string[] = Object.keys(modules).map(toUrl).sort()

/** How `open` loads a card: the `import` option of createBoard. */
export function importCard(url: string): Promise<{ default: Card }> {
  const file = Object.keys(modules).find((k) => toUrl(k) === url)
  if (!file) return Promise.reject(new Error(`unknown card ${url}`))
  return modules[file]()
}

const faces = new Map<string, Promise<Card>>()
/** The face of a card, for the board view, cached. */
export function faceOf(url: string): Promise<Card> {
  let p = faces.get(url)
  if (!p) {
    p = importCard(url).then((m) => m.default)
    faces.set(url, p)
  }
  return p
}
