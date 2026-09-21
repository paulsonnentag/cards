# Cards

An experimental programming environment: boards hold cards (behavior) and stickers (the result). Every sticker shows who put it there. See [spec.md](spec.md) for the design.

This repository contains the runtime, the demo cards, and a shell, built with Solid, Vite, TypeScript, and Automerge.

## Run it

```sh
npm install
npm run dev
```

Open the printed URL. The first load seeds a whiteboard with a notes board and a map board and stores it in IndexedDB. **Reset** in the top bar deletes the local documents and reseeds.

```sh
npm run typecheck   # tsc
npm run build       # vite build
```

## The demo

Type `@` and the start of a place name in the notes, for example `@Paris`. A menu of places opens, answered by the Place finder card through OpenStreetMap's Nominatim. Pick one: a place document is created, the token becomes a chip, and a pin appears on the map. Click the pin or the chip to select the place; the selection lives on the whiteboard, so both react.

To look behind anything, click **Inspect** in the top-right corner and pick a node on the page. The board whose `dom` holds that node opens in a panel that slides in from the right, with a line back to the node:

- **Cards**, on the left: the board's cards as playing cards. Click a card to flip it face down and its effect stops. Drag to move, `+ Add card` to add one, hover for `×` to remove.
- **Table**, on the right: every sticker the board sees. Path, scope, board, card, and value, with covered stickers dimmed.

Pick the notes to inspect the notes board, the map for the map board, or the empty canvas for the whiteboard itself. Close the panel with `×` and the page returns to normal.

Things to try:

- Flip **Place finder** face down. The menu says "Searching…" and `search/results/nominatim` leaves the table.
- Flip **Locations** face down. The pins go.
- Flip **Mentions** face down. The editor loses the `@` menu.

## Layout

```
src/runtime/     the runtime: boards, stickers, cells, paths, hands, mount, open
  types.ts       the public API (Board, Card, Cell, Sticker, ...)
  handle.ts      Handle helpers: wrap, fromDoc, field, derive, NotFound
  board.ts       BoardImpl, HandImpl, mount, createBoard
src/cards/       the demo cards, one module each, default-exporting a Card object
src/shell/       the inspector: pick a node, see its board's cards and table in a side panel
src/seed.ts      creates the demo documents on first run
src/main.tsx     wires the repo, the root board, and the shell
```

## Notes on the implementation

- Reactivity is Solid's. Every board keeps one signal per sticker path plus one for structural changes. Cells resolve inside a tracked scope, so subscribers re-run only when something in their stack changes.
- Cards are loaded through `card:<name>` URLs that map to the modules in `src/cards`, via the `import` option of `createBoard`.
- Documents are Automerge documents in an automerge-repo with IndexedDB storage and a BroadcastChannel network adapter, so two tabs stay in sync.
- The map uses MapLibre with the demo tiles style and falls back to a plain background when the style can't be fetched.
