# cards

An experimental programming environment. Two goals: every effect should be
inspectable — you can always see what is acting on what, and who put it
there — and systems should grow by adding things, not by editing them. The
metaphor is a table with playing cards on it.

There are three concepts.

**card** — a process you play. A card is a module with a face (a title, an
icon, a sentence) and a `play` function. While it lies face-up on a board it
has an effect there; flip it or take it off and the effect is gone.

**board** — a space you play cards on. A board is a flat table of named,
live values. Cards read from it and write to it. A board can be forked: the
child sees everything the parent has, can cover or hide things for itself,
and can add things the parent never sees.

**view** — a way of looking at a board. The *board view* shows the cards
lying on it. The *table view* shows the rows: every value, and who put it
there. The *DOM view* shows what the cards rendered. A board is shown as the
three shuffled into one pile; you can fan them out, or pick one and slide
the others behind it.

## How it works

### Boards and forks

A board is a table of rows. A row is an address, a value, and a note of who
put it there. `createBoard()` gives you the first board; `fork()` gives you
another with the same rows and an empty layer of its own.

What you put in your layer, you and your forks see; the board you forked
from does not, nor do its other forks. What you did not put, you read from
the board you came from, live: if it changes there, it changes for you. You
can `hide` a name: it reads as nothing for you and everything below, even
though the parent still has it. You can never look up — a board has no
address for its parent, only a parent to ask.

This is what makes a board the thing you hand to a card. Fork, put what the
card should see, hide what it shouldn't, play the card on it. The card can't
tell whether `document` was put just for it or inherited from the page, and
it can't reach anything you didn't give it.

The boards forked from one root are a *hierarchy*. Names are scoped by the
fork chain, as above. Documents are not: a hierarchy has one *shared
environment* where everything stuck onto a document lives, seen by every
board in the hierarchy that reaches the document (see Addresses). A second
`createBoard()` is a second hierarchy and shares nothing.

### Addresses

An address is a key or a URL, then a walk.

```
selection                             a key
document/shapes/map/pointer           a key, then names walked into the value there
automerge:wb…/shapes/map/pointer      a URL, then a walk — means the same thing from every board
```

Walking: a string value with a scheme is a *link* and is followed; an object
is stepped into by key; a row at the exact address covers the field there. A
key that isn't there is a miss, like a name that isn't there.

**An address is cut at the first link it crosses.** `document/shapes/map/
pointer`, where `document` holds `automerge:wb…`, is
`automerge:wb…/shapes/map/pointer`. This canonical form is what a cell
reports as `at` and what the table shows, and it decides which of two kinds
of row an address names:

- **Key-rooted** — the walk crosses no link. The row lives in a board's
  layer and is scoped by the fork chain: `selection`, `dom`, `document`,
  `search/queries`.
- **URL-rooted** — the walk crosses a link, or starts at a URL. The row
  lives in the hierarchy's shared environment. Every board in the hierarchy
  that reaches the document sees it, through whichever name it reaches it
  by. `foo/bar/baz` and `lol/baz` read the same row when both `foo/bar` and
  `lol` hold `automerge:a…`, and so does a child's `document/baz`.

Which kind a write makes depends on the path, not the value. `put
("document", "automerge:map…")` crosses nothing and is a key-rooted row on
the board that put it; `put("document/pointer", p)` on that board crosses
the link and is shared. How a board came by its document — a URL string
from its parent, a cell into a field of the parent's document — makes no
difference to where its stickers land.

A row past a link sticks to the document, not the name. Point `document`
somewhere else and the row is not where `document/pointer` now leads.

### Reading

```ts
board.get<T>(at, fallback?)     // the top of the stack at `at`, live
board.layers<T>(at)             // the whole stack, top first
board.keys(at?)                 // the names a reader sees at `at`: fields, plus rows below, minus cuts
```

Every address has a *stack*. `get` returns its top. At a key-rooted address,
top to bottom:

1. this board's rows at the address, latest on top — a cut here ends the walk
2. the parent's stack at the same address, and so on up
3. the value the address walks into, when the row is at a prefix of it
4. fallbacks: this board's, then the parent's — below everything, outside cuts

At a URL-rooted address: the shared rows, latest on top — a cut ends the
walk — then the document's field, then the shared fallbacks.

