import type {
  SingleDeviceRevealRequest,
  SingleDeviceRevealResult,
  SingleDeviceRevealToken
} from '../../../shared-types/src/index.ts';

export interface ProtectedRevealFlowController {
  armReveal(request: SingleDeviceRevealRequest): Promise<SingleDeviceRevealToken>;
  openReveal(tokenId: string): Promise<SingleDeviceRevealResult>;
  hideReveal(tokenId: string): Promise<SingleDeviceRevealToken>;
  listRevealTokens(matchId: string): Promise<SingleDeviceRevealToken[]>;
}
