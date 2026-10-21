# Cardplayer

A whiteboard for turning images into card decks and playing with them.

## Running

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run build    # type-check and production build
```

## Using it

- **Add images** by pasting, dropping files onto the board, or with *Add images*.
- **Build a deck**: select images (click, Shift-click or drag a box) and choose *Build deck*.
  - *Use images as cards* – for images that are already card-shaped and the same size; picked automatically when they are.
  - *Place images on poker cards* – each image is fitted onto a 2.5 × 3.5 in card, with a choice of card colour, margin and optional rotation of landscape images.
  - The back is either generated (pattern and two colours) or taken from any image on the board.
  - Each card gets a name, value and description, editable in the dialog and later in the side panel.
- **Play**: select a deck for *Shuffle*, *Draw*, *Deal…* (players, cards each, face up/down), *Flip*, *Spread* and *Gather*. Drag a card onto a deck to put it back on top; Alt-drag a deck to pull its top card off; double-click a card to flip it. *Stack into deck* combines selected cards.
- **Navigate**: scroll to pan, Ctrl/⌘ + scroll or pinch to zoom, Space-drag or middle-drag to pan. Press `?` in the toolbar for the full list.

The board is saved in the browser (IndexedDB) and can be exported or imported as a JSON file.

## Structure

- `src/store.ts` – board state and all deck/card operations (zustand).
- `src/lib/deckOps.ts` – pure helpers: shuffling, dealing, fitting images onto cards.
- `src/lib/cardRender.ts` – canvas rendering of card faces and backs.
- `src/components/Board.tsx` – the pan/zoom canvas and pointer interactions.

Online multiplayer is not implemented yet. The board state is plain serialisable data, so the intended next step is syncing it through a small WebSocket server, with per-player hands kept private.
