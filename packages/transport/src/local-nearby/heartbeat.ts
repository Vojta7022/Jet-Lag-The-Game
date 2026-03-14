import { randomUUID } from 'node:crypto';

import type { NearbyHeartbeatRecord } from '../../../shared-types/src/index.ts';

export function createHeartbeatRecord(
  matchId: string,
  hostSessionId: string,
  sequence: number,
  emittedAt: string
): NearbyHeartbeatRecord {
  return {
    heartbeatId: `heartbeat:${randomUUID()}`,
    matchId,
    hostSessionId,
    sequence,
    emittedAt
  };
}
