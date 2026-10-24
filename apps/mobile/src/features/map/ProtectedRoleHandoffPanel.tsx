import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchProjection, SingleDeviceRevealResult, SingleDeviceRevealToken, VisiblePlayerProjection } from '../../../../../packages/shared-types/src/index.ts';
import { useAppShell } from '../../providers/AppShellProvider.tsx';
import { getBundledContentPackById } from '../../runtime/default-content-pack.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

function getPlayer(projection: MatchProjection | undefined, playerId: string | undefined) {
  return projection?.players.find((player) => player.playerId === playerId);
}

export function ProtectedRoleHandoffPanel() {
  const {
    state,
    armProtectedReveal,
    openProtectedReveal,
    hideProtectedReveal,
    listProtectedReveals
  } = useAppShell();
  const match = state.activeMatch;
  const projection = match?.projection;
  const contentPack = getBundledContentPackById(projection?.contentPackId);
  const isReferee = match?.runtimeKind === 'single_device_referee' && match.recipient.scope === 'host_admin';
  const players = projection?.players.filter((player) => player.role === 'hider' || player.role === 'seeker') ?? [];
  const [token, setToken] = useState<SingleDeviceRevealToken>();
  const [revealed, setRevealed] = useState<SingleDeviceRevealResult>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isReferee || !match?.matchId) return;
    let mounted = true;
    void listProtectedReveals().then((tokens) => {
      if (!mounted) return;
      const pending = tokens.find((candidate) => candidate.matchId === match.matchId && candidate.state !== 'hidden');
      if (pending?.state === 'revealed') {
        void hideProtectedReveal(pending.tokenId).then(() => {
          if (mounted) setToken(undefined);
        });
      } else {
        setToken(pending);
      }
      setRevealed(undefined);
    });
    return () => { mounted = false; };
  }, [hideProtectedReveal, isReferee, listProtectedReveals, match?.matchId]);

  if (!isReferee || players.length === 0) return null;

  const selectedPlayer = getPlayer(projection, token?.viewer.viewerPlayerId);
  const revealedPlayer = getPlayer(revealed?.projection, token?.viewer.viewerPlayerId);

  const beginHandoff = async (player: VisiblePlayerProjection) => {
    if (!player.role || !player.teamId) return;
    setBusy(true);
    const nextToken = await armProtectedReveal({
      scope: 'team_private',
      viewerPlayerId: player.playerId,
      viewerTeamId: player.teamId,
      viewerRole: player.role
    }, `Private handoff to ${player.displayName}`);
    setToken(nextToken);
    setBusy(false);
  };

  const revealRole = async () => {
    if (!token) return;
    setBusy(true);
    const result = await openProtectedReveal(token.tokenId);
    if (result) {
      setToken(result.token);
      setRevealed(result);
    }
    setBusy(false);
  };

  const returnToReferee = async () => {
    if (!token) return;
    setBusy(true);
    const hidden = await hideProtectedReveal(token.tokenId);
    if (hidden) {
      setToken(undefined);
      setRevealed(undefined);
    }
    setBusy(false);
  };

  if (revealed && token) {
    const hiddenLocation = revealed.projection.hiddenState?.hiderLocation;
    const teamCards = revealed.projection.visibleCards;
    return (
      <Panel title="Private team view" subtitle="Only show this screen to the current player. Pass the device back to the referee when you are done." tone="accent">
        <View style={styles.roleStamp}>
          <Text style={styles.roleName}>{revealedPlayer?.displayName ?? 'Player'}</Text>
          <Text style={styles.roleLabel}>{revealedPlayer?.role?.toUpperCase() ?? 'TEAM'} SIDE</Text>
        </View>
        <Text style={styles.detail}>Private cards in your view: {teamCards.length}</Text>
        {teamCards.map((card) => (
          <Text key={card.cardInstanceId} style={styles.cardName}>
            {contentPack.cards.find((definition) => definition.cardDefinitionId === card.cardDefinitionId)?.name ?? card.cardDefinitionId}
          </Text>
        ))}
        <Text style={styles.detail}>Investigation history visible: {revealed.projection.visibleQuestions.length}</Text>
        {hiddenLocation ? (
          <Text style={styles.detail}>Hider location: {hiddenLocation.latitude.toFixed(5)}, {hiddenLocation.longitude.toFixed(5)}</Text>
        ) : null}
        <AppButton label={busy ? 'Securing view…' : 'Pass device back to referee'} onPress={() => void returnToReferee()} disabled={busy} tone="primary" />
      </Panel>
    );
  }

  if (token) {
    return (
      <Panel title="Pass the device" subtitle="Hand the phone to the named player. Their side remains hidden until they open it." tone="accent">
        <Text style={styles.detail}>Next: {selectedPlayer?.displayName ?? 'the selected player'}</Text>
        <Text style={styles.helper}>Make sure the other team cannot see the screen before revealing private information.</Text>
        <AppButton label={busy ? 'Preparing private view…' : 'Reveal my team view'} onPress={() => void revealRole()} disabled={busy} tone="primary" />
        <AppButton label="Cancel handoff" onPress={() => void returnToReferee()} disabled={busy} tone="secondary" />
      </Panel>
    );
  }

  return (
    <Panel title="Private team handoff" subtitle="Pass the referee device privately so players can check their side's information." tone="soft">
      <View style={styles.playerList}>
        {players.map((player) => (
          <AppButton
            key={player.playerId}
            label={`Pass to ${player.displayName} · ${player.role}`}
            onPress={() => void beginHandoff(player)}
            disabled={busy}
            tone="secondary"
          />
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  playerList: { gap: 8 },
  roleStamp: { alignSelf: 'flex-start', backgroundColor: colors.signal, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  roleName: { color: colors.ink, fontSize: 23, fontWeight: '900' },
  roleLabel: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  detail: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  cardName: { backgroundColor: colors.surface, borderRadius: 10, color: colors.ink, fontSize: 13, fontWeight: '700', padding: 10 },
  helper: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }
});