What `get` returns is a **cell**: a live grip on whatever is on top. A cell
re-resolves whenever any layer at its address changes — a row put or peeled
above it, the parent re-stickering, a link retargeted, a document finishing
loading — and its subscribers hear the new top. While nothing is there,
`value` throws `NotFound` and subscribers stay quiet. You never read a stale
value.

Stickers cover; they never merge. But nothing underneath is lost:

```ts
board.get<string>("document/content").value           // the Translate card's sticker
board.get<string>("document/content").under?.value    // the original text beneath it, live
board.layers("document/content").value                // [{ sticker, by Translate }, { data }]
```

`keys` is how you discover stickers on data: `keys("document/shapes/map")`
lists the shape's fields *and* `pointer`, if something stuck a pointer on
it. A node that has rows below it but no value of its own — `editor/
extensions` when the rows are `editor/extensions/mentions` and `editor/
extensions/stickers` — is listed by `keys` and throws `NotFound` on `value`.

### Writing: two verbs

There is a difference between changing a thing and laying something over
it, and the API keeps them apart.

```ts
board.put(at, value)       // layer: a sticker on top of whatever is at `at`
cell.change(fn)            // change: edit what is on top, in place, wherever it lives
board.hide(at)             // cut: `at` reads as nothing here and below
```

**`put`** lays a row. It lands in this board's layer if the address is
key-rooted, in the shared environment if it is URL-rooted. It is attributed
to the card that made it and peeled when that card stops. A card putting
twice at one canonical address replaces its own row; two cards at one
address stack, latest on top. `put` is the only verb that creates a row.

**`change`** edits the thing on top of the stack in place: a document
through `doc.change`, a record sticker by mutation. It goes *through* — a
child changing an inherited record changes the parent's row, and every
reader sees it. It is not attributed to a layer and not peeled: it is a real
edit and it stays. It never creates: `change` on nothing throws `NotFound`.
Since a primitive can't be edited in place, another card's `put("scale",
1)` can only be covered, never changed — shared state that several cards
write should be a record or a document field.

**`hide`** cuts. A cut at a key-rooted address is for this board and below;
at a URL-rooted address it is shared, like a sticker there. A cut never
heals — put over it if you want something back.

Rule of thumb: *to share, address through the document; to scope, address by
key.* A card that wants everyone in the hierarchy to see its annotation puts
it on `document/…`. A card that wants a private view for its board and below
puts a key — `content` rather than `document/content`.

### Fallbacks

`get("selection", {})` when nothing anywhere is at `selection` lays a
*fallback* row in the reader's board: a value to read when nobody has said
otherwise. Fallbacks sit at the bottom of the stack, below data and below
anything a parent puts later, so they never shadow a definition that
arrives after them:

```ts
// Markers, on the map board, before anyone has defined selection
const selection = board.get<Record<string, true>>("selection", {})   // a fallback row on the map board
pin.onclick = () => selection.change((s) => { s[url] = true })      // edits the fallback

// later the whiteboard puts selection: the cell flips to it; subscribers hear it;
// the map's fallback is still there in layers(), covered
```

Order stops mattering for reads. The fallback's contents don't migrate up at
the flip; a writer that must survive it writes as an effect of the cell
rather than once. Declaring shared rows in the board document (see Board
documents) makes them exist from the first frame, so in practice the flip
doesn't happen.

### Attribution and retraction

Every row carries the board whose layer it is in and the card that put it.
The table shows both. When a card stops — flipped, removed, or its board
closed — its rows are peeled, from its layer and from the shared
environment. When a board closes, innermost first: its cards stop, its forks
close, its layer is dropped, its `signal` aborts. Cleanup that isn't a row —
DOM, a maplibre instance, timers — hangs off the signal or the card's
teardown. Cells elsewhere that pointed at anything that vanished re-resolve;
nobody holds a stale grip on a closed board.

`change`s are not retracted. If the map card wrote `d.center` into its
document, that stays; a shape re-added under the same id starts with the
last saved center and no stickers.

Two instances of one card on one document stack two rows at the same shared
address; the top wins and `layers` shows both. Items that are fields of
their parent's document get distinct addresses by construction; the
collision only arises when two placements link to the same separate
document.

### Shared state, three ways

Because stickers cover rather than merge, state that several cards touch
takes one of three shapes:

