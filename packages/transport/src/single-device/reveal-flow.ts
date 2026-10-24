import { createRandomUuid } from '../../../shared-types/src/index.ts';

import type {
  MatchProjection,
  SingleDeviceRevealCheckpoint,
  SingleDeviceRevealFlowState,
  SingleDeviceRevealRequest,
  SingleDeviceRevealResult,
  SingleDeviceRevealToken,
  LocalRuntimePersistence
} from '../../../shared-types/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';

export class SingleDeviceRevealFlowManager {
  private readonly tokens = new Map<string, SingleDeviceRevealToken>();
  private readonly checkpoints = new Map<string, SingleDeviceRevealCheckpoint[]>();
  private readonly now: () => Date;
  private readonly persistence?: Pick<LocalRuntimePersistence, 'loadRevealFlowState' | 'saveRevealFlowState'>;
  private readonly ready: Promise<void>;

  constructor(
    now: () => Date = () => new Date(),
    persistence?: Pick<LocalRuntimePersistence, 'loadRevealFlowState' | 'saveRevealFlowState'>
  ) {
    this.now = now;
    this.persistence = persistence;
    this.ready = this.restoreState();
  }

  async armReveal(request: SingleDeviceRevealRequest): Promise<SingleDeviceRevealToken> {
    await this.ready;
    const active = [...this.tokens.values()].find((token) => token.matchId === request.matchId && token.state !== 'hidden');
    if (active) {
      throw new TransportRuntimeError(
        'REVEAL_ALREADY_ACTIVE',
        'Only one protected reveal may be active at a time on a single-device referee runtime.'
      );
    }

    const token: SingleDeviceRevealToken = {
      tokenId: `reveal:${createRandomUuid()}`,
      matchId: request.matchId,
      viewer: request.viewer,
      reason: request.reason,
      requiresPassback: request.requiresPassback ?? true,
      state: 'armed',
      createdAt: this.now().toISOString()
    };

    this.tokens.set(token.tokenId, token);
    this.appendCheckpoint(token.matchId, {
      checkpointId: `checkpoint:${createRandomUuid()}`,
      tokenId: token.tokenId,
      matchId: token.matchId,
      state: token.state,
      occurredAt: token.createdAt
    });
    await this.persistState();

    return token;
  }

  async openReveal(tokenId: string, projection: MatchProjection): Promise<SingleDeviceRevealResult> {
    await this.ready;
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new TransportRuntimeError('REVEAL_NOT_FOUND', 'The requested reveal token does not exist.');
    }

    if (token.state !== 'armed') {
      throw new TransportRuntimeError(
        'REVEAL_NOT_ARMED',
        'Protected reveals may only be opened once while armed.'
      );
    }

    const updated: SingleDeviceRevealToken = {
      ...token,
      state: 'revealed'
    };
    this.tokens.set(tokenId, updated);
    this.appendCheckpoint(updated.matchId, {
      checkpointId: `checkpoint:${createRandomUuid()}`,
      tokenId,
      matchId: updated.matchId,
      state: updated.state,
      occurredAt: this.now().toISOString()
    });
    await this.persistState();

    return {
      token: updated,
      projection
    };
  }

  async hideReveal(tokenId: string): Promise<SingleDeviceRevealToken> {
    await this.ready;
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new TransportRuntimeError('REVEAL_NOT_FOUND', 'The requested reveal token does not exist.');
    }

    if (token.state === 'hidden') {
      throw new TransportRuntimeError('REVEAL_ALREADY_HIDDEN', 'The reveal token is already hidden.');
    }

    const updated: SingleDeviceRevealToken = {
      ...token,
      state: 'hidden'
    };
    this.tokens.set(tokenId, updated);
    this.appendCheckpoint(updated.matchId, {
      checkpointId: `checkpoint:${createRandomUuid()}`,
      tokenId,
      matchId: updated.matchId,
      state: updated.state,
      occurredAt: this.now().toISOString()
    });
    await this.persistState();

    return updated;
  }

  async getRevealToken(tokenId: string): Promise<SingleDeviceRevealToken> {
    await this.ready;
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new TransportRuntimeError('REVEAL_NOT_FOUND', 'The requested reveal token does not exist.');
    }

    return token;
  }

  async listRevealTokens(matchId: string): Promise<SingleDeviceRevealToken[]> {
    await this.ready;
    return [...this.tokens.values()].filter((token) => token.matchId === matchId);
  }

  private async restoreState(): Promise<void> {
    const saved = await this.persistence?.loadRevealFlowState?.();
    if (!saved) return;

    for (const token of saved.tokens) {
      this.tokens.set(token.tokenId, token);
    }
    for (const checkpoint of saved.checkpoints) {
      const current = this.checkpoints.get(checkpoint.matchId) ?? [];
      this.checkpoints.set(checkpoint.matchId, [...current, checkpoint]);
    }

    const recoveredVisibleTokens = [...this.tokens.values()].filter((token) => token.state === 'revealed');
    for (const token of recoveredVisibleTokens) {
      const hidden = { ...token, state: 'hidden' as const };
      this.tokens.set(token.tokenId, hidden);
      this.appendCheckpoint(token.matchId, {
        checkpointId: `checkpoint:${createRandomUuid()}`,
        tokenId: token.tokenId,
        matchId: token.matchId,
        state: 'hidden',
        occurredAt: this.now().toISOString()
      });
    }
    if (recoveredVisibleTokens.length > 0) {
      await this.persistence?.saveRevealFlowState?.(this.getState());
    }
  }

  private getState(): SingleDeviceRevealFlowState {
    return {
      tokens: [...this.tokens.values()],
      checkpoints: [...this.checkpoints.values()].flat()
    };
  }

  private async persistState(): Promise<void> {
    await this.persistence?.saveRevealFlowState?.(this.getState());
  }

  private appendCheckpoint(matchId: string, checkpoint: SingleDeviceRevealCheckpoint): void {
    const current = this.checkpoints.get(matchId) ?? [];
    this.checkpoints.set(matchId, [...current, checkpoint]);
  }
}
