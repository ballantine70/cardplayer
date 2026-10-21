import { fitOnCard } from './deckOps';

/** Pixel density used when rendering card images, relative to world units. */
const RES = 2;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * RES);
  canvas.height = Math.round(h * RES);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RES, RES);
  return { canvas, ctx };
}

export interface FaceOptions {
  background: string;
  padding: number;
  allowRotate: boolean;
}

/** Place an irregular image onto a card of size (w, h). */
export async function renderFace(src: string, w: number, h: number, opts: FaceOptions): Promise<string> {
  const img = await loadImage(src);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, w, h);
  const p = fitOnCard(img.naturalWidth, img.naturalHeight, w, h, opts.padding, opts.allowRotate);
  if (p.rotate) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  } else {
    ctx.drawImage(img, p.x, p.y, p.w, p.h);
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** Crop an image to fill a card of size (w, h). */
export async function renderCoverBack(src: string, w: number, h: number): Promise<string> {
  const img = await loadImage(src);
  const { canvas, ctx } = makeCanvas(w, h);
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export type BackPattern = 'lattice' | 'stripes' | 'dots';

export interface BackOptions {
  pattern: BackPattern;
  primary: string;
  secondary: string;
  label: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw a generated card back of size (w, h). */
export function renderGeneratedBack(w: number, h: number, opts: BackOptions): string {
  const { canvas, ctx } = makeCanvas(w, h);
  const m = Math.min(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  const inset = m * 0.06;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  roundRect(ctx, inset, inset, iw, ih, m * 0.04);
  ctx.fillStyle = opts.primary;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.strokeStyle = opts.secondary;
  ctx.fillStyle = opts.secondary;
  ctx.globalAlpha = 0.55;
  const step = m * 0.08;
  if (opts.pattern === 'lattice') {
    ctx.lineWidth = m * 0.008;
    for (let d = -h; d < w + h; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + h, h);
      ctx.moveTo(d, h);
      ctx.lineTo(d + h, 0);
      ctx.stroke();
    }
  } else if (opts.pattern === 'stripes') {
    ctx.lineWidth = step * 0.35;
    for (let d = -h; d < w + h; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + h, h);
      ctx.stroke();
    }
  } else {
    const r = step * 0.18;
    let row = 0;
    for (let y = 0; y < h + step; y += step * 0.87, row++) {
      for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // Inner frame
  ctx.strokeStyle = opts.secondary;
  ctx.lineWidth = m * 0.012;
  roundRect(ctx, inset * 1.8, inset * 1.8, w - inset * 3.6, h - inset * 3.6, m * 0.03);
  ctx.stroke();

  // Central medallion with the deck's initials
  const cx = w / 2;
  const cy = h / 2;
  const rad = m * 0.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rad, rad * 1.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = opts.primary;
  ctx.fill();
  ctx.lineWidth = m * 0.014;
  ctx.stroke();
  const initials = opts.label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
  if (initials) {
    ctx.fillStyle = opts.secondary;
    ctx.font = `600 ${rad * 0.8}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, cx, cy + rad * 0.05);
  }
  return canvas.toDataURL('image/png');
}

/** Read an image file into a data URL plus its natural size. */
export async function readImageFile(file: File): Promise<{ src: string; width: number; height: number; name: string }> {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await loadImage(src);
  return { src, width: img.naturalWidth, height: img.naturalHeight, name: file.name || 'Pasted image' };
}
