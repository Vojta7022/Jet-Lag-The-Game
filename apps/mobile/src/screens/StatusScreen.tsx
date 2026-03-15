import { StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function StatusScreen() {
  const { state, clearError, refreshActiveMatch } = useAppShell();
  const activeMatch = state.activeMatch;

  return (
    <ScreenContainer
      title="Session Status"
      subtitle="Runtime and sync diagnostics for the app shell. Useful while transport adapters are still foundation-stage."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Shell Error" detail={state.errorMessage} />
      ) : null}

      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active transport session"
          detail="There is nothing to inspect yet because no match connection has been established."
        />
      ) : null}

      {activeMatch ? (
        <Panel title="Transport Status">
          <View style={styles.row}>
            <Text style={styles.label}>Runtime Foundation</Text>
            <Text style={styles.value}>{activeMatch.runtimeKind}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Runtime Mode</Text>
            <Text style={styles.value}>{activeMatch.runtimeMode}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Adapter Flavor</Text>
            <Text style={styles.value}>{activeMatch.transportFlavor}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Connection</Text>
            <Text style={styles.value}>{activeMatch.connectionState}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Snapshot Version</Text>
            <Text style={styles.value}>{String(activeMatch.snapshotVersion)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Last Event Sequence</Text>
            <Text style={styles.value}>{String(activeMatch.lastEventSequence)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Recipient Scope</Text>
            <Text style={styles.value}>{activeMatch.recipient.scope}</Text>
          </View>
          <AppButton
            label="Refresh Transport Snapshot"
            onPress={() => {
              void refreshActiveMatch();
            }}
          />
        </Panel>
      ) : null}

      {activeMatch?.joinOffer ? (
        <Panel title="Nearby Join Offer">
          <Text style={styles.value}>Join Code: {activeMatch.joinOffer.joinCode}</Text>
          <Text style={styles.copy}>QR payload token: {activeMatch.joinOffer.joinToken}</Text>
          <Text style={styles.copy}>Expires: {activeMatch.joinOffer.expiresAt}</Text>
        </Panel>
      ) : null}

      {state.errorMessage ? (
        <AppButton label="Dismiss Error" onPress={clearError} tone="secondary" />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
    textAlign: 'right'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
