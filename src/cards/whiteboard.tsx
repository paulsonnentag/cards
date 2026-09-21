import { For, createSignal, from, onCleanup, onMount } from "solid-js"
import { render } from "solid-js/web"
import type { Board, BoardDoc, Card } from "../runtime"
import { clear } from "../docs"

const px = (n: number) => `${n}px`

export default {
  title: "Whiteboard",
  icon: "🗂",
  description: "Lays the boards on this board out on a canvas.",

  async mount(board: Board) {
    const dom = await board.get<HTMLElement>("dom").ready
    const doc = await board.get<BoardDoc>("board").ready
    const selection = board.get<Record<string, true>>("selection", {})

    const host = document.createElement("div")
    host.className = "canvas"
    dom.value.appendChild(host)

    const dispose = render(() => {
      const state = from(doc)
      const sel = from(selection)
      const [dragging, setDragging] = createSignal<{ id: string; x: number; y: number } | null>(null)

      const drag = (e: PointerEvent, id: string) => {
        if (e.button !== 0) return
        const placed = state()!.boards[id]
        const start = { x: e.clientX - placed.x, y: e.clientY - placed.y }
        const target = e.currentTarget as HTMLElement
        target.setPointerCapture(e.pointerId)
        selection.change((s) => {
          clear(s)
          s[id] = true
        })
        let moved = false
        const move = (ev: PointerEvent) => {
          moved = true
          setDragging({ id, x: ev.clientX - start.x, y: ev.clientY - start.y })
        }
        const up = () => {
          target.removeEventListener("pointermove", move)
          target.removeEventListener("pointerup", up)
          const d = dragging()
          if (moved && d) {
            doc.change((b) => {
              b.boards[id].x = Math.round(d.x)
              b.boards[id].y = Math.round(d.y)
            })
          }
          setDragging(null)
        }
        target.addEventListener("pointermove", move)
        target.addEventListener("pointerup", up)
      }

      return (
        <For each={Object.keys(state()?.boards ?? {})}>
          {(id) => {
            const placed = () => state()!.boards[id]
            const pos = () => (dragging()?.id === id ? dragging()! : placed())
            let content!: HTMLDivElement
            const child = board.fork(id)
            onMount(() => {
              child.put("dom", content)
              child.open(placed().url)
            })
            onCleanup(() => child.close())
            return (
              <div
                class="item"
                classList={{ selected: !!sel()?.[id] }}
                style={{ left: px(pos().x), top: px(pos().y), width: px(placed().w ?? 420), height: px(placed().h ?? 300) }}
              >
                <div class="item-handle" onPointerDown={(e) => drag(e, id)}>
                  {id}
                </div>
                <div class="item-content" ref={content} />
              </div>
            )
          }}
        </For>
      )
    }, host)

    return () => {
      dispose()
      host.remove()
    }
  },
} satisfies Card
