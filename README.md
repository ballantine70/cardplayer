# Cardplayer

A whiteboard for turning images into card decks and playing with them.

## Running

```sh
npm install
npm run dev:server   # room server on :8787 (needed for online play)
npm run dev          # app on http://localhost:5173, proxying /api and /ws to the server
npm test             # unit tests
npm run build        # type-check and production build
npm start            # serve the built app and rooms on $PORT
```

Node 22.18 or later is required: the server is TypeScript run directly by Node.

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

## Playing online

*Play online* creates a room with its own link (`/r/<id>`), optionally copying the current board into it. Everyone with the link shares the board, sees each other's pointers, and has a hand tray at the bottom of the screen: drag cards into it to take them, drag them out to play them. *Deal…* can deal straight into the hands of everyone online.

Each room has two settings, changeable at any time under *Room settings*:

- **Private hands** – only a hand's holder sees its cards. Off means hands are open, and anyone can look at another player's hand from the players panel.
- **Hide face-down cards** – nobody can see face-down cards on the table or the order of a deck. Turn it off while building or checking decks.

Hidden cards are withheld by the server, not just hidden in the page: players are only sent a card's face and details when they are allowed to see it. One limit: card identities are stable, so a player who has seen a card and watches its id in developer tools could follow it into a deck.

Simultaneous moves are resolved per object: each change carries the revision it was based on, and the server refuses changes based on an out-of-date revision and sends back the current state.

## Deploying on Railway

`railway.json` sets the build (`npm run build`), start command (`npm start`) and health check (`/api/health`). Railway provides `PORT`.

Rooms and their images are written to disk. Attach a **volume** to the service so they survive redeploys; the server uses the volume's mount path automatically (`RAILWAY_VOLUME_MOUNT_PATH`), or `DATA_DIR` if set. Without a volume, rooms are lost on every deploy.

## Structure

- `src/store.ts` – board state and all deck/card operations (zustand).
- `src/lib/deckOps.ts` – pure helpers: shuffling, dealing, fitting images onto cards.
- `src/lib/cardRender.ts` – canvas rendering of card faces and backs.
- `src/components/Board.tsx` – the pan/zoom canvas and pointer interactions.
- `src/sync/` – the browser side of online rooms: sends local changes, applies remote ones.
- `src/shared/` – code used by both sides: the message protocol and the card visibility rules.
- `server/` – HTTP and WebSocket server: static files, room state, image uploads, persistence.
