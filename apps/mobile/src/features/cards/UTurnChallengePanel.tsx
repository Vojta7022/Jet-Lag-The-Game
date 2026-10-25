import { StyleSheet, Text, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

type SeekerPlayer = { playerId: string; displayName: string };

interface UTurnChallengePanelProps {
  challenge?: MatchProjection['uTurnChallenge'];
  players: SeekerPlayer[];
  viewerRole?: MatchRole;
  viewerPlayerId?: string;
  disabled?: boolean;
  onReport: (stationName: string, targetPlayerId?: string) => void;
}

export function UTurnChallengePanel(props: UTurnChallengePanelProps) {
  const challenge = props.challenge;
  if (!challenge) return null;
  const reported = challenge.disembarkedAtByPlayerId;
  const currentPlayerReported = Boolean(props.viewerPlayerId && reported[props.viewerPlayerId]);
  const allReported = challenge.requiredSeekerPlayerIds.every((playerId) => reported[playerId]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>U-TURN · NEXT STOP</Text>
      <Text style={styles.copy}>
        Seekers must leave their current transit mode at <Text style={styles.emphasis}>{challenge.nextStationName}</Text>.
        Another form of transit must serve that stop within {challenge.alternateTransitWindowMinutes} minutes.
      </Text>
      <View style={styles.statusList}>
        {challenge.requiredSeekerPlayerIds.map((playerId) => {
          const player = props.players.find((candidate) => candidate.playerId === playerId);
          return (
            <Text key={playerId} style={styles.status}>
              {player?.displayName ?? playerId}: {reported[playerId] ? 'disembarked · confirmed' : 'still needs to disembark'}
            </Text>
          );
        })}
      </View>
      {props.viewerRole === 'seeker' && !currentPlayerReported ? (
        <AppButton
          label={`I disembarked at ${challenge.nextStationName}`}
          tone="secondary"
          disabled={props.disabled}
          onPress={() => props.onReport(challenge.nextStationName)}
        />
      ) : null}
      {props.viewerRole === 'host' ? challenge.requiredSeekerPlayerIds.flatMap((playerId) => {
        if (reported[playerId]) return [];
        const player = props.players.find((candidate) => candidate.playerId === playerId);
        return [(
          <AppButton
            key={playerId}
            label={`Referee: confirm ${player?.displayName ?? 'seeker'} disembarked`}
            tone="secondary"
            disabled={props.disabled}
            onPress={() => props.onReport(challenge.nextStationName, playerId)}
          />
        )];
      }) : null}
      {allReported ? <Text style={styles.success}>All seekers have reported leaving transit at the agreed stop. Questions can resume.</Text> : null}
      <Text style={styles.note}>The hider confirms the next actual stop, wrong-way direction, and alternate-service window. Each seeker reports from their own phone after physically disembarking. Live route and timetable checks are not available in the app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 9, padding: 13, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19 },
  emphasis: { color: colors.text, fontWeight: '900' },
  statusList: { gap: 4, paddingTop: 4 },
  status: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  success: { color: colors.success, fontSize: 12, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }
});
