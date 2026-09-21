import { For, createResource, createSignal, from } from "solid-js"
import type { Board, BoardDoc, Placement } from "../runtime"
import { faceOf } from "../cards"

const px = (n: number) => `${n}px`

/** The cards where they lie, face up or down, and child boards as stacks. Edits the board document. */
export function BoardView(props: { board: Board }) {
  const cell = props.board.get<BoardDoc>("board")
  const doc = from(cell)
  const children = from(props.board.children)
  const [selected, setSelected] = createSignal<string | null>(null)

  return (
    <div class="board-view" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
      <For each={Object.keys(doc()?.cards ?? {})}>
        {(id) => (
          <PlayingCard
            id={id}
            placement={() => doc()!.cards[id]}
            cell={cell}
            selected={() => selected() === id}
            select={() => setSelected(id)}
          />
        )}
      </For>
      <div class="stacks">
        <For each={Object.keys(doc()?.boards ?? {})}>
          {(id) => {
            const open = () => children()?.find((b) => b.name === id) ?? null
            return (
              <div class="stack" classList={{ placed: !!open() }} title={open() ? "Placed on the canvas; look at it there" : "Not placed by any card"}>
                <span class="stack-cards" />
                <span class="stack-name">{id}</span>
                <span class="dim">{open() ? "placed" : "unplaced"}</span>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}

function PlayingCard(props: {
  id: string
  placement: () => Placement
  cell: { change(fn: (d: BoardDoc) => void): void }
  selected: () => boolean
  select: () => void
}) {
  const [face] = createResource(() => props.placement().url, faceOf)
  const [drag, setDrag] = createSignal<{ x: number; y: number } | null>(null)
  const pos = () => drag() ?? props.placement()

  const flip = () =>
    props.cell.change((b) => {
      b.cards[props.id].faceUp = !b.cards[props.id].faceUp
    })

  /** Click selects, drag moves. The corner flips (its own handler). */
  const down = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".card-remove, .card-flip")) return
    e.stopPropagation()
    props.select()
    const target = e.currentTarget as HTMLElement
    const p = props.placement()
    const start = { x: e.clientX - p.x, y: e.clientY - p.y }
    let moved = false
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3 && !moved) return
      moved = true
      setDrag({ x: ev.clientX - start.x, y: ev.clientY - start.y })
    }
    const up = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", up)
      const d = drag()
      if (moved && d) {
        props.cell.change((b) => {
          b.cards[props.id].x = Math.round(d.x)
          b.cards[props.id].y = Math.round(d.y)
        })
      }
      setDrag(null)
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", up)
  }

  return (
    <div
      class="card"
      classList={{ down: !props.placement().faceUp, dragging: !!drag(), selected: props.selected() }}
      style={{ left: px(pos().x), top: px(pos().y) }}
      onPointerDown={down}
    >
      <button
        class="card-remove"
        title="Remove from board"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          props.cell.change((b) => {
            delete b.cards[props.id]
          })
        }}
      >
        ×
      </button>
      <div class="card-front">
        <div class="pip tl">{face()?.icon ?? "▢"}</div>
        <div class="card-title">{face()?.title ?? props.placement().url}</div>
        <div class="card-main" />
        <div class="card-text">{face()?.description}</div>
        <div class="pip br">{face()?.icon ?? "▢"}</div>
      </div>
      <div class="card-back">
        <span>{face()?.title ?? props.placement().url}</span>
      </div>
      <button
        class="card-flip"
        title={props.placement().faceUp ? "Flip face down" : "Flip face up"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          flip()
        }}
      />
    </div>
  )
}
