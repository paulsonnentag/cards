import { createEffect, from, on } from "solid-js"
import { render } from "solid-js/web"
import type { Board } from "../runtime"
import { Inspector } from "./Inspector"
import { reset } from "../seed"

/** Show a board: its `dom` fills the page, and an inspector in the corner opens any board behind what you pick. */
export function show(board: Board, into: HTMLElement) {
  return render(
    () => (
      <>
        <DomSlot board={board} />
        <Inspector root={board} />
        <button class="reset" onClick={() => confirm("Reset the demo? This deletes the local documents.") && reset()} title="Delete the local documents and start over">
          Reset demo
        </button>
      </>
    ),
    into,
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

export { Inspector } from "./Inspector"
export { BoardView } from "./BoardView"
export { TableView } from "./TableView"
