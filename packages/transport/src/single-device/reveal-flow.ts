import { randomUUID } from 'node:crypto';

import type {
  MatchProjection,
  SingleDeviceRevealCheckpoint,
  SingleDeviceRevealRequest,
  SingleDeviceRevealResult,
  SingleDeviceRevealToken
} from '../../../shared-types/src/index.ts';

import { TransportRuntimeError } from '../errors.ts';

export class SingleDeviceRevealFlowManager {
  private readonly tokens = new Map<string, SingleDeviceRevealToken>();
  private readonly checkpoints = new Map<string, SingleDeviceRevealCheckpoint[]>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async armReveal(request: SingleDeviceRevealRequest): Promise<SingleDeviceRevealToken> {
    const active = [...this.tokens.values()].find((token) => token.matchId === request.matchId && token.state !== 'hidden');
    if (active) {
      throw new TransportRuntimeError(
        'REVEAL_ALREADY_ACTIVE',
        'Only one protected reveal may be active at a time on a single-device referee runtime.'
      );
    }

    const token: SingleDeviceRevealToken = {
      tokenId: `reveal:${randomUUID()}`,
      matchId: request.matchId,
      viewer: request.viewer,
      reason: request.reason,
      requiresPassback: request.requiresPassback ?? true,
      state: 'armed',
      createdAt: this.now().toISOString()
    };

    this.tokens.set(token.tokenId, token);
    this.appendCheckpoint(token.matchId, {
      checkpointId: `checkpoint:${randomUUID()}`,
      tokenId: token.tokenId,
      matchId: token.matchId,
      state: token.state,
      occurredAt: token.createdAt
    });

    return token;
  }

  async openReveal(tokenId: string, projection: MatchProjection): Promise<SingleDeviceRevealResult> {
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
      checkpointId: `checkpoint:${randomUUID()}`,
      tokenId,
      matchId: updated.matchId,
      state: updated.state,
      occurredAt: this.now().toISOString()
    });

    return {
      token: updated,
      projection
    };
  }

  async hideReveal(tokenId: string): Promise<SingleDeviceRevealToken> {
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
      checkpointId: `checkpoint:${randomUUID()}`,
      tokenId,
      matchId: updated.matchId,
      state: updated.state,
      occurredAt: this.now().toISOString()
    });

    return updated;
  }

  async getRevealToken(tokenId: string): Promise<SingleDeviceRevealToken> {
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new TransportRuntimeError('REVEAL_NOT_FOUND', 'The requested reveal token does not exist.');
    }

    return token;
  }

  async listRevealTokens(matchId: string): Promise<SingleDeviceRevealToken[]> {
    return [...this.tokens.values()].filter((token) => token.matchId === matchId);
  }

  private appendCheckpoint(matchId: string, checkpoint: SingleDeviceRevealCheckpoint): void {
    const current = this.checkpoints.get(matchId) ?? [];
    this.checkpoints.set(matchId, [...current, checkpoint]);
  }
}
