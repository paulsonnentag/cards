export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** Deep-copies a plain value. Used to turn frozen document values into editable stickers. */
export function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(clone) as T
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = clone(v)
  return out as T
}

export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
