import { createEffect, createRoot, createSignal, untrack } from "solid-js"
import { isValidAutomergeUrl, type AutomergeUrl, type DocHandle, type Repo } from "@automerge/automerge-repo"
import { NotFound, field, fromDoc, subscribeTo } from "./handle"
import { clone, sameJson } from "./json"
import type { Board, BoardDoc, Card, Cell, Handle, Mounted, Path, Sticker } from "./types"

// ---- helpers -----------------------------------------------------------------

export function toPath(p: Path): string[] {
  return (Array.isArray(p) ? p : p.split("/")).filter((s) => s.length > 0)
}

export function isLink(v: unknown): v is string {
  return typeof v === "string" && isValidAutomergeUrl(v)
}

const keyOf = (path: string[]) => JSON.stringify(path)
const display = (path: string[]) => path.join("/")

/** Fine-grained change tracking: one signal per key, plus one for "anything". */
class Tracker {
  private signals = new Map<string, [() => number, (fn: (v: number) => number) => void]>()
  private all = createSignal(0)
  track(key: string) {
    let s = this.signals.get(key)
    if (!s) {
      const [get, set] = createSignal(0)
      s = [get, set]
      this.signals.set(key, s)
    }
    s[0]()
  }
  trackAll() {
    this.all[0]()
  }
  /** A value at `key` changed. */
  bump(key: string) {
    this.signals.get(key)?.[1]((v) => v + 1)
  }
  /** A sticker at `key` appeared or disappeared. */
  bumpStructure(key: string) {
    this.bump(key)
    this.all[1]((v) => v + 1)
  }
}

interface Rec {
  path: string[]
  key: string
  board: BoardImpl
  hand?: HandImpl
  value: unknown
  hide: boolean
}

type Res =
  | { found: true; value: unknown; canonical: string[]; rec?: Rec; docUrl?: string; within: string[] }
  | { found: false; pending: boolean; canonical: string[] }

interface DocEntry {
  handle?: DocHandle<unknown>
  failed: boolean
}

// ---- the hierarchy: shared environment and documents -------------------------

class Hierarchy {
  shared = new Map<string, Rec[]>()
  tracker = new Tracker()
  docs = new Map<string, DocEntry>()
  docTracker = new Tracker()

  constructor(
    readonly repo: Repo,
    readonly importCard: (url: string) => Promise<Card>,
  ) {}

  doc(url: string): DocEntry {
    this.docTracker.track(url)
    let entry = this.docs.get(url)
    if (!entry) {
      entry = { failed: false }
      this.docs.set(url, entry)
      const e = entry
      this.repo
        .find(url as AutomergeUrl)
        .then((h) => {
          e.handle = h
          h.on("change", () => this.docTracker.bump(url))
          this.docTracker.bump(url)
        })
        .catch(() => {
          e.failed = true
          this.docTracker.bump(url)
        })
    }
    return entry
  }

  topShared(prefix: string[], skip: Set<Rec>): Rec | undefined {
    const key = keyOf(prefix)
    this.tracker.track(key)
    const stack = this.shared.get(key)
    if (!stack) return undefined
    for (let i = stack.length - 1; i >= 0; i--) if (!skip.has(stack[i])) return stack[i]
    return undefined
  }

  resolveDoc(url: string, rest: string[], skip: Set<Rec>): Res {
    for (let len = rest.length; len >= 0; len--) {
      const prefix = [url, ...rest.slice(0, len)]
      const top = this.topShared(prefix, skip)
      if (!top) continue
      if (top.hide) return { found: false, pending: false, canonical: prefix }
      return this.walk(top.value, rest.slice(len), prefix, top, skip, undefined)
    }
    const entry = this.doc(url)
    const doc = entry.handle?.doc()
    if (doc === undefined) return { found: false, pending: !entry.failed, canonical: [url, ...rest] }
    return this.walk(doc, rest, [url], undefined, skip, url)
  }

