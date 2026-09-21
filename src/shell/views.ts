import type { Board } from "../runtime"

export type ViewName = "board" | "table" | "dom"

export const VIEWS: { name: ViewName; title: string; glyph: string }[] = [
  { name: "dom", title: "DOM", glyph: "◫" },
  { name: "board", title: "Board", glyph: "▦" },
  { name: "table", title: "Table", glyph: "☰" },
]

/** Which view is on top is the sticker `view` on the board. */
export function setView(board: Board, name: ViewName) {
  board.put("view", name)
}
