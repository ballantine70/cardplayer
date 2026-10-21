import { useRef, useState } from 'react';
import { boardData, useBoard } from '../store';
import { downloadJson, isBoardData } from '../lib/persist';
import { viewportCentre, zoomBy, zoomToFit } from '../lib/view';
import { useUi } from '../ui';
import { useSession } from '../sync/session';

export function Toolbar({ onImages }: { onImages: (files: File[]) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const boardInput = useRef<HTMLInputElement>(null);
  const zoom = useBoard((s) => s.camera.zoom);
  const roomId = useSession((s) => s.roomId);
  const status = useSession((s) => s.status);
  const [copied, setCopied] = useState(false);

  return (
    <header className="toolbar no-board">
      <h1>Cardplayer</h1>
      <div className="group">
        <button className="primary" onClick={() => fileInput.current?.click()}>
          Add images
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onImages([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => {
            const c = viewportCentre();
            useBoard.getState().addText({ x: c.x - 110, y: c.y - 24 });
            useUi.getState().setEditingText(useBoard.getState().selection[0]);
          }}
        >
          Add label
        </button>
      </div>
      <div className="group">
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
          −
        </button>
        <button className="zoom-level" onClick={zoomToFit} title="Fit everything in view">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          +
        </button>
      </div>
      <div className="spacer" />
      {roomId ? (
        <div className="group">
          <span className={`status ${status}`} title={status}>
            {status === 'online' ? 'Online' : status === 'missing' ? 'Room not found' : 'Connecting…'}
          </span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.origin + location.pathname);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                prompt('Copy this link:', location.origin + location.pathname);
              }
            }}
          >
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <button onClick={() => useUi.getState().openDialog({ type: 'room-settings' })}>Room settings</button>
          <a className="button" href="/">
            Leave
          </a>
          <button onClick={() => useUi.getState().openDialog({ type: 'help' })} aria-label="Help">
            ?
          </button>
        </div>
      ) : (
        <div className="group">
          <button className="primary" onClick={() => useUi.getState().openDialog({ type: 'online' })}>
            Play online
          </button>
          <button onClick={() => downloadJson(boardData(), 'cardplayer-board.json')}>Export</button>
          <button onClick={() => boardInput.current?.click()}>Import</button>
          <input
            ref={boardInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const data = JSON.parse(await file.text());
                if (!isBoardData(data)) throw new Error('Not a Cardplayer board file.');
                useBoard.getState().loadBoard(data);
              } catch (err) {
                alert(`Could not import: ${err instanceof Error ? err.message : err}`);
              }
            }}
          />
          <button
            onClick={() => {
              if (confirm('Remove everything from the board?')) useBoard.getState().clearBoard();
            }}
          >
            Clear
          </button>
          <button onClick={() => useUi.getState().openDialog({ type: 'help' })} aria-label="Help">
            ?
          </button>
        </div>
      )}
    </header>
  );
}