  walk(value: unknown, rest: string[], canonical: string[], rec: Rec | undefined, skip: Set<Rec>, docUrl: string | undefined): Res {
    let cur = value
    const canon = [...canonical]
    for (let i = 0; ; i++) {
      if (isLink(cur)) return this.resolveDoc(cur, rest.slice(i), skip)
      if (i === rest.length) return { found: true, value: cur, canonical: canon, rec, docUrl, within: rest }
      const name = rest[i]
      if (cur !== null && typeof cur === "object" && name in (cur as object)) {
        cur = (cur as Record<string, unknown>)[name]
        canon.push(name)
      } else {
        return { found: false, pending: false, canonical: [...canon, ...rest.slice(i)] }
      }
    }
  }

  change(res: Res & { found: true }, fn: (v: unknown) => void) {
    if (res.docUrl) {
      const handle = this.doc(res.docUrl).handle
      if (!handle) throw new NotFound(res.canonical)
      handle.change((d: unknown) => {
        let cur: unknown = d
        for (const name of res.within) cur = (cur as Record<string, unknown>)[name]
        if (cur === null || typeof cur !== "object") throw new Error(`cannot change a primitive at ${display(res.canonical)}`)
        fn(cur)
      })
      return
    }
    if (res.rec) {
      if (res.value === null || typeof res.value !== "object") {
        throw new Error(`cannot change a primitive at ${display(res.canonical)}; put over it instead`)
      }
      fn(res.value)
      res.rec.board.bumpRec(res.rec)
      return
    }
    throw new NotFound(res.canonical)
  }

  recHandle<T>(rec: Rec): Handle<T> {
    const h: Handle<T> = {
      get value() {
        rec.board.trackRec(rec)
        return rec.value as T
      },
      change: (fn) => {
        if (rec.value === null || typeof rec.value !== "object") throw new Error("cannot change a primitive")
        fn(rec.value as T)
        rec.board.bumpRec(rec)
      },
      subscribe: (fn) => subscribeTo(h, fn),
    }
    return h
  }

  toSticker(rec: Rec, covered: boolean, via?: string): Sticker {
    return {
      path: display(rec.path),
      via,
      scope: isLink(rec.path[0]) ? "document" : "board",
      board: rec.board.name,
      card: rec.hand?.card.title,
      handle: rec.hide ? undefined : this.recHandle(rec),
      covered,
    }
  }
}

// ---- cells -------------------------------------------------------------------

class CellImpl<T> implements Cell<T> {
  constructor(
    private board: BoardImpl,
    private raw: string[],
    private skip: Set<Rec>,
  ) {}

  private resolve(): Res {
    return this.board.resolve(this.raw, this.skip)
  }

  get value(): T {
    const r = this.resolve()
    if (!r.found) throw new NotFound(r.canonical)
    return r.value as T
  }

  get path(): readonly string[] {
    return this.resolve().canonical
  }

  get under(): Cell<T> | undefined {
    const r = this.resolve()
    if (!r.found || !r.rec) return undefined
    const below = new CellImpl<T>(this.board, this.raw, new Set([...this.skip, r.rec]))
    return untrack(() => below.resolve()).found ? below : undefined
  }

  get ready(): Promise<Cell<T>> {
    return new Promise((resolve, reject) => {
      let unsub: (() => void) | undefined
      let done = false
      const finish = () => {
        done = true
        queueMicrotask(() => unsub?.())
      }
      unsub = this.subscribe(() => {
        if (done) return
        finish()
        resolve(this)
      })
      this.board.signal.addEventListener("abort", () => {
        if (done) return
        finish()
        reject(new NotFound(this.raw))
      })
    })
  }

  change(fn: (value: T) => void): void {
    const r = untrack(() => this.resolve())
    if (!r.found) throw new NotFound(r.canonical)
    this.board.hierarchy.change(r, fn as (v: unknown) => void)
  }

  subscribe(fn: (value: T) => void): () => void {
    return subscribeTo(this, fn)
  }
}

// ---- boards ------------------------------------------------------------------

function listHandle<T>(): [Handle<T[]>, (fn: (list: T[]) => T[]) => void] {
  const [list, setList] = createSignal<T[]>([])
  const h: Handle<T[]> = {
    get value() {
      return list()
    },
    change() {
      throw new Error("read-only")
    },
    subscribe: (fn) => subscribeTo(h, fn),
  }
  return [h, (fn) => setList((l) => fn(l))]
}

