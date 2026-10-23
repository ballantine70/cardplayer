import type { Asset } from '../types';
import { fileBaseName } from './deckOps';

/** Longest side of a rendered page, in pixels. */
const MAX_SIDE = 1600;

export function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Render every page of a PDF to an image. `onPage` reports progress as
 * (pages done, total). pdf.js is loaded only when first needed.
 */
export async function pdfToImages(file: File, onPage?: (done: number, total: number) => void): Promise<Omit<Asset, 'id'>[]> {
  // The legacy build supports browsers that lack the newest JavaScript features.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
  });
  const doc = await task.promise;

  const base = fileBaseName(file.name) || 'PDF';
  const out: Omit<Asset, 'id'>[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(unit.width, unit.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      out.push({
        src: canvas.toDataURL('image/jpeg', 0.9),
        width: canvas.width,
        height: canvas.height,
        name: doc.numPages > 1 ? `${base} p${n}` : base,
      });
      page.cleanup();
      onPage?.(n, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return out;
}