- **One owner, edited from below.** A record put by the board that should
  see it — `selection`, `search/queries` — and `change`d by every board
  beneath. Scoping is opt-in by covering: a map that wants selection of its
  own puts `selection` on itself and its shapes edit that one. *Shared by
  default, scoped by putting your own.*
- **One row per contributor.** Contributors put under a common prefix —
  `editor/extensions/mentions`, `editor/extensions/stickers` — and readers
  `keys` the prefix. Each row is attributed and peeled on its own, so
  retraction and provenance are free. This is the right shape whenever
  contributions are independent.
- **A record keyed by contributor.** When a reader wants one value, the
  owner puts `highlight: {}` and each contributor `change`s its own key and
  deletes it in its teardown. Retraction is by convention.

### Stickering into a document

Deep addresses make ninepatch's surfaces work without any extra machinery.
A surface is a record with a `pointer` and a `scale` stuck on it:

```ts
// Whiteboard card, on the whiteboard board: the record is the surface
board.put("document/pointer", board.get("pointer"))      // → automerge:wb…/pointer, shared
board.put("document/scale", 1)

// Map card, on the map board, whose `document` is automerge:wb…/shapes/map
const outer = board.get<LocalPointer>("surface/pointer")           // the surface it sits on
board.put("document/pointer", derive(outer, toMapUnits))           // → automerge:wb…/shapes/map/pointer, shared
board.put("document/scale", derive(zoom, (k) => k * outerScale.value))

// Pen card, on the whiteboard board, walking down
board.keys("document/shapes/map").value                             // […fields, "pointer", "scale"]: a surface
board.get<LocalPointer>("document/shapes/map/pointer").value        // already in map units
```

Two maps are two ids, two records, two `pointer` rows. Remove a map and its
rows peel; the document's real fields were never touched.

### Cards

A card is a module. Its default export plays it; its named exports are its
face:

```ts
export const title = "Place finder"
export const icon = "map-pin"
export const description = "Answers searches on this board with places from OpenStreetMap."

export default function play(board: Hand) {
  …
  return () => { … }        // optional: rows are peeled for you
}
```

`board.play(url, id)` imports the module and calls its default export with
a *hand*: the board it was played on, plus `card`, a cell to its own
placement in the board document. The hand shares the board's rows — what
the card puts, everything on the board and below sees — but tags every
`put` and `hide` with the card, and closes with it. The card's teardown, if
it returns one, runs when it stops; anything it put is peeled regardless. A
card that only puts needs no teardown.

Cards are rendered as playing cards: rounded corners, a title, mirrored
corner pips, a main section that is usually empty, and a text section at
the bottom that says what the card is doing, present tense, card as
subject. The design — icon, colour, sentence — lives in the module; the
document holds only what differs per placement. A card that does its work
elsewhere shows a calm face, not a control panel; the table view is where
you look to see what it is doing.

### Board documents

What persists is a board document: which cards lie on it, which child
boards are placed on it, and which rows to lay when it opens.

```ts
type BoardDoc = {
  cards: Record<Id, Placement>          // the cards on it, where they lie, face up or down, their settings
  boards: Record<Id, Placed>            // child board documents, and where they are placed
  stickers: Record<string, Json>        // rows to put when the board opens: `document: "automerge:…"`, `selection: {}`
}
```

`board.open(url)` deals the document onto the board: it puts `board` → the
URL, puts every entry of `stickers` as a row (attributed to the board
itself), plays every face-up card with its id, and follows the document
from then on — a card flipped up plays, flipped down stops, a sticker
edited is re-put. Rows put from `stickers` are how a board declares the
shared records its cards edit, so they exist before any card asks.

A child board placed in `boards` is inert data until a card gives it a
place: a renderer forks, puts `dom`, and opens it. The shell shows unplaced
child boards as stacks in the board view, and lets you pick one up to look
at it.

The runtime is a hierarchy of boards; the documents are its description.
Everything a card puts is runtime and gone on reload; everything a card
`change`s into a document is kept.

### Views

A view is a way of drawing a board, and the shell has three:

- **board** — the cards where they lie, face up or down, and child boards
  as stacks. Drag to move, click to flip, drop to add. Edits the board
  document.
- **table** — `board.rows()`: address, value, scope, whose layer, which
  card, and whether something above it wins. Shared rows are grouped by
  document, with the name this board reaches them by.
- **DOM** — the board's `dom` row: whatever the cards rendered into it.

