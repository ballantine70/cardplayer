import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LibraryCard, LibraryDeck, LibrarySummary } from '../src/shared/library.ts';
import { ID_PATTERN } from '../src/shared/protocol.ts';

interface Index {
  decks: Record<string, LibraryDeck>;
  /** Content type of each stored image. */
  mimes: Record<string, string>;
}

/** Saved decks, shared by all admins, stored alongside the rooms. */
export class Library {
  readonly assetDir: string;
  private file: string;
  private index: Index = { decks: {}, mimes: {} };
  /** Recently uploaded images, protected from clean-up until a deck uses them. */
  private pending = new Map<string, number>();

  constructor(dataDir: string) {
    this.assetDir = join(dataDir, 'library', 'assets');
    this.file = join(dataDir, 'library', 'index.json');
  }

  async load() {
    if (existsSync(this.file)) this.index = JSON.parse(await readFile(this.file, 'utf8')) as Index;
  }

  list(): LibrarySummary[] {
    return Object.values(this.index.decks)
      .map((d) => ({
        id: d.id,
        name: d.name,
        savedAt: d.savedAt,
        cardCount: d.cards.length,
        coverAssetId: d.cards[0]?.faceAssetId ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): LibraryDeck | undefined {
    return this.index.decks[id];
  }

  assetPath(id: string) {
    return join(this.assetDir, id);
  }

  mime(id: string): string | undefined {
    return this.index.mimes[id];
  }

  async putAsset(id: string, mime: string, body: Buffer) {
    await mkdir(this.assetDir, { recursive: true });
    await writeFile(this.assetPath(id), body);
    this.index.mimes[id] = mime;
    this.pending.set(id, Date.now());
  }

  /** Create or replace a deck. Returns an error message if the deck is not valid. */
  async save(id: string, input: unknown): Promise<LibraryDeck | string> {
    const d = input as Partial<LibraryDeck>;
    if (!d || typeof d.name !== 'string' || !Array.isArray(d.cards) || d.cards.length === 0) return 'A deck needs a name and cards.';
    if (d.cards.length > 2000) return 'Too many cards.';
    const assets: LibraryDeck['assets'] = {};
    const cards: LibraryCard[] = [];
    for (const c of d.cards as LibraryCard[]) {
      for (const assetId of [c.faceAssetId, c.backAssetId]) {
        if (!ID_PATTERN.test(String(assetId)) || !this.index.mimes[assetId]) return `Image ${assetId} has not been uploaded.`;
        const meta = d.assets?.[assetId];
        assets[assetId] = {
          id: assetId,
          width: Number(meta?.width) || 0,
          height: Number(meta?.height) || 0,
          name: String(meta?.name ?? ''),
        };
      }
      cards.push({
        name: String(c.name ?? '').slice(0, 200),
        value: String(c.value ?? '').slice(0, 200),
        description: String(c.description ?? '').slice(0, 5000),
        faceAssetId: c.faceAssetId,
        backAssetId: c.backAssetId,
        width: Number(c.width) || 250,
        height: Number(c.height) || 350,
      });
    }
    const deck: LibraryDeck = { id, name: d.name.trim().slice(0, 100) || 'Untitled deck', savedAt: new Date().toISOString(), cards, assets };
    this.index.decks[id] = deck;
    for (const assetId of Object.keys(assets)) this.pending.delete(assetId);
    await this.collectGarbage();
    await this.persist();
    return deck;
  }

  async rename(id: string, name: string) {
    const d = this.index.decks[id];
    if (!d) return false;
    d.name = name.trim().slice(0, 100) || d.name;
    await this.persist();
    return true;
  }

  async remove(id: string) {
    if (!this.index.decks[id]) return false;
    delete this.index.decks[id];
    await this.collectGarbage();
    await this.persist();
    return true;
  }

  /** Delete images no saved deck uses. */
  private async collectGarbage() {
    const used = new Set<string>();
    for (const d of Object.values(this.index.decks)) for (const id of Object.keys(d.assets)) used.add(id);
    const stale = Date.now() - 10 * 60_000;
    for (const id of Object.keys(this.index.mimes)) {
      if (used.has(id) || (this.pending.get(id) ?? 0) > stale) continue;
      delete this.index.mimes[id];
      this.pending.delete(id);
      await rm(this.assetPath(id), { force: true });
    }
  }

  private async persist() {
    await mkdir(join(this.file, '..'), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.index));
    await rename(`${this.file}.tmp`, this.file);
  }
}
