import { render } from "solid-js/web"
import type { Board } from "../runtime"
import { Pile } from "./Pile"
import { ChildPiles } from "./ChildPiles"

/** Show a board: its views shuffled into one pile, and a switcher on every child board that has a DOM. */
export function show(board: Board, into: HTMLElement) {
  return render(
    () => (
      <>
        <Pile board={board} top />
        <ChildPiles board={board} />
      </>
    ),
    into,
  )
}

export { Pile } from "./Pile"
export { BoardView } from "./BoardView"
export { TableView } from "./TableView"
export { DomView } from "./DomView"
