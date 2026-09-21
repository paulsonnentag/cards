import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import type { Board } from "../runtime"
import { BoardView } from "./BoardView"
import { TableView } from "./TableView"

interface Target {
  el: Element
  board: Board
}

/**
 * An inspector for whatever is on the page. Pick a DOM node; the board whose `dom` holds it
 * opens in a panel on the right, cards next to the table, with a line back to the node.
 */
export function Inspector(props: { root: Board }) {
  const [picking, setPicking] = createSignal(false)
  const [hover, setHover] = createSignal<Target | null>(null)
  const [target, setTarget] = createSignal<Target | null>(null)
  const [rect, setRect] = createSignal<DOMRect | null>(null)
  const [panelLeft, setPanelLeft] = createSignal(window.innerWidth)
  let panel!: HTMLDivElement

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
      if (h) setTarget(h)
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

  // follow the inspected node while the panel is open; close if it leaves the page or its board closes
  createEffect(() => {
    const t = target()
    if (!t) return setRect(null)
    // the panel pushes the page aside; once it has, bring the node back into view
    const scroll = setTimeout(() => {
      t.el.scrollIntoView({ block: "nearest", inline: "nearest" })
      // leave room between the node and the panel for the line
      const scroller = scrollParent(t.el)
      const over = t.el.getBoundingClientRect().right - (panel.getBoundingClientRect().left - 48)
      if (scroller && over > 0) scroller.scrollLeft += over
    }, 280)
    onCleanup(() => clearTimeout(scroll))
    let raf = 0
    const tick = () => {
      if (!t.el.isConnected || t.board.signal.aborted) return setTarget(null)
      setRect(t.el.getBoundingClientRect())
      setPanelLeft(panel.getBoundingClientRect().left)
      raf = requestAnimationFrame(tick)
    }
    tick()
    onCleanup(() => cancelAnimationFrame(raf))
  })

  const link = () => {
    const r = rect()
    if (!r) return null
    const x2 = panelLeft()
    const y2 = 68
    const x1 = Math.min(r.right, x2 - 8)
    const y1 = Math.max(r.top, Math.min(r.bottom, y2))
    const cx = (x1 + x2) / 2
    return { r, d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}` }
  }

  return (
    <>
      <button class="inspector-btn" classList={{ active: picking(), open: !!target() }} onClick={() => setPicking((p) => !p)} title="Pick something on the page to inspect the board behind it">
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

      <Show when={link()}>
        {(l) => (
          <svg class="inspector-link">
            <rect x={l().r.left} y={l().r.top} width={l().r.width} height={l().r.height} />
            <path d={l().d} />
            <circle cx={panelLeft()} cy={68} r={4} />
          </svg>
        )}
      </Show>

      <div class="inspector-panel" classList={{ open: !!target() }} ref={panel}>
        <Show when={target()}>
          {(t) => (
            <div class="inspector-inner">
              <header class="inspector-head">
                <span class="inspector-title">{t().board.name}</span>
                <span class="dim mono">{describe(t().el)}</span>
                <span class="spacer" />
                <button class="inspector-close" onClick={() => setTarget(null)} title="Close">
                  ×
                </button>
              </header>
              <div class="inspector-body">
                <section class="inspector-cards">
                  <BoardView board={t().board} />
                </section>
                <section class="inspector-table">
                  <TableView board={t().board} />
                </section>
              </div>
            </div>
          )}
        </Show>
      </div>
    </>
  )
}

function scrollParent(el: Element): Element | null {
  for (let e = el.parentElement; e; e = e.parentElement) {
    const o = getComputedStyle(e).overflowX
    if ((o === "auto" || o === "scroll") && e.scrollWidth > e.clientWidth) return e
  }
  return null
}

function describe(el: Element) {
  const cls = [...el.classList].filter((c) => !c.startsWith("maplibregl") && !c.startsWith("cm-") && !c.startsWith("ͼ"))[0]
  return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>`
}
