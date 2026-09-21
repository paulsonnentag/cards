import { For, Show, createMemo, createSignal, from } from "solid-js"
import type { JSX } from "solid-js"
import type { Board, Handle, Sticker } from "../runtime"
import { NotFound, isLink } from "../runtime"

/**
 * Every sticker the board sees, as one flat listing: a row per sticker with its name, who put it,
 * and a summary of its value. Pick a row and the value opens as a JSON document in the pane beside.
 */
export function TableView(props: { board: Board }) {
  const rows = from(props.board.stickers())
  const [picked, setPicked] = createSignal<string | null>(null)
  const idOf = (s: Sticker) => `${s.path}\u0000${s.board}\u0000${s.card ?? ""}`
  const open = createMemo(() => {
    const id = picked()
    return id === null ? undefined : (rows() ?? []).find((s) => idOf(s) === id)
  })

  return (
    <div class="table-view">
      <div class="strip" classList={{ single: !open() }}>
        <div class="entries">
          <For each={rows() ?? []}>
            {(s) => {
              const value = () => read(s)
              const own = () => s.board === props.board.name
              return (
                <div
                  class="tree-item"
                  classList={{
                    selected: picked() === idOf(s),
                    inherited: !own(),
                    shared: s.scope === "document",
                    covered: s.covered,
                    hidden: !s.handle,
                  }}
                  title={`${s.path}\n${who(s)}${s.covered ? "\ncovered by a sticker above it" : ""}`}
                  onClick={() => setPicked((p) => (p === idOf(s) ? null : idOf(s)))}
                >
                  <Show when={s.scope === "document"} fallback={<FileIcon />}>
                    <DocIcon />
                  </Show>
                  <span class="tree-name">
                    {s.via ?? s.path}
                    <Show when={s.via}>
                      <span class="tree-canonical"> {s.path}</span>
                    </Show>
                  </span>
                  <span class="tree-by">{s.card ?? (own() ? "" : s.board)}</span>
                  <span class="tree-value">
                    <Show when={s.covered}>
                      <span class="tree-tag">covered</span>
                    </Show>
                    {summarize(value())}
                  </span>
                  <span class="tree-more">›</span>
                </div>
              )
            }}
          </For>
        </div>
        <Show when={open()}>{(s) => <Preview sticker={s()} close={() => setPicked(null)} />}</Show>
      </div>
    </div>
  )
}

/** The picked sticker's value as a JSON document. */
function Preview(props: { sticker: Sticker; close: () => void }) {
  const value = () => read(props.sticker)
  return (
    <div class="preview">
      <div class="preview-head">
        <Show when={props.sticker.scope === "document"} fallback={<FileIcon />}>
          <DocIcon />
        </Show>
        <code class="preview-path" title={props.sticker.path}>
          {props.sticker.via ?? props.sticker.path}
        </code>
        <span class="preview-where">{who(props.sticker)}</span>
        <button class="preview-close" title="Close" onClick={props.close}>
          ×
        </button>
      </div>
      <div class="preview-body">
        <pre class="json">{json(value())}</pre>
      </div>
    </div>
  )
}

// ---- values -------------------------------------------------------------------

const HIDDEN = Symbol("hidden")
const MISSING = Symbol("missing")

/** The sticker's value, or a marker for a hide, nothing there yet, or a read that threw. */
function read(s: Sticker): unknown {
  if (!s.handle) return HIDDEN
  return readHandle(s.handle)
}

function readHandle(handle: Handle<unknown>): unknown {
  try {
    return handle.value
  } catch (e) {
    if (e instanceof NotFound) return MISSING
    return e
  }
}

function who(s: Sticker) {
  return s.card ? `${s.card} on ${s.board}` : s.board
}

/** One line for the row, in the spirit of a file browser's size column. */
function summarize(v: unknown): JSX.Element {
  if (v === HIDDEN) return <i>hidden</i>
  if (v === MISSING) return <i>—</i>
  if (v instanceof Error) return <code class="err">{v.message}</code>
  if (v === undefined) return <i>—</i>
  if (v === null) return <code>null</code>
  if (isLink(v)) return <code class="url" title={v}>{shorten(v)}</code>
  if (typeof v === "string") return <code>{JSON.stringify(v)}</code>
  if (typeof v === "function") return <code>ƒ</code>
  if (v instanceof Element) return <code>{tag(v)}</code>
  if (Array.isArray(v)) return <code>[{v.length} {v.length === 1 ? "item" : "items"}]</code>
  if (typeof v === "object") {
    const ctor = v.constructor?.name
    if (ctor && ctor !== "Object") return <code>[{ctor}]</code>
    const keys = Object.keys(v)
    if (keys.length === 0) return <code>{"{ }"}</code>
    const shown = keys.slice(0, 4).join(", ")
    const more = keys.length > 4 ? `, +${keys.length - 4}` : ""
    return <code>{`{ ${shown}${more} }`}</code>
  }
  return <code>{String(v)}</code>
}

/** The value as a JSON document. What JSON can't say (elements, functions, instances) shows as a token. */
function json(v: unknown): JSX.Element {
  if (v === HIDDEN) return <i>hidden: a sticker below hides this path</i>
  if (v === MISSING) return <i>nothing here yet</i>
  if (v instanceof Error) return <span class="err">{String(v)}</span>
  const text = (() => {
    try {
      const out = JSON.stringify(v, (_k, val) => token(val) ?? val, 2)
      return out === undefined ? String(v) : out
    } catch (e) {
      return String(e)
    }
  })()
  return highlight(text)
}

/** A stand-in string for a value JSON cannot carry, or undefined to leave it be. */
function token(v: unknown): string | undefined {
  if (typeof v === "function") return "ƒ"
  if (typeof v === "bigint") return `${v}n`
  if (v instanceof Element) return tag(v)
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const ctor = v.constructor?.name
    if (ctor && ctor !== "Object") return `[${ctor}]`
  }
  return undefined
}

/** Colour keys, strings, links, numbers, and literals. */
function highlight(text: string): JSX.Element {
  const out: JSX.Element[] = []
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out.push(<span class="j-key">{m[1]}</span>, m[2])
      } else {
        const inner = JSON.parse(m[1]) as string
        out.push(isLink(inner) ? <span class="j-url">{m[1]}</span> : <span class="j-str">{m[1]}</span>)
      }
    } else if (m[3] !== undefined) {
      out.push(<span class="j-num">{m[3]}</span>)
    } else {
      out.push(<span class="j-lit">{m[4]}</span>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const tag = (el: Element) => `<${el.tagName.toLowerCase()}${el.classList[0] ? "." + el.classList[0] : ""}>`

/** automerge:2wd3J7…kQ1r — enough to tell two links apart. */
function shorten(url: string) {
  const [scheme, rest = ""] = url.split(":", 2)
  return rest.length > 12 ? `${scheme}:${rest.slice(0, 5)}…${rest.slice(-4)}` : url
}

// ---- icons ----------------------------------------------------------------------

function FileIcon() {
  return (
    <svg class="icon file-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path class="page" d="M3.5 1.5h6l3 3v9.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" />
      <path class="corner" d="M9.5 1.5v3h3" />
    </svg>
  )
}

/** A shared sticker: one on a document rather than on a board. */
function DocIcon() {
  return (
    <svg class="icon doc-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path class="page" d="M3.5 1.5h6l3 3v9.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5z" />
      <path class="corner" d="M9.5 1.5v3h3" />
      <path d="M5.5 8h5M5.5 10.5h5" />
    </svg>
  )
}
