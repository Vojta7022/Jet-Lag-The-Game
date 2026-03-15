import { StyleSheet, Text, View } from 'react-native';

import type { AdminControlAction, AdminControlModel } from './admin-debug-state.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

interface AdminControlPanelProps {
  controls: AdminControlModel[];
  onAction: (action: AdminControlAction) => void;
}

export function AdminControlPanel(props: AdminControlPanelProps) {
  return (
    <Panel title="Admin Controls">
      {props.controls.map((control) => (
        <View key={control.action} style={styles.controlCard}>
          <View style={styles.copy}>
            <Text style={styles.title}>{control.label}</Text>
            <Text style={styles.description}>{control.description}</Text>
            <Text style={[styles.status, !control.wired ? styles.statusPending : null]}>
              {control.wired ? 'Wired to current engine/runtime contracts.' : 'Not wired yet.'}
            </Text>
            {control.disabledReason ? <Text style={styles.disabledReason}>{control.disabledReason}</Text> : null}
          </View>
          <AppButton
            label={control.label}
            onPress={() => {
              props.onAction(control.action);
            }}
            disabled={!control.enabled}
            tone={control.tone}
          />
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  controlCard: {
    gap: 10,
    paddingBottom: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  copy: {
    gap: 4
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  status: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700'
  },
  statusPending: {
    color: colors.warning
  },
  disabledReason: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 17
  }
});
