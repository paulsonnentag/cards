import { For, createEffect, from, on, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import type { Board } from "../runtime"
import { Pile } from "./Pile"

/** Every open child board that has a `dom` gets a pile where its dom was put, and its own children recursively. */
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

/**
 * Renders a pile into the element that holds the child's `dom`. The pile adopts the dom element
 * into its DOM sheet, so the renderer's slot ends up holding the whole pile.
 */
function InPlace(props: { board: Board }) {
  const dom = from(props.board.get<HTMLElement>("dom"))
  createEffect(
    on(dom, (el) => {
      const holder = el?.parentElement
      if (!el || !holder || holder.classList.contains("dom-view")) return
      const host = document.createElement("div")
      host.className = "pile-host"
      holder.appendChild(host)
      const dispose = render(() => <Pile board={props.board} onSpread={(n) => (holder.style.zIndex = n ? "5" : "")} />, host)
      onCleanup(() => {
        dispose()
        host.remove()
      })
    }),
  )
  return null
}
