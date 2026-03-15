import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

export function StatusScreen() {
  const { state, clearError, refreshActiveMatch } = useAppShell();
  const activeMatch = state.activeMatch;

  return (
    <ScreenContainer
      title="Session Status"
      subtitle="Review the current runtime connection, sync state, and nearby join details for this session."
      topSlot={<ProductNavBar current="status" />}
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
        <Panel
          title="Connection Status"
          subtitle="Core transport and snapshot details for the active match session."
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
          <AppButton
            label="Refresh Status"
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
