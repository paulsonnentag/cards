import { Compartment, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { minimalSetup } from "codemirror"
import { markdown } from "@codemirror/lang-markdown"
import { automergeSyncPlugin } from "@automerge/automerge-codemirror"
import type { AutomergeUrl, DocHandle, Repo } from "@automerge/automerge-repo"
import type { Board, Card } from "../runtime"
import type { MarkdownDoc } from "../docs"

export default {
  title: "Markdown",
  icon: "📝",
  description: "Edits the document's text, with whatever editor extensions this board offers.",

  async mount(board: Board) {
    const dom = await board.get<HTMLElement>("dom").ready
    const doc = await board.get<MarkdownDoc>("document").ready
    const repo = board.get<Repo>("repo").value
    const handle = await repo.find<MarkdownDoc>(doc.path[0] as AutomergeUrl)
    const names = board.keys("editor/extensions")
    const extensions = new Compartment()

    const view = new EditorView({
      parent: dom.value,
      doc: handle.doc()?.content ?? "",
      extensions: [
        minimalSetup,
        markdown(),
        EditorView.lineWrapping,
        automergeSyncPlugin({ handle: handle as unknown as Parameters<typeof automergeSyncPlugin>[0]["handle"], path: ["content"] }),
        extensions.of([]),
      ],
    })

    // Installed extensions follow the board. Dispatching from inside a subscription can land in the
    // middle of an editor update, so it is deferred.
    let installed: Extension[] = []
    let alive = true
    const stop = names.subscribe((ns) => {
      const exts: Extension[] = []
      for (const n of ns) {
        try {
          exts.push(board.get<Extension>(`editor/extensions/${n}`).value)
        } catch {
          /* not there yet */
        }
      }
      if (exts.length === installed.length && exts.every((e, i) => e === installed[i])) return
      installed = exts
      queueMicrotask(() => alive && view.dispatch({ effects: extensions.reconfigure(exts) }))
    })

    return () => {
      alive = false
      stop()
      view.destroy()
    }
  },
} satisfies Card

export type { DocHandle }
