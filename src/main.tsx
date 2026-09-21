import { Repo } from "@automerge/automerge-repo"
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb"
import { BroadcastChannelNetworkAdapter } from "@automerge/automerge-repo-network-broadcastchannel"
import { createBoard } from "./runtime"
import { importCard } from "./cards"
import { DB, seed } from "./seed"
import { show } from "./shell"
import "./shell/styles.css"

async function main() {
  const repo = new Repo({
    storage: new IndexedDBStorageAdapter(DB),
    network: [new BroadcastChannelNetworkAdapter()],
  })
  const url = await seed(repo)

  const root = createBoard({ repo, import: importCard })
  const page = document.getElementById("app")!
  root.put("dom", page)
  root.put("repo", repo)

  const whiteboard = root.fork("whiteboard")
  const stage = document.createElement("div")
  stage.className = "stage"
  whiteboard.put("dom", stage) // the element the DOM view shows
  whiteboard.open(url) // puts `board`, puts `selection` and `search/queries`, mounts the face-up cards
  show(whiteboard, page) // the views, shuffled

  Object.assign(window, { root, whiteboard, repo })
}

main().catch((e) => {
  console.error(e)
  document.getElementById("app")!.textContent = String(e)
})
