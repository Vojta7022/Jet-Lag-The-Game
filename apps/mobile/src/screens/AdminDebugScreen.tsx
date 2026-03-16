import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import {
  AdminControlPanel,
  buildAdminControlModels,
  buildProjectionInspectionModel,
  buildRuntimeDiagnosticsModel,
  canAccessAdminTools,
  EventLogViewer,
  ProjectionInspectorPanel,
  RuntimeDiagnosticsPanel,
  type AdminControlAction
} from '../features/admin/index.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

interface AdminActionStatus {
  tone: 'success' | 'warning' | 'error' | 'info';
  title: string;
  detail?: string;
}

export function AdminDebugScreen() {
  const {
    state,
    clearError,
    submitCommand,
    recoverActiveMatch,
    refreshActiveMatch
  } = useAppShell();
  const [actionStatus, setActionStatus] = useState<AdminActionStatus | undefined>(undefined);
  const activeMatch = state.activeMatch;
  const canAccess = canAccessAdminTools(activeMatch) &&
    canAccessHostControls(activeMatch?.playerRole ?? activeMatch?.recipient.role, activeMatch?.recipient.scope);
  const controls = useMemo(() => buildAdminControlModels(activeMatch), [activeMatch]);
  const diagnostics = useMemo(
    () => buildRuntimeDiagnosticsModel(activeMatch, state.lastSync),
    [activeMatch, state.lastSync]
  );
  const projectionInspection = useMemo(
    () => buildProjectionInspectionModel(activeMatch?.projection, { allowSensitiveState: canAccess }),
    [activeMatch?.projection, canAccess]
  );

  useEffect(() => {
    if (activeMatch && !canAccess) {
      router.replace('/map');
    }
  }, [activeMatch, canAccess]);

  const handleAction = async (action: AdminControlAction) => {
    const control = controls.find((candidate) => candidate.action === action);
    if (!control) {
      return;
    }

    if (!control.enabled) {
      setActionStatus({
        tone: 'warning',
        title: `${control.label} is unavailable`,
        detail: control.disabledReason
      });
      return;
    }

    if (action === 'recover_snapshot') {
      const recovered = await recoverActiveMatch();
      setActionStatus({
        tone: recovered ? 'success' : 'error',
        title: recovered ? 'Runtime recovery completed' : 'Runtime recovery failed',
        detail: recovered
          ? 'The runtime replayed stored state and the screen refreshed from the latest scoped snapshot.'
          : 'The runtime could not rebuild a recoverable snapshot.'
      });
      return;
    }

    if (action === 'rebuild_from_log' || action === 'rewind_repair' || action === 'export_bundle') {
      setActionStatus({
        tone: 'warning',
        title: `${control.label} is not wired yet`,
        detail: control.disabledReason
      });
      return;
    }

    if (!control.command) {
      setActionStatus({
        tone: 'error',
        title: `${control.label} is missing a command`,
        detail: 'The UI does not have a valid command payload for this action.'
      });
      return;
    }

    const succeeded = await submitCommand(control.command);
    setActionStatus({
      tone: succeeded ? 'success' : 'error',
      title: succeeded ? `${control.label} submitted` : `${control.label} failed`,
      detail: succeeded
        ? 'The authoritative runtime accepted the request and refreshed the scoped projection.'
        : 'The authoritative runtime rejected the request.'
    });
  };

  return (
    <ScreenContainer
      title="Referee Panel"
      eyebrow="Host Only"
      subtitle="Use this secondary panel for authority actions, diagnostics, and recovery after the main live shell is already in place."
      topSlot={<ProductNavBar current="admin" />}
    >
      {state.loadState === 'loading' ? (
        <StateBanner tone="info" title="Working" detail="The admin shell is waiting for the runtime to respond." />
      ) : null}

      {state.errorMessage ? (
        <StateBanner tone="error" title="Last runtime error" detail={state.errorMessage} />
      ) : null}

      {actionStatus ? (
        <StateBanner tone={actionStatus.tone} title={actionStatus.title} detail={actionStatus.detail} />
      ) : null}

      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Referee tools only appear once the shell is connected to a runtime."
        />
      ) : null}

      {activeMatch ? (
        <Panel
          title="Referee Context"
          subtitle="Current role, visibility scope, and match state for this session."
        >
          <FactList
            items={[
              { label: 'Role', value: activeMatch.playerRole ?? activeMatch.recipient.role ?? 'spectator' },
              { label: 'Scope', value: activeMatch.recipient.scope },
              { label: 'Stage', value: activeMatch.projection.lifecycleState },
              { label: 'Paused', value: activeMatch.projection.paused ? 'Yes' : 'No' }
            ]}
          />
        </Panel>
      ) : null}

      {activeMatch && !canAccess ? (
        <StateBanner
          tone="warning"
          title="Admin tools unavailable"
          detail="This route only unlocks controls and inspection panels for host-admin or single-device referee views."
        />
      ) : null}

      {activeMatch && canAccess ? (
        <>
          <AdminControlPanel controls={controls} onAction={(action) => { void handleAction(action); }} />
          <RuntimeDiagnosticsPanel model={diagnostics} />
          <EventLogViewer entries={activeMatch.projection.visibleEventLog} />
          <ProjectionInspectorPanel model={projectionInspection} />
          <Panel
            title="Refresh Session"
            subtitle="Request the latest scoped snapshot without changing match state."
          >
            <Text style={styles.copy}>
              Use refresh when you want to confirm the latest referee-visible state after another device or adapter has updated the match.
            </Text>
            <View style={styles.refreshRow}>
              <Text style={styles.helper}>
                This uses the same transport snapshot request path as the rest of the app shell.
              </Text>
            </View>
            <AppButton
              label="Refresh Active Snapshot"
              tone="secondary"
              onPress={() => {
                void refreshActiveMatch();
              }}
            />
          </Panel>
        </>
      ) : null}

      {state.errorMessage ? (
        <AppButton label="Dismiss Error" onPress={clearError} tone="secondary" />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  refreshRow: {
    gap: 4
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