export class BoardImpl implements Board {
  readonly signal: AbortSignal
  readonly cards: Handle<Mounted[]>
  readonly children: Handle<Board[]>
  readonly stacks = new Map<string, Rec[]>()
  readonly tracker = new Tracker()
  private aborter = new AbortController()
  private setCards: (fn: (l: Mounted[]) => Mounted[]) => void
  private setChildren: (fn: (l: Board[]) => Board[]) => void
  private declared = new Map<string, unknown>()
  private opened = new Map<string, { wanted: boolean; mounted?: Mounted }>()
  private closed = false

  constructor(
    readonly hierarchy: Hierarchy,
    readonly name: string,
    readonly parent: BoardImpl | undefined,
  ) {
    this.signal = this.aborter.signal
    ;[this.cards, this.setCards] = listHandle<Mounted>()
    ;[this.children, this.setChildren] = listHandle<Board>()
  }

  // -- tracking

  trackRec(rec: Rec) {
    if (isLink(rec.path[0])) this.hierarchy.tracker.track(rec.key)
    else rec.board.tracker.track(rec.key)
  }
  bumpRec(rec: Rec) {
    if (isLink(rec.path[0])) this.hierarchy.tracker.bump(rec.key)
    else rec.board.tracker.bump(rec.key)
  }

  // -- resolution

  private topInChain(prefix: string[], skip: Set<Rec>): Rec | undefined {
    const key = keyOf(prefix)
    for (let b: BoardImpl | undefined = this; b; b = b.parent) {
      b.tracker.track(key)
      const stack = b.stacks.get(key)
      if (!stack) continue
      for (let i = stack.length - 1; i >= 0; i--) if (!skip.has(stack[i])) return stack[i]
    }
    return undefined
  }

  resolve(path: string[], skip: Set<Rec> = new Set()): Res {
    if (path.length === 0) return { found: false, pending: false, canonical: [] }
    if (isLink(path[0])) return this.hierarchy.resolveDoc(path[0], path.slice(1), skip)
    for (let len = path.length; len >= 1; len--) {
      const prefix = path.slice(0, len)
      const top = this.topInChain(prefix, skip)
      if (!top) continue
      if (top.hide) return { found: false, pending: false, canonical: prefix }
      return this.hierarchy.walk(top.value, path.slice(len), prefix, top, skip, undefined)
    }
    return { found: false, pending: false, canonical: path }
  }

  /** Where a sticker at `path` lives: the longest resolvable proper prefix, re-rooted, plus the rest. */
  canonical(path: string[]): string[] {
    if (path.length === 0) return path
    if (isLink(path[0])) return path
    for (let len = path.length - 1; len >= 1; len--) {
      const r = this.resolve(path.slice(0, len))
      if (r.found) return [...r.canonical, ...path.slice(len)]
    }
    return path
  }

  // -- reading

  get<T>(path: Path, defaultValue?: T): Cell<T> {
    const p = toPath(path)
    if (defaultValue !== undefined) {
      const r = untrack(() => this.resolve(p))
      if (!r.found && !r.pending) this.putAs(undefined, p, defaultValue)
    }
    return new CellImpl<T>(this, p, new Set())
  }

  stickers<T>(path: Path): Handle<Sticker<T>[]>
  stickers(): Handle<Sticker[]>
  stickers(path?: Path): Handle<Sticker[]> {
    const h: Handle<Sticker[]> = {
      value: [],
      change() {
        throw new Error("read-only")
      },
      subscribe: (fn) => subscribeTo(h, fn),
    }
    if (path === undefined) {
      Object.defineProperty(h, "value", { get: () => this.allStickers() })
    } else {
      const p = toPath(path)
      Object.defineProperty(h, "value", { get: () => this.stackAt(p) })
    }
    return h
  }

  /** The stack at a path, top first, across the chain or the shared environment. */
  private chainStack(canonical: string[]): Rec[] {
    const key = keyOf(canonical)
    const out: Rec[] = []
    if (isLink(canonical[0])) {
      this.hierarchy.tracker.track(key)
      const stack = this.hierarchy.shared.get(key) ?? []
      for (let i = stack.length - 1; i >= 0; i--) out.push(stack[i])
      return out
    }
    for (let b: BoardImpl | undefined = this; b; b = b.parent) {
      b.tracker.track(key)
      const stack = b.stacks.get(key) ?? []
      for (let i = stack.length - 1; i >= 0; i--) out.push(stack[i])
    }
    return out
  }

