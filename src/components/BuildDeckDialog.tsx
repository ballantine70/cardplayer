import { useEffect, useMemo, useState } from 'react';
import type { Asset, ImageItem } from '../types';
import { DEFAULT_CARD, itemBounds, unionRects } from '../lib/geometry';
import { fileBaseName, isUniform, readingOrder } from '../lib/deckOps';
import { renderCoverBack, renderFace, renderGeneratedBack, type BackPattern } from '../lib/cardRender';
import { useBoard, type NewCard } from '../store';
import { Modal } from './Modal';

interface Row {
  itemId: string;
  name: string;
  value: string;
  description: string;
}

type Mode = 'uniform' | 'irregular';

export function BuildDeckDialog({ itemIds, onClose }: { itemIds: string[]; onClose: () => void }) {
  const items = useBoard((s) => s.items);
  const assets = useBoard((s) => s.assets);
  const createDeck = useBoard((s) => s.createDeck);

  const sources = useMemo(
    () => readingOrder(itemIds.map((id) => items[id]).filter((it): it is ImageItem => it?.kind === 'image')),
    // Only the initial selection matters; ignore later board changes.
    [],
  );
  const allImages = useMemo(() => Object.values(items).filter((it): it is ImageItem => it.kind === 'image'), [items]);
  const assetOf = (it: ImageItem): Asset => assets[it.assetId];

  const uniform = isUniform(sources.map(assetOf));
  const [mode, setMode] = useState<Mode>(uniform ? 'uniform' : 'irregular');
  const [name, setName] = useState('New deck');
  const [background, setBackground] = useState('#ffffff');
  const [padding, setPadding] = useState(0.08);
  const [allowRotate, setAllowRotate] = useState(false);
  const [backSource, setBackSource] = useState<'generated' | 'image'>('generated');
  const [pattern, setPattern] = useState<BackPattern>('lattice');
  const [primary, setPrimary] = useState('#7a1f2b');
  const [secondary, setSecondary] = useState('#e8c872');
  const [backItemId, setBackItemId] = useState<string | null>(null);
  const [removeSources, setRemoveSources] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() =>
    sources.map((it, i) => ({
      itemId: it.id,
      name: fileBaseName(assetOf(it).name) || `Card ${i + 1}`,
      value: String(i + 1),
      description: '',
    })),
  );

  // An image chosen as the back is not also used as a face.
  const faceRows = rows.filter((r) => !(backSource === 'image' && r.itemId === backItemId));

  const size = useMemo(() => {
    if (mode === 'irregular' || faceRows.length === 0) return DEFAULT_CARD;
    const a = assetOf(items[faceRows[0].itemId] as ImageItem);
    return { w: DEFAULT_CARD.w, h: (DEFAULT_CARD.w * a.height) / a.width };
  }, [mode, faceRows[0]?.itemId]);

  const [backPreview, setBackPreview] = useState<string>('');
  const [facePreview, setFacePreview] = useState<string>('');

  useEffect(() => {
    let live = true;
    const backItem = backItemId ? items[backItemId] : null;
    if (backSource === 'image' && backItem?.kind === 'image') {
      renderCoverBack(assetOf(backItem).src, size.w, size.h).then((s) => live && setBackPreview(s));
    } else {
      setBackPreview(renderGeneratedBack(size.w, size.h, { pattern, primary, secondary, label: name }));
    }
    return () => {
      live = false;
    };
  }, [backSource, backItemId, pattern, primary, secondary, name, size.w, size.h]);

  const firstFace = faceRows[0] ? (items[faceRows[0].itemId] as ImageItem) : null;
  useEffect(() => {
    let live = true;
    if (!firstFace) return setFacePreview('');
    const src = assetOf(firstFace).src;
    if (mode === 'uniform') setFacePreview(src);
    else renderFace(src, size.w, size.h, { background, padding, allowRotate }).then((s) => live && setFacePreview(s));
    return () => {
      live = false;
    };
  }, [firstFace?.id, mode, background, padding, allowRotate, size.w, size.h]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function build() {
    if (faceRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const cards: NewCard[] = [];
      for (const r of faceRows) {
        const a = assetOf(items[r.itemId] as ImageItem);
        const face =
          mode === 'uniform'
            ? { src: a.src, width: a.width, height: a.height, name: a.name }
            : {
                src: await renderFace(a.src, size.w, size.h, { background, padding, allowRotate }),
                width: size.w * 2,
                height: size.h * 2,
                name: a.name,
              };
        cards.push({ face, width: size.w, height: size.h, name: r.name, value: r.value, description: r.description });
      }
      const at = unionRects(sources.map((it) => itemBounds(it, {})))!;
      createDeck({
        name,
        cards,
        back: { src: backPreview, width: size.w * 2, height: size.h * 2, name: `${name} back` },
        x: at.x,
        y: at.y,
        removeItemIds: removeSources ? faceRows.map((r) => r.itemId) : [],
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="Build deck" onClose={onClose} wide>
      <div className="build-grid">
        <section className="build-options">
          <label className="field">
            <span>Deck name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <fieldset>
            <legend>Card faces</legend>
            <label className="radio">
              <input type="radio" checked={mode === 'uniform'} onChange={() => setMode('uniform')} />
              <span>
                Use images as cards
                <small>For images that are already card-shaped and all the same size.{uniform ? ' (detected)' : ''}</small>
              </span>
            </label>
            <label className="radio">
              <input type="radio" checked={mode === 'irregular'} onChange={() => setMode('irregular')} />
              <span>
                Place images on poker cards
                <small>Each image is fitted onto a 2.5 × 3.5 in card.</small>
              </span>
            </label>
            {mode === 'irregular' && (
              <div className="sub-options">
                <label className="field inline">
                  <span>Card colour</span>
                  <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
                </label>
                <label className="field inline">
                  <span>Margin</span>
                  <input type="range" min={0} max={0.25} step={0.01} value={padding} onChange={(e) => setPadding(+e.target.value)} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
                  Rotate landscape images to fill the card
                </label>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend>Card back</legend>
            <label className="radio">
              <input type="radio" checked={backSource === 'generated'} onChange={() => setBackSource('generated')} />
              <span>Generate a back</span>
            </label>
            {backSource === 'generated' && (
              <div className="sub-options">
                <label className="field inline">
                  <span>Pattern</span>
                  <select value={pattern} onChange={(e) => setPattern(e.target.value as BackPattern)}>
                    <option value="lattice">Lattice</option>
                    <option value="stripes">Stripes</option>
                    <option value="dots">Dots</option>
                  </select>
                </label>
                <label className="field inline">
                  <span>Colours</span>
                  <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
                  <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
                </label>
              </div>
            )}
            <label className="radio">
              <input
                type="radio"
                checked={backSource === 'image'}
                disabled={allImages.length === 0}
                onChange={() => {
                  setBackSource('image');
                  setBackItemId((id) => id ?? allImages.find((i) => !itemIds.includes(i.id))?.id ?? allImages[0]?.id ?? null);
                }}
              />
              <span>Use an image from the board</span>
            </label>
            {backSource === 'image' && (
              <div className="back-picker">
                {allImages.map((it) => (
                  <button
                    key={it.id}
                    className={it.id === backItemId ? 'thumb chosen' : 'thumb'}
                    onClick={() => setBackItemId(it.id)}
                    title={assetOf(it).name}
                  >
                    <img src={assetOf(it).src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={removeSources} onChange={(e) => setRemoveSources(e.target.checked)} />
            Remove the source images from the board
          </label>

          <div className="preview">
            {facePreview && <img src={facePreview} style={{ aspectRatio: `${size.w} / ${size.h}` }} alt="Face preview" />}
            {backPreview && <img src={backPreview} style={{ aspectRatio: `${size.w} / ${size.h}` }} alt="Back preview" />}
          </div>
        </section>

        <section className="build-cards">
          <h3>
            Cards <small>({faceRows.length}, first is the top of the deck)</small>
          </h3>
          <div className="card-rows">
            {rows.map((r, i) => {
              const it = items[r.itemId] as ImageItem | undefined;
              if (!it) return null;
              const isBack = backSource === 'image' && r.itemId === backItemId;
              return (
                <div key={r.itemId} className={isBack ? 'card-row is-back' : 'card-row'}>
                  <img src={assetOf(it).src} alt="" />
                  {isBack ? (
                    <p className="muted">Used as the card back</p>
                  ) : (
                    <div className="card-fields">
                      <input placeholder="Name" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                      <input placeholder="Value" value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} />
                      <textarea
                        placeholder="Description"
                        rows={2}
                        value={r.description}
                        onChange={(e) => setRow(i, { description: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <footer>
        {error && <span className="error">{error}</span>}
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || faceRows.length === 0 || !backPreview} onClick={build}>
          {busy ? 'Building…' : `Build ${faceRows.length}-card deck`}
        </button>
      </footer>
    </Modal>
  );
}
