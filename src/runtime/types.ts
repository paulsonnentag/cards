import type { Json } from "./json"

// ---- paths -------------------------------------------------------------------

/** "a/b" or ["a", "b"]. A first name that is an automerge URL roots the path in a document. */
export type Path = string | string[]

// ---- handles and cells -------------------------------------------------------

export interface Handle<T> {
  /** Throws NotFound while nothing is there. */
  readonly value: T
  /** Edit in place. On a link, edits the document it names. */
  change(fn: (value: T) => void): void
  /** Calls fn now if there is a value, and after every change. */
  subscribe(fn: (value: T) => void): () => void
}

export interface Cell<T> extends Handle<T> {
  /** Canonical: past a link, the URL and the rest. */
  readonly path: readonly string[]
  /** The next sticker down, then the value the path walks into. Live. */
  readonly under: Cell<T> | undefined
  /** Resolves at the first value. */
  readonly ready: Promise<Cell<T>>
}

export interface Sticker<T = unknown> {
  path: string
  via?: string
  scope: "board" | "document"
  board: string
  card?: string
  handle?: Handle<T>
  covered: boolean
}

// ---- boards ------------------------------------------------------------------

export interface Board {
  readonly name: string
  readonly signal: AbortSignal
  readonly cards: Handle<Mounted[]>
  readonly children: Handle<Board[]>

  get<T>(path: Path, defaultValue?: T): Cell<T>
  stickers<T>(path: Path): Handle<Sticker<T>[]>
  stickers(): Handle<Sticker[]>
  keys(path?: Path): Handle<string[]>

  put(path: Path, value: unknown): void
  hide(path: Path): void

  fork(name?: string): Board
  open(url: string): void
  close(): void
}

// ---- cards -------------------------------------------------------------------

export type Teardown = () => void

export interface Card<S = Record<string, Json>> {
  title: string
  icon?: string
  description: string
  mount(board: Board, settings?: Handle<S>): Teardown | void | Promise<Teardown | void>
}

export interface Mounted {
  readonly card: Card
  readonly hand: Board
  readonly done: Promise<void>
  unmount(): void
}

// ---- board documents ---------------------------------------------------------

export type Id = string

export interface BoardDoc {
  cards: Record<Id, Placement>
  boards: Record<Id, Placed>
  stickers: Record<string, Json>
}
export interface Placement {
  url: string
  x: number
  y: number
  faceUp: boolean
  settings?: Record<string, Json>
}
export interface Placed {
  url: string
  x: number
  y: number
  w?: number
  h?: number
}
