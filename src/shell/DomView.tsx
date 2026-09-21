import { createEffect, from } from "solid-js"
import type { Board } from "../runtime"

/** The board's `dom` sticker, adopted into this slot. */
export function DomView(props: { board: Board }) {
  const dom = from(props.board.get<HTMLElement>("dom"))
  let slot!: HTMLDivElement
  createEffect(() => {
    const el = dom()
    if (el && el.parentElement !== slot) slot.appendChild(el)
  })
  return <div class="dom-view" ref={slot} />
}
