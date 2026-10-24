import type { ContentPack } from '../../../../packages/shared-types/src/index.ts';
import type { ImportIssue } from '../../../../packages/shared-types/src/index.ts';
import defaultContentPackJson from '../../../../samples/generated/jet-lag-the-game.content-pack.json';
import { validateContentPack } from '../../../../packages/content-import/src/validation.ts';

export const defaultContentPack = defaultContentPackJson as ContentPack;

/** Add new, locally installed versioned packs here; matches remain pinned to their selected pack ID. */
export const bundledContentPacks: ContentPack[] = [defaultContentPack];

export function getBundledContentPackById(packId: string | undefined): ContentPack {
  if (!packId) return defaultContentPack;
  const pack = bundledContentPacks.find((candidate) => candidate.packId === packId);
  if (!pack) throw new Error(`This match uses content pack "${packId}", which is not installed on this device.`);
  return pack;
}

export function getBundledContentPackValidationIssues(pack: ContentPack): ImportIssue[] {
  return validateContentPack(pack);
}
