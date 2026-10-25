import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  CompleteImpressionableConsumerChallengeCommand,
  ImpressionableConsumerChallengeModel,
  ReviewImpressionableConsumerTargetCommand,
  SubmitImpressionableConsumerTargetCommand,
  VisibleMapProjection
} from '../../../../../packages/shared-types/src/index.ts';
import { MapCanvas } from '../map/MapCanvas';
import type { MapCoordinate } from '../map/map-geometry.ts';
import { useLocationSharing } from '../../providers/LocationSharingProvider.tsx';
import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

type Challenge = ImpressionableConsumerChallengeModel;

interface Props {
  challenge: Challenge;
  visibleMap?: VisibleMapProjection;
  players: Array<{ playerId: string; displayName: string }>;
  viewerRole?: string;
  viewerPlayerId?: string;
  disabled: boolean;
  onSubmitTarget: (payload: SubmitImpressionableConsumerTargetCommand['payload']) => void;
  onReview: (payload: ReviewImpressionableConsumerTargetCommand['payload']) => void;
  onComplete: (payload: CompleteImpressionableConsumerChallengeCommand['payload']) => void;
}

export function ImpressionableConsumerPanel(props: Props) {
  const [advertisementName, setAdvertisementName] = useState('');
  const [targetName, setTargetName] = useState('');
  const [advertisementCoordinate, setAdvertisementCoordinate] = useState<MapCoordinate>();
  const [targetCoordinate, setTargetCoordinate] = useState<MapCoordinate>();
  const [action, setAction] = useState<'enter_location' | 'buy_product_or_service'>('enter_location');
  const [outdoorsConfirmed, setOutdoorsConfirmed] = useState(false);
  const [businessConfirmed, setBusinessConfirmed] = useState(false);
  const [sendingLocation, setSendingLocation] = useState(false);
  const location = useLocationSharing();
  const challenge = props.challenge;
  const target = challenge.target;
  const ownVisitReported = Boolean(props.viewerPlayerId && challenge.completedAtByPlayerId[props.viewerPlayerId]);
  const canSubmit = Boolean(advertisementName.trim() && targetName.trim() && advertisementCoordinate && targetCoordinate && outdoorsConfirmed && businessConfirmed);

  const coordinateCopy = (coordinate?: MapCoordinate) => coordinate
    ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
    : 'Tap the map to place this pin.';

  return (
    <Panel title="Curse of the Impressionable Consumer" subtitle={`Find an outdoor ad at least ${challenge.minimumAdvertisementDistanceMeters} m from its advertised business.`} tone="accent">
      <Text style={styles.copy}>The seekers must visit a real advertised business before asking another question. The hider checks that the ad and destination qualify. Public places such as parks do not count as businesses.</Text>

      {target ? (
        <>
          <Text style={styles.sectionTitle}>Advertisement submitted</Text>
          <Text style={styles.copy}>{target.advertisementName} → {target.targetName}</Text>
          <Text style={styles.copy}>{target.action === 'enter_location' ? 'Seekers must enter the location.' : 'Seekers must buy and receive the advertised product or service.'}</Text>
          <Text style={styles.copy}>Ad pin: {coordinateCopy({ latitude: target.advertisementLatitude, longitude: target.advertisementLongitude })} · business pin: {coordinateCopy({ latitude: target.targetLatitude, longitude: target.targetLongitude })}</Text>
          <MapCanvas visibleMap={props.visibleMap} height={220} selectedCoordinate={{ latitude: target.advertisementLatitude, longitude: target.advertisementLongitude }} />
          <MapCanvas visibleMap={props.visibleMap} height={220} selectedCoordinate={{ latitude: target.targetLatitude, longitude: target.targetLongitude }} />
          {target.reviewApproved === undefined ? <Text style={styles.status}>Waiting for the hider to review this target.</Text> : target.reviewApproved ? <Text style={styles.status}>Approved by the hider. Each seeker must complete the visit from their own phone.</Text> : <Text style={styles.status}>The hider asked for another target. Submit a different qualifying ad and business.</Text>}
          {(props.viewerRole === 'hider' || props.viewerRole === 'host') && target.reviewApproved === undefined ? (
            <View style={styles.actions}>
              <AppButton label="Ask seekers to find another" tone="secondary" disabled={props.disabled} onPress={() => props.onReview({ sourceCardInstanceId: challenge.sourceCardInstanceId, approved: false })} />
              <AppButton label="Approve this ad and business" disabled={props.disabled} onPress={() => props.onReview({ sourceCardInstanceId: challenge.sourceCardInstanceId, approved: true })} />
            </View>
          ) : null}
        </>
      ) : null}

      {props.viewerRole === 'seeker' && (!target || target.reviewApproved === false) && !challenge.completedAt ? (
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Pin the ad and what it advertises</Text>
          <Field label="Advertisement" value={advertisementName} onChangeText={setAdvertisementName} placeholder="Example: a poster for a local café" autoCapitalize="sentences" />
          <Text style={styles.copy}>Advertisement pin: {coordinateCopy(advertisementCoordinate)}</Text>
          <MapCanvas visibleMap={props.visibleMap} height={240} selectable selectedCoordinate={advertisementCoordinate} onCoordinateSelect={setAdvertisementCoordinate} />
          <Field label="Advertised business or product" value={targetName} onChangeText={setTargetName} placeholder="Name the place, product, or service" autoCapitalize="sentences" />
          <Text style={styles.copy}>Business pin: {coordinateCopy(targetCoordinate)}</Text>
          <MapCanvas visibleMap={props.visibleMap} height={240} selectable selectedCoordinate={targetCoordinate} onCoordinateSelect={setTargetCoordinate} />
          <View style={styles.actions}>
            <AppButton label={action === 'enter_location' ? '✓ Enter the location' : 'Enter the location'} tone={action === 'enter_location' ? 'primary' : 'secondary'} onPress={() => setAction('enter_location')} />
            <AppButton label={action === 'buy_product_or_service' ? '✓ Buy the product or service' : 'Buy the product or service'} tone={action === 'buy_product_or_service' ? 'primary' : 'secondary'} onPress={() => setAction('buy_product_or_service')} />
          </View>
          <Attestation checked={outdoorsConfirmed} label="We found this advertisement outdoors, at least 30 m from what it advertises." onPress={() => setOutdoorsConfirmed((value) => !value)} />
          <Attestation checked={businessConfirmed} label="This is a real business or paid service, not a public place such as a park." onPress={() => setBusinessConfirmed((value) => !value)} />
          <AppButton label="Send target to hider" disabled={props.disabled || !canSubmit} onPress={() => {
            if (!advertisementCoordinate || !targetCoordinate) return;
            props.onSubmitTarget({
              sourceCardInstanceId: challenge.sourceCardInstanceId,
              advertisementName: advertisementName.trim(),
              advertisementLatitude: advertisementCoordinate.latitude,
              advertisementLongitude: advertisementCoordinate.longitude,
              advertisementOutdoorsAttested: true,
              targetName: targetName.trim(),
              targetLatitude: targetCoordinate.latitude,
              targetLongitude: targetCoordinate.longitude,
              action,
              targetIsBusinessAttested: true
            });
          }} />
        </View>
      ) : null}

      {target?.reviewApproved === true ? (
        <>
          {challenge.requiredSeekerPlayerIds.map((playerId) => {
            const player = props.players.find((candidate) => candidate.playerId === playerId);
            const reported = Boolean(challenge.completedAtByPlayerId[playerId]);
            return <Text key={playerId} style={styles.copy}>{player?.displayName ?? 'Seeker'}: {reported ? 'visit reported' : 'visit not yet reported'}</Text>;
          })}
          {props.viewerRole === 'seeker' && !ownVisitReported && !challenge.completedAt ? (
            <>
              <Text style={styles.copy}>{target.action === 'enter_location' ? 'Confirm after you have entered and gained admission, if required.' : 'Confirm only after you have bought and received the advertised product or service.'} Your phone must have a fresh location fix within 50 m of the business.</Text>
              {location.state.permissionState !== 'granted' ? <AppButton label="Allow location access" tone="secondary" disabled={sendingLocation} onPress={() => void location.requestForegroundPermission()} /> : null}
              <AppButton label={sendingLocation ? 'Checking your location…' : 'I completed the visit'} disabled={props.disabled || sendingLocation || location.state.permissionState !== 'granted'} onPress={() => {
                setSendingLocation(true);
                void location.sendSingleUpdate().then(() => props.onComplete({ sourceCardInstanceId: challenge.sourceCardInstanceId })).finally(() => setSendingLocation(false));
              }} />
            </>
          ) : null}
        </>
      ) : null}
      {challenge.completedAt ? <Text style={styles.status}>Challenge complete. The seekers can ask their next question.</Text> : null}
    </Panel>
  );
}

function Attestation(props: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: props.checked }} onPress={props.onPress} style={styles.attestation}>
      <View style={[styles.checkbox, props.checked ? styles.checkboxChecked : undefined]}><Text style={styles.check}>{props.checked ? '✓' : ''}</Text></View>
      <Text style={styles.copy}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
  attestation: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  checkbox: { alignItems: 'center', borderColor: colors.borderStrong, borderRadius: 6, borderWidth: 1, height: 24, justifyContent: 'center', width: 24 },
  checkboxChecked: { backgroundColor: colors.accentStrong, borderColor: colors.accentStrong },
  check: { color: colors.surface, fontWeight: '800' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  form: { gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  status: { color: colors.accentStrong, fontSize: 14, fontWeight: '800', lineHeight: 20 }
});
