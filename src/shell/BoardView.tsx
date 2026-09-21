import { For, Show, createResource, createSignal, from } from "solid-js"
import type { Board, BoardDoc, Placement } from "../runtime"
import { cardUrls, faceOf } from "../cards"
import { Pile } from "./Pile"

const px = (n: number) => `${n}px`

/** The cards where they lie, face up or down, and child boards as stacks. Edits the board document. */
export function BoardView(props: { board: Board }) {
  const cell = props.board.get<BoardDoc>("board")
  const doc = from(cell)
  const children = from(props.board.children)
  const [adding, setAdding] = createSignal(false)
  const [pickedUp, setPickedUp] = createSignal<Board | null>(null)

  const add = (url: string) => {
    const id = url.replace(/^card:/, "") + "-" + Math.random().toString(36).slice(2, 6)
    cell.change((d) => {
      d.cards[id] = { url, x: 40 + Math.random() * 200, y: 40 + Math.random() * 120, faceUp: true }
    })
    setAdding(false)
  }

  return (
    <div class="board-view">
      <For each={Object.keys(doc()?.cards ?? {})}>
        {(id) => <PlayingCard id={id} placement={() => doc()!.cards[id]} cell={cell} />}
      </For>
      <div class="stacks">
        <For each={Object.keys(doc()?.boards ?? {})}>
          {(id) => {
            const open = () => children()?.find((b) => b.name === id) ?? null
            return (
              <button class="stack" classList={{ placed: !!open() }} onClick={() => open() && setPickedUp(open())} title={open() ? "Pick up" : "Not placed by any card"}>
                <span class="stack-cards" />
                <span class="stack-name">{id}</span>
                <span class="dim">{open() ? "placed" : "unplaced"}</span>
              </button>
            )
          }}
        </For>
      </div>
      <div class="board-tools">
        <button class="btn" onClick={() => setAdding((a) => !a)}>
          + Add card
        </button>
        <Show when={adding()}>
          <div class="menu">
            <For each={cardUrls}>{(url) => <FaceButton url={url} onPick={() => add(url)} />}</For>
          </div>
        </Show>
      </div>
      <Show when={pickedUp()}>
        {(b) => (
          <div class="modal" onClick={(e) => e.target === e.currentTarget && setPickedUp(null)}>
            <div class="modal-body">
              <Pile board={b()} onClose={() => setPickedUp(null)} />
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}

function FaceButton(props: { url: string; onPick: () => void }) {
  const [face] = createResource(() => props.url, faceOf)
  return (
    <button class="menu-item" onClick={props.onPick}>
      <span class="icon">{face()?.icon ?? "▢"}</span>
      <span>
        <b>{face()?.title ?? props.url}</b>
        <span class="dim"> {face()?.description}</span>
      </span>
    </button>
  )
}

function PlayingCard(props: { id: string; placement: () => Placement; cell: { change(fn: (d: BoardDoc) => void): void } }) {
  const [face] = createResource(() => props.placement().url, faceOf)
  const [drag, setDrag] = createSignal<{ x: number; y: number } | null>(null)
  const pos = () => drag() ?? props.placement()

  const down = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".card-remove")) return
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
      } else {
        props.cell.change((b) => {
          b.cards[props.id].faceUp = !b.cards[props.id].faceUp
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
      classList={{ down: !props.placement().faceUp, dragging: !!drag() }}
      style={{ left: px(pos().x), top: px(pos().y) }}
      onPointerDown={down}
      title={props.placement().faceUp ? "Click to flip face down" : "Click to flip face up"}
    >
      <button
        class="card-remove"
        title="Remove from board"
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
    </div>
  )
}
