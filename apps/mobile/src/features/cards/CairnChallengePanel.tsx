import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface CairnChallengePanelProps {
  challenge?: MatchProjection['cairnChallenge'];
  viewerRole?: MatchRole;
  disabled?: boolean;
  onBeginPlacement: () => void;
  onConfirmStable: () => void;
  onReportFallen: () => void;
}

export function CairnChallengePanel(props: CairnChallengePanelProps) {
  const challenge = props.challenge;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!challenge?.pendingRockStartedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [challenge?.pendingRockStartedAt]);
  if (!challenge) return null;
  const canReport = props.viewerRole === 'seeker' || props.viewerRole === 'host';
  const secondsRemaining = challenge.pendingRockStartedAt
    ? Math.max(0, Math.ceil((5_000 - (now - Date.parse(challenge.pendingRockStartedAt))) / 1_000))
    : 0;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>CAIRN · REBUILD THE TOWER</Text>
      {challenge.completedAt ? (
        <Text style={styles.success}>The seeker team matched the hider’s {challenge.targetHeight}-rock tower. Questions are unlocked.</Text>
      ) : (
        <>
          <Text style={styles.copy}>Build one shared seeker tower with {challenge.targetHeight} rocks. Each new rock must stand for five seconds before it counts and before another rock is added.</Text>
          <Text style={styles.progress}>Stable rocks: {challenge.seekerStableHeight} / {challenge.targetHeight} · failed builds: {challenge.attempts}</Text>
          {challenge.pendingRockStartedAt ? (
            <>
              <Text style={styles.timer}>{secondsRemaining > 0 ? `Hold steady · ${secondsRemaining}s` : 'Five seconds reached · confirm the rock is still standing'}</Text>
              {canReport ? <AppButton label="This rock stood for 5 seconds" disabled={props.disabled || secondsRemaining > 0} onPress={props.onConfirmStable} /> : null}
              {canReport ? <AppButton label="Tower fell · restart from zero" tone="secondary" disabled={props.disabled} onPress={props.onReportFallen} /> : null}
            </>
          ) : canReport ? (
            <View style={styles.actions}>
              <AppButton label="I placed the next rock · start 5 seconds" disabled={props.disabled} onPress={props.onBeginPlacement} />
              {challenge.seekerStableHeight > 0 ? <AppButton label="Tower fell · restart from zero" tone="secondary" disabled={props.disabled} onPress={props.onReportFallen} /> : null}
            </View>
          ) : <Text style={styles.helper}>A seeker records each placement and confirms its five-second stability.</Text>}
        </>
      )}
      <Text style={styles.helper}>Players judge whether rocks touch only one other rock and whether the tower remained standing. Rocks must come from nature; both teams disperse them when finished.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 9, padding: 13, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19 },
  progress: { color: colors.text, fontSize: 14, fontWeight: '800' },
  timer: { color: colors.warning, fontSize: 15, fontWeight: '900' },
  helper: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  success: { color: colors.success, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  actions: { gap: 7 }
});
