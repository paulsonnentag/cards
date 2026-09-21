import * as maplibregl from "maplibre-gl"
import type { Board, Card } from "../runtime"
import { clear, type Location } from "../docs"

export default {
  title: "Markers",
  icon: "📌",
  description: "Drops a pin on the map for every location this board knows about.",

  async mount(board: Board) {
    const map = await board.get<maplibregl.Map>("map").ready
    const locations = board.get<Record<string, Location>>("locations", {})
    const selection = board.get<Record<string, true>>("selection", {})
    const pins = new Map<string, maplibregl.Marker>()

    const stopLocations = locations.subscribe((all) => {
      for (const [url, loc] of Object.entries(all)) {
        let pin = pins.get(url)
        if (!pin) {
          const el = document.createElement("div")
          el.className = "pin"
          el.title = loc.title
          el.onclick = (e) => {
            e.stopPropagation()
            selection.change((s) => {
              clear(s)
              s[url] = true
            })
          }
          pin = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([loc.lng, loc.lat]).addTo(map.value)
          pins.set(url, pin)
        } else {
          pin.setLngLat([loc.lng, loc.lat])
        }
      }
      for (const [url, pin] of pins) {
        if (!(url in all)) {
          pin.remove()
          pins.delete(url)
        }
      }
    })

    const stopSelection = selection.subscribe((s) => {
      for (const [url, pin] of pins) pin.getElement().classList.toggle("selected", !!s[url])
      const url = Object.keys(s).find((u) => pins.has(u))
      if (!url) return
      const loc = locations.value[url]
      map.value.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.value.getZoom(), 5) })
    })

    return () => {
      stopLocations()
      stopSelection()
      for (const p of pins.values()) p.remove()
    }
  },
} satisfies Card
