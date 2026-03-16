import { router } from 'expo-router';
import { useState } from 'react';

import { mobileAppEnvironment } from '../config/env.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { useRuntimeMode } from '../providers/RuntimeModeProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

export function JoinMatchScreen() {
  const { state, joinMatch } = useAppShell();
  const { runtimeKind } = useRuntimeMode();
  const [matchId, setMatchId] = useState(state.activeMatch?.matchId ?? '');
  const [joinCode, setJoinCode] = useState(state.activeMatch?.joinCode ?? '');
  const [joinToken, setJoinToken] = useState('');
  const [requestedScope, setRequestedScope] = useState<'public_match' | 'player_private' | 'team_private'>('player_private');
  const effectiveScope = runtimeKind === 'online_foundation' ? 'player_private' : requestedScope;

  return (
    <ScreenContainer
      title={runtimeKind === 'online_foundation' ? 'Join Online Match' : 'Join Match'}
      eyebrow="Pregame"
      subtitle="Join with your display name, then continue into Match Room and Map Setup."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Join match failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Join Details"
        subtitle={runtimeKind === 'online_foundation'
          ? 'Enter the short join code from the host. Players can use the same display name without blocking each other.'
          : 'Enter the match details for this connection mode.'}
        tone="accent"
      >
        {runtimeKind === 'online_foundation' ? (
          <Field
            label="Join Code"
            value={joinCode}
            onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="AB12CD"
            autoCapitalize="characters"
          />
        ) : (
          <Field
            label={runtimeKind === 'nearby_host_authority' ? 'Match Code Or ID' : 'Match Code'}
            value={matchId}
            onChangeText={setMatchId}
            placeholder={runtimeKind === 'nearby_host_authority' ? 'Optional when join code is known' : 'match-1'}
          />
        )}
        {runtimeKind === 'nearby_host_authority' ? (
          <>
            <Field
              label="Connection View"
              value={requestedScope}
              onChangeText={(value) => setRequestedScope(value as typeof requestedScope)}
              placeholder="player_private"
            />
            <Field label="Join Code" value={joinCode} onChangeText={setJoinCode} placeholder="ABC123" />
            <Field label="QR Join Token" value={joinToken} onChangeText={setJoinToken} placeholder="Optional join token" />
          </>
        ) : null}
        {runtimeKind === 'online_foundation' ? (
          <StateBanner
            tone="info"
            title="Display names stay simple"
            detail="This device uses its own private player identity automatically, so matching visible names do not cause duplicate-player errors."
          />
        ) : null}
        {runtimeKind === 'online_foundation' && mobileAppEnvironment.enableDeveloperTools ? (
          <Field
            label="Advanced Match ID"
            value={matchId}
            onChangeText={setMatchId}
            placeholder="Only needed for debugging"
          />
        ) : null}
        <AppButton
          label={state.loadState === 'loading' ? 'Joining Match...' : 'Join Match Room'}
          disabled={state.loadState === 'loading'}
          onPress={() => {
            void joinMatch({
              matchId: runtimeKind === 'online_foundation'
                ? (mobileAppEnvironment.enableDeveloperTools ? matchId.trim() || undefined : undefined)
                : matchId.trim() || undefined,
              joinCode: joinCode.trim() || undefined,
              joinToken: joinToken.trim() || undefined,
              requestedScope: effectiveScope
            }).then((accepted) => {
              if (accepted) {
                router.replace('/lobby');
              }
            });
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}