  private stackAt(path: string[]): Sticker[] {
    const canonical = this.canonical(path)
    return this.chainStack(canonical).map((rec, i) => this.hierarchy.toSticker(rec, i > 0))
  }

  private allStickers(): Sticker[] {
    const out: Sticker[] = []
    const seen = new Set<string>()
    const chain: BoardImpl[] = []
    for (let b: BoardImpl | undefined = this; b; b = b.parent) {
      b.tracker.trackAll()
      chain.push(b)
    }
    for (const b of chain) {
      for (const key of b.stacks.keys()) {
        if (seen.has(key)) continue
        seen.add(key)
        const stack = this.chainStack(JSON.parse(key))
        stack.forEach((rec, i) => out.push(this.hierarchy.toSticker(rec, i > 0)))
      }
    }
    // shared stickers, with the name this board reaches them by
    this.hierarchy.tracker.trackAll()
    const names = new Map<string, string>()
    for (const s of out) {
      const rec = this.findRec(s)
      if (rec && !rec.hide && isLink(rec.value) && !names.has(rec.value)) names.set(rec.value, s.path)
    }
    for (const [key, stack] of this.hierarchy.shared) {
      const path = JSON.parse(key) as string[]
      const via = names.get(path[0])
      const top = stack.length - 1
      for (let i = top; i >= 0; i--) {
        out.push(this.hierarchy.toSticker(stack[i], i < top, via ? display([via, ...path.slice(1)]) : undefined))
      }
    }
    return out
  }

  private findRec(s: Sticker): Rec | undefined {
    const key = keyOf(s.path.split("/"))
    for (let b: BoardImpl | undefined = this; b; b = b.parent) {
      const stack = b.stacks.get(key)
      if (stack) for (const rec of stack) if (rec.board.name === s.board && (rec.hand?.card.title ?? undefined) === s.card) return rec
    }
    return undefined
  }

  keys(path?: Path): Handle<string[]> {
    const h: Handle<string[]> = {
      value: [],
      change() {
        throw new Error("read-only")
      },
      subscribe: (fn) => subscribeTo(h, fn),
    }
    const p = path === undefined ? [] : toPath(path)
    Object.defineProperty(h, "value", { get: () => this.keysAt(p) })
    return h
  }

  private keysAt(path: string[]): string[] {
    const names = new Set<string>()
    let canonical: string[]
    if (path.length === 0) {
      canonical = []
    } else {
      const r = this.resolve(path)
      if (r.found && r.value !== null && typeof r.value === "object") for (const k of Object.keys(r.value)) names.add(k)
      canonical = r.found ? r.canonical : this.canonical(path)
    }
    const prefix = keyOf(canonical).slice(0, -1) // "[..." without the closing bracket
    const consider = (stacks: Map<string, Rec[]>) => {
      for (const key of stacks.keys()) {
        if (!key.startsWith(prefix)) continue
        const p = JSON.parse(key) as string[]
        if (p.length <= canonical.length) continue
        if (canonical.some((seg, i) => p[i] !== seg)) continue
        names.add(p[canonical.length])
      }
    }
    if (canonical.length > 0 && isLink(canonical[0])) {
      this.hierarchy.tracker.trackAll()
      consider(this.hierarchy.shared)
    } else {
      for (let b: BoardImpl | undefined = this; b; b = b.parent) {
        b.tracker.trackAll()
        consider(b.stacks)
      }
    }
    // minus hides
    for (const name of [...names]) {
      const top = isLink(canonical[0])
        ? this.hierarchy.topShared([...canonical, name], new Set())
        : this.topInChain([...canonical, name], new Set())
      if (top?.hide) names.delete(name)
    }
    return [...names].sort()
  }

  // -- writing

  put(path: Path, value: unknown): void {
    this.putAs(undefined, toPath(path), value)
  }

  hide(path: Path): void {
    this.putAs(undefined, toPath(path), undefined, true)
  }

