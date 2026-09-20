# Cards

Cards is an experimental programming environment. It has two goals:

- Every effect is inspectable. You can always see what acts on what, and
  who put it there.
- Systems grow by adding things, not by editing them.

The metaphor is a table with playing cards on it.

## Concepts

Cards has three concepts: cards, boards, and views.

A **card** is a process that you play. A card is a module with a face (a
title, an icon, and a sentence) and a `play` function. While a card lies
face up on a board, it has an effect on that board. When you flip the card
over or take it off the board, the effect ends.

A **board** is a space that you play cards on. A board is a flat table of
named, live values. Cards read values from a board and write values to it.
You can fork a board. The child board sees everything that the parent board
has. The child can cover or hide values for itself, and it can add values
that the parent never sees.

A **view** is a way of looking at a board. The *board view* shows the cards
that lie on the board. The *table view* shows every value on the board and
its attribution. If the board has a `dom` value, the *DOM view* shows what
the cards rendered into it. The shell shows a board's views as one pile. You
can fan them out, or bring one to the front and slide the others behind it.

## Terms

This document uses one name for each concept. The following table defines
the names.

| Term | Meaning |
|---|---|
| sticker | One named value on a board. Every value on a board is a sticker, including the values that a board document declares and the defaults that reads create. |
| address | The name of a sticker: a key or a URL, followed by an optional walk into the value. |
| attribution | The record of who put a sticker: the board that it is on and the card that put it. |
| put | The verb that creates a sticker. |
| change | The verb that edits a value in place. |
| hide | The verb that makes an address read as nothing. |
| peel | To remove a sticker. The runtime peels a card's stickers when the card stops. |
| cell | A live handle to the value at an address. `get` returns a cell. |
| hierarchy | All boards forked from one root. |
| shared environment | The stickers that a hierarchy places on documents. Every board in the hierarchy that reaches the document sees them. |

## How it works

This section describes boards, addresses, the read and write verbs,
defaults, attribution, cards, board documents, and views.

### Boards and forks

A board holds stickers. A sticker is an address, a value, and an
attribution. `createBoard()` creates the first board. `fork()` creates a
child board. The child reads every sticker that its parent has, and it
starts with no stickers of its own.

A sticker that you put on a board is visible to that board and to its
forks. It is not visible to the board that you forked from, or to that
board's other forks. Anything that you didn't put, you read from the parent,
live: when it changes on the parent, it changes for you. You can `hide` a
name. The name then reads as nothing on your board and on every board below
it, while the parent still has it. A board can't look up: it has no address
for its parent, only a parent to ask.

This is what makes a board the thing that you hand to a card. Fork a board,
put what the card should see, hide what it shouldn't see, and play the card
on the fork. The card can't distinguish a `document` that was put for it
from one that was inherited from the page, and it can't reach anything that
you didn't give it.

