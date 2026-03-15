import { router } from 'expo-router';
import { Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

function HostDashboardPlaceholder() {
  return (
    <Panel
      title="Host View"
      subtitle="Guide the match through setup and use referee tools when the current stage needs host action."
    >
      <Text>Open map setup to define the playable region, keep the lobby aligned, and use referee tools for pause, recovery, and inspection.</Text>
      <AppButton label="Referee Tools" onPress={() => router.push('/admin')} tone="secondary" />
    </Panel>
  );
}

function HiderDashboardPlaceholder() {
  return (
    <Panel
      title="Hider View"
      subtitle="Focus on private hand management, answers, and team coordination."
    >
      <Text>Use Cards for visible hand state, Questions to answer seeker prompts, and Chat for private or public coordination. Protected hider-specific movement UX is still pending.</Text>
      <AppButton label="Cards" onPress={() => router.push('/cards')} />
      <AppButton label="Questions" onPress={() => router.push('/questions')} tone="secondary" />
    </Panel>
  );
}

function SeekerDashboardPlaceholder() {
  return (
    <Panel
      title="Seeker View"
      subtitle="Track visible movement, ask questions, and work from the bounded search area."
    >
      <Text>Use Movement for visible seeker trails, Questions to narrow the search area, and Chat for coordination. Seeker deck content will grow with future content packs.</Text>
      <AppButton label="Movement" onPress={() => router.push('/movement')} />
      <AppButton label="Questions" onPress={() => router.push('/questions')} tone="secondary" />
    </Panel>
  );
}

function SpectatorDashboardPlaceholder() {
  return (
    <Panel
      title="Spectator View"
      subtitle="Stay on public information without crossing private match boundaries."
    >
      <Text>Spectators can review public match state, visible chat channels, and connection status, but private hands, hidden locations, and referee controls stay out of scope.</Text>
      <AppButton label="Status" onPress={() => router.push('/status')} tone="secondary" />
    </Panel>
  );
}

export function RoleDashboardScreen() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;

  if (!activeMatch) {
    return (
      <ScreenContainer
        title="Role"
        subtitle="Your role summary appears once a match is connected."
        topSlot={<ProductNavBar current="dashboard" />}
      >
        <StateBanner tone="warning" title="No active match" detail="Join or create a match first." />
      </ScreenContainer>
    );
  }

  const role = activeMatch.playerRole ?? activeMatch.recipient.role ?? 'spectator';

  return (
    <ScreenContainer
      title="Role"
      subtitle={`A role-focused overview for the current ${role} view.`}
      topSlot={<ProductNavBar current="dashboard" />}
    >
      <Panel
        title="Current View"
        subtitle="The dashboard follows the active match scope and only shows what the current role is allowed to access."
      >
        <FactList
          items={[
            { label: 'Role', value: role },
            { label: 'Scope', value: activeMatch.recipient.scope },
            { label: 'Stage', value: activeMatch.projection.lifecycleState }
          ]}
        />
      </Panel>
      {role === 'host' ? <HostDashboardPlaceholder /> : null}
      {role === 'hider' ? <HiderDashboardPlaceholder /> : null}
      {role === 'seeker' ? <SeekerDashboardPlaceholder /> : null}
      {role === 'spectator' ? <SpectatorDashboardPlaceholder /> : null}
      <Panel
        title="Available Tools"
        subtitle="Map, questions, cards, chat, movement, and referee tools are all connected to the same runtime and projection model."
      >
        <Text>Live uploads, richer role-specific guidance, and deeper automation are still in progress, but the current screens already use the real transport and engine contracts.</Text>
      </Panel>
    </ScreenContainer>
  );
}