The shell shows the three shuffled together. Fan them out to see all three;
pick one to bring it to the front and slide the others behind — a map view
with the cards visible behind it, or a board of cards with the view it
produces behind that. Which is on top is the key-rooted row `view` on the
board, so it shows in the table and a card could set it.

Every board that is open — including a child board a renderer placed on a
canvas — can be un-shuffled in place. The shell finds them through
`children`.

## Interface

```ts
// ---- addresses ---------------------------------------------------------------

type Address = string | string[]              // "a/b" or ["a", "b"]; a first name with a scheme is a URL

// ---- handles and cells -------------------------------------------------------

type Handle<T> = {                            // ninepatch's, less `set`: a Svelte store, so Solid's from() takes it
  readonly value: T                           // throws NotFound while nothing is there
  change(fn: (value: T) => void): void        // edit in place; on a link, edit the document it names
  subscribe(fn: (value: T) => void): () => void   // now if there is a value, and after every change
}

type Cell<T> = Handle<T> & {                  // what get() returns: a handle that knows where it points
  readonly at: readonly string[]              // canonical: past a link, the URL and the rest
  readonly under: Cell<T> | undefined         // the next layer down, live
  readonly ready: Promise<Cell<T>>            // resolves at the first value; rejects NotFound once nothing can arrive
}

type Layer<T = unknown> = {
  handle: Handle<T>                           // change on a lower layer edits that layer
  kind: "sticker" | "fallback" | "data"
  board: string
  card?: string                               // undefined: the board itself put it
}

type Row = {                                  // one sticker, as the table draws it
  at: string                                  // canonical address
  via?: string                                // for a shared row: how this board reaches it, if it does
  scope: "board" | "shared"
  board: string
  card?: string
  kind: "sticker" | "fallback" | "cut"
  value: unknown
  covered: boolean                            // something above it is what a reader gets
}

// ---- boards ------------------------------------------------------------------

type Board = {
  readonly name: string
  readonly signal: AbortSignal                // aborts on close
  readonly children: Handle<Board[]>          // forked from here and still open

  get<T>(at: Address, fallback?: T): Cell<T>
  layers<T>(at: Address): Handle<Layer<T>[]>
  keys(at?: Address): Handle<string[]>

  put(at: Address, value: unknown): void      // idempotent per card and canonical address
  hide(at: Address): void

  fork(name?: string): Board
  play(url: string, id?: string): Played      // run a card here; `id` names its placement in `board/cards`
  open(url: string): void                     // deal a board document onto this board and follow it
  rows(): Handle<Row[]>                       // own and inherited, plus the shared rows, for the table
  close(): void
}

type Hand = Board & {
  readonly card: Cell<Placement>              // this card's placement in the board document; NotFound if played without an id
}

// ---- cards -------------------------------------------------------------------

type CardModule = {
  default: (board: Hand) => Teardown | void | Promise<Teardown | void>
  title: string
  icon?: string
  description: string
}
type Teardown = () => void

type Played = {
  readonly url: string
  readonly id?: string
  readonly board: Hand
  readonly done: Promise<void>                // the teardown has run, or the card threw
  stop(): void
}

// ---- board documents ---------------------------------------------------------

type BoardDoc = {
  cards: Record<Id, Placement>
  boards: Record<Id, Placed>
  stickers: Record<string, Json>
}
type Placement = {
  url: string                                 // the card module
  x: number
  y: number
  faceUp: boolean
  settings?: Record<string, Json>             // what differs per placement; nothing else
}
type Placed = { url: string; x: number; y: number; w?: number; h?: number }

// ---- views -------------------------------------------------------------------

type View = { title: string; render(board: Board, into: HTMLElement): Teardown }
declare const boardView: View
declare const tableView: View
declare const domView: View

// ---- the root and the helpers ------------------------------------------------

function createBoard(options: {
  repo: Repo                                  // answers automerge: URLs, whole documents at a time
  import?(url: string): Promise<CardModule>   // how play loads a card; the platform's import() by default
}): Board

class NotFound extends Error { readonly at: string[] }

function fromDoc<T>(doc: DocHandle<T>): Handle<T>
function field<T>(source: Handle<unknown>, path: string[]): Handle<T>                        // writes through source.change
function derive<A, B>(source: Handle<A>, fn: (a: A) => B, write?: (b: B) => void): Handle<B>  // read-only unless `write`
function wrap<T>(value: T): Handle<T>
```

