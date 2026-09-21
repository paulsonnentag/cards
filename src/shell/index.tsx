import { render } from "solid-js/web"
import type { Board } from "../runtime"
import { Pile } from "./Pile"
import { ChildPiles } from "./ChildPiles"
import { reset } from "../seed"

/**
 * Show a board the same way every board on a canvas is shown: as a pile of its views.
 * The top-level pile is locked for now, so only the boards on the canvas can be peeked behind.
 */
export function show(board: Board, into: HTMLElement) {
  return render(
    () => (
      <>
        <Pile board={board} locked />
        <ChildPiles board={board} />
        <button class="reset" onClick={() => confirm("Reset the demo? This deletes the local documents.") && reset()} title="Delete the local documents and start over">
          Reset demo
        </button>
      </>
    ),
    into,
  )
}

export { Pile } from "./Pile"
export { BoardView } from "./BoardView"
export { TableView } from "./TableView"
