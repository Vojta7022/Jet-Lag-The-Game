import type {
  DomainCommand,
  MatchProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { buildQuestionFlowBootstrapCommands } from '../questions/question-flow-bootstrap.ts';

export function buildCardFlowBootstrapCommands(
  projection: MatchProjection
): DomainCommand[] {
  return buildQuestionFlowBootstrapCommands(projection);
}
