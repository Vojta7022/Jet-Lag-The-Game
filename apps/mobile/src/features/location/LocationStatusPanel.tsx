import { StyleSheet, Text, View } from 'react-native';

import type { LocationShellState } from './location-state.ts';

import { colors } from '../../ui/theme.ts';
import { describeLocationPermissionState } from './location-state.ts';

export function LocationStatusPanel(props: {
  state: LocationShellState;
  viewerRole: string;
  canShare: boolean;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Viewer Role</Text>
        <Text style={styles.value}>{props.viewerRole}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Permission</Text>
        <Text style={styles.value}>{describeLocationPermissionState(props.state)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Availability</Text>
        <Text style={styles.value}>{props.state.availabilityState}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Sharing</Text>
        <Text style={styles.value}>{props.state.sharingState}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Frequency</Text>
        <Text style={styles.value}>{props.state.frequencyMode}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Eligible To Share</Text>
        <Text style={styles.value}>{props.canShare ? 'yes' : 'no'}</Text>
      </View>
      {props.state.lastDeviceSample ? (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Last Device Sample</Text>
            <Text style={styles.value}>
              {props.state.lastDeviceSample.latitude.toFixed(4)}, {props.state.lastDeviceSample.longitude.toFixed(4)}
            </Text>
          </View>
          <Text style={styles.copy}>Recorded at {props.state.lastDeviceSample.recordedAt}</Text>
        </>
      ) : null}
      {props.state.lastSubmittedAt ? (
        <Text style={styles.copy}>Last runtime submission: {props.state.lastSubmittedAt}</Text>
      ) : null}
      {props.state.errorMessage ? (
        <Text style={styles.error}>{props.state.errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18
  }
});
