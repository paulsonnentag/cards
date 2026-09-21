import { For, createEffect, createSignal, from, on, untrack } from "solid-js"
import type { Board } from "../runtime"
import { BoardView } from "./BoardView"
import { TableView } from "./TableView"

export type ViewName = "board" | "table" | "dom"

const VIEWS: { name: ViewName; title: string; glyph: string }[] = [
  { name: "dom", title: "DOM", glyph: "◫" },
  { name: "board", title: "Board", glyph: "▦" },
  { name: "table", title: "Table", glyph: "☰" },
]

const TUCK = 22 // px of a tucked sheet that peeks out below the main one
const PULL_DISTANCE = 80 // px a sheet has to be dragged sideways to pull it out or tuck it back

/**
 * A board's views as a pile of sheets. The focused view is on top; the others are tucked
 * under it and peek out at the bottom. Hover a tucked sheet and it slides out a little,
 * click it to bring it to the front, drag it out to lay it next to the main sheet.
 * Which view is on top is the sticker `view` on the board. A locked pile shows only the top sheet.
 */
export function Pile(props: { board: Board; locked?: boolean; onSpread?: (count: number) => void }) {
  // The board's own `view` sticker, so a parent's choice doesn't flip this pile.
  const own = untrack(() => props.board.stickers("view").value[0]?.board === props.board.name)
  if (!own) props.board.put("view", "dom")
  const view = from(props.board.get<ViewName>("view"))
  const hasDom = from(props.board.get<HTMLElement>("dom"))

  const [pulled, setPulled] = createSignal<ViewName[]>([])
  const [drag, setDrag] = createSignal<{ name: ViewName; dx: number; dy: number } | null>(null)

  const views = () => VIEWS.filter((v) => v.name !== "dom" || hasDom())
  const main = (): ViewName => {
    const v = view()
    return v && views().some((x) => x.name === v) ? v : views()[0].name
  }
  const tucked = () => (props.locked ? [] : views().map((v) => v.name).filter((n) => n !== main() && !pulled().includes(n)))
  const state = (n: ViewName) => (n === main() ? "main" : pulled().includes(n) ? "pulled" : tucked().includes(n) ? "tucked" : "hidden")

  createEffect(() => props.onSpread?.(pulled().length))

  /** Bring a sheet to the front. A pulled sheet trades places with the main one. */
  const swap = (n: ViewName) => {
    const old = main()
    if (pulled().includes(n)) setPulled((p) => p.map((x) => (x === n ? old : x)))
    props.board.put("view", n)
  }

  const grab = (e: PointerEvent, n: ViewName) => {
    if (e.button !== 0 || state(n) === "main") return
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const start = { x: e.clientX, y: e.clientY }
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < 4) return
      moved = true
      setDrag({ name: n, dx, dy })
    }
    const up = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", up)
      target.removeEventListener("pointercancel", up)
      const d = drag()
      setDrag(null)
      if (!moved || !d) return swap(n)
      if (state(n) === "tucked" && d.dx > PULL_DISTANCE) setPulled((p) => [...p, n])
      else if (state(n) === "pulled" && d.dx < -PULL_DISTANCE) setPulled((p) => p.filter((x) => x !== n))
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", up)
    target.addEventListener("pointercancel", up)
  }

  /** Where a sheet rests, as CSS variables the stylesheet turns into a transform. */
  const place = (n: ViewName) => {
    const s = state(n)
    const d = drag()
    let x = "0px"
    let y = "0px"
    let z = 3
    if (s === "tucked") {
      const i = tucked().indexOf(n)
      y = `${(i + 1) * TUCK}px`
      z = 2 - i
    } else if (s === "pulled") {
      const i = pulled().indexOf(n)
      x = `calc(${i + 1} * (100% + 16px))`
      z = 3
    }
    if (d?.name === n) {
      x = `calc(${x} + ${d.dx}px)`
      y = `calc(${y} + ${d.dy}px)`
      z = 10
    }
    return { "--x": x, "--y": y, "z-index": z }
  }

  return (
    <div class="pile" classList={{ locked: !!props.locked }}>
      <For each={views()}>
        {(v) => (
          <section class="sheet" classList={{ [state(v.name)]: true, dragging: drag()?.name === v.name }} style={place(v.name)} data-view={v.name}>
            <div class="sheet-body">
              {v.name === "dom" ? <DomSlot board={props.board} /> : v.name === "board" ? <BoardView board={props.board} /> : <TableView board={props.board} />}
            </div>
            <div class="sheet-tab" onPointerDown={(e) => grab(e, v.name)} title={`${v.title}: click to bring to the front, drag out to lay it beside`}>
              <span class="glyph">{v.glyph}</span> {v.title}
            </div>
          </section>
        )}
      </For>
    </div>
  )
}

/** The board's `dom` sticker, adopted into this slot. */
function DomSlot(props: { board: Board }) {
  const dom = from(props.board.get<HTMLElement>("dom"))
  let slot!: HTMLDivElement
  createEffect(
    on(dom, (el) => {
      if (el && el.parentElement !== slot) slot.appendChild(el)
    }),
  )
  return <div class="dom-view" ref={slot} />
}