  putAs(hand: HandImpl | undefined, path: string[], value: unknown, hide = false): void {
    if (this.closed) return
    const canonical = untrack(() => this.canonical(path))
    const key = keyOf(canonical)
    const shared = isLink(canonical[0])
    const stacks = shared ? this.hierarchy.shared : this.stacks
    let stack = stacks.get(key)
    if (!stack) {
      stack = []
      stacks.set(key, stack)
    }
    const tracker = shared ? this.hierarchy.tracker : this.tracker
    const own = stack.find((r) => r.board === this && r.hand === hand)
    if (own) {
      own.value = value
      own.hide = hide
      tracker.bump(key)
    } else {
      stack.push({ path: canonical, key, board: this, hand, value, hide })
      tracker.bumpStructure(key)
    }
  }

  /** Remove every sticker a hand put, here and in the shared environment. */
  peel(hand: HandImpl | undefined, only?: string) {
    const sweep = (stacks: Map<string, Rec[]>, tracker: Tracker) => {
      for (const [key, stack] of stacks) {
        const before = stack.length
        const kept = stack.filter((r) => !(r.board === this && r.hand === hand && (only === undefined || r.key === only)))
        if (kept.length !== before) {
          if (kept.length === 0) stacks.delete(key)
          else stacks.set(key, kept)
          tracker.bumpStructure(key)
        }
      }
    }
    sweep(this.stacks, this.tracker)
    sweep(this.hierarchy.shared, this.hierarchy.tracker)
  }

  // -- structure

  fork(name?: string): Board {
    const child = new BoardImpl(this.hierarchy, name ?? `${this.name}/fork`, this)
    this.setChildren((l) => [...l, child])
    return child
  }

  addMounted(m: Mounted) {
    this.setCards((l) => [...l, m])
  }
  removeMounted(m: Mounted) {
    this.setCards((l) => l.filter((x) => x !== m))
  }
  removeChild(b: Board) {
    this.setChildren((l) => l.filter((x) => x !== b))
  }

  open(url: string): void {
    this.put("board", url)
    const dispose = createRoot((dispose) => {
      createEffect(() => {
        const entry = this.hierarchy.doc(url)
        const handle = entry.handle
        const doc = handle?.doc() as BoardDoc | undefined
        if (!doc || !handle) return
        untrack(() => this.follow(doc, handle))
      })
      return dispose
    })
    this.signal.addEventListener("abort", dispose)
  }

  private follow(doc: BoardDoc, handle: DocHandle<unknown>) {
    const declared = doc.stickers ?? {}
    for (const [name, value] of Object.entries(declared)) {
      const prev = this.declared.get(name)
      if (!this.declared.has(name) || !sameJson(prev, value)) {
        this.declared.set(name, clone(value))
        this.putAs(undefined, toPath(name), clone(value))
      }
    }
    for (const name of [...this.declared.keys()]) {
      if (!(name in declared)) {
        this.declared.delete(name)
        this.peel(undefined, keyOf(untrack(() => this.canonical(toPath(name)))))
      }
    }

    const cards = doc.cards ?? {}
    for (const [id, placement] of Object.entries(cards)) {
      let state = this.opened.get(id)
      if (placement.faceUp && !state) {
        state = { wanted: true }
        this.opened.set(id, state)
        const s = state
        this.hierarchy
          .importCard(placement.url)
          .then((card) => {
            if (!s.wanted || this.closed) return
            const settings = field<Record<string, never>>(fromDoc(handle), ["cards", id, "settings"])
            s.mounted = mount(card, this, settings)
          })
          .catch((e) => console.error(`could not load ${placement.url}`, e))
      } else if (!placement.faceUp && state) {
        state.wanted = false
        state.mounted?.unmount()
        this.opened.delete(id)
      }
    }
    for (const [id, state] of [...this.opened]) {
      if (!(id in cards)) {
        state.wanted = false
        state.mounted?.unmount()
        this.opened.delete(id)
      }
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const child of [...this.children.value]) child.close()
    for (const m of [...this.cards.value]) m.unmount()
    for (const [key, stack] of [...this.hierarchy.shared]) {
      const kept = stack.filter((r) => r.board !== this)
      if (kept.length !== stack.length) {
        if (kept.length === 0) this.hierarchy.shared.delete(key)
        else this.hierarchy.shared.set(key, kept)
        this.hierarchy.tracker.bumpStructure(key)
      }
    }
    for (const key of [...this.stacks.keys()]) {
      this.stacks.delete(key)
      this.tracker.bumpStructure(key)
    }
    this.parent?.removeChild(this)
    this.aborter.abort()
  }
}

