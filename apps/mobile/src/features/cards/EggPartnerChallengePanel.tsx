import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

type PlayerRow = { playerId: string; displayName: string };
const EGG_MEMBER_ID = 'egg-partner:egg';

interface EggPartnerChallengePanelProps {
  challenge?: MatchProjection['eggPartnerChallenge'];
  players: PlayerRow[];
  viewerRole?: MatchRole;
  viewerPlayerId?: string;
  disabled?: boolean;
  onAcquire: () => void;
  onReportLost: (memberId: string, lossKind: 'abandoned' | 'cracked') => void;
}

export function EggPartnerChallengePanel(props: EggPartnerChallengePanelProps) {
  const [selectedMemberId, setSelectedMemberId] = useState(EGG_MEMBER_ID);
  const challenge = props.challenge;
  if (!challenge) return null;

  const eggStatus = challenge.statusByMemberId[EGG_MEMBER_ID];
  const eggAcquired = Boolean(challenge.eggAcquiredAt);
  const eggLost = Boolean(eggStatus?.lossKind);
  const firstLostMember = Object.entries(challenge.statusByMemberId).find(([, status]) => status.lossKind);
  const canReferee = props.viewerRole === 'host';
  const canAcquire = canReferee || props.viewerRole === 'seeker';
  const canReportEgg = canReferee || props.viewerRole === 'seeker';
  const selectedIsEgg = selectedMemberId === EGG_MEMBER_ID;
  const selectedStatus = challenge.statusByMemberId[selectedMemberId];
  const canReportSelected = !challenge.bonusAwardedAt && (selectedIsEgg ? eggAcquired && !eggLost : !selectedStatus?.lossKind);
  const selectedLabel = selectedIsEgg ? 'the egg' : props.players.find((player) => player.playerId === selectedMemberId)?.displayName ?? 'seeker';

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>EGG PARTNER</Text>
      <Text style={styles.copy}>{eggAcquired ? 'The seeker team has acquired the egg. It counts as a team member for curses that apply to every seeker.' : 'Seekers must acquire a real egg before asking their next question.'}</Text>
      <Text style={styles.copy}>{challenge.bonusAwardedAt ? `${firstLostMember?.[0] === EGG_MEMBER_ID ? 'The egg' : props.players.find((player) => player.playerId === firstLostMember?.[0])?.displayName ?? 'A seeker'} was reported ${firstLostMember?.[1].lossKind}. The hider received the ${challenge.hiderBonusMinutes}-minute bonus.` : `If a seeker or the egg is abandoned or lost before the run ends, the hider receives ${challenge.hiderBonusMinutes} extra minutes. The egg must be real; any visible crack counts as lost.`}</Text>
      {!eggAcquired && canAcquire ? (
        <AppButton label="Confirm the team acquired an egg" disabled={props.disabled} onPress={props.onAcquire} />
      ) : null}
      {props.viewerRole === 'seeker' && props.viewerPlayerId && !challenge.bonusAwardedAt && !challenge.statusByMemberId[props.viewerPlayerId]?.lossKind ? (
        <AppButton label="Report that I left the seeker team" tone="secondary" disabled={props.disabled} onPress={() => props.onReportLost(props.viewerPlayerId!, 'abandoned')} />
      ) : null}
      {canReportEgg && !challenge.bonusAwardedAt ? (
        <>
          {canReferee ? (
            <View style={styles.row}>
              {[{ playerId: EGG_MEMBER_ID, displayName: 'Egg' }, ...props.players].map((member) => (
                <Pressable key={member.playerId} onPress={() => setSelectedMemberId(member.playerId)} style={[styles.member, selectedMemberId === member.playerId ? styles.selected : null]}>
                  <Text style={styles.memberText}>{member.displayName}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {canReportSelected ? (
            <View style={styles.row}>
              {(selectedIsEgg ? ['cracked', 'abandoned'] as const : ['abandoned'] as const).map((lossKind) => (
                <AppButton key={lossKind} label={`Report ${selectedLabel} ${lossKind}`} tone="secondary" disabled={props.disabled || (!canReferee && !selectedIsEgg && selectedMemberId !== props.viewerPlayerId)} onPress={() => props.onReportLost(selectedMemberId, lossKind)} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <Text style={styles.note}>Egg acquisition and member loss are confirmed by players or the host referee.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  member: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  memberText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }
});
