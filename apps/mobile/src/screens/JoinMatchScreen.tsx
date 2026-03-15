import { router } from 'expo-router';
import { useState } from 'react';

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
  const [joinCode, setJoinCode] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [requestedScope, setRequestedScope] = useState<'public_match' | 'player_private' | 'team_private'>('player_private');

  return (
    <ScreenContainer
      title="Join Match"
      subtitle="Connect to an existing match as a player or spectator through the current connection mode."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Join match failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Join Details"
        subtitle="Enter the match information needed for the current connection mode."
      >
        <Field
          label="Match Id"
          value={matchId}
          onChangeText={setMatchId}
          placeholder={runtimeKind === 'nearby_host_authority' ? 'Optional when join code is known' : 'match-1'}
        />
        <Field
          label="Requested Scope"
          value={requestedScope}
          onChangeText={(value) => setRequestedScope(value as typeof requestedScope)}
          placeholder="player_private"
        />
        {runtimeKind === 'nearby_host_authority' ? (
          <>
            <Field label="Join Code" value={joinCode} onChangeText={setJoinCode} placeholder="ABC123" />
            <Field label="QR Join Token" value={joinToken} onChangeText={setJoinToken} placeholder="Optional join token" />
          </>
        ) : null}
        <AppButton
          label={state.loadState === 'loading' ? 'Joining...' : 'Join Match'}
          disabled={state.loadState === 'loading'}
          onPress={() => {
            void joinMatch({
              matchId: matchId.trim() || undefined,
              joinCode: joinCode.trim() || undefined,
              joinToken: joinToken.trim() || undefined,
              requestedScope
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