`Handle`, `fromDoc`, `field`, `derive`, `wrap` and `NotFound` are
ninepatch's, with `set` removed. A handle obtained from `get` carries its
canonical address; a hand-made one (`wrap`, `derive`) does not, so an
address walked through it stops at its value and a `put` through it is
key-rooted.

## Rules

1. **An address is cut at the first link.** The rest is re-rooted at the
   URL. A key-rooted row is in a board's layer, scoped by the fork chain; a
   URL-rooted row is in the hierarchy's shared environment, seen by every
   board that reaches the document. Which kind a `put` makes is decided by
   the path it walks, never by the value.
2. **Reads take the top of the stack.** Own rows, then inherited, then the
   data, then fallbacks; a cut ends the walk above the data. `layers` sees
   every layer; `under` is the next one down.
3. **`put` covers.** A sticker is a whole value on top; it never merges with
   what is beneath. A card re-putting at one canonical address replaces its
   own row; different cards stack, latest on top.
4. **`change` goes through, and stays.** It edits what is on top, in place —
   the parent's record, the document — and is never peeled. It never
   creates: on nothing it throws.
5. **`hide` cuts, never restores.** For this board and below at a key-rooted
   address; for the hierarchy at a URL-rooted one. A later `put` over the
   cut is allowed.
6. **Fallbacks sit at the bottom.** Below data, below anything put later,
   outside cuts. They make the order in which boards define things
   irrelevant to what a reader sees.
7. **Every row is attributed.** To the board whose layer it is in and the
   card that put it. Stopping a card peels its rows wherever they landed.
   Closing a board stops its cards, closes its forks, drops its layer, and
   aborts its `signal`, innermost first.
8. **Live means live.** A cell re-resolves on any change at its address and
   tells its subscribers. If nothing is there, `value` throws `NotFound` and
   subscribers stay quiet until something is. No stale value is ever
   delivered.
9. **`keys` is what a reader sees.** Fields of the value, plus rows below the
   address, minus cuts — the set `get` would succeed on. It never reveals a
   cut. `rows` is the raw table.
10. **A card shares its board.** `play` calls the module with a hand that
    has the board's rows — the same table, not a copy — tagged with the
    card and closed with it. A card's effects are seen by the board it lies
    on and everything below, and by the whole hierarchy through the
    documents it puts on.
11. **Documents load once per hierarchy.** A URL read from any board lands
    on the same fill in the shared environment. The repo answers misses;
    if it can't, the cell rejects with `NotFound`.
12. **The document describes; the runtime is.** `open` follows the board
    document and keeps the board in step with it. Nothing a card puts is
    written back; only `change` reaches a document.

## The example

A whiteboard with a map and a markdown document on it. Typing `@Paris` in
the document opens a menu of places; picking one inserts a mention, and a
pin appears on the map.

### The boards

```
root                              dom: the page   repo: the automerge repo
└─ whiteboard          [BoardDoc]
   stickers: selection: {}   search/queries: {}
   cards:
     Whiteboard    lays the child boards out on a canvas; drag, select
     Mentions      puts editor/extensions/mentions: the @-menu, driven over search/queries and search/results/*
     PlaceFinder   answers search/queries with places, into search/results/nominatim
     Locations     follows every URL reachable from the board document; puts locations
   boards:
     map           [BoardDoc]  stickers: document → MapDoc { center, zoom }
        cards:
          Map          maplibre into dom; center/zoom ↔ document; puts map
          Markers      a pin per entry of locations; click → selection
     notes         [BoardDoc]  stickers: document → MarkdownDoc { content }
        cards:
          Markdown     codemirror into dom on document/content; installs keys("editor/extensions")
```

`map` and `notes` are forks of `whiteboard`, so `selection`, `search/*`,
`editor/extensions/*` and `locations` are inherited. `dom` and `document`
are put on each child — `dom` by the Whiteboard card, `document` from the
child's own board document — and cover the whiteboard's.

### The whiteboard's table

