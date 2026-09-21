/** Document shapes used by the demo. */

export interface MapDoc {
  center: [number, number] // [lng, lat]
  zoom: number
}

export interface MarkdownDoc {
  content: string
}

export interface PlaceDoc {
  title: string
  lat: number
  lng: number
}

export interface Location {
  title: string
  lat: number
  lng: number
}

export interface Place {
  title: string
  lat: number
  lng: number
}

export function isLocation(v: unknown): v is Location {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as Location).lat === "number" &&
    typeof (v as Location).lng === "number"
  )
}

export function clear(record: Record<string, unknown>) {
  for (const k of Object.keys(record)) delete record[k]
}
