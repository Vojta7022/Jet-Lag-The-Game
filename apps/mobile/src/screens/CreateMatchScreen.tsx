import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { useRuntimeClient } from '../providers/RuntimeClientProvider.tsx';
import { useRuntimeMode } from '../providers/RuntimeModeProvider.tsx';
import { mobileAppEnvironment } from '../config/env.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';
import { GameArtwork } from '../ui/GameArtwork.tsx';
import { buildLobbyRouteForMatch } from '../navigation/map-scenario-handoff.ts';
import {
  defaultContentPack,
  getBundledContentPackValidationIssues
} from '../runtime/default-content-pack.ts';

const SCALE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' }
] as const;

export function CreateMatchScreen() {
  const routeParams = useLocalSearchParams<{ scenario?: string | string[] }>();
  const { state, createMatch, getInstalledContentPacks, importContentPackJson } = useAppShell();
  const runtimeClient = useRuntimeClient();
  const { runtimeKind } = useRuntimeMode();
  const [matchId, setMatchId] = useState(
    `${mobileAppEnvironment.defaultMatchPrefix}-${Date.now().toString(36)}`
  );
  const [initialScale, setInitialScale] = useState<
    'small' | 'medium' | 'large'
  >('small');
  const [contentPackReference, setContentPackReference] = useState(`${defaultContentPack.packId}@${defaultContentPack.packVersion}`);
  const [installingPack, setInstallingPack] = useState(false);
  const [packNotice, setPackNotice] = useState<{ tone: 'info' | 'error'; message: string }>();
  const contentPacks = getInstalledContentPacks();
  const selectedPack = contentPacks.find((pack) => `${pack.packId}@${pack.packVersion}` === contentPackReference)
    ?? runtimeClient.getContentPackByReference();

  const importPack = async () => {
    setInstallingPack(true);
    setPackNotice(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'text/plain'],
        multiple: false,
        copyToCacheDirectory: true
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('The selected file did not contain readable content.');
      if (asset.size !== undefined && asset.size > 5 * 1024 * 1024) {
        throw new Error('Content pack JSON must be smaller than 5 MB.');
      }
      const rawJson = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const pack = await importContentPackJson(rawJson);
      setContentPackReference(`${pack.packId}@${pack.packVersion}`);
      setPackNotice({ tone: 'info', message: `${pack.title} ${pack.packVersion} is installed on this device and ready for a new match.` });
    } catch (error) {
      setPackNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The content pack could not be installed.'
      });
    } finally {
      setInstallingPack(false);
    }
  };
  const matchMode =
    runtimeKind === 'online_foundation'
      ? 'online'
      : runtimeKind === 'nearby_host_authority'
        ? 'local_nearby'
        : 'single_device_referee';

  const runtimeHint = useMemo(() => {
    switch (runtimeKind) {
      case 'online_foundation':
        return 'This creates a shared online match. The saved player profile becomes the host for the current cloud session on this device.';
      case 'nearby_host_authority':
        return 'This creates a nearby host session on this device for local testing or in-person play.';
      case 'single_device_referee':
        return 'This creates a single-device referee session on this device.';
      case 'in_memory':
      default:
        return 'This local in-memory mode is mainly for quick testing without network or nearby transport.';
    }
  }, [runtimeKind]);

  return (
    <ScreenContainer
      title={
        runtimeKind === 'online_foundation'
          ? 'Create Online Match'
          : runtimeKind === 'single_device_referee'
            ? 'Plan your escape'
            : 'Create Match'
      }
      eyebrow="FIRST STOP · YOUR ADVENTURE"
      subtitle={
        runtimeKind === 'single_device_referee'
          ? 'Choose the scale of your adventure. Your crew and playing field come next.'
          : 'Create the room, share the join code, then move into teams and map setup.'
      }
    >
      {state.errorMessage ? (
        <StateBanner
          tone="error"
          title="Create match failed"
          detail={state.errorMessage}
        />
      ) : null}

      <View style={styles.routeArtwork}>
        <GameArtwork />
      </View>

      <Panel
        title="How far will you go?"
        subtitle={
          runtimeKind === 'online_foundation'
            ? 'Choose the room size, then create the room. A short join code appears right after creation.'
            : runtimeKind === 'single_device_referee'
              ? 'Pick a scale, then bring your crew together.'
              : 'Choose a match code and game size, then create the session.'
        }
        tone="accent"
      >
        {runtimeKind === 'online_foundation' ||
        runtimeKind === 'single_device_referee' ? null : (
          <Field
            label="Match Code"
            value={matchId}
            onChangeText={setMatchId}
            placeholder="prague-night-run"
          />
        )}
        <View style={styles.choiceGroup}>
          <Text style={styles.choiceLabel}>Game Size</Text>
          <View style={styles.choiceRow}>
            {SCALE_OPTIONS.map((option) => {
              const selected = option.value === initialScale;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setInitialScale(option.value)}
                  style={[
                    styles.choiceChip,
                    selected ? styles.choiceChipSelected : null
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipLabel,
                      selected ? styles.choiceChipLabelSelected : null
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.choiceDetail,
                      selected && styles.choiceDetailSelected
                    ]}
                  >
                    {option.value === 'small'
                      ? 'City sprint'
                      : option.value === 'medium'
                        ? 'Regional chase'
                        : 'Grand escape'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.choiceGroup}>
          <Text style={styles.choiceLabel}>Rules & Question Set</Text>
          <Text style={styles.packHint}>Import a versioned JSON game pack. Every player needs the same version installed.</Text>
          {contentPacks.map((pack) => {
            const packReference = `${pack.packId}@${pack.packVersion}`;
            const selected = packReference === contentPackReference;
            const issues = getBundledContentPackValidationIssues(pack);
            const blockingIssueCount = issues.filter((issue) => issue.blocking || issue.severity === 'error').length;
            return (
              <Pressable
                key={`${pack.packId}@${pack.packVersion}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setContentPackReference(packReference)}
                disabled={blockingIssueCount > 0}
                style={[styles.packOption, selected ? styles.packOptionSelected : null]}
              >
                <View style={styles.packText}>
                  <Text style={[styles.choiceChipLabel, selected ? styles.choiceChipLabelSelected : null]}>
                    {pack.title}
                  </Text>
                  <Text style={styles.packHint}>{pack.summary ?? 'Rules, questions, and reward cards.'}</Text>
                  <Text style={styles.packVersion}>
                    Version {pack.packVersion} · {pack.status} · {blockingIssueCount === 0 ? 'validated' : `${blockingIssueCount} blocking issues`}
                  </Text>
                </View>
                <Text style={styles.packCheck}>{selected ? '✓' : ''}</Text>
              </Pressable>
            );
          })}
          <AppButton
            label={installingPack ? 'Adding game pack…' : 'Add a game pack from file'}
            onPress={() => void importPack()}
            disabled={installingPack}
            tone="secondary"
          />
          {packNotice ? (
            <StateBanner
              tone={packNotice.tone}
              title={packNotice.tone === 'error' ? 'Pack not installed' : 'New game ready'}
              detail={packNotice.message}
            />
          ) : null}
        </View>
        {runtimeKind === 'online_foundation' ? (
          <StateBanner
            tone="info"
            title="Online shared match"
            detail="Each player can join from their own device. This is the main player-facing way to play."
          />
        ) : (
          <StateBanner
            tone="info"
            title={
              runtimeKind === 'single_device_referee'
                ? 'One device is the referee'
                : 'Local session'
            }
            detail={
              runtimeKind === 'single_device_referee'
                ? 'Keep this device with the referee to manage clues, cards, and the game clock.'
                : 'This local session is intended for development and testing.'
            }
          />
        )}
        {runtimeKind !== 'single_device_referee' ? (
          <Text>{runtimeHint}</Text>
        ) : null}
        <AppButton
          label={
            state.loadState === 'loading'
              ? 'Getting ready…'
              : 'Gather the crew  →'
          }
          disabled={state.loadState === 'loading'}
          onPress={() => {
            void createMatch({
              matchId: matchId.trim(),
              initialScale,
              contentPackId: selectedPack.packId,
              contentPackVersion: selectedPack.packVersion,
              matchMode
            }).then((accepted) => {
              if (accepted) {
                router.replace(buildLobbyRouteForMatch(routeParams.scenario));
              }
            });
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  routeArtwork: { height: 140, overflow: 'hidden', borderRadius: 12 },
  packOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  packOptionSelected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  packText: { flex: 1, gap: 3 },
  packHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  packVersion: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  packCheck: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  choiceDetail: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center'
  },
  choiceDetailSelected: { color: colors.ink },
  choiceGroup: {
    gap: 10
  },
  choiceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8
  },
  choiceChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  choiceChipSelected: {
    backgroundColor: colors.signal,
    borderColor: colors.ink
  },
  choiceChipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  choiceChipLabelSelected: {
    color: colors.ink
  }
});
