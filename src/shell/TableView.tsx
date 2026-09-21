import { For, from } from "solid-js"
import type { Board, Handle, Sticker } from "../runtime"
import { isLink } from "../runtime"
import { NotFound } from "../runtime"

/** Every sticker the board sees: path, scope, attribution, value, and whether it is covered. */
export function TableView(props: { board: Board }) {
  const rows = from(props.board.stickers())
  return (
    <div class="table-view">
      <table>
        <thead>
          <tr>
            <th>Path</th>
            <th>Scope</th>
            <th>Board</th>
            <th>Card</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <For each={rows() ?? []}>
            {(s) => (
              <tr classList={{ covered: s.covered, hidden: !s.handle, shared: s.scope === "document" }}>
                <td class="path">
                  <span class="mono">{s.via ?? s.path}</span>
                  {s.via ? <span class="dim mono"> {s.path}</span> : null}
                </td>
                <td>{s.scope}</td>
                <td>{s.board}</td>
                <td>{s.card ?? <span class="dim">board</span>}</td>
                <td class="value mono">
                  {repr(s)}
                  {s.covered ? <span class="tag">covered</span> : null}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function repr(s: Sticker): string {
  if (!s.handle) return "hidden"
  return reprValue(s.handle)
}

function reprValue(handle: Handle<unknown>): string {
  let v: unknown
  try {
    v = handle.value
  } catch (e) {
    if (e instanceof NotFound) return "—"
    return String(e)
  }
  return format(v)
}

export function format(v: unknown): string {
  if (v instanceof HTMLElement) return `<${v.tagName.toLowerCase()}${v.className ? "." + String(v.className).split(" ")[0] : ""}>`
  if (typeof v === "function") return "ƒ"
  if (isLink(v)) return v
  if (typeof v === "string") return truncate(JSON.stringify(v), 70)
  if (v === null || typeof v !== "object") return String(v)
  const ctor = (v as object).constructor?.name
  if (ctor && ctor !== "Object" && ctor !== "Array") return `[${ctor}]`
  try {
    return truncate(JSON.stringify(v), 90)
  } catch {
    return `[${ctor ?? "object"}]`
  }
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)
