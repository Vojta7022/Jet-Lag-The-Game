import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import type { OnlineAuthSession } from '../../../../packages/shared-types/src/index.ts';

import type { MobileAppEnvironment } from '../config/env.ts';
import type { SessionProfileDraft } from './types.ts';

interface SupabaseMobileSessionSnapshot {
  authSessionId: string;
  authUserId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export class SupabaseMobileSessionManager {
  private readonly environment: MobileAppEnvironment;
  private client?: SupabaseClient;
  private cachedProfileKey?: string;
  private cachedSession?: SupabaseMobileSessionSnapshot;

  constructor(environment: MobileAppEnvironment) {
    this.environment = environment;
  }

  isConfigured(): boolean {
    return Boolean(this.environment.onlineProjectUrl && this.environment.onlineAnonKey);
  }

  async createOnlineAuthSession(profile: SessionProfileDraft): Promise<OnlineAuthSession> {
    const authenticated = this.isConfigured()
      ? await this.getOrCreateAnonymousSession(profile)
      : undefined;

    return {
      authProvider: 'supabase',
      authSessionId: authenticated?.authSessionId ?? `session:${profile.authUserId ?? profile.playerId}`,
      authUserId: authenticated?.authUserId ?? profile.authUserId ?? profile.playerId,
      defaultPlayerId: profile.playerId,
      accessToken: authenticated?.accessToken,
      refreshToken: authenticated?.refreshToken,
      expiresAt: authenticated?.expiresAt,
      memberships: []
    };
  }

  private async getOrCreateAnonymousSession(
    profile: SessionProfileDraft
  ): Promise<SupabaseMobileSessionSnapshot> {
    const profileKey = `${profile.playerId}:${profile.authUserId ?? profile.playerId}:${profile.displayName}`;
    if (this.cachedProfileKey === profileKey && this.cachedSession) {
      return this.cachedSession;
    }

    const client = this.getClient();
    if (this.cachedProfileKey && this.cachedProfileKey !== profileKey) {
      await client.auth.signOut().catch(() => undefined);
    }

    const signIn = await client.auth.signInAnonymously({
      options: {
        data: {
          requested_player_id: profile.playerId,
          requested_display_name: profile.displayName,
          local_auth_user_id: profile.authUserId ?? profile.playerId
        }
      }
    });

    if (signIn.error) {
      throw new Error(
        `Supabase anonymous sign-in failed. Enable anonymous auth for local/dev use or provide a backend session flow. ${signIn.error.message}`
      );
    }

    const session = signIn.data.session ?? (await client.auth.getSession()).data.session;
    if (!session) {
      throw new Error('Supabase anonymous sign-in did not return a usable session.');
    }

    this.cachedProfileKey = profileKey;
    this.cachedSession = mapSession(session);
    return this.cachedSession;
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      if (!this.environment.onlineProjectUrl || !this.environment.onlineAnonKey) {
        throw new Error('Supabase project URL and anon key are required before creating a mobile auth session.');
      }

      this.client = createClient(this.environment.onlineProjectUrl, this.environment.onlineAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: false,
          detectSessionInUrl: false
        }
      });
    }

    return this.client;
  }
}

function mapSession(session: Session): SupabaseMobileSessionSnapshot {
  return {
    authSessionId: session.access_token,
    authUserId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt:
      typeof session.expires_at === 'number'
        ? new Date(session.expires_at * 1000).toISOString()
        : undefined
  };
}
