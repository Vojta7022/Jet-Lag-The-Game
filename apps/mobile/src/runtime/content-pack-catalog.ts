import type { ContentPack } from '../../../../packages/shared-types/src/index.ts';
import { validateContentPack } from '../../../../packages/content-import/src/validation.ts';

const MAX_CONTENT_PACK_BYTES = 5 * 1024 * 1024;

export interface ContentPackKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function referenceKey(pack: Pick<ContentPack, 'packId' | 'packVersion'>): string {
  return `${pack.packId}@${pack.packVersion}`;
}

function validateImportedPack(value: unknown): ContentPack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The file must contain one content pack JSON object.');
  }

  const pack = value as ContentPack;
  let issues;
  try {
    issues = validateContentPack(pack);
  } catch (error) {
    throw new Error(`Content pack has blocking validation issues: ${error instanceof Error ? error.message : 'invalid structure'}`);
  }
  const blockingIssues = issues.filter((issue) => issue.blocking || issue.severity === 'error');
  if (blockingIssues.length > 0) {
    throw new Error(`Content pack has blocking validation issues: ${blockingIssues.map((issue) => issue.message).join(' ')}`);
  }
  return pack;
}

export function parseContentPackJson(rawJson: string): ContentPack {
  if (new TextEncoder().encode(rawJson).byteLength > MAX_CONTENT_PACK_BYTES) {
    throw new Error('Content pack JSON must be smaller than 5 MB.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Choose a file containing valid JSON.');
  }
  return validateImportedPack(parsed);
}

export class ContentPackCatalog {
  private readonly storage: ContentPackKeyValueStorage;
  private readonly storageKey: string;

  constructor(storage: ContentPackKeyValueStorage, storageKey = 'jetlag:installed-content-packs:v1') {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  async load(): Promise<ContentPack[]> {
    const stored = await this.storage.getItem(this.storageKey);
    if (!stored) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      throw new Error('The saved content pack library is corrupt. Remove its local storage entry to recover.');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('The saved content pack library has an invalid format.');
    }

    const packs = parsed.map(validateImportedPack);
    const refs = new Set<string>();
    for (const pack of packs) {
      const key = referenceKey(pack);
      if (refs.has(key)) throw new Error(`The saved content pack library contains duplicate version ${key}.`);
      refs.add(key);
    }
    return packs;
  }

  async install(pack: ContentPack): Promise<void> {
    const validatedPack = validateImportedPack(pack);
    const current = await this.load();
    const key = referenceKey(validatedPack);
    const existing = current.find((candidate) => referenceKey(candidate) === key);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(validatedPack)) {
        throw new Error(`Content pack version ${key} is already installed with different contents. Increase packVersion before changing it.`);
      }
      return;
    }
    await this.storage.setItem(this.storageKey, JSON.stringify([...current, validatedPack]));
  }
}
