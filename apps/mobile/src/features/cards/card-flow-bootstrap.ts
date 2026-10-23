import type {
  DomainCommand,
  MatchProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { buildQuestionFlowBootstrapCommands } from '../questions/question-flow-bootstrap.ts';

export function buildCardFlowBootstrapCommands(
  projection: MatchProjection,
  options?: { preferredRegionId?: string; mode?: 'standard' | 'demo' }
): DomainCommand[] {
  return buildQuestionFlowBootstrapCommands(projection, options);
}
