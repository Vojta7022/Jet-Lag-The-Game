import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  const canAccess = canAccessAdminTools(activeMatch);
  const controls = useMemo(() => buildAdminControlModels(activeMatch), [activeMatch]);
  const diagnostics = useMemo(
    () => buildRuntimeDiagnosticsModel(activeMatch, state.lastSync),
    [activeMatch, state.lastSync]
  );
  const projectionInspection = useMemo(
    () => buildProjectionInspectionModel(activeMatch?.projection, { allowSensitiveState: canAccess }),
    [activeMatch?.projection, canAccess]
  );

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
      title="Admin / Debug"
      subtitle="Referee-only controls and scoped inspection tools backed by the real engine and transport foundations."
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
          detail="Create or join a match first. Admin/debug tools only appear once the shell is connected to a runtime."
        />
      ) : null}

      {activeMatch ? (
        <Panel title="Admin Context">
          <View style={styles.row}>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>{activeMatch.playerRole ?? activeMatch.recipient.role ?? 'spectator'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Scope</Text>
            <Text style={styles.value}>{activeMatch.recipient.scope}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Lifecycle</Text>
            <Text style={styles.value}>{activeMatch.projection.lifecycleState}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Paused</Text>
            <Text style={styles.value}>{activeMatch.projection.paused ? 'Yes' : 'No'}</Text>
          </View>
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
          <Panel title="Manual Refresh">
            <Text style={styles.copy}>
              Use refresh if you want to re-request the latest scoped snapshot without changing match state.
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  },
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
