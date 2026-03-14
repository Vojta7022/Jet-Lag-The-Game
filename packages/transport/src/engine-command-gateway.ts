import type {
  CommandGateway,
  CommandGatewayContext,
  CommandSubmissionResult
} from '../../shared-types/src/index.ts';
import { EngineCommandError, executeCommand } from '../../engine/src/index.ts';

export class EngineCommandGateway implements CommandGateway {
  async submit(context: CommandGatewayContext): Promise<CommandSubmissionResult> {
    try {
      const result = executeCommand(context.aggregate, context.envelope, context.contentPack);

      return {
        accepted: true,
        matchId: context.envelope.matchId,
        commandId: context.envelope.commandId,
        aggregate: result.aggregate,
        aggregateRevision: result.aggregate.revision,
        events: result.events
      };
    } catch (error) {
      if (error instanceof EngineCommandError) {
        return {
          accepted: false,
          matchId: context.envelope.matchId,
          commandId: context.envelope.commandId,
          events: [],
          rejection: {
            code: error.issues[0]?.code ?? 'COMMAND_REJECTED',
            message: error.message,
            issues: error.issues
          }
        };
      }

      throw error;
    }
  }
}
