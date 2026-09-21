import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import type { Board } from "../runtime"
import { BoardView } from "./BoardView"
import { TableView } from "./TableView"

interface Target {
  el: Element
  board: Board
}

interface Link {
  board: Board
  r: DOMRect
  x2: number
  y2: number
  d: string
}

/**
 * An inspector for whatever is on the page. Pick a DOM node; the board whose `dom` holds it
 * opens in a panel on the right, cards next to the table, with a line back to the node.
 * Pick again to open another board beneath it: every open board keeps its own panel.
 */
export function Inspector(props: { root: Board }) {
  const [picking, setPicking] = createSignal(false)
  const [hover, setHover] = createSignal<Target | null>(null)
  const [targets, setTargets] = createSignal<Target[]>([])
  const [links, setLinks] = createSignal<Link[]>([])
  const heads = new Map<Board, HTMLElement>()
  let panel!: HTMLDivElement

  const inspect = (t: Target) =>
    setTargets((ts) => (ts.some((x) => x.board === t.board) ? ts.map((x) => (x.board === t.board ? t : x)) : [...ts, t]))
  const drop = (board: Board) => setTargets((ts) => ts.filter((t) => t.board !== board))

  /** Every open board that put a `dom` of its own, with that element. */
  const boards = (): { board: Board; el: HTMLElement }[] => {
    const out: { board: Board; el: HTMLElement }[] = []
    const visit = (b: Board) => {
      try {
        const own = b.stickers<HTMLElement>("dom").value[0]
        if (own?.board === b.name && own.handle) {
          const el = own.handle.value
          if (el instanceof HTMLElement) out.push({ board: b, el })
        }
      } catch {
        /* no dom */
      }
      for (const child of b.children.value) visit(child)
    }
    visit(props.root)
    return out
  }

  /** The board whose dom holds `el`, innermost first. */
  const boardFor = (el: Element): Board | null => {
    let best: { board: Board; depth: number } | null = null
    for (const { board, el: dom } of boards()) {
      if (!dom.contains(el)) continue
      let depth = 0
      for (let e: Element | null = dom; e; e = e.parentElement) depth++
      if (!best || depth > best.depth) best = { board, depth }
    }
    return best?.board ?? null
  }

  const ours = (el: Element) => !!el.closest(".inspector-btn, .inspector-panel, .pick-box, .inspector-link, .reset")

  // pick mode: hover highlights, click picks, escape cancels
  createEffect(() => {
    if (!picking()) return setHover(null)
    const move = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || ours(el)) return setHover(null)
      const board = boardFor(el)
      setHover(board ? { el, board } : null)
    }
    const swallow = (e: Event) => {
      if (e.target instanceof Element && ours(e.target)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const click = (e: MouseEvent) => {
      if (e.target instanceof Element && ours(e.target)) return
      swallow(e)
      const h = hover()
      if (h) inspect(h)
      setPicking(false)
    }
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false)
    document.addEventListener("pointermove", move, true)
    document.addEventListener("pointerdown", swallow, true)
    document.addEventListener("pointerup", swallow, true)
    document.addEventListener("click", click, true)
    window.addEventListener("keydown", key, true)
    onCleanup(() => {
      document.removeEventListener("pointermove", move, true)
      document.removeEventListener("pointerdown", swallow, true)
      document.removeEventListener("pointerup", swallow, true)
      document.removeEventListener("click", click, true)
      window.removeEventListener("keydown", key, true)
    })
  })

  // follow every inspected node while its panel is open; drop it if it leaves the page or its board closes
  createEffect(() => {
    const ts = targets()
    if (ts.length === 0) return setLinks([])
    let raf = 0
    const tick = () => {
      const gone = ts.filter((t) => !t.el.isConnected || t.board.signal.aborted)
      if (gone.length) {
        setTargets((cur) => cur.filter((t) => !gone.includes(t)))
        return
      }
      const x2 = panel.getBoundingClientRect().left
      const out: Link[] = []
      for (const t of ts) {
        const head = heads.get(t.board)
        if (!head) continue
        const h = head.getBoundingClientRect()
        const r = t.el.getBoundingClientRect()
        const y2 = h.top + h.height / 2
        const x1 = Math.min(r.right, x2 - 8)
        const y1 = Math.max(r.top, Math.min(r.bottom, y2))
        const cx = (x1 + x2) / 2
        out.push({ board: t.board, r, x2, y2, d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}` })
      }
      setLinks(out)
      raf = requestAnimationFrame(tick)
    }
    tick()
    onCleanup(() => cancelAnimationFrame(raf))
  })

  return (
    <>
      <button
        class="inspector-btn"
        classList={{ active: picking(), open: targets().length > 0 }}
        onClick={() => setPicking((p) => !p)}
        title="Pick something on the page to inspect the board behind it"
      >
        <span class="glyph">⌖</span> {picking() ? "Pick…" : "Inspect"}
      </button>

      <Show when={picking() && hover()}>
        {(h) => {
          const r = h().el.getBoundingClientRect()
          return (
            <div class="pick-box" style={{ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }}>
              <span class="pick-label">
                {h().board.name} <span class="mono">{describe(h().el)}</span>
              </span>
            </div>
          )
        }}
      </Show>

      <Show when={links().length > 0}>
        <svg class="inspector-link">
          <For each={links()}>
            {(l) => (
              <>
                <rect x={l.r.left} y={l.r.top} width={l.r.width} height={l.r.height} />
                <path d={l.d} />
                <circle cx={l.x2} cy={l.y2} r={4} />
              </>
            )}
          </For>
        </svg>
      </Show>

      <div class="inspector-panel" classList={{ open: targets().length > 0 }} ref={panel}>
        <div class="inspector-inner">
          <For each={targets()}>
            {(t) => (
              <section class="inspector-section">
                <header
                  class="inspector-head"
                  ref={(el) => {
                    heads.set(t.board, el)
                    onCleanup(() => heads.delete(t.board))
                  }}
                >
                  <span class="inspector-title">{t.board.name}</span>
                  <span class="dim mono">{describe(t.el)}</span>
                  <span class="spacer" />
                  <button class="inspector-close" onClick={() => drop(t.board)} title="Close">
                    ×
                  </button>
                </header>
                <div class="inspector-body">
                  <section class="inspector-cards">
                    <BoardView board={t.board} />
                  </section>
                  <section class="inspector-table">
                    <TableView board={t.board} />
                  </section>
                </div>
              </section>
            )}
          </For>
        </div>
      </div>
    </>
  )
}

function describe(el: Element) {
  const cls = [...el.classList].filter((c) => !c.startsWith("maplibregl") && !c.startsWith("cm-") && !c.startsWith("ͼ"))[0]
  return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>`
}