| address | scope | board | card | how it is written |
|---|---|---|---|---|
| `dom` | board | root | — | put by the shell |
| `repo` | board | root | — | put by the shell |
| `board` | board | whiteboard | — | put by `open`: a link to the board document |
| `selection` | board | whiteboard | — | from `stickers`; `change`d by Markers, Whiteboard, the mention extension |
| `search/queries` | board | whiteboard | — | from `stickers`; `change`d by the mention extension |
| `search/results/nominatim` | board | whiteboard | PlaceFinder | `put`, replaced on every answer; one row per finder |
| `editor/extensions/mentions` | board | whiteboard | Mentions | `put` once |
| `locations` | board | whiteboard | Locations | `put`, replaced on every change |

The map board's table shows its own `board`, `document`, `dom`, `map` on
top of the same inherited rows, `locations` marked inherited. Every row
says who wrote it; removing a card takes its rows with it and the table
shows what is left.

### The flow of `@Paris`

1. The user types `@Par` in `notes`. The mention extension — installed by
   `Markdown` from `editor/extensions/*` — does `get("search/queries")
   .change(q => { clear(q); q["Par"] = true })`. The row is the
   whiteboard's; the change goes through to it.
2. `PlaceFinder` on the whiteboard is subscribed to `search/queries`. It
   debounces, asks Nominatim, and `put("search/results/nominatim", { Par:
   [...] })`.
3. The extension watches `keys("search/results")` and reads every finder's
   row; it renders the menu from their `["Par"]` entries — inline `{ title,
   lat, lng }`, nothing minted yet.
4. Pick: the extension creates a `PlaceDoc { title, lat, lng }` through
   `repo`, replaces `@Par` with `{automerge:place…}` in `content`, and
   clears its query.
5. `Locations` follows every URL reachable from the whiteboard's board
   document — `boards.notes` → its `stickers.document` → `content`, where
   the token is found by regex — opens the place document, sees `{ lat,
   lng }`, and re-puts `locations` with it.
6. `Markers` on the map board sees the new `locations` row and drops a pin.
7. Click the pin: `get("selection").change(s => { clear(s); s[place] =
   true })` goes through to the whiteboard's row. The editor rings the
   token, the whiteboard highlights the notes item, the map flies to the
   pin, the table shows the row change.

Take `PlaceFinder` off the board and step 2 stops: the menu says
"Searching…", `search/results/nominatim` leaves the table. Take `Mentions`
off and the editor loses the `@` menu. Take `Locations` off and the pins
go. Put a second finder on and it puts `search/results/photon` next to
PlaceFinder's row — one row per contributor — and the extension picks it up
through `keys("search/results")`, neither finder knowing about the other.

### The cards, sketched

```tsx
// whiteboard.tsx — lays out the child boards, and owns their lifetimes
export default async function play(board: Hand) {
  const dom = await board.get<HTMLElement>("dom").ready
  const doc = await board.get<BoardDoc>("board").ready
  const selection = board.get<Record<string, true>>("selection")
  return render(() => {
    const state = from(doc, doc.value)
    return (
      <For each={Object.keys(state().boards)}>
        {(id) => {
          const el = (<div class="item" style={positionOf(state().boards[id])} onPointerDown={(e) => drag(e, id)} />) as HTMLElement
          const child = board.fork(id)
          child.put("dom", el)
          child.open(state().boards[id].url)
          onCleanup(() => child.close())
          return el
        }}
      </For>
    )
  }, dom.value)
}
```

```ts
// mentions.ts — one row, peeled for us when the card stops
export default function play(board: Hand) {
  board.put("editor/extensions/mentions", mentionSearch(board))
}

// inside mentionSearch(board): the extension every editor on the board installs
const queries = board.get<Record<string, true>>("search/queries")
const finders = board.keys("search/results")                       // one row per finder
const repo = board.get<Repo>("repo")
// caret after "@…": queries.change((q) => { clear(q); q[text] = true })
// menu rows: finders.value.flatMap((n) => board.get<Record<string, Place[]>>(`search/results/${n}`).value[text] ?? [])
// pick: const url = repo.value.create(place).url; insert `{${url}}`; queries.change(clear)
```

```ts
// place-finder.ts — reads the queries, answers with places
export default function play(board: Hand) {
  const queries = board.get<Record<string, true>>("search/queries")
  return queries.subscribe(
    debounced(async (q) => {
      const answers: Record<string, Place[]> = {}
      for (const text of Object.keys(q)) answers[text] = await nominatim(text)
      board.put("search/results/nominatim", answers)        // replaces this card's row
    })
  )
}
```

