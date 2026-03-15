import type { ContentPack } from '../../../../packages/shared-types/src/index.ts';
import defaultContentPackJson from '../../../../samples/generated/jet-lag-the-game.content-pack.json';

import { ensureMobileShellContentPack } from './augment-content-pack.ts';

export const defaultContentPack = ensureMobileShellContentPack(defaultContentPackJson as ContentPack);
