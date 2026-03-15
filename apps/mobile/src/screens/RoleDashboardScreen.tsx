import { router } from 'expo-router';
import { Text } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

function HostDashboardPlaceholder() {
  return (
    <Panel title="Host Dashboard">
      <Text>Host controls will later cover role assignment, phase controls, overrides, and runtime admin tools.</Text>
      <AppButton label="Open Admin / Debug" onPress={() => router.push('/admin')} tone="secondary" />
    </Panel>
  );
}

function HiderDashboardPlaceholder() {
  return (
    <Panel title="Hider Dashboard">
      <Text>Use the Cards, Chat, and Question Center screens for the first hand-management and answer flows. Protected hider-specific location UX is still pending.</Text>
    </Panel>
  );
}

function SeekerDashboardPlaceholder() {
  return (
    <Panel title="Seeker Dashboard">
      <Text>Use the Movement screen for first-pass location sharing, the Question Center for questions, and the Cards screen for future seeker-eligible decks. Richer team coordination is still pending.</Text>
    </Panel>
  );
}

function SpectatorDashboardPlaceholder() {
  return (
    <Panel title="Spectator Dashboard">
      <Text>Spectator mode currently stays on public read-only data and transport status only.</Text>
    </Panel>
  );
}

export function RoleDashboardScreen() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;

  if (!activeMatch) {
    return (
      <ScreenContainer title="Role Dashboard" subtitle="Role-aware placeholders will appear after a match connection is active.">
        <StateBanner tone="warning" title="No active match" detail="Join or create a match first." />
      </ScreenContainer>
    );
  }

  const role = activeMatch.playerRole ?? activeMatch.recipient.role ?? 'spectator';

  return (
    <ScreenContainer
      title="Role Dashboard"
      subtitle={`Placeholder dashboard bound to the real projection scope for the current ${role} view.`}
    >
      <Panel title="Current Role">
        <Text>{role}</Text>
      </Panel>
      {role === 'host' ? <HostDashboardPlaceholder /> : null}
      {role === 'hider' ? <HiderDashboardPlaceholder /> : null}
      {role === 'seeker' ? <SeekerDashboardPlaceholder /> : null}
      {role === 'spectator' ? <SpectatorDashboardPlaceholder /> : null}
      <Panel title="Intentional Gaps">
        <Text>Map setup, movement, question flow, cards, and first-pass chat now work against the real runtime. Live uploads, richer admin tools, and polished role UX are still pending.</Text>
      </Panel>
    </ScreenContainer>
  );
}
