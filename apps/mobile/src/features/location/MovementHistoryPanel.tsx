import { StyleSheet, Text, View } from 'react-native';

import type { MovementTrackViewModel } from './location-state.ts';

import { colors } from '../../ui/theme.ts';

export function MovementHistoryPanel(props: { tracks: MovementTrackViewModel[] }) {
  if (props.tracks.length === 0) {
    return (
      <Text style={styles.empty}>
        No visible seeker movement history is available in this scope yet.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {props.tracks.map((track) => (
        <View key={track.playerId} style={styles.card}>
          <Text style={styles.title}>{track.displayName}</Text>
          <Text style={styles.meta}>
            {track.role} • {track.sampleCount} sample{track.sampleCount === 1 ? '' : 's'}
          </Text>
          {track.latestSample ? (
            <Text style={styles.copy}>
              Latest: {track.latestSample.latitude.toFixed(4)}, {track.latestSample.longitude.toFixed(4)} at {track.latestSample.recordedAt}
            </Text>
          ) : null}
          <Text style={styles.copy}>
            Recent breadcrumbs: {track.recentSamples.map((sample) => sample.sampleId).join(', ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12
  },
  copy: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
