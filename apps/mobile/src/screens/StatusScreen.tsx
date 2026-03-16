import { router } from 'expo-router';
import { useEffect } from 'react';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import {
  MatchTimingBanner,
  MatchTimingPanel,
  useMatchTimingModel
} from '../features/timers/index.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

export function StatusScreen() {
  const { state, clearError, refreshActiveMatch } = useAppShell();
  const activeMatch = state.activeMatch;
  const timingModel = useMatchTimingModel(activeMatch?.projection, activeMatch?.receivedAt);
  const canAccess = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );

  useEffect(() => {
    if (activeMatch && !canAccess) {
      router.replace('/map');
    }
  }, [activeMatch, canAccess]);

  return (
    <ScreenContainer
      title="Match Controls"
      eyebrow="Host Only"
      subtitle="Use this host-only overflow for referee access, movement review, and connection health."
      topSlot={<ProductNavBar current="status" />}
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Shell Error" detail={state.errorMessage} />
      ) : null}

      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="There is nothing to inspect yet because no match connection has been established."
        />
      ) : null}

      {activeMatch && !canAccess ? (
        <StateBanner
          tone="warning"
          title="Host access required"
          detail="Only the host or host-admin view can open match controls."
        />
      ) : null}

      <MatchTimingBanner model={timingModel} />

      {activeMatch && canAccess ? (
        <Panel
          title="Control Room"
          subtitle="Keep advanced tools out of the main player path while still making them easy for the host to reach."
          tone="accent"
        >
          <AppButton label="Open Live Map" onPress={() => router.push('/map')} tone="secondary" />
          <AppButton label="Open Referee Panel" onPress={() => router.push('/admin')} tone="secondary" />
          <AppButton label="Open Movement Review" onPress={() => router.push('/movement')} tone="ghost" />
        </Panel>
      ) : null}

      {activeMatch ? (
        <Panel
          title="Live Timing"
          subtitle="The current screen-wide timing summary from the latest synced projection."
        >
          <MatchTimingPanel model={timingModel} />
        </Panel>
      ) : null}

      {activeMatch ? (
        <Panel
          title="Connection Status"
          subtitle="Transport, persistence, and snapshot details for the active host session."
        >
          <FactList
            items={[
              { label: 'Runtime', value: activeMatch.runtimeKind },
              { label: 'Mode', value: activeMatch.runtimeMode },
              { label: 'Adapter', value: activeMatch.transportFlavor },
              { label: 'Connection', value: activeMatch.connectionState },
              { label: 'Snapshot Version', value: activeMatch.snapshotVersion },
              { label: 'Last Event Sequence', value: activeMatch.lastEventSequence },
              { label: 'Scope', value: activeMatch.recipient.scope }
            ]}
          />
          {activeMatch.onlineStatus ? (
            <FactList
              items={[
                { label: 'Online Persistence', value: activeMatch.onlineStatus.persistenceMode },
                { label: 'Attachment Storage', value: activeMatch.onlineStatus.attachmentStorageMode },
                { label: 'Attachment Bucket', value: activeMatch.onlineStatus.attachmentBucket ?? 'Not configured' },
                { label: 'Supabase URL', value: activeMatch.onlineStatus.projectUrl ?? 'Not configured' }
              ]}
            />
          ) : null}
          <AppButton
            label="Refresh Match Controls"
            onPress={() => {
              void refreshActiveMatch();
            }}
          />
        </Panel>
      ) : null}

      {activeMatch?.joinOffer ? (
        <Panel
          title="Nearby Join Offer"
          subtitle="Share these details when hosting a nearby session."
        >
          <FactList
            items={[
              { label: 'Join Code', value: activeMatch.joinOffer.joinCode },
              { label: 'Join Token', value: activeMatch.joinOffer.joinToken },
              { label: 'Expires', value: activeMatch.joinOffer.expiresAt }
            ]}
          />
        </Panel>
      ) : null}

      {state.errorMessage ? (
        <AppButton label="Dismiss Error" onPress={clearError} tone="secondary" />
      ) : null}
    </ScreenContainer>
  );
}
