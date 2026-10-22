import { useEffect, useState } from 'react';
import { Board, isTyping } from './components/Board';
import { BuildDeckDialog } from './components/BuildDeckDialog';
import { DealDialog } from './components/DealDialog';
import { HelpDialog } from './components/HelpDialog';
import { Inspector } from './components/Inspector';
import { Toolbar } from './components/Toolbar';
import { readImageFile } from './lib/cardRender';
import { screenToWorld } from './lib/geometry';
import { loadSavedBoard, saveBoard } from './lib/persist';
import { viewportCentre, zoomToFit } from './lib/view';
import { boardData, useBoard } from './store';
import { useUi } from './ui';
import { NameDialog, OnlineDialog, RoomSettingsDialog } from './components/OnlineDialogs';
import { connectRoom, disconnectRoom } from './sync/client';
import { loadRole, roomIdFromPath, useSession } from './sync/session';

async function addFiles(files: File[], at?: { x: number; y: number }) {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) return;
  const loaded = await Promise.all(images.map((f) => readImageFile(f).catch(() => null)));
  const ok = loaded.filter((x) => x !== null);
  if (ok.length) useBoard.getState().addImages(ok, at ?? viewportCentre());
}

/** Read once: React may run effects twice in development, and the flag is removed from the URL. */
const seedRequested = new URLSearchParams(location.search).has('seed');

/** Restore the local board, then save changes as they happen. Returns a cleanup function. */
function startLocal(onReady: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsub = () => {};
  let cancelled = false;
  loadSavedBoard()
    .then((data) => {
      if (data) useBoard.getState().loadBoard(data);
      else zoomToFit();
    })
    .catch(() => zoomToFit())
    .finally(() => {
      if (cancelled) return;
      onReady();
      unsub = useBoard.subscribe((s, prev) => {
        if (s.items === prev.items && s.cards === prev.cards && s.camera === prev.camera) return;
        clearTimeout(timer);
        timer = setTimeout(() => saveBoard(boardData()).catch((e) => console.error('Save failed', e)), 400);
      });
    });
  return () => {
    cancelled = true;
    unsub();
    clearTimeout(timer);
  };
}

export function App() {
  const dialog = useUi((u) => u.dialog);
  const openDialog = useUi((u) => u.openDialog);
  const [loaded, setLoaded] = useState(false);

  const roomId = useSession((s) => s.roomId);
  const status = useSession((s) => s.status);

  const admin = useSession((s) => s.admin);

  useEffect(() => {
    loadRole();
  }, []);

  useEffect(() => {
    const id = roomIdFromPath();
    if (!id) return startLocal(() => setLoaded(true));
    useSession.setState({ roomId: id, status: 'connecting' });
    let cancelled = false;
    const seed = seedRequested;
    history.replaceState(null, '', `/r/${id}`);
    (seed ? loadSavedBoard().catch(() => null) : Promise.resolve(null)).then((board) => {
      if (cancelled) return;
      connectRoom(id, board);
      setLoaded(true);
      if (!useSession.getState().me.named) openDialog({ type: 'name' });
    });
    return () => {
      cancelled = true;
      disconnectRoom();
    };
  }, [openDialog]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useUi.getState().dialog) return;
      const s = useBoard.getState();
      const sel = s.selection.filter((id) => s.items[id]);
      const deck = sel.length === 1 && s.items[sel[0]].kind === 'deck' ? sel[0] : null;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length) s.deleteItems(sel);
      } else if (e.key === 'Escape') {
        s.select([]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.select(Object.keys(s.items));
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      } else if (e.key === 'f') {
        s.flip(sel);
      } else if (e.key === 's' && deck) {
        s.shuffleDeck(deck);
      } else if (e.key === 'd' && deck) {
        s.drawCard(deck, { faceUp: true });
      }
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const board = document.querySelector('.board')!.getBoundingClientRect();
    const at = screenToWorld(useBoard.getState().camera, e.clientX - board.left, e.clientY - board.top);
    addFiles([...e.dataTransfer.files], at);
  };

  const close = () => openDialog(null);

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <Toolbar onImages={(files) => addFiles(files)} />
      <main>
        {loaded && status !== 'missing' && <Board />}
        {roomId && status === 'missing' && (
          <div className="notice">
            <p>This table does not exist, or the server has lost it.</p>
            {admin && (
              <a className="button primary" href="/">
                Back to your board
              </a>
            )}
          </div>
        )}
        <Inspector />
      </main>
      {dialog?.type === 'build' && <BuildDeckDialog itemIds={dialog.itemIds} onClose={close} />}
      {dialog?.type === 'deal' && <DealDialog deckId={dialog.deckId} onClose={close} />}
      {dialog?.type === 'help' && <HelpDialog onClose={close} />}
      {dialog?.type === 'online' && <OnlineDialog onClose={close} />}
      {dialog?.type === 'room-settings' && <RoomSettingsDialog onClose={close} />}
      {dialog?.type === 'name' && <NameDialog onClose={close} />}
    </div>
  );
}
