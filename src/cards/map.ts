import * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import type { Board, Card } from "../runtime"
import type { MapDoc } from "../docs"

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

const STYLE_URL = "https://demotiles.maplibre.org/style.json"

/** A style that needs no network, for when the tiles can't be reached. */
const OFFLINE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#dde7ee" } }],
}

async function loadStyle(): Promise<string | maplibregl.StyleSpecification> {
  try {
    const r = await fetch(STYLE_URL)
    return r.ok ? ((await r.json()) as maplibregl.StyleSpecification) : OFFLINE_STYLE
  } catch {
    return OFFLINE_STYLE
  }
}

export default {
  title: "Map",
  icon: "🗺",
  description: "Shows a map in this board's DOM and keeps its viewport in the document.",

  async mount(board: Board) {
    const dom = await board.get<HTMLElement>("dom").ready
    const doc = await board.get<MapDoc>("document").ready

    const el = document.createElement("div")
    el.className = "map"
    el.style.cssText = "position:absolute;inset:0" // maplibre's own stylesheet sets position: relative
    dom.value.appendChild(el)

    const map = new maplibregl.Map({
      container: el,
      style: await loadStyle(),
      center: doc.value.center,
      zoom: doc.value.zoom,
      attributionControl: false,
    })
    map.on("error", () => {})

    map.on("moveend", () => {
      const c = map.getCenter()
      const z = map.getZoom()
      const d = doc.value
      if (near(d.center[0], c.lng) && near(d.center[1], c.lat) && near(d.zoom, z)) return
      doc.change((m) => {
        m.center = [c.lng, c.lat]
        m.zoom = z
      })
    })
    const stop = doc.subscribe((d) => {
      const c = map.getCenter()
      if (near(d.center[0], c.lng) && near(d.center[1], c.lat) && near(d.zoom, map.getZoom())) return
      map.jumpTo({ center: d.center, zoom: d.zoom })
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el)

    board.put("map", map)

    return () => {
      stop()
      ro.disconnect()
      map.remove()
      el.remove()
    }
  },
} satisfies Card
