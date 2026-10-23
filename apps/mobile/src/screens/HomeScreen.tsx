import { router } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { RuntimeModeSwitcher } from '../components/RuntimeModeSwitcher.tsx';
import { mobileAppEnvironment } from '../config/env.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { GameArtwork } from '../ui/GameArtwork.tsx';
import { GameIcon } from '../ui/GameIcon.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors, fonts } from '../ui/theme.ts';

export function HomeScreen() {
  const { state, disconnectActiveMatch, selectRuntimeKind } = useAppShell();
  const [showOptions, setShowOptions] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const match = state.activeMatch;
  const busy = state.loadState === 'loading';
  const canManageMatch = canAccessHostControls(
    match?.playerRole ?? match?.recipient.role,
    match?.recipient.scope
  );
  const identityMismatch =
    match?.runtimeKind === 'online_foundation' &&
    (match.recipient.playerId !== state.sessionProfile.playerId ||
      match.recipient.actorId !==
        (state.sessionProfile.authUserId ?? state.sessionProfile.playerId));
  const continueRoute =
    match &&
    ['draft', 'lobby', 'role_assignment'].includes(
      match.projection.lifecycleState
    )
      ? '/lobby'
      : '/map';
  const startGame = () => {
    selectRuntimeKind('single_device_referee');
    router.push('/create-match');
  };

  return (
    <ScreenContainer title="Hide + Seek" hideHeader>
      <View style={styles.masthead}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <GameIcon name="map" color={colors.inkInverse} size={21} />
          </View>
          <View>
            <Text style={styles.brandName}>HIDE + SEEK</Text>
            <Text style={styles.brandCaption}>A CITY-SIZED ADVENTURE</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit player profile"
          onPress={() => router.push('/auth')}
          style={styles.profile}
        >
          <Text style={styles.avatar}>
            {state.sessionProfile.displayName.slice(0, 1).toUpperCase()}
          </Text>
          {width >= 370 ? <>
          <Text numberOfLines={1} style={styles.profileName}>
            {state.sessionProfile.displayName}
          </Text>
          </> : null}
        </Pressable>
      </View>
      {state.errorMessage ? (
        <StateBanner
          tone="error"
          title="Something needs your attention"
          detail={state.errorMessage}
        />
      ) : null}
      {identityMismatch ? (
        <StateBanner
          tone="warning"
          title="Reconnect to switch players"
          detail="This match is connected as your previous online player. Leave the game and reconnect to use your current profile."
        />
      ) : null}
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.heroCopy}>
          <View style={styles.edition}>
            <View style={styles.liveDot} />
            <Text style={styles.kicker}>THE REAL WORLD. YOUR PLAYGROUND.</Text>
          </View>
          <Text
            accessibilityRole="header"
            style={[
              styles.headline,
              width < 370 && { fontSize: 35, lineHeight: 40 },
              wide && styles.headlineWide
            ]}
          >
            Somewhere{`\n`}out there.
          </Text>
          <Text style={styles.intro}>
            One team hides. The others hunt. Turn your city into a game of
            clues, clever moves, and one very good hiding spot.
          </Text>
          <AppButton
            label={
              busy
                ? 'Unpacking your game…'
                : match
                  ? match.projection.visibleMap
                    ? 'Back to the hunt  →'
                    : 'Finish getting ready  →'
                  : 'Let’s play  →'
            }
            onPress={match ? () => router.push(continueRoute) : startGame}
            disabled={busy}
          />
          <Text style={styles.playNote}>
            One referee device. A whole city of possibilities.
          </Text>
        </View>
        <View style={[styles.artwork, wide && styles.artworkWide]}>
          <GameArtwork />
          <View style={styles.mapStamp}>
            <Text style={styles.stampText}>
              NO TWO GAMES{`\n`}TAKE THE SAME ROUTE.
            </Text>
          </View>
        </View>
      </View>
      {match ? (
        <View style={styles.ticket}>
          <View style={styles.ticketTop}>
            <Text style={styles.ticketEyebrow}>YOUR ADVENTURE IS WAITING</Text>
            <Text style={styles.ticketCode}>↗ RESUME</Text>
          </View>
          <Text style={styles.ticketTitle}>
            {match.projection.visibleMap?.displayName ??
              'Your next great escape'}
          </Text>
          <Text style={styles.ticketDetail}>
            {match.projection.lifecycleState.replace(/_/g, ' ')} ·{' '}
            {match.projection.players.length} players
          </Text>
          <View style={styles.perforation} />
          <Text style={styles.ticketDetail}>
            Saved on this device. Ready whenever you are.
          </Text>
        </View>
      ) : null}
      <View style={styles.routeGuide}>
        {[
          {
            n: '01',
            title: 'Pick your city',
            copy: 'Choose the boundary. Set the scene.',
            icon: 'map' as const
          },
          {
            n: '02',
            title: 'Hide & investigate',
            copy: 'Follow clues. Narrow the search.',
            icon: 'seeker' as const
          },
          {
            n: '03',
            title: 'Make the find',
            copy: 'Close in. Make the final call.',
            icon: 'hider' as const
          }
        ].map((step) => (
          <View key={step.n} style={[styles.guideStep, !wide && { flexBasis: '100%' }]}>
            <View style={styles.guideTop}>
              <Text style={styles.stepNumber}>{step.n}</Text>
              <GameIcon name={step.icon} size={22} />
            </View>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepCopy}>{step.copy}</Text>
          </View>
        ))}
      </View>
      <View style={styles.onlineSection}>
        <Text style={styles.sectionTitle}>Playing on separate phones?</Text>
        <Text style={styles.sectionCopy}>
          Bring your crew together in an online room.
        </Text>
        <View style={[styles.onlineActions, !wide && styles.actionsStack]}>
          <View style={styles.actionFlex}>
            <AppButton
              label="Create online room"
              tone="secondary"
              disabled={busy}
              onPress={() => {
                selectRuntimeKind('online_foundation');
                router.push('/create-match');
              }}
            />
          </View>
          <View style={styles.actionFlex}>
            <AppButton
              label="Join with a code"
              tone="secondary"
              disabled={busy}
              onPress={() => {
                selectRuntimeKind('online_foundation');
                router.push('/join-match');
              }}
            />
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showOptions }}
        onPress={() => setShowOptions(!showOptions)}
        style={styles.optionsToggle}
      >
        <Text style={styles.optionsLabel}>Game settings & tools</Text>
        <Text style={styles.optionsLabel}>{showOptions ? '−' : '+'}</Text>
      </Pressable>
      {showOptions ? (
        <View style={styles.options}>
          {match ? (
            <AppButton
              label="Start a new adventure"
              tone="secondary"
              onPress={startGame}
              disabled={busy}
            />
          ) : null}
          <AppButton
            label="Player profile"
            tone="secondary"
            onPress={() => router.push('/auth')}
          />
          {match ? (
            <>
              {canManageMatch ? (
                <AppButton
                  label="Match controls"
                  tone="secondary"
                  onPress={() => router.push('/status')}
                />
              ) : null}
              <AppButton
                label="Leave this game"
                tone="danger"
                onPress={() => {
                  void disconnectActiveMatch();
                }}
              />
            </>
          ) : null}
          {mobileAppEnvironment.enableDeveloperTools ? (
            <RuntimeModeSwitcher />
          ) : null}
        </View>
      ) : null}
      <Text style={styles.footer}>TAKE THE LONG WAY HOME.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 42,
    height: 42,
    backgroundColor: colors.ink,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-5deg' }]
  },
  brandName: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1
  },
  brandCaption: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginTop: 3
  },
  profile: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    minHeight: 44,
    maxWidth: 160
  },
  avatar: {
    backgroundColor: colors.accentMuted,
    color: colors.accentStrong,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden'
  },
  profileName: { color: colors.textMuted, fontSize: 12, flexShrink: 1 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  heroWide: { flexDirection: 'row', minHeight: 430 },
  heroCopy: { padding: 28, gap: 20, flex: 1 },
  edition: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.seeker
  },
  kicker: {
    fontFamily: fonts.mono,
    color: colors.accentStrong,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '700',
    flexShrink: 1
  },
  headline: {
    fontFamily: fonts.display,
    color: colors.ink,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -2,
    fontWeight: '700'
  },
  headlineWide: { fontSize: 64, lineHeight: 66 },
  intro: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 390
  },
  playNote: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  artwork: { height: 245, overflow: 'hidden', position: 'relative' },
  artworkWide: { flex: 1, height: '100%', minHeight: 430 },
  mapStamp: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    backgroundColor: colors.inkInverse,
    padding: 10,
    transform: [{ rotate: '-4deg' }],
    borderWidth: 1,
    borderColor: colors.ink
  },
  stampText: {
    fontFamily: fonts.mono,
    color: colors.ink,
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 1,
    fontWeight: '800'
  },
  ticket: {
    backgroundColor: colors.ink,
    padding: 24,
    borderRadius: 12,
    gap: 12
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap'
  },
  ticketEyebrow: {
    color: colors.signal,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5
  },
  ticketCode: {
    color: colors.inkInverse,
    fontFamily: fonts.mono,
    fontSize: 10
  },
  ticketTitle: {
    color: colors.inkInverse,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '700'
  },
  ticketDetail: { color: '#CADBD8', fontSize: 13, textTransform: 'capitalize' },
  perforation: {
    borderTopColor: '#627B85',
    borderTopWidth: 1,
    borderStyle: 'dashed',
    marginVertical: 8
  },
  routeGuide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    paddingVertical: 8
  },
  guideStep: { flexGrow: 1, flexBasis: 160, gap: 8 },
  guideTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    paddingBottom: 10
  },
  stepNumber: {
    fontFamily: fonts.mono,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800'
  },
  stepTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  stepCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  onlineSection: { gap: 10, paddingTop: 8 },
  sectionTitle: {
    fontFamily: fonts.display,
    color: colors.ink,
    fontSize: 25,
    fontWeight: '700'
  },
  sectionCopy: { color: colors.textMuted, fontSize: 14 },
  onlineActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  actionsStack: { flexDirection: 'column' },
  actionFlex: { flex: 1 },
  optionsToggle: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  optionsLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  options: { gap: 12 },
  footer: {
    fontFamily: fonts.mono,
    color: colors.textSubtle,
    fontSize: 9,
    letterSpacing: 3,
    textAlign: 'center',
    marginVertical: 12
  }
});
