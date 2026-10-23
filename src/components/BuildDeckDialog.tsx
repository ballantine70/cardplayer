import { useEffect, useMemo, useState } from 'react';
import type { Asset, ImageItem } from '../types';
import { DEFAULT_CARD, itemBounds, unionRects } from '../lib/geometry';
import { fileBaseName, isUniform, pairFrontsAndBacks, readingOrder, type PairOrder } from '../lib/deckOps';
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
/** One back for every card (generated or a board image), or a back image per card. */
type BackSource = 'generated' | 'image' | 'paired';

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
  const [backSource, setBackSource] = useState<BackSource>('generated');
  const [pairOrder, setPairOrder] = useState<PairOrder>('alternate');
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
      value: '',
      description: '',
    })),
  );

  // Each card is a front row plus, with paired backs, the image used as its back.
  // An image chosen as the shared back is not also used as a face.
  const pairs = useMemo(
    () =>
      backSource === 'paired'
        ? pairFrontsAndBacks(rows, pairOrder).map((p) => ({ front: p.front, backItemId: p.back?.itemId ?? null }))
        : rows.filter((r) => !(backSource === 'image' && r.itemId === backItemId)).map((front) => ({ front, backItemId: null })),
    [rows, backSource, pairOrder, backItemId],
  );
  const faceRows = pairs.map((p) => p.front);
  const unpaired = backSource === 'paired' ? pairs.filter((p) => !p.backItemId).length : 0;
  // The generated back is used for every card, or for paired cards that lack a back image.
  const needsGenerated = backSource === 'generated' || unpaired > 0;

  const size = useMemo(() => {
    if (mode === 'irregular' || faceRows.length === 0) return DEFAULT_CARD;
    const a = assetOf(items[faceRows[0].itemId] as ImageItem);
    return { w: DEFAULT_CARD.w, h: (DEFAULT_CARD.w * a.height) / a.width };
  }, [mode, faceRows[0]?.itemId]);

  const [backPreview, setBackPreview] = useState<string>('');
  const [facePreview, setFacePreview] = useState<string>('');
  const generatedBack = useMemo(
    () => renderGeneratedBack(size.w, size.h, { pattern, primary, secondary }),
    [pattern, primary, secondary, size.w, size.h],
  );

  /** A board image as it will appear on a card: as it is, or fitted onto a card. */
  const asCardImage = (src: string) =>
    mode === 'uniform' ? Promise.resolve(src) : renderFace(src, size.w, size.h, { background, padding, allowRotate });

  const firstPairBack = backSource === 'paired' ? pairs[0]?.backItemId ?? null : null;
  useEffect(() => {
    let live = true;
    const backItem = backItemId ? items[backItemId] : null;
    const pairBack = firstPairBack ? items[firstPairBack] : null;
    if (backSource === 'image' && backItem?.kind === 'image') {
      renderCoverBack(assetOf(backItem).src, size.w, size.h).then((s) => live && setBackPreview(s));
    } else if (pairBack?.kind === 'image') {
      asCardImage(assetOf(pairBack).src).then((s) => live && setBackPreview(s));
    } else {
      setBackPreview(generatedBack);
    }
    return () => {
      live = false;
    };
  }, [backSource, backItemId, firstPairBack, generatedBack, mode, background, padding, allowRotate, size.w, size.h]);

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

  const setRow = (itemId: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r)));

  async function build() {
    if (faceRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const cards: NewCard[] = [];
      for (const { front: r, backItemId: pairBackId } of pairs) {
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
        let back: NewCard['back'];
        if (pairBackId) {
          const b = assetOf(items[pairBackId] as ImageItem);
          back =
            mode === 'uniform'
              ? { src: b.src, width: b.width, height: b.height, name: b.name }
              : { src: await asCardImage(b.src), width: size.w * 2, height: size.h * 2, name: b.name };
        }
        cards.push({ face, back, width: size.w, height: size.h, name: r.name, value: r.value, description: r.description });
      }
      const at = unionRects(sources.map((it) => itemBounds(it, {})))!;
      createDeck({
        name,
        cards,
        back: {
          src: backSource === 'image' ? backPreview : generatedBack,
          width: size.w * 2,
          height: size.h * 2,
          name: `${name} back`,
        },
        x: at.x,
        y: at.y,
        removeItemIds: removeSources ? pairs.flatMap((p) => (p.backItemId ? [p.front.itemId, p.backItemId] : [p.front.itemId])) : [],
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
            {needsGenerated && backSource !== 'image' && (
              <div className="sub-options">
                {backSource === 'paired' && (
                  <small className="muted">
                    {unpaired === 1 ? 'One card has' : `${unpaired} cards have`} no back image, so {unpaired === 1 ? 'it gets' : 'they get'} this
                    generated back.
                  </small>
                )}
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
            <label className="radio">
              <input type="radio" checked={backSource === 'paired'} disabled={rows.length < 2} onChange={() => setBackSource('paired')} />
              <span>
                Each card has its own back
                <small>The selected images include a back for every card.</small>
              </span>
            </label>
            {backSource === 'paired' && (
              <div className="sub-options">
                <label className="radio">
                  <input type="radio" checked={pairOrder === 'alternate'} onChange={() => setPairOrder('alternate')} />
                  <span>
                    Alternating
                    <small>Front, back, front, back… as in a double-sided PDF.</small>
                  </span>
                </label>
                <label className="radio">
                  <input type="radio" checked={pairOrder === 'halves'} onChange={() => setPairOrder('halves')} />
                  <span>
                    Fronts first, then backs
                    <small>All the fronts, followed by the backs in the same order.</small>
                  </span>
                </label>
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
            {pairs.map(({ front: r, backItemId: pairBackId }) => {
              const it = items[r.itemId] as ImageItem | undefined;
              if (!it) return null;
              const backIt = pairBackId ? (items[pairBackId] as ImageItem | undefined) : undefined;
              return (
                <div key={r.itemId} className="card-row">
                  <div className="card-thumbs">
                    <img src={assetOf(it).src} alt="Front" title="Front" />
                    {backSource === 'paired' &&
                      (backIt ? (
                        <img src={assetOf(backIt).src} alt="Back" title="Back" />
                      ) : (
                        <img src={generatedBack} alt="Generated back" title="Generated back" />
                      ))}
                  </div>
                  <div className="card-fields">
                    <input placeholder="Name" value={r.name} onChange={(e) => setRow(r.itemId, { name: e.target.value })} />
                    <input placeholder="Value" value={r.value} onChange={(e) => setRow(r.itemId, { value: e.target.value })} />
                    <textarea
                      placeholder="Description"
                      rows={2}
                      value={r.description}
                      onChange={(e) => setRow(r.itemId, { description: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}
            {backSource === 'image' && backItemId && rows.some((r) => r.itemId === backItemId) && (
              <div className="card-row is-back">
                <div className="card-thumbs">
                  <img src={assetOf(items[backItemId] as ImageItem).src} alt="" />
                </div>
                <p className="muted">Used as the card back</p>
              </div>
            )}
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
