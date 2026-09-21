import { For, Show, createSignal, from } from "solid-js"
import type { Board } from "../runtime"
import { BoardView } from "./BoardView"
import { TableView } from "./TableView"
import { DomView } from "./DomView"
import { VIEWS, setView, type ViewName } from "./views"
import { reset } from "../seed"

/**
 * A board's views shuffled into one pile. Pick one to bring it to the front, or fan them out.
 * The DOM view exists only while the board has a `dom` sticker.
 */
export function Pile(props: { board: Board; top?: boolean; onClose?: () => void }) {
  const view = from(props.board.get<ViewName>("view", "dom"))
  const hasDom = from(props.board.get<HTMLElement>("dom"))
  const [fanned, setFanned] = createSignal(false)
  const views = () => VIEWS.filter((v) => v.name !== "dom" || hasDom())
  const current = (): ViewName => {
    const v = view()
    return v && views().some((x) => x.name === v) ? v : views()[0].name
  }

  return (
    <div class="pile" classList={{ fanned: fanned(), top: !!props.top }}>
      <header class="pile-bar">
        <span class="pile-name">{props.board.name}</span>
        <nav class="tabs">
          <For each={views()}>
            {(v) => (
              <button class="tab" classList={{ active: !fanned() && current() === v.name }} onClick={() => setView(props.board, v.name)}>
                <span class="glyph">{v.glyph}</span> {v.title}
              </button>
            )}
          </For>
        </nav>
        <span class="spacer" />
        <button class="tab" classList={{ active: fanned() }} onClick={() => setFanned((f) => !f)} title="Fan the views out side by side">
          Fan out
        </button>
        <Show when={props.top}>
          <button class="tab" onClick={() => confirm("Reset the demo? This deletes the local documents.") && reset()} title="Delete the local documents and start over">
            Reset
          </button>
        </Show>
        <Show when={props.onClose}>
          <button class="tab" onClick={props.onClose}>
            Close
          </button>
        </Show>
      </header>
      <div class="sheets">
        <For each={views()}>
          {(v) => (
            <section class="sheet" classList={{ visible: fanned() || current() === v.name }} data-view={v.name}>
              {v.name === "dom" ? <DomView board={props.board} /> : v.name === "board" ? <BoardView board={props.board} /> : <TableView board={props.board} />}
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
