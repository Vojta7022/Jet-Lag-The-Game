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
  const effectiveScope = runtimeKind === 'online_foundation' ? 'player_private' : requestedScope;

  return (
    <ScreenContainer
      title={runtimeKind === 'online_foundation' ? 'Join Online Match' : 'Join Match'}
      subtitle="Connect with the saved player profile, then continue in the match room and live map."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Join match failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Join Details"
        subtitle="Enter the match details for this connection mode."
      >
        <Field
          label={runtimeKind === 'nearby_host_authority' ? 'Match Code Or ID' : 'Match Code'}
          value={matchId}
          onChangeText={setMatchId}
          placeholder={runtimeKind === 'nearby_host_authority' ? 'Optional when join code is known' : 'match-1'}
        />
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
            title="Online player identity"
            detail="Online join uses the saved player profile from Home and reconnects with your personal player view on this device."
          />
        ) : null}
        <AppButton
          label={state.loadState === 'loading' ? 'Joining...' : 'Join Match'}
          disabled={state.loadState === 'loading'}
          onPress={() => {
            void joinMatch({
              matchId: matchId.trim() || undefined,
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
