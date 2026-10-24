import type {
  CommandSubmissionResult,
  MatchMembershipRecord,
  OnlineCommandCommit,
  OnlineCommandCommitResult
} from '../../../shared-types/src/index.ts';
import { TransportRuntimeError } from '../errors.ts';
import type { OnlineAuthorityRepository } from './contracts.ts';

function membershipKey(matchId: string, authUserId: string) {
  return `${matchId}:${authUserId}`;
}

function idempotencyKey(matchId: string, commandKey: string) {
  return `${matchId}:${commandKey}`;
}

export class InMemoryOnlineAuthorityRepository implements OnlineAuthorityRepository {
  private readonly matches = new Map<string, OnlineCommandCommit['match']>();
  private readonly eventsByMatch = new Map<string, OnlineCommandCommit['events']>();
  private readonly commitsByIdempotencyKey = new Map<string, {
    commandId: string;
    committedRevision: number;
    result: CommandSubmissionResult;
  }>();
  private readonly memberships = new Map<string, MatchMembershipRecord>();

  async commit(input: OnlineCommandCommit): Promise<OnlineCommandCommitResult> {
    const replay = this.commitsByIdempotencyKey.get(idempotencyKey(input.matchId, input.idempotencyKey));
    if (replay) {
      if (replay.commandId !== input.commandId) {
        throw new TransportRuntimeError(
          'IDEMPOTENCY_KEY_REUSE',
          'An idempotency key cannot be reused for a different online command.'
        );
      }

      return {
        status: 'duplicate',
        committedRevision: replay.committedRevision,
        result: replay.result
      };
    }

    const previousMatch = this.matches.get(input.matchId);
    const currentRevision = previousMatch?.revision ?? null;
    if (currentRevision !== input.expectedRevision) {
      return { status: 'revision_conflict', currentRevision };
    }

    const previousSequence = previousMatch?.revision ?? 0;
    if (
      !input.result.accepted ||
      input.result.matchId !== input.matchId ||
      input.result.commandId !== input.commandId ||
      input.match.matchId !== input.matchId ||
      input.snapshot.matchId !== input.matchId ||
      input.snapshot.snapshotVersion !== input.match.revision ||
      input.snapshot.lastEventSequence !== input.match.revision ||
      input.match.revision <= previousSequence ||
      input.events.length === 0
    ) {
      throw new TransportRuntimeError(
        'INVALID_ATOMIC_COMMIT',
        'The online command result, match revision, snapshot, or event batch is inconsistent.'
      );
    }

    let expectedSequence = previousSequence + 1;
    for (const event of input.events) {
      if (event.matchId !== input.matchId || event.sequence !== expectedSequence) {
        throw new TransportRuntimeError(
          'INVALID_ATOMIC_COMMIT',
          'Online event batches must belong to the match and have contiguous sequence numbers.'
        );
      }
      expectedSequence += 1;
    }

    if (expectedSequence - 1 !== input.match.revision) {
      throw new TransportRuntimeError(
        'INVALID_ATOMIC_COMMIT',
        'The committed match revision must equal the last event sequence.'
      );
    }

    for (const projection of input.projections) {
      if (
        projection.matchId !== input.matchId ||
        projection.snapshotVersion !== input.match.revision ||
        projection.lastEventSequence !== input.match.revision
      ) {
        throw new TransportRuntimeError(
          'INVALID_ATOMIC_COMMIT',
          'Every committed projection must match the new match revision.'
        );
      }
    }

    const existingEvents = this.eventsByMatch.get(input.matchId) ?? [];
    const clientSafeResult: CommandSubmissionResult = {
      accepted: true,
      matchId: input.matchId,
      commandId: input.commandId,
      aggregateRevision: input.match.revision,
      events: []
    };
    this.matches.set(input.matchId, input.match);
    this.eventsByMatch.set(input.matchId, [...existingEvents, ...input.events]);
    this.commitsByIdempotencyKey.set(idempotencyKey(input.matchId, input.idempotencyKey), {
      commandId: input.commandId,
      committedRevision: input.match.revision,
      result: clientSafeResult
    });
    return {
      status: 'committed',
      committedRevision: input.match.revision,
      result: clientSafeResult
    };
  }

  async findMembership(matchId: string, authUserId: string): Promise<MatchMembershipRecord | undefined> {
    return this.memberships.get(membershipKey(matchId, authUserId));
  }

  async findIdempotentResult(
    matchId: string,
    commandKey: string,
    commandId: string
  ): Promise<CommandSubmissionResult | undefined> {
    const replay = this.commitsByIdempotencyKey.get(idempotencyKey(matchId, commandKey));
    if (!replay) return undefined;
    if (replay.commandId !== commandId) {
      throw new TransportRuntimeError(
        'IDEMPOTENCY_KEY_REUSE',
        'An idempotency key cannot be reused for a different online command.'
      );
    }
    return replay.result;
  }

  async bindMembership(record: MatchMembershipRecord): Promise<void> {
    const existingByAuth = this.memberships.get(membershipKey(record.matchId, record.authUserId));
    if (existingByAuth) {
      if (existingByAuth.playerId === record.playerId && existingByAuth.status === 'active') {
        return;
      }
      throw new TransportRuntimeError(
        'PLAYER_ALREADY_JOINED',
        'This authenticated user is already bound to another player in the match.'
      );
    }

    const existingByPlayer = [...this.memberships.values()].find(
      (membership) => membership.matchId === record.matchId && membership.playerId === record.playerId && membership.status === 'active'
    );
    if (existingByPlayer) {
      throw new TransportRuntimeError(
        'PLAYER_ID_ALREADY_BOUND',
        'This player identity is already bound to another authenticated user in the match.'
      );
    }

    this.memberships.set(membershipKey(record.matchId, record.authUserId), record);
  }
}
