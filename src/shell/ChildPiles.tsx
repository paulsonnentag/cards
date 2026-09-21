import { For, Show, from } from "solid-js"
import { Portal } from "solid-js/web"
import type { Board } from "../runtime"
import { BoardView } from "./BoardView"
import { TableView } from "./TableView"
import { VIEWS, setView, type ViewName } from "./views"

/** Every open child board that has a `dom` gets a switcher in place, and its own children recursively. */
export function ChildPiles(props: { board: Board }) {
  const children = from(props.board.children)
  return (
    <For each={children() ?? []}>
      {(child) => (
        <>
          <InPlace board={child} />
          <ChildPiles board={child} />
        </>
      )}
    </For>
  )
}

function InPlace(props: { board: Board }) {
  const dom = from(props.board.get<HTMLElement>("dom"))
  // A placed board starts with its DOM on top, whatever its parent shows: its own `view` sticker covers the inherited one.
  props.board.put("view", "dom")
  const view = from(props.board.get<ViewName>("view"))
  const current = () => view() ?? "dom"
  return (
    <Show when={dom()?.parentElement}>
      {(parent) => (
        <Portal mount={parent()}>
          <div class="inplace">
            <nav class="inplace-tabs">
              <For each={VIEWS}>
                {(v) => (
                  <button class="inplace-tab" classList={{ active: current() === v.name }} title={v.title} onClick={() => setView(props.board, v.name)}>
                    {v.glyph}
                  </button>
                )}
              </For>
            </nav>
            <Show when={current() !== "dom"}>
              <div class="inplace-sheet">{current() === "board" ? <BoardView board={props.board} /> : <TableView board={props.board} />}</div>
            </Show>
          </div>
        </Portal>
      )}
    </Show>
  )
}