The boards forked from one root form a *hierarchy*. Keys are scoped by the
fork chain, as described above. Documents are not scoped. A hierarchy has
one *shared environment* that holds every sticker placed on a document.
Every board in the hierarchy that reaches the document sees those stickers.
For details, see [Addresses](#addresses). A second `createBoard()` call
creates a second hierarchy that shares nothing with the first.

### Addresses

An address is a key or a URL, followed by a walk:

```
selection                             a key
document/shapes/map/pointer           a key, then names walked into the value there
automerge:wb…/shapes/map/pointer      a URL, then a walk; means the same thing from every board
```

The walk follows these rules:

- A string value with a scheme is a *link*, and the walk follows it.
- An object is stepped into by key.
- A sticker at the exact address covers the field there.
- A key that isn't there is a miss, like a name that isn't there.

**An address is cut at the first link that it crosses.** For example, when
`document` holds `automerge:wb…`, the address `document/shapes/map/pointer`
is `automerge:wb…/shapes/map/pointer`. This canonical form is what a cell
reports as `at` and what the table view shows. It also decides which of two
kinds of sticker an address names:

- **Key-rooted.** The walk crosses no link. The sticker is on a board and is
  scoped by the fork chain. Examples: `selection`, `dom`, `document`,
  `search/queries`.
- **URL-rooted.** The walk crosses a link, or the address starts with a URL.
  The sticker is in the hierarchy's shared environment. Every board in the
  hierarchy that reaches the document sees it, through whichever name it
  reaches the document by. `foo/bar/baz` and `lol/baz` read the same sticker
  when both `foo/bar` and `lol` hold `automerge:a…`, and so does a child's
  `document/baz`.

The path decides which kind a write makes, not the value. `put("document",
"automerge:map…")` crosses nothing, so it creates a key-rooted sticker on
the board that put it. `put("document/pointer", p)` on that board crosses
the link, so it creates a shared sticker. How a board came by its document,
whether as a URL string from its parent or as a cell into a field of the
parent's document, makes no difference to where its stickers land.

A sticker past a link sticks to the document, not to the name. If you point
`document` somewhere else, the sticker is not where `document/pointer` now
leads.

### Reading

The read API has three functions:

```ts
board.get<T>(at, default?)      // the top sticker or value at `at`, live
board.stickers<T>(at)           // every sticker at `at`, top first
board.keys(at?)                 // the names a reader sees at `at`: fields, plus stickers below, minus hides
```

The stickers at one address form a stack. `get` returns the top of the
stack. At a key-rooted address, `get` returns the first of the following
that exists:

1. A sticker that this board put at the address, latest first. A hide here
   ends the search.
2. A sticker that the parent put at the address, and so on up the fork
   chain.
3. The value that the address walks into, when a sticker is at a prefix of
   the address.
4. A default: this board's, then the parent's. Defaults sit below everything
   else, and a hide doesn't remove them.

At a URL-rooted address, `get` returns the first of the following that
exists: the shared stickers, latest first, where a hide ends the search;
then the document's field; then the shared defaults.

`get` returns a **cell**: a live handle to whatever is on top. A cell
re-resolves whenever anything in the stack at its address changes. For
example, a cell re-resolves when a sticker is put or peeled above it, when
the parent re-puts, when a link is retargeted, or when a document finishes
loading. The cell's subscribers hear the new top. While nothing is at the
address, `value` throws `NotFound` and subscribers stay quiet. You never
read a stale value.

Stickers cover; they never merge. Nothing underneath is lost. You can read
each sticker at an address on its own:

```ts
board.get<string>("document/content").value            // the Translate card's sticker
board.get<string>("document/content").under?.value     // the original text beneath it, live
board.stickers("document/content").value               // [{ kind: "put", card: "Translate", handle, … }]
```

`stickers(at)` lists the stickers at an address, top first. Each entry has
its attribution and a handle to its own value. The value that the address
walks into is not a sticker; the bottom sticker's `under` reaches it.

`keys` is how you discover stickers on data. `keys("document/shapes/map")`
lists the shape's fields *and* `pointer`, if something put a pointer on the
shape. A node that has stickers below it but no value of its own is listed
by `keys` and throws `NotFound` on `value`. For example, `editor/extensions`
is such a node when the stickers are `editor/extensions/mentions` and
`editor/extensions/stickers`.

### Writing

Changing a thing and laying something over it are different operations,
and the API keeps them apart:

```ts
board.put(at, value)       // cover: a sticker on top of whatever is at `at`
cell.change(fn)            // change: edit what is on top, in place, wherever it lives
board.hide(at)             // hide: `at` reads as nothing here and below
```

**`put`** creates a sticker. The sticker goes on this board if the address
is key-rooted, and into the shared environment if the address is
URL-rooted. The sticker is attributed to the card that made it, and it is
peeled when that card stops. A card that puts twice at one canonical address
replaces its own sticker. Two cards that put at one address stack, latest on
top. `put` is the only verb that creates a sticker.

**`change`** edits the thing on top of the stack in place: a document
through `doc.change`, or a record sticker by mutation. It goes *through*.
When a child changes an inherited record, it changes the parent's sticker,
and every reader sees the change. A change has no attribution and is not
peeled. It is a real edit, and it stays. `change` never creates a value:
`change` on nothing throws `NotFound`. A primitive can't be edited in place,
so another card's `put("scale", 1)` can only be covered, never changed.
Shared state that several cards write should be a record or a document
field.

**`hide`** makes an address read as nothing. A hide at a key-rooted address
applies to this board and the boards below it. A hide at a URL-rooted
address is shared, like a sticker there. A hide never heals. To get
something back, put over it.

Rule of thumb: *to share, address through the document; to scope, address by
key.* A card that wants everyone in the hierarchy to see its annotation puts
it on `document/…`. A card that wants a private value for its board and
below puts a key, for example `content` rather than `document/content`.

### Defaults

`get(at, default)` reads like `get(at)`, with one addition. If nothing is at
`at`, the board puts `default` as a sticker at `at`. The sticker has kind
`default` and is attributed to the calling card. The default is part of the
board's state: it appears in the table view and in `stickers(at)`, and
`change` on the cell edits it.

A default sticker sits at the bottom of the stack. It sits below the value
that the address walks into, and below anything that any board puts later.
A default never covers a definition that arrives after it:

```ts
// Markers, on the map board, before anyone has defined selection
const selection = board.get<Record<string, true>>("selection", {})   // puts a default sticker on the map board
pin.onclick = () => selection.change((s) => { s[url] = true })      // edits the default

// Later, the whiteboard puts selection. The cell flips to it, and subscribers hear it.
// The map's default is still in stickers(), covered.
```

The order in which boards define things stops mattering for reads. The
default's contents don't migrate up when the cell flips. A writer that must
survive the flip writes as an effect of the cell rather than once. In
practice, the flip rarely happens: a board document declares its shared
values in `stickers`, so they exist from the first frame. For details, see
[Board documents](#board-documents).

### Attribution and retraction

Every sticker carries an attribution: the board that it is on and the card
that put it. The table view shows both. When a card stops, whether it is
flipped, removed, or its board is closed, the runtime peels its stickers
from the board and from the shared environment. When a board closes, it
closes innermost first: its cards stop, its forks close, its stickers are
dropped, and its `signal` aborts. Cleanup that isn't a sticker, such as DOM
elements, a maplibre instance, or timers, hangs off the signal or the card's
teardown function. Cells elsewhere that pointed at anything that vanished
re-resolve. Nobody holds a stale handle to a closed board.

Changes are not retracted. If the map card wrote `d.center` into its
document, that write stays. A shape that is re-added under the same ID
starts with the last saved center and no stickers.

Two instances of one card on one document stack two stickers at the same
shared address. The top wins, and `stickers` shows both. Items that are
fields of their parent's document get distinct addresses by construction.
The collision only arises when two placements link to the same separate
document.

### Shared state

Stickers cover rather than merge. State that several cards touch therefore
takes one of three shapes:

- **One owner, edited from below.** The board that should see the value
  puts a record, such as `selection` or `search/queries`, and every board
  beneath it `change`s the record. Scoping is opt-in by covering: a map that
  wants a selection of its own puts `selection` on itself, and its shapes
  edit that one. Shared by default, scoped by putting your own.
- **One sticker per contributor.** Contributors put under a common prefix,
  such as `editor/extensions/mentions` and `editor/extensions/stickers`.
  Readers call `keys` on the prefix. Each sticker has its own attribution
  and is peeled on its own, so retraction and provenance come for free. Use
  this shape whenever contributions are independent.
- **A record keyed by contributor.** When a reader wants one value, the
  owner puts `highlight: {}`. Each contributor `change`s its own key and
  deletes it in its teardown function. Retraction is by convention.

### Stickers on documents

Deep addresses make ninepatch's surfaces work without extra machinery. A
surface is a record with a `pointer` and a `scale` stuck on it:

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

Two maps are two IDs, two records, and two `pointer` stickers. When you
remove a map, its stickers peel. The document's real fields were never
touched.

### Cards

A card is a module. Its default export plays it. Its named exports are its
face:

```ts
export const title = "Place finder"
export const icon = "map-pin"
export const description = "Answers searches on this board with places from OpenStreetMap."

export default function play(board: Hand) {
  …
  return () => { … }        // optional: stickers are peeled for you
}
```

`board.play(url, id)` imports the module and calls its default export with
a *hand*. A hand is the board that the card was played on, plus `card`, a
cell to the card's own placement in the board document. The hand shares the
board's stickers: what the card puts, everything on the board and below
sees. The hand tags every `put` and `hide` with the card, and it closes with
the card. If the card returns a teardown function, the function runs when
the card stops. Anything the card put is peeled regardless. A card that
only puts needs no teardown function.

Cards are rendered as playing cards: rounded corners, a title, mirrored
corner pips, a main section that is usually empty, and a text section at
the bottom that says what the card is doing, in the present tense, with the
card as subject. The design (icon, color, and sentence) lives in the module.
The document holds only what differs per placement. A card that does its
work elsewhere shows a calm face, not a control panel. The table view is
where you look to see what the card is doing.

### Board documents

A board document is what persists: which cards lie on the board, which
child boards are placed on it, and which stickers to put when the board
opens.

```ts
type BoardDoc = {
  cards: Record<Id, Placement>          // the cards on it, where they lie, face up or down, their settings
  boards: Record<Id, Placed>            // child board documents, and where they are placed
  stickers: Record<string, Json>        // stickers to put when the board opens: `document: "automerge:…"`, `selection: {}`
}
```

`board.open(url)` deals the document onto the board. It puts `board` as a
link to the URL, puts every entry of `stickers` as a sticker attributed to
the board itself, and plays every face-up card with its ID. From then on, it
follows the document: a card flipped up plays, a card flipped down stops,
and an edited sticker is re-put. The stickers that a board document
declares are how a board provides the shared records that its cards edit,
so that they exist before any card asks.

A child board placed in `boards` is inert data until a card gives it a
place. A renderer forks, puts `dom`, and opens the child. The shell shows
unplaced child boards as stacks in the board view, and lets you pick one up
to look at it.

The runtime is a hierarchy of boards. The documents are its description.
Everything that a card puts is runtime state and is gone on reload.
Everything that a card `change`s into a document is kept.

### Views

A view is a way of drawing a board. The shell has three views:

- **Board view.** The cards where they lie, face up or face down, and child
  boards as stacks. Drag to move a card, click to flip it, and drop to add
  one. The board view edits the board document.
- **Table view.** `board.stickers()`. For each sticker: its address, value,
  scope, attribution, and whether another sticker covers it. Shared
  stickers are grouped by document, under the name that this board reaches
  them by.
- **DOM view.** The contents of the board's `dom` sticker, which is whatever
  the cards rendered into it.

`dom` is an ordinary sticker. The runtime doesn't treat it specially. A
renderer puts it, cards read it and render into it, and the shell displays
its contents. Only a board that has a `dom` sticker has a DOM view. A board
without one, for example a board whose cards only compute, has a board view
and a table view.

The shell shows a board's views shuffled into one pile. You can fan them out
to see all of them, or pick one to bring it to the front and slide the
others behind it: a map with the cards visible behind it, or a board of
cards with the view that it produces behind that. Which view is on top is
the key-rooted sticker `view` on the board. It shows in the table view, and
a card could set it.

Every open board can be fanned out in place, including a child board that a
renderer placed on a canvas. The shell finds open boards through `children`.

## API reference

The following declarations describe the API.

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
  readonly under: Cell<T> | undefined         // the next sticker down, then the value the address walks into; live
  readonly ready: Promise<Cell<T>>            // resolves at the first value; rejects NotFound once nothing can arrive
}

type Sticker<T = unknown> = {                 // one sticker, as stickers() returns it and the table view draws it
  at: string                                  // canonical address
  via?: string                                // for a shared sticker: the name this board reaches it by, if it does
  scope: "board" | "shared"
  board: string                               // attribution: the board it is on
  card?: string                               // attribution: the card that put it; undefined when the board itself put it
  kind: "put" | "default" | "hide"            // the verb that made it
  handle: Handle<T>                           // this sticker's own value; change edits this sticker, wherever it sits
  covered: boolean                            // another sticker above it is what get returns
}

// ---- boards ------------------------------------------------------------------

type Board = {
  readonly name: string
  readonly signal: AbortSignal                // aborts on close
  readonly children: Handle<Board[]>          // forked from here and still open

  get<T>(at: Address, default?: T): Cell<T>   // with a default: puts it as a `default` sticker when nothing is there
  stickers<T>(at: Address): Handle<Sticker<T>[]>   // the stickers at `at`, top first
  stickers(): Handle<Sticker[]>               // every sticker this board sees: own, inherited, and shared, for the table view
  keys(at?: Address): Handle<string[]>

  put(at: Address, value: unknown): void      // idempotent per card and canonical address
  hide(at: Address): void

  fork(name?: string): Board
  play(url: string, id?: string): Played      // run a card here; `id` names its placement in `board/cards`
  open(url: string): void                     // deal a board document onto this board and follow it
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
declare const domView: View                   // shown only for a board that has a `dom` sticker

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

`Handle`, `fromDoc`, `field`, `derive`, `wrap`, and `NotFound` are
ninepatch's, with `set` removed. A handle obtained from `get` carries its
canonical address. A hand-made handle, from `wrap` or `derive`, does not. An
address walked through a hand-made handle stops at its value, and a `put`
through it is key-rooted.

## Rules

The following rules summarize the semantics.

1. **An address is cut at the first link.** The rest is re-rooted at the
   URL. A key-rooted sticker is on a board and is scoped by the fork chain.
   A URL-rooted sticker is in the hierarchy's shared environment and is seen
   by every board that reaches the document. The path that a `put` walks
   decides which kind it makes, never the value.
2. **Reads take the top of the stack.** Own stickers, then inherited
   stickers, then the value the address walks into, then defaults. A hide
   ends the search above the value. `stickers` sees every sticker. `under`
   is the next one down.
3. **`put` covers.** A sticker is a whole value on top. It never merges with
   what is beneath it. A card that re-puts at one canonical address replaces
   its own sticker. Different cards stack, latest on top.
4. **`change` goes through, and stays.** It edits what is on top, in place:
   the parent's record, or the document. It is never peeled. It never
   creates a value: on nothing, it throws.
5. **`hide` never restores.** A hide applies to this board and below at a
   key-rooted address, and to the hierarchy at a URL-rooted one. A later
   `put` over the hide is allowed.
6. **Defaults are stickers at the bottom.** `get` with a default puts the
   default as a sticker, attributed to the caller, so that the table view
   and `stickers` show it. It sits below the value that the address walks
   into and below anything put later, and a hide doesn't remove it. Defaults
   make the order in which boards define things irrelevant to what a reader
   sees.
7. **Every sticker has an attribution.** The attribution names the board
   that the sticker is on and the card that put it. Stopping a card peels
   its stickers wherever they landed. Closing a board stops its cards,
   closes its forks, drops its stickers, and aborts its `signal`, innermost
   first.
8. **Live means live.** A cell re-resolves on any change at its address and
   tells its subscribers. If nothing is there, `value` throws `NotFound`,
   and subscribers stay quiet until something is. No stale value is ever
   delivered.
9. **`keys` is what a reader sees.** It lists the fields of the value, plus
   the stickers below the address, minus hides: the set that `get` would
   succeed on. It never reveals a hide. `stickers()` is the raw table.
10. **A card shares its board.** `play` calls the module with a hand that
    has the board's stickers, the same table and not a copy, tagged with the
    card and closed with it. The board that a card lies on and everything
    below it see the card's effects. The whole hierarchy sees them through
    the documents that the card puts on.
11. **Documents load once per hierarchy.** A URL read from any board lands
    on the same document in the shared environment. The repo answers
    misses. If it can't, the cell rejects with `NotFound`.
12. **The document describes; the runtime is.** `open` follows the board
    document and keeps the board in step with it. Nothing that a card puts
    is written back. Only `change` reaches a document.

## Example

This example is a whiteboard with a map and a markdown document on it.
Typing `@Paris` in the document opens a menu of places. Picking one inserts
a mention, and a pin appears on the map.

### The boards

The following tree shows the boards, their cards, and their declared
stickers:

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

`map` and `notes` are forks of `whiteboard`, so they inherit `selection`,
`search/*`, `editor/extensions/*`, and `locations`. `dom` and `document`
are put on each child and cover the whiteboard's. The Whiteboard card puts
`dom`. The child's own board document puts `document`.

### The whiteboard's table view

The following table shows what the table view lists for the whiteboard
board.

| Address | Scope | Board | Card | How it is written |
|---|---|---|---|---|
| `dom` | board | root | none | Put by the shell. |
| `repo` | board | root | none | Put by the shell. |
| `board` | board | whiteboard | none | Put by `open`: a link to the board document. |
| `selection` | board | whiteboard | none | From `stickers`; `change`d by Markers, Whiteboard, and the mention extension. |
| `search/queries` | board | whiteboard | none | From `stickers`; `change`d by the mention extension. |
| `search/results/nominatim` | board | whiteboard | PlaceFinder | `put`, replaced on every answer; one sticker per finder. |
| `editor/extensions/mentions` | board | whiteboard | Mentions | `put` once. |
| `locations` | board | whiteboard | Locations | `put`, replaced on every change. |

The map board's table view shows its own `board`, `document`, `dom`, and
`map` on top of the same inherited stickers, with `locations` marked as
inherited. Every sticker shows its attribution. Removing a card takes its
stickers with it, and the table view shows what is left. The map board and
the notes board each have a `dom` sticker, so each has a DOM view. The root
board has one too. The whiteboard board's DOM view shows the canvas.

### The flow of `@Paris`

The following steps trace one interaction:

1. The user types `@Par` in `notes`. The mention extension, which
   `Markdown` installed from `editor/extensions/*`, calls
   `get("search/queries").change(q => { clear(q); q["Par"] = true })`. The
   sticker is the whiteboard's. The change goes through to it.
2. `PlaceFinder` on the whiteboard is subscribed to `search/queries`. It
   debounces, asks Nominatim, and calls `put("search/results/nominatim", {
   Par: [...] })`.
3. The extension watches `keys("search/results")` and reads every finder's
   sticker. It renders the menu from their `["Par"]` entries, which are
   inline `{ title, lat, lng }` objects. Nothing is minted yet.
4. The user picks an entry. The extension creates a `PlaceDoc { title, lat,
   lng }` through `repo`, replaces `@Par` with `{automerge:place…}` in
   `content`, and clears its query.
5. `Locations` follows every URL reachable from the whiteboard's board
   document: `boards.notes`, then its `stickers.document`, then `content`,
   where a regex finds the token. It opens the place document, sees `{ lat,
   lng }`, and re-puts `locations` with it.
6. `Markers` on the map board sees the new `locations` sticker and drops a
   pin.
7. The user clicks the pin. `get("selection").change(s => { clear(s);
   s[place] = true })` goes through to the whiteboard's sticker. The editor
   rings the token, the whiteboard highlights the notes item, the map flies
   to the pin, and the table view shows the change.

If you take `PlaceFinder` off the board, step 2 stops: the menu says
"Searching…", and `search/results/nominatim` leaves the table view. If you
take `Mentions` off, the editor loses the `@` menu. If you take `Locations`
off, the pins go. If you put a second finder on, it puts
`search/results/photon` next to PlaceFinder's sticker, one sticker per
contributor, and the extension picks it up through `keys("search/results")`.
Neither finder knows about the other.

### The cards, sketched

The following sketches show each card's `play` function.

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
// mentions.ts — one sticker, peeled for us when the card stops
export default function play(board: Hand) {
  board.put("editor/extensions/mentions", mentionSearch(board))
}

// inside mentionSearch(board): the extension every editor on the board installs
const queries = board.get<Record<string, true>>("search/queries")
const finders = board.keys("search/results")                       // one sticker per finder
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
      board.put("search/results/nominatim", answers)        // replaces this card's sticker
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
  const locations = board.get<Record<string, Location>>("locations", {})   // default stickers on the map board,
  const selection = board.get<Record<string, true>>("selection", {})       // covered once the whiteboard defines them
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

The shell creates the root board, forks the whiteboard, and shows it:

```ts
const root = createBoard({ repo })
root.put("dom", page)
root.put("repo", repo)

const whiteboard = root.fork("whiteboard")
whiteboard.put("dom", stage)            // the element the DOM view shows
whiteboard.open(seed.whiteboard)        // puts `board`, puts `selection` and `search/queries`, plays the cards
show(whiteboard)                        // the views, shuffled
```

## Accepted trade-offs

The design accepts the following trade-offs:

- A URL-shaped string is a link, and the walk follows it. To keep a URL as
  data, store it inside an object, or read it off the parent.
- Putting through a document is public to the hierarchy. A sticker or hide
  on `document/content` covers it for every board that reaches the
  document. Address by key when you mean something private.
- Two placements of one document collide at shared addresses. The top wins,
  and `stickers` shows both.
- Stickers never merge. Several contributors to one thing are one sticker
  each under a prefix, or a record edited by convention.
- `change` is not retracted. State that a card edited stays edited after
  the card is removed.
- A primitive that another card put can only be covered, not changed.
- A node with stickers below it and no value of its own throws on `value`.
  Use `keys`.
- A default's contents don't migrate when a definition arrives above it.
- A default is a sticker on the reader's board. A card that reads with a
  default puts something, and the table view shows it.
- Whoever holds the root sees every board through `children` and can close
  any of them. The defense is to not hand out the root.
- Cards are modules that the platform's `import()` can load. Running a card
  stored in a document needs a loader, which is `createBoard`'s `import`
  option.

## Not yet designed

The following topics are deferred:

- **Isolation.** A board that starts a new shared environment while still
  inheriting keys. Today, the only isolation is a second `createBoard()`.
- **Servers for other schemes.** Only `automerge:` is answered, by the repo.
- **Union reads.** A `get` that composes the stickers below an address into
  one value, so that `editor/extensions` could be read as a record. `keys`
  covers this case.
- **Binds.** A board as a value that you can put, so that a walk continues
  inside it. Deep addresses into documents replaced what ninepatch used
  binds for.
- **Garbage collection of shared stickers** that no board reaches any more.
- **Read-only cells**, and cells that carry the address of a hand-made
  handle.
- **A process table.** `children` says what is open. Nothing says which card
  put a sticker without reading the table view.
- **Provenance for `change`.** The table view can show who last edited a
  sticker. Nothing records the history.
