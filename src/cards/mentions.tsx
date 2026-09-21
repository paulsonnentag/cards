import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view"
import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state"
import type { Repo } from "@automerge/automerge-repo"
import { For, Show, createRoot, createSignal } from "solid-js"
import { render } from "solid-js/web"
import type { Board, Card } from "../runtime"
import { clear, type Place, type PlaceDoc } from "../docs"

const TOKEN_RE = /\{(automerge:[A-Za-z0-9]+)\}/g
const QUERY_RE = /@([\p{L}\p{N}][\p{L}\p{N} '.-]*)$/u

/** Tells the plugin that something outside the editor changed. */
const refresh = StateEffect.define<null>()

export default {
  title: "Mentions",
  icon: "@",
  description: "Offers an @ menu in every editor on this board, answered by the finders here.",

  mount(board: Board) {
    board.put("editor/extensions/mentions", mentionSearch(board))
  },
} satisfies Card

/** The extension every editor on the board installs. */
function mentionSearch(board: Board): Extension {
  const queries = board.get<Record<string, true>>("search/queries", {})
  const finders = board.keys("search/results")
  const selection = board.get<Record<string, true>>("selection", {})

  class MentionWidget extends WidgetType {
    constructor(
      readonly url: string,
      readonly selected: boolean,
    ) {
      super()
    }
    eq(other: MentionWidget) {
      return other.url === this.url && other.selected === this.selected
    }
    toDOM() {
      const el = document.createElement("span")
      el.className = "mention" + (this.selected ? " selected" : "")
      el.textContent = "…"
      const place = board.get<PlaceDoc>(this.url)
      const stop = place.subscribe((p) => (el.textContent = `📍 ${shortTitle(p.title)}`))
      el.onclick = (e) => {
        e.preventDefault()
        selection.change((s) => {
          clear(s)
          s[this.url] = true
        })
      }
      ;(el as HTMLElement & { stop?: () => void }).stop = stop
      return el
    }
    destroy(dom: HTMLElement) {
      ;(dom as HTMLElement & { stop?: () => void }).stop?.()
    }
    ignoreEvent() {
      return false
    }
  }

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      menu: HTMLDivElement
      disposeMenu: () => void
      stopSelection: () => void
      query: string | null = null
      range: { from: number; to: number } | null = null
      setQuery: (q: string | null) => void
      items: () => Place[]
      disposeItems: () => void
      alive = true

      constructor(readonly view: EditorView) {
        this.decorations = this.decorate()

        // menu items: every finder's answer for the current query, live
        const [query, setQuery] = createSignal<string | null>(null)
        this.setQuery = setQuery
        const [items, dispose] = createRoot((dispose) => {
          const items = () => {
            const q = query()
            if (!q) return []
            const out: Place[] = []
            for (const n of finders.value) {
              try {
                out.push(...(board.get<Record<string, Place[]>>(`search/results/${n}`).value[q] ?? []))
              } catch {
                /* not answered yet */
              }
            }
            return out
          }
          return [items, dispose] as const
        })
        this.items = items
        this.disposeItems = dispose

        this.menu = document.createElement("div")
        this.menu.className = "mention-menu"
        this.menu.style.display = "none"
        view.dom.appendChild(this.menu)
        this.disposeMenu = render(
          () => (
            <Show when={query()} fallback={null}>
              <Show when={this.items().length > 0} fallback={<div class="mention-empty">Searching…</div>}>
                <For each={this.items()}>
                  {(place) => (
                    <button class="mention-item" onMouseDown={(e) => e.preventDefault()} onClick={() => this.pick(place)}>
                      <span class="mention-title">{shortTitle(place.title)}</span>
                      <span class="mention-sub">{place.title}</span>
                    </button>
                  )}
                </For>
              </Show>
            </Show>
          ),
          this.menu,
        )

        this.stopSelection = selection.subscribe(() => queueMicrotask(() => this.alive && view.dispatch({ effects: refresh.of(null) })))
        this.check()
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.focusChanged || u.transactions.some((t) => t.effects.some((e) => e.is(refresh)))) {
          this.decorations = this.decorate()
          this.check()
        }
      }

      /** Decorates every `{automerge:…}` token as a chip. */
      decorate(): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>()
        let selected: Record<string, true> = {}
        try {
          selected = selection.value
        } catch {
          /* none */
        }
        const text = this.view.state.doc.toString()
        for (const m of text.matchAll(TOKEN_RE)) {
          const from = m.index!
          const to = from + m[0].length
          builder.add(from, to, Decoration.replace({ widget: new MentionWidget(m[1], !!selected[m[1]]) }))
        }
        return builder.finish()
      }

      /** Is the caret after `@something`? Then that is the query. */
      check() {
        const state = this.view.state
        const pos = state.selection.main.head
        const line = state.doc.lineAt(pos)
        const before = line.text.slice(0, pos - line.from)
        const m = this.view.hasFocus && state.selection.main.empty ? QUERY_RE.exec(before) : null
        if (m) {
          const q = m[1].trim()
          this.range = { from: line.from + m.index, to: pos }
          if (q !== this.query) {
            this.query = q
            this.setQuery(q)
            queries.change((qs) => {
              clear(qs)
              qs[q] = true
            })
          }
          this.place()
          this.menu.style.display = ""
        } else if (this.query !== null) {
          this.query = null
          this.range = null
          this.setQuery(null)
          this.menu.style.display = "none"
          queries.change(clear)
        }
      }

      place() {
        // Layout can't be read during an update; measure afterwards.
        this.view.requestMeasure({
          read: (view) => ({ coords: view.coordsAtPos(view.state.selection.main.head), box: view.dom.getBoundingClientRect() }),
          write: ({ coords, box }) => {
            if (!coords) return
            this.menu.style.left = `${Math.max(0, coords.left - box.left)}px`
            this.menu.style.top = `${coords.bottom - box.top + 4}px`
          },
        })
      }

      pick(place: Place) {
        if (!this.range) return
        const repo = board.get<Repo>("repo").value
        const url = repo.create<PlaceDoc>({ title: place.title, lat: place.lat, lng: place.lng }).url
        const { from, to } = this.range
        this.view.dispatch({ changes: { from, to, insert: `{${url}} ` }, selection: { anchor: from + url.length + 3 } })
        this.view.focus()
      }

      destroy() {
        this.alive = false
        this.stopSelection()
        this.disposeMenu()
        this.disposeItems()
        this.menu.remove()
        if (this.query !== null) queries.change(clear)
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
    },
  )

  return [plugin]
}

function shortTitle(title: string) {
  return title.split(",")[0].trim()
}