```ts
// locations.ts — every place the board document can reach, by URL
export default function play(board: Hand) {
  const root = board.get<BoardDoc>("board")
  const watched = new Map<string, Cell<unknown>>()
  const rebuild = () => {
    const reachable = closure(root.value, (url) => watched.get(url)?.value)   // URLs in fields and in text
    …open new ones with board.get(url), drop old ones…
    const found: Record<string, Location> = {}
    for (const [url, cell] of watched) if (isLocation(cell.value)) found[url] = cell.value
    board.put("locations", found)
  }
  return root.subscribe(rebuild)
}
```

```ts
// map.ts — the map, and the live instance for cards on this board
export default async function play(board: Hand) {
  const dom = await board.get<HTMLElement>("dom").ready
  const doc = await board.get<MapDoc>("document").ready
  const map = new LibreMap({ container: dom.value, center: doc.value.center, zoom: doc.value.zoom })
  map.on("moveend", () => doc.change((d) => { d.center = map.getCenter(); d.zoom = map.getZoom() }))
  board.put("map", map)
  return () => map.remove()
}
```

```ts
// markers.ts — a pin per location; selection goes through to the whiteboard
export default async function play(board: Hand) {
  const map = await board.get<LibreMap>("map").ready
  const locations = board.get<Record<string, Location>>("locations", {})
  const selection = board.get<Record<string, true>>("selection", {})
  const pins = new Map<string, Marker>()
  const stop = locations.subscribe((all) => {
    …one Marker per url, removed when gone…
    pin.onclick = () => selection.change((s) => { clear(s); s[url] = true })
  })
  return () => { stop(); for (const p of pins.values()) p.remove() }
}
```

```ts
// markdown.ts — the editor, with whatever extensions the board offers
export default async function play(board: Hand) {
  const dom = await board.get<HTMLElement>("dom").ready
  const doc = await board.get<MarkdownDoc>("document").ready
  const names = board.keys("editor/extensions")
  const extensions = new Compartment()
  const view = new EditorView({ parent: dom.value, extensions: [automerge(doc, ["content"]), extensions.of([])] })
  const stop = names.subscribe((ns) =>
    view.dispatch({ effects: extensions.reconfigure(ns.map((n) => board.get<Extension>(`editor/extensions/${n}`).value)) })
  )
  return () => { stop(); view.destroy() }
}
```

### The shell

```ts
const root = createBoard({ repo })
root.put("dom", page)
root.put("repo", repo)

const whiteboard = root.fork("whiteboard")
whiteboard.put("dom", stage)            // the DOM view's element
whiteboard.open(seed.whiteboard)        // puts `board`, lays `selection` and `search/queries`, plays the cards
show(whiteboard)                        // the three views, shuffled
```

## Accepted trade-offs

- A URL-shaped string is a link and is followed. Store one as data inside
  an object, or read it off the parent.
- Putting through a document is public to the hierarchy: a sticker or cut
  on `document/content` covers it for every board that reaches the
  document. Address by key when you mean something private.
- Two placements of one document collide at shared addresses; the top wins,
  `layers` shows both.
- Stickers never merge. Several contributors to one thing are a row each
  under a prefix, or a record edited by convention.
- `change` is not retracted. State edited by a card that is later removed
  stays edited.
- A primitive put by another card can only be covered, not changed.
- A node with rows below and no value of its own throws on `value`. Use
  `keys`.
- A fallback's contents do not migrate when a definition arrives above it.
- Whoever holds the root sees every board through `children` and can close
  any of them. The defence is not handing out the root.
- Cards are modules the platform's `import()` can load. Running a card
  stored in a document needs a loader — `createBoard`'s `import` option.

## Deferred

- **Isolation.** A board that starts a new shared environment while still
  inheriting keys. Today the only isolation is a second `createBoard()`.
- **Servers for other schemes.** Only `automerge:` is answered, by the repo.
- **Union reads.** A `get` that composes rows below an address into one
  value, so `editor/extensions` could be read as a record. `keys` covers it.
- **Binds.** A board as a value you can put, so a walk continues inside it.
  Deep addresses into documents replaced what ninepatch used them for.
- **Garbage collection of shared rows** that no board reaches any more.
- **Read-only cells**, and cells that carry the address of a hand-made
  handle.
- **A process table.** `children` says what is open; nothing says which
  card put a row without reading the table.
- **Provenance for `change`.** The table can show who last edited a row;
  nothing records the history.
