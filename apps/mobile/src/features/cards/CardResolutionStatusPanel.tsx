import { StyleSheet, Text, View } from 'react-native';

import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { formatAutomationLevel } from './card-catalog.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface CardResolutionStatusPanelProps {
  activeCard?: ResolvedVisibleCardModel;
  disabled?: boolean;
  canResolve: boolean;
  onResolve: () => void;
}

export function CardResolutionStatusPanel(props: CardResolutionStatusPanelProps) {
  return (
    <View style={styles.container}>
      {!props.activeCard ? (
        <Text style={styles.copy}>
          No card-resolution window is open. Manual and assisted cards will surface here when a play opens a lock window.
        </Text>
      ) : (
        <>
          <Text style={styles.title}>Active Card Window</Text>
          <Text style={styles.copy}>{props.activeCard.definition.name}</Text>
          <Text style={styles.copy}>
            {formatAutomationLevel(props.activeCard.definition.automationLevel)} effect currently locks the card window.
          </Text>
          <Text style={styles.copy}>
            The app does not fake unresolved effects. Review the card text, handle the outcome manually or with referee assistance, then close the window.
          </Text>
          <AppButton
            label="Close Resolution Window"
            onPress={props.onResolve}
            disabled={!props.canResolve || props.disabled}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
