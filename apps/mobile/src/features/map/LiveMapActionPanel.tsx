import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../ui/AppButton.tsx';
import { FactList } from '../../ui/FactList.tsx';
import { colors } from '../../ui/theme.ts';

import type { LiveGameplayGuideModel } from './live-gameplay-model.ts';

interface LiveMapActionPanelProps {
  model: LiveGameplayGuideModel;
}

export function LiveMapActionPanel(props: LiveMapActionPanelProps) {
  return (
    <View
      style={[
        styles.card,
        props.model.tone === 'success'
          ? styles.cardSuccess
          : props.model.tone === 'warning'
            ? styles.cardWarning
            : styles.cardInfo
      ]}
    >
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{props.model.badge}</Text>
        </View>
        <Text style={styles.title}>{props.model.title}</Text>
        <Text style={styles.copy}>{props.model.detail}</Text>
      </View>
      <FactList items={props.model.facts} />
      {props.model.actions.length > 0 ? (
        <View style={styles.actions}>
          {props.model.actions.map((action) => (
            <AppButton
              key={`${action.href}:${action.label}`}
              label={action.label}
              tone={action.tone}
              onPress={() => {
                router.push(action.href);
              }}
            />
          ))}
        </View>
      ) : null}
      {props.model.footnote ? <Text style={styles.helper}>{props.model.footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  cardInfo: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  cardSuccess: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success
  },
  cardWarning: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning
  },
  header: {
    gap: 6
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  copy: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  actions: {
    gap: 10
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
