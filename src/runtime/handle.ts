import { createEffect, createRoot, createSignal } from "solid-js"
import type { Handle } from "./types"

export class NotFound extends Error {
  constructor(readonly path: string[]) {
    super(`nothing at ${path.join("/")}`)
    this.name = "NotFound"
  }
}

/** Something that looks like an automerge-repo DocHandle. */
export interface DocHandleLike<T> {
  doc(): T | undefined
  change(fn: (doc: T) => void): void
  on(event: "change", fn: () => void): unknown
  off(event: "change", fn: () => void): unknown
}

/** A handle over a mutable value. `change` mutates in place and notifies. */
export function wrap<T>(initial: T): Handle<T> {
  const [version, setVersion] = createSignal(0)
  let value = initial
  return {
    get value() {
      version()
      return value
    },
    change(fn) {
      fn(value)
      setVersion((v) => v + 1)
    },
    subscribe(fn) {
      return createRoot((dispose) => {
        createEffect(() => {
          version()
          fn(value)
        })
        return dispose
      })
    },
  }
}

/** A handle over an automerge document. */
export function fromDoc<T>(handle: DocHandleLike<T>): Handle<T> {
  const [version, setVersion] = createSignal(0)
  handle.on("change", () => setVersion((v) => v + 1))
  return {
    get value() {
      version()
      const doc = handle.doc()
      if (doc === undefined) throw new NotFound([])
      return doc
    },
    change(fn) {
      handle.change(fn)
    },
    subscribe(fn) {
      return subscribeTo(this, fn)
    },
  }
}

/** A handle into a field of another handle. Writes go through `source.change`. */
export function field<T>(source: Handle<unknown>, path: string[]): Handle<T> {
  return {
    get value() {
      return walk(source.value, path) as T
    },
    change(fn) {
      source.change((root) => fn(walk(root, path) as T))
    },
    subscribe(fn) {
      return subscribeTo(this, fn)
    },
  }
}

/** A read-only view of another handle, unless `write` is given. */
export function derive<A, B>(source: Handle<A>, fn: (a: A) => B, write?: (b: B) => void): Handle<B> {
  return {
    get value() {
      return fn(source.value)
    },
    change(edit) {
      if (!write) throw new Error("derived handle is read-only")
      const b = fn(source.value)
      edit(b)
      write(b)
    },
    subscribe(sub) {
      return subscribeTo(this, sub)
    },
  }
}

/** subscribe() for a handle whose `value` getter reads Solid signals. */
export function subscribeTo<T>(handle: { readonly value: T }, fn: (value: T) => void): () => void {
  return createRoot((dispose) => {
    createEffect(() => {
      let v: T
      try {
        v = handle.value
      } catch (e) {
        if (e instanceof NotFound) return
        throw e
      }
      fn(v)
    })
    return dispose
  })
}

function walk(value: unknown, path: string[]): unknown {
  let cur = value
  for (const name of path) {
    if (cur === null || typeof cur !== "object" || !(name in cur)) throw new NotFound(path)
    cur = (cur as Record<string, unknown>)[name]
  }
  return cur
}
