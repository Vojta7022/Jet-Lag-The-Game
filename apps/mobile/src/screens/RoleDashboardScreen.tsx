import { router } from 'expo-router';
import { Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

function formatRoleLabel(role: string) {
  switch (role) {
    case 'host':
      return 'Host';
    case 'hider':
      return 'Hider';
    case 'seeker':
      return 'Seeker';
    default:
      return 'Spectator';
  }
}

function formatStageLabel(lifecycleState: string, seekPhaseSubstate?: string) {
  return seekPhaseSubstate
    ? `${lifecycleState.replace(/_/g, ' ')} · ${seekPhaseSubstate.replace(/_/g, ' ')}`
    : lifecycleState.replace(/_/g, ' ');
}

function buildRoleCopy(role: string) {
  switch (role) {
    case 'host':
      return {
        title: 'Guide setup and keep the match moving',
        detail:
          'Use the live map to manage the playable region before play begins, then keep questions, pauses, and referee-only actions moving smoothly.',
        primaryAction: { label: 'Enter Game', href: '/map' },
        secondaryActions: [
          { label: 'Questions', href: '/questions' },
          { label: 'Deck', href: '/cards' },
          { label: 'Dice', href: '/dice' },
          { label: 'Referee Tools', href: '/admin' },
          { label: 'Chat', href: '/chat' }
        ]
      };
    case 'hider':
      return {
        title: 'Stay hidden and answer honestly',
        detail:
          'Your main flow is the live map, your private cards, and the question answers your team needs to keep the search area trustworthy.',
        primaryAction: { label: 'Enter Game', href: '/map' },
        secondaryActions: [
          { label: 'Deck', href: '/cards' },
          { label: 'Questions', href: '/questions' },
          { label: 'Dice', href: '/dice' },
          { label: 'Chat', href: '/chat' }
        ]
      };
    case 'seeker':
      return {
        title: 'Track the search and narrow the map',
        detail:
          'Your main flow is the live map, question asking, and team coordination while visible movement and clues update the search area.',
        primaryAction: { label: 'Enter Game', href: '/map' },
        secondaryActions: [
          { label: 'Questions', href: '/questions' },
          { label: 'Dice', href: '/dice' },
          { label: 'Movement', href: '/movement' },
          { label: 'Chat', href: '/chat' }
        ]
      };
    default:
      return {
        title: 'Follow the match from the public view',
        detail:
          'You can stay with the live map and public chat without crossing private team or hidden-information boundaries.',
        primaryAction: { label: 'Enter Game', href: '/map' },
        secondaryActions: [
          { label: 'Chat', href: '/chat' },
          { label: 'Match Room', href: '/lobby' }
        ]
      };
  }
}

export function RoleDashboardScreen() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;

  if (!activeMatch) {
    return (
      <ScreenContainer
        title="Team"
        subtitle="Your team view appears once a match is connected."
        topSlot={<ProductNavBar current="dashboard" />}
      >
        <StateBanner tone="warning" title="No active match" detail="Join or create a match first." />
      </ScreenContainer>
    );
  }

  const role = activeMatch.playerRole ?? activeMatch.recipient.role ?? 'spectator';
  const roleCopy = buildRoleCopy(role);

  return (
    <ScreenContainer
      title="Team"
      subtitle={`This device is currently playing from the ${formatRoleLabel(role).toLowerCase()} view.`}
      topSlot={<ProductNavBar current="dashboard" />}
    >
      <Panel
        title="Current Role"
        subtitle="This summary follows the active match connection and only shows what this role is allowed to use."
      >
        <FactList
          items={[
            { label: 'Role', value: formatRoleLabel(role) },
            {
              label: 'Stage',
              value: formatStageLabel(activeMatch.projection.lifecycleState, activeMatch.projection.seekPhaseSubstate)
            },
            {
              label: 'Visible Map',
              value: activeMatch.projection.visibleMap?.displayName ?? 'Not selected yet'
            }
          ]}
        />
      </Panel>

      <Panel title={roleCopy.title} subtitle="Keep the next actions simple and role-based.">
        <Text>{roleCopy.detail}</Text>
        <AppButton
          label={roleCopy.primaryAction.label}
          onPress={() => router.push(roleCopy.primaryAction.href)}
        />
        {roleCopy.secondaryActions.map((action) => (
          <AppButton
            key={action.href}
            label={action.label}
            onPress={() => router.push(action.href)}
            tone="secondary"
          />
        ))}
      </Panel>
    </ScreenContainer>
  );
}