// ---- hands and mount ---------------------------------------------------------

/** A fork made for one card: reads what the board reads, writes onto the board, attributed to the card. */
export class HandImpl implements Board {
  readonly signal: AbortSignal
  readonly children: Handle<Board[]>
  private setChildren: (fn: (l: Board[]) => Board[]) => void
  private aborter = new AbortController()
  onClose?: () => void

  constructor(
    readonly board: BoardImpl,
    readonly card: Card,
  ) {
    this.signal = this.aborter.signal
    ;[this.children, this.setChildren] = listHandle<Board>()
  }

  get name() {
    return this.card.title
  }
  get cards() {
    return this.board.cards
  }

  get<T>(path: Path, defaultValue?: T): Cell<T> {
    const p = toPath(path)
    if (defaultValue !== undefined) {
      const r = untrack(() => this.board.resolve(p))
      if (!r.found && !r.pending) this.board.putAs(this, p, defaultValue)
    }
    return this.board.get<T>(p)
  }
  stickers<T>(path: Path): Handle<Sticker<T>[]>
  stickers(): Handle<Sticker[]>
  stickers(path?: Path): Handle<Sticker[]> {
    return path === undefined ? this.board.stickers() : this.board.stickers(path)
  }
  keys(path?: Path) {
    return this.board.keys(path)
  }
  put(path: Path, value: unknown) {
    this.board.putAs(this, toPath(path), value)
  }
  hide(path: Path) {
    this.board.putAs(this, toPath(path), undefined, true)
  }
  fork(name?: string): Board {
    const child = this.board.fork(name)
    this.setChildren((l) => [...l, child])
    child.signal.addEventListener("abort", () => this.setChildren((l) => l.filter((x) => x !== child)))
    return child
  }
  open(url: string) {
    this.board.open(url)
  }
  close() {
    this.onClose?.()
  }
  /** Called by unmount: close forks, peel stickers, abort. */
  teardown() {
    for (const child of [...this.children.value]) child.close()
    this.board.peel(this)
    this.aborter.abort()
  }
}

/** Add a card to a board: fork the board into a hand for the card and call the card's mount. */
export function mount<S>(card: Card<S>, board: Board, settings?: Handle<S>): Mounted {
  const target = board instanceof HandImpl ? board.board : (board as BoardImpl)
  const hand = new HandImpl(target, card as Card)
  let teardown: (() => void) | undefined
  let closed = false
  let finish!: () => void
  const done = new Promise<void>((resolve) => (finish = resolve))

  const mounted: Mounted = {
    card: card as Card,
    hand,
    done,
    unmount() {
      if (closed) return
      closed = true
      hand.teardown()
      try {
        teardown?.()
      } catch (e) {
        console.error(`${card.title}: teardown threw`, e)
      }
      target.removeMounted(mounted)
      finish()
    },
  }
  hand.onClose = () => mounted.unmount()
  target.addMounted(mounted)

  try {
    const result = card.mount(hand, settings)
    if (result instanceof Promise) {
      result.then(
        (t) => {
          if (closed) t?.()
          else teardown = t ?? undefined
        },
        (e) => {
          console.error(`${card.title}: mount failed`, e)
          mounted.unmount()
        },
      )
    } else {
      teardown = result ?? undefined
    }
  } catch (e) {
    console.error(`${card.title}: mount threw`, e)
    mounted.unmount()
  }
  return mounted
}

// ---- the root ----------------------------------------------------------------

export function createBoard(options: { repo: Repo; import?: (url: string) => Promise<{ default: Card }> }): Board {
  const importer = options.import ?? ((url: string) => import(/* @vite-ignore */ url))
  const hierarchy = new Hierarchy(options.repo, (url) => importer(url).then((m) => m.default))
  return new BoardImpl(hierarchy, "root", undefined)
}
