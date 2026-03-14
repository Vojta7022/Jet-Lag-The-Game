import type {
  MatchProjection,
  ProjectionViewer
} from '../projections/match-projection.ts';

export interface SingleDeviceRevealRequest {
  matchId: string;
  viewer: ProjectionViewer;
  reason: string;
  requiresPassback?: boolean;
}

export interface SingleDeviceRevealToken {
  tokenId: string;
  matchId: string;
  viewer: ProjectionViewer;
  reason: string;
  requiresPassback: boolean;
  state: 'armed' | 'revealed' | 'hidden';
  createdAt: string;
}

export interface SingleDeviceRevealCheckpoint {
  checkpointId: string;
  tokenId: string;
  matchId: string;
  state: SingleDeviceRevealToken['state'];
  occurredAt: string;
}

export interface SingleDeviceRevealResult {
  token: SingleDeviceRevealToken;
  projection: MatchProjection;
}
