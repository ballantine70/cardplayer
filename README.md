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

- **Add images** by pasting, dropping files onto the board, or with *Add images*. PDFs are accepted too: each page becomes an image, named after the page's title (its largest text) or, failing that, the file and page number.
- **Build a deck**: select images (click, Shift-click or drag a box) and choose *Build deck*.
  - *Use images as cards* – for images that are already card-shaped and the same size; picked automatically when they are.
  - *Place images on poker cards* – each image is fitted onto a 2.5 × 3.5 in card, with a choice of card colour, margin and optional rotation of landscape images.
  - By default every card shares one back: generated (pattern and two colours) or taken from any image on the board.
  - For double-sided cards, choose *Each card has its own back*: the selected images are paired either alternately (front, back, front, back…, as in a double-sided PDF) or as all the fronts followed by all the backs. A card left without a pair gets the generated back.
  - Each card gets a name, value and description, editable in the dialog and later in the side panel.
- **Play**: select a deck for *Shuffle*, *Draw*, *Deal…* (players, cards each, face up/down), *Flip*, *Spread* and *Gather*. Drag a card onto a deck to put it back on top; Alt-drag a deck to pull its top card off; double-click a card to flip it. *Stack into deck* combines selected cards, and *Spread out* lays selected loose cards out in a grid, top of a pile first.
- **Navigate**: scroll to pan, Ctrl/⌘ + scroll or pinch to zoom, Space-drag or middle-drag to pan. Press `?` in the toolbar for the full list.

The board is saved in the browser (IndexedDB) and can be exported or imported as a JSON file.

## Deck library

On the admin board, select a deck and choose *Save to library* to keep a copy on the server: its images and each card's name, value and description, in the deck's current order. Saving a deck that came from the library offers to update the saved copy or save a new one. *Library* in the toolbar lists saved decks, to put on the board, rename or delete.

When creating a table with *Play online*, tick library decks to put them on it. Admins also get *Add deck* on a table to add more later. Tables get their own copy, so editing or deleting a library deck does not change tables already using it.

## Playing online

*Play online* creates a room with its own link (`/r/<id>`), optionally copying the current board into it. Everyone with the link shares the board, sees each other's pointers, and has a hand tray at the bottom of the screen: drag cards into it to take them, drag them out to play them. *Deal…* can deal straight into the hands of everyone online.

Each room has two settings, changeable at any time under *Room settings*:

- **Private hands** – only a hand's holder sees its cards. Off means hands are open, and anyone can look at another player's hand from the players panel.
- **Hide face-down cards** – nobody can see face-down cards on the table or the order of a deck. Turn it off while building or checking decks.

Hidden cards are withheld by the server, not just hidden in the page: players are only sent a card's face and details when they are allowed to see it, and only sent a card's back when it could be seen on the table (the top of a deck, or a loose face-down card), since double-sided decks have a different back on every card. One limit: card identities are stable, so a player who has seen a card and watches its id in developer tools could follow it into a deck.

Simultaneous moves are resolved per object: each change carries the revision it was based on, and the server refuses changes based on an out-of-date revision and sends back the current state.

## Deploying on Railway

`railway.json` sets the build (`npm run build`), start command (`npm start`) and health check (`/api/health`). Railway provides `PORT`.

To put the whole site behind a password, set the `SITE_PASSWORD` variable on the service. Visitors then get a login page; a successful login is remembered in that browser for 30 days, and changing the password signs everyone out. Visiting `/api/logout` signs the current browser out. Leave the variable unset for an open site.

To keep deck building to yourself, set `ADMIN_PASSWORD` as well. The home board (where decks are built and tables are created) then needs the admin password, while players with the site password can only join tables from invite links. Without it, everyone who can log in is treated as an admin. Either way, decks cannot be built on a shared table: only an admin can add cards to one, by copying their board in when creating it.

Rooms and their images are written to disk. Attach a **volume** to the service so they survive redeploys; the server uses the volume's mount path automatically (`RAILWAY_VOLUME_MOUNT_PATH`), or `DATA_DIR` if set. Without a volume, rooms are lost on every deploy.

## Structure

- `src/store.ts` – board state and all deck/card operations (zustand).
- `src/lib/deckOps.ts` – pure helpers: shuffling, dealing, fitting images onto cards.
- `src/lib/cardRender.ts` – canvas rendering of card faces and backs.
- `src/components/Board.tsx` – the pan/zoom canvas and pointer interactions.
- `src/sync/` – the browser side of online rooms: sends local changes, applies remote ones.
- `src/shared/` – code used by both sides: the message protocol and the card visibility rules.
- `server/` – HTTP and WebSocket server: static files, room state, image uploads, persistence.
- `server/library.ts` – the deck library, stored under `library/` in the data directory.
