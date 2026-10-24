import { router, useLocalSearchParams } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { DomainCommand } from '../../../../packages/shared-types/src/index.ts';
import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import {
  buildDeckViewModels,
  resolveCurrentRole
} from '../features/cards/index.ts';
import { MapCanvas } from '../features/map/MapCanvas';
import { LiveEndgameControls } from '../features/map/LiveEndgameControls.tsx';
import { ProtectedRoleHandoffPanel } from '../features/map/ProtectedRoleHandoffPanel.tsx';
import type { PlayableRegionCatalogEntry } from '../features/map/index.ts';
import { createMapScenario, decodeMapScenario, encodeMapScenario, type MapScenario } from '../features/map/map-scenarios.ts';
import { loadSavedMapScenarios, saveMapScenario } from '../features/map/map-scenario-storage.ts';
import { defaultContentPack } from '../runtime/default-content-pack.ts';

import {
  LiveMapActionPanel,
  LiveMapImpactCard,
  LiveMapInfoChips,
  LiveMapInlineActionPanel,
  MapLegend,
  SelectedRegionChipList,
  SearchableRegionPicker,
  addRegionToSelection,
  buildAppliedRegionDraft,
  buildLiveDeckSummaryModel,
  buildLiveGameplayGuideModel,
  describeLiveClueStep,
  formatRoleLabel,
  buildMapOverlayModel,
  buildCompositePlayableRegion,
  buildMapScaleGuidanceModel,
  buildMapSetupBootstrapCommands,
  buildPregameMapSetupFlowModel,
  clearSelectedRegions,
  mobileRegionDataSource,
  removeRegionFromSelection,
  resolveInlineLiveMapActionMode,
  resolveMapCanvasPreviewRegion,
  buildLiveMapDisplayProjection,
  useRegionSearch
} from '../features/map/index.ts';
import {
  findActiveQuestion,
  buildQuestionMapEffectModel,
  findConstraintForQuestion,
  findLatestResolvedQuestion,
  findQuestionCategory,
  findQuestionTemplate
} from '../features/questions/index.ts';
import {
  MatchTimingBanner,
  formatCountdown,
  useMatchTimingModel
} from '../features/timers/index.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import type { AppShellState } from '../state/app-shell-state.ts';
import { isSameMapSetupDraft } from '../state/app-shell-state.ts';
import { hasRequiredRoleAssignments } from '../features/roles/role-assignment.ts';
import { findTransitStationsInGeometry, getHidingRadiusMeters } from '../features/map/station-layer.ts';
import type { TransitStationCandidate } from '../features/map/station-layer.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors, fonts } from '../ui/theme.ts';

function createMapRegionCommand(selectedRegion: PlayableRegionCatalogEntry): DomainCommand {
  return {
    type: 'create_map_region',
    payload: {
      regionId: selectedRegion.regionId,
      displayName: selectedRegion.displayName,
      regionKind: selectedRegion.regionKind,
      featureDatasetRefs: selectedRegion.featureDatasetRefs,
      geometry: selectedRegion.geometry
    }
  };
}

function sameSelection(left: PlayableRegionCatalogEntry[], right: PlayableRegionCatalogEntry[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((region, index) => region.regionId === right[index]?.regionId);
}

function formatScaleLabel(scale: 'small' | 'medium' | 'large') {
  switch (scale) {
    case 'small':
      return 'Small';
    case 'medium':
      return 'Medium';
    case 'large':
      return 'Large';
  }
}

function resolvePrecisionTone(
  precision: 'exact' | 'approximate' | 'metadata_only' | undefined
): 'default' | 'success' | 'warning' {
  if (precision === 'exact') {
    return 'success';
  }

  if (precision === 'approximate') {
    return 'warning';
  }

  return 'default';
}

function hasOnlineIdentityMismatch(
  profile: {
    playerId: string;
    authUserId?: string;
  },
  activeMatch: AppShellState['activeMatch']
) {
  if (!activeMatch || activeMatch.runtimeKind !== 'online_foundation') {
    return false;
  }

  return activeMatch.recipient.playerId !== profile.playerId ||
    activeMatch.recipient.actorId !== (profile.authUserId ?? profile.playerId);
}

export function MapScreen() {
  const routeParams = useLocalSearchParams<{ scenario?: string | string[] }>();
  const dimensions = useWindowDimensions();
  const {
    state,
    submitCommand,
    submitCommands,
    refreshActiveMatch,
    saveMapSetupDraft,
    clearMapSetupDraft
  } = useAppShell();
  const [showLegend, setShowLegend] = useState(false);
  const activeMatch = state.activeMatch;
  const mapSetupDraft = activeMatch ? state.uiState.mapSetupDrafts[activeMatch.matchId] : undefined;
  const [selectedRegions, setSelectedRegions] = useState<PlayableRegionCatalogEntry[]>(
    () => mapSetupDraft?.selectedRegions ?? []
  );
  const [transitStations, setTransitStations] = useState<TransitStationCandidate[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>();
  const [scenarioStation, setScenarioStation] = useState<TransitStationCandidate>();
  const [scenarioHidingRadius, setScenarioHidingRadius] = useState<number>();
  const [savedScenarios, setSavedScenarios] = useState<MapScenario[]>([]);
  const [loadedScenario, setLoadedScenario] = useState<MapScenario>();
  const [scenarioNotice, setScenarioNotice] = useState<string>();
  const [stationSearchLoading, setStationSearchLoading] = useState(false);
  const [stationSearchError, setStationSearchError] = useState<string>();
  const autoHideRefreshRequestedForMatch = useRef<string | undefined>(undefined);
  const loadedScenarioToken = useRef<string | undefined>(undefined);
  const regionSearch = useRegionSearch({
    source: mobileRegionDataSource,
    initialQuery: mapSetupDraft?.query,
    initialRegionId: mapSetupDraft?.selectedPreviewRegionId
  });
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const selectedScale = projection?.selectedScale ?? activeMatch?.selectedScale;
  const isHostView = activeMatch?.recipient.scope === 'host_admin' || activeMatch?.playerRole === 'host';
  const appliedRegion = buildAppliedRegionDraft(projection?.visibleMap)[0];
  const selectedStation = transitStations.find((station) => station.stationId === selectedStationId);
  const scaleGuidance = buildMapScaleGuidanceModel({
    selectedRegions: selectedRegions.length > 0 ? selectedRegions : appliedRegion ? [appliedRegion] : [],
    appliedMap: projection?.visibleMap
  });
  const activeQuestion = findActiveQuestion(projection);
  const activeQuestionTemplate = findQuestionTemplate(defaultContentPack, activeQuestion?.templateId);
  const activeQuestionCategory = findQuestionCategory(defaultContentPack, activeQuestion?.categoryId);
  const latestResolvedQuestion = findLatestResolvedQuestion(projection);
  const latestResolvedConstraint = findConstraintForQuestion(
    projection,
    latestResolvedQuestion?.questionInstanceId
  );
  const latestResolvedTemplate = findQuestionTemplate(
    defaultContentPack,
    latestResolvedQuestion?.templateId
  );
  const latestResolvedCategory = findQuestionCategory(
    defaultContentPack,
    latestResolvedQuestion?.categoryId
  );
  const latestQuestionEffect = useMemo(
    () =>
      buildQuestionMapEffectModel({
        question: latestResolvedQuestion,
        template: latestResolvedTemplate,
        category: latestResolvedCategory,
        constraint: latestResolvedConstraint,
        visibleMap: projection?.visibleMap
      }),
    [
      latestResolvedCategory,
      latestResolvedConstraint,
      latestResolvedQuestion,
      latestResolvedTemplate,
      projection?.visibleMap
    ]
  );
  const compositePreviewRegion = useMemo(
    () => buildCompositePlayableRegion(selectedRegions),
    [selectedRegions]
  );
  const previewRegion = compositePreviewRegion ?? regionSearch.selectedRegion;
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const canUseStationWorkbench = !liveGameplayState || isHostView || viewerRole === 'hider';
  const stationGeometry = liveGameplayState
    ? projection?.visibleMap?.playableBoundary.geometry
    : previewRegion?.geometry;
  const savedHidingZone = projection?.hiddenState?.hidingZone;
  const savedZoneStation: TransitStationCandidate | undefined = savedHidingZone ? {
    stationId: savedHidingZone.stationId,
    name: savedHidingZone.stationName,
    latitude: savedHidingZone.latitude,
    longitude: savedHidingZone.longitude
  } : undefined;
  const activeZoneStation = selectedStation ?? scenarioStation ?? savedZoneStation;
  const hiderLocationLocked = Boolean(
    projection?.hiddenState?.hiderLocationLocked ||
    (isHostView && projection?.hiddenState?.hiderLocation)
  );
  const hideTimerRemaining = timingModel?.timers.find((timer) => timer.kind === 'hide')?.remainingSeconds;

  useEffect(() => {
    const matchId = activeMatch?.matchId;
    const canAdvanceHidePhase =
      matchId &&
      projection?.lifecycleState === 'hide_phase' &&
      hideTimerRemaining !== undefined &&
      hideTimerRemaining <= 0 &&
      Boolean(savedHidingZone) &&
      hiderLocationLocked;
    if (!canAdvanceHidePhase || autoHideRefreshRequestedForMatch.current === matchId) return;
    autoHideRefreshRequestedForMatch.current = matchId;
    void refreshActiveMatch();
  }, [
    activeMatch?.matchId,
    hideTimerRemaining,
    hiderLocationLocked,
    projection?.lifecycleState,
    refreshActiveMatch,
    savedHidingZone
  ]);
  const mapSelectedStation = canUseStationWorkbench
    ? selectedStation ?? scenarioStation ?? savedZoneStation
    : undefined;
  const mapHidingRadius = savedHidingZone?.radiusMeters ?? scenarioHidingRadius ??
    (selectedScale ? getHidingRadiusMeters(selectedScale) : undefined);
  const displayedVisibleMap = useMemo(
    () => liveGameplayState ? buildLiveMapDisplayProjection(projection?.visibleMap) : projection?.visibleMap,
    [liveGameplayState, projection?.visibleMap]
  );
  const rolesReadyForMapSetup = hasRequiredRoleAssignments(projection);
  const deckViewModels = useMemo(
    () => buildDeckViewModels(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const hiderDeck = deckViewModels.find((deck) => deck.deck.ownerScope === 'hider_team') ??
    deckViewModels.find((deck) => deck.deck.ownerScope === 'hider_player');
  const activeQuestionTimerSeconds = timingModel?.timers.find(
    (timer) => timer.kind === 'question' && timer.status !== 'completed'
  )?.remainingSeconds;
  const activeQuestionTimerLabel = activeQuestionTimerSeconds !== undefined
    ? formatCountdown(activeQuestionTimerSeconds)
    : undefined;
  const primaryLiveTimer = timingModel?.timers.find((timer) => timer.status !== 'completed');
  const canvasPreviewRegion = useMemo(
    () =>
      resolveMapCanvasPreviewRegion({
        appliedMap: displayedVisibleMap,
        compositePreviewRegion,
        searchPreviewRegion: regionSearch.selectedRegion,
        liveGameplayState,
        loadState: state.loadState
      }),
    [
      compositePreviewRegion,
      liveGameplayState,
      displayedVisibleMap,
      regionSearch.selectedRegion,
      state.loadState
    ]
  );
  const overlayModel = useMemo(
    () => buildMapOverlayModel({
      visibleMap: displayedVisibleMap,
      visibleMovementTracks: projection?.visibleMovementTracks,
      roundStartLocation: projection?.roundStartLocation,
      previewRegion: canvasPreviewRegion,
      transitStations,
      selectedStation: mapSelectedStation,
      hidingRadiusMeters: mapHidingRadius
    }),
    [canvasPreviewRegion, displayedVisibleMap, mapHidingRadius, mapSelectedStation, projection?.roundStartLocation, projection?.visibleMovementTracks, transitStations]
  );
  const canPrepareMapSetup =
    isHostView &&
    projection &&
    rolesReadyForMapSetup &&
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation'].includes(projection.lifecycleState);
  const canApplySelectedRegion =
    isHostView &&
    projection?.lifecycleState === 'map_setup' &&
    Boolean(compositePreviewRegion);
  const mapHasBeenApplied = Boolean(projection?.visibleMap);
  const draftDiffersFromApplied = Boolean(
    compositePreviewRegion &&
    projection?.visibleMap &&
    compositePreviewRegion.regionId !== projection.visibleMap.regionId
  );
  const mapHeight = liveGameplayState
    ? Math.max(330, Math.min(Math.round(dimensions.height * 0.50), 620))
    : Math.max(190, Math.min(Math.round(dimensions.height * 0.24), 250));
  const regionSummary = projection?.visibleMap?.displayName ?? compositePreviewRegion?.displayName ?? previewRegion?.displayName ?? 'No region selected';
  const candidateSummary = projection?.visibleMap?.remainingArea
    ? projection.visibleMap.remainingArea.precision === 'exact'
      ? 'Exact bounded search area'
      : projection.visibleMap.remainingArea.precision === 'approximate'
        ? 'Approximate bounded search area'
        : 'Evidence-only result'
    : compositePreviewRegion
      ? `${selectedRegions.length} selected ${selectedRegions.length === 1 ? 'region' : 'regions'}`
      : 'Pending region application';
  const selectedSourcesSummary =
    compositePreviewRegion?.compositeMetadata?.sourceProviderLabels.join(', ') ??
    compositePreviewRegion?.sourceLabel ??
    previewRegion?.sourceLabel ??
    'No provider selected yet';
  const disconnectedWarning = compositePreviewRegion?.compositeMetadata?.disconnectedWarning;
  const previewRegionAlreadyAdded = Boolean(
    regionSearch.selectedRegion &&
    selectedRegions.some((region) => region.regionId === regionSearch.selectedRegion?.regionId)
  );
  const activeSelectionCoverage = compositePreviewRegion?.countryLabel ?? previewRegion?.countryLabel;
  const activeSelectionParentLabel = compositePreviewRegion?.parentRegionLabel ?? previewRegion?.parentRegionLabel;
  const compositeDissolveNotice = compositePreviewRegion?.compositeMetadata?.dissolveNotice;
  const selectionBadgeLabel =
    selectedRegions.length > 1
      ? 'Composite'
      : compositePreviewRegion?.regionKind ?? previewRegion?.regionKind ?? 'Preview';
  const onlineIdentityMismatch = hasOnlineIdentityMismatch(state.sessionProfile, activeMatch);
  const pregameFlowModel = useMemo(
    () =>
      buildPregameMapSetupFlowModel({
        isHostView,
        rolesReadyForMapSetup,
        lifecycleState: projection?.lifecycleState,
        mapHasBeenApplied,
        hasDraftSelection: Boolean(compositePreviewRegion),
        draftDiffersFromApplied
      }),
    [
      compositePreviewRegion,
      draftDiffersFromApplied,
      isHostView,
      mapHasBeenApplied,
      projection?.lifecycleState,
      rolesReadyForMapSetup
    ]
  );
  const inlineActionMode = resolveInlineLiveMapActionMode(viewerRole, projection);
  const liveGuideModel = useMemo(
    () =>
      liveGameplayState
        ? buildLiveGameplayGuideModel({
            role: viewerRole,
            projection,
            currentSearchAreaLabel: candidateSummary,
            activeQuestionTemplate,
            activeQuestionCategory,
            activeQuestionTimerLabel,
            latestQuestionEffect,
            hasDeckAccess: Boolean(hiderDeck)
          })
        : undefined,
    [
      activeQuestionCategory,
      activeQuestionTemplate,
      activeQuestionTimerLabel,
      candidateSummary,
      hiderDeck,
      latestQuestionEffect,
      liveGameplayState,
      projection,
      viewerRole
    ]
  );
  const liveDeckSummary = useMemo(
    () =>
      buildLiveDeckSummaryModel({
        role: viewerRole,
        projection,
        hiderDeck,
        activeQuestionCategory
      }),
    [activeQuestionCategory, hiderDeck, projection, viewerRole]
  );
  const liveStatusItems = useMemo(
    () =>
      liveGameplayState
        ? [
            {
              label: 'Clue status',
              value: describeLiveClueStep(projection, activeQuestionTemplate?.name)
            },
            {
              label: 'Search',
              value: candidateSummary,
              tone: resolvePrecisionTone(displayedVisibleMap?.remainingArea?.precision)
            }
          ]
        : [],
    [
      activeQuestionTemplate?.name,
      candidateSummary,
      displayedVisibleMap?.remainingArea?.precision,
      liveGameplayState,
      primaryLiveTimer?.label,
      primaryLiveTimer?.remainingLabel,
      projection,
      viewerRole
    ]
  );
  const screenTitle = liveGameplayState ? 'Map' : 'Map Setup';
  const screenSubtitle = liveGameplayState
    ? undefined
    : 'Choose teams, apply the playable area, then start the game.';
  const liveGuideModelForDisplay = useMemo(() => {
    if (!liveGuideModel || !inlineActionMode) {
      return liveGuideModel;
    }

    return {
      ...liveGuideModel,
      actions: liveGuideModel.actions.filter((action, index) => {
        if (index > 0) {
          return true;
        }

        if (inlineActionMode === 'ask' || inlineActionMode === 'answer' || inlineActionMode === 'apply') {
          return action.href !== '/questions';
        }

        return true;
      })
    };
  }, [inlineActionMode, liveGuideModel]);

  useEffect(() => {
    const persistedSelection = mapSetupDraft?.selectedRegions ?? [];
    setSelectedRegions((current) => (sameSelection(current, persistedSelection) ? current : persistedSelection));
  }, [activeMatch?.matchId, mapSetupDraft?.selectedRegions]);

  useEffect(() => {
    void loadSavedMapScenarios().then(setSavedScenarios);
  }, []);

  useEffect(() => {
    const token = Array.isArray(routeParams.scenario) ? routeParams.scenario[0] : routeParams.scenario;
    if (!token || loadedScenarioToken.current === token) return;
    loadedScenarioToken.current = token;
    try {
      const scenario = decodeMapScenario(token);
      setLoadedScenario(scenario);
      setSelectedRegions(scenario.selectedRegions);
      regionSearch.setQuery(scenario.query);
      if (scenario.selectedPreviewRegionId) void regionSearch.selectRegion(scenario.selectedPreviewRegionId);
      setScenarioStation(scenario.selectedStation ? {
        ...scenario.selectedStation,
        kind: 'transit'
      } : undefined);
      setScenarioHidingRadius(scenario.hidingRadiusMeters);
      setSelectedStationId(scenario.selectedStation?.stationId);
      setScenarioNotice(`Loaded shared map: ${scenario.name}`);
    } catch (error) {
      setScenarioNotice(error instanceof Error ? error.message : 'Could not load this map scenario.');
    }
  }, [routeParams.scenario]);

  useEffect(() => {
    if (!activeMatch || liveGameplayState) {
      return;
    }

    const nextDraft = {
      matchId: activeMatch.matchId,
      selectedRegions,
      query: regionSearch.query,
      selectedPreviewRegionId: regionSearch.selectedRegionId
    };

    if (isSameMapSetupDraft(mapSetupDraft, nextDraft)) {
      return;
    }

    saveMapSetupDraft(nextDraft);
  }, [
    activeMatch,
    mapSetupDraft,
    liveGameplayState,
    regionSearch.query,
    regionSearch.selectedRegionId,
    saveMapSetupDraft,
    selectedRegions
  ]);

  useEffect(() => {
    if (!activeMatch || !liveGameplayState) {
      return;
    }

    const shouldClearDraftState = selectedRegions.length > 0 ||
      regionSearch.query.length > 0 ||
      Boolean(regionSearch.selectedRegionId) ||
      Boolean(mapSetupDraft);

    if (!shouldClearDraftState) {
      return;
    }

    if (selectedRegions.length > 0) {
      setSelectedRegions(clearSelectedRegions());
    }

    if (regionSearch.query.length > 0) {
      regionSearch.setQuery('');
    }

    if (regionSearch.selectedRegionId) {
      regionSearch.clearSelection();
    }

    if (mapSetupDraft) {
      clearMapSetupDraft(activeMatch.matchId);
    }
  }, [
    activeMatch,
    clearMapSetupDraft,
    liveGameplayState,
    mapSetupDraft,
    regionSearch.clearSelection,
    regionSearch.query,
    regionSearch.selectedRegionId,
    regionSearch.setQuery,
    selectedRegions.length
  ]);

  const canShowSetupBuilder = Boolean(!liveGameplayState && isHostView && projection?.lifecycleState === 'map_setup');
  const canShowReadonlySetupPreview = Boolean(!liveGameplayState && !canShowSetupBuilder && projection?.visibleMap);

  const clearDraftSelection = () => {
    setSelectedRegions(clearSelectedRegions());
    regionSearch.setQuery('');
    regionSearch.clearSelection();
    if (activeMatch) {
      clearMapSetupDraft(activeMatch.matchId);
    }
  };

  const makeScenario = (name: string) => createMapScenario({
    name,
    query: regionSearch.query || loadedScenario?.query || '',
    selectedPreviewRegionId: regionSearch.selectedRegionId ?? loadedScenario?.selectedPreviewRegionId,
    selectedRegions: selectedRegions.length ? selectedRegions : loadedScenario?.selectedRegions ?? (appliedRegion ? [appliedRegion] : []),
    selectedStation: selectedStation ?? scenarioStation ?? savedZoneStation ?? loadedScenario?.selectedStation,
    hidingRadiusMeters: savedHidingZone?.radiusMeters ?? scenarioHidingRadius ?? loadedScenario?.hidingRadiusMeters ?? (selectedScale ? getHidingRadiusMeters(selectedScale) : undefined)
  });

  const handleSaveScenario = async () => {
    if (selectedRegions.length === 0 && !appliedRegion && !loadedScenario) {
      setScenarioNotice('Choose a playable region before saving a map.');
      return;
    }
    const title = (compositePreviewRegion?.displayName ?? loadedScenario?.name ?? appliedRegion?.displayName ?? 'Map')
      .replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 36);
    const scenario = makeScenario(`${title} · ${new Date().toLocaleDateString()}`);
    setSavedScenarios(await saveMapScenario(scenario));
    setScenarioNotice(`Saved ${scenario.name}`);
  };

  const handleShareScenario = async () => {
    if (selectedRegions.length === 0 && !appliedRegion && !loadedScenario) {
      setScenarioNotice('Choose a playable region before sharing a map.');
      return;
    }
    const scenario = makeScenario(compositePreviewRegion?.displayName ?? loadedScenario?.name ?? appliedRegion?.displayName ?? 'Shared map');
    const url = ExpoLinking.createURL('map', { queryParams: { scenario: encodeMapScenario(scenario) } });
    await Share.share({ message: `Open this map scenario in Transit Hide and Seek:\n${url}`, url });
  };

  const handleLoadScenario = (scenario: MapScenario) => {
    setLoadedScenario(scenario);
    setSelectedRegions(scenario.selectedRegions);
    regionSearch.setQuery(scenario.query);
    if (scenario.selectedPreviewRegionId) void regionSearch.selectRegion(scenario.selectedPreviewRegionId);
    setScenarioStation(scenario.selectedStation ? { ...scenario.selectedStation, kind: 'transit' } : undefined);
    setScenarioHidingRadius(scenario.hidingRadiusMeters);
    setSelectedStationId(scenario.selectedStation?.stationId);
    setScenarioNotice(`Loaded ${scenario.name}`);
  };

  const handlePrepareMapSetup = () => {
    if (!projection || !canPrepareMapSetup) {
      return;
    }

    const commands = buildMapSetupBootstrapCommands(projection);
    if (commands.length === 0) {
      void refreshActiveMatch();
      return;
    }

    void submitCommands(commands);
  };

  const handleApplyPlayableRegion = () => {
    if (!canApplySelectedRegion || !compositePreviewRegion) {
      return;
    }

    void (async () => {
      const succeeded = await submitCommands([createMapRegionCommand(compositePreviewRegion)]);
      if (!succeeded || !activeMatch) {
        return;
      }

      clearDraftSelection();
    })();
  };

  const handleStartMatch = () => {
    void submitCommand({
      type: 'start_match',
      payload: {}
    });
  };

  const handleFindStations = () => {
    if (!stationGeometry || stationSearchLoading) return;
    setStationSearchLoading(true);
    setStationSearchError(undefined);
    void findTransitStationsInGeometry(stationGeometry)
      .then((stations) => {
        setTransitStations(stations);
        setSelectedStationId(undefined);
      })
      .catch((error: unknown) => {
        setTransitStations([]);
        setStationSearchError(error instanceof Error ? error.message : 'Station search failed. Try again later.');
      })
      .finally(() => setStationSearchLoading(false));
  };

  const stationWorkbench = stationGeometry ? (
    <View style={styles.stationWorkbench}>
      <View style={styles.stationWorkbenchHeading}>
        <View style={styles.stationWorkbenchCopy}>
          <Text style={styles.stationWorkbenchTitle}>Transit station workbench</Text>
          <Text style={styles.helperCopy}>Hiding zones follow the selected game scale.</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="OpenStreetMap copyright and attribution"
            onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
          >
            <Text style={styles.stationAttribution}>© OpenStreetMap contributors</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={stationSearchLoading}
          onPress={handleFindStations}
          style={({ pressed }) => [styles.stationSearchButton, pressed ? styles.legendTogglePressed : null]}
        >
              <Text style={styles.stationSearchLabel}>{stationSearchLoading ? 'Searching…' : transitStations.length ? 'Refresh' : 'Find stations'}</Text>
        </Pressable>
      </View>
      {stationSearchError ? <Text style={styles.stationError}>{stationSearchError}</Text> : null}
      {transitStations.length ? (
        <View style={styles.stationList}>
          {transitStations.slice(0, 8).map((station) => (
            <Pressable
              key={station.stationId}
              accessibilityRole="button"
              onPress={() => setSelectedStationId(station.stationId)}
              style={[styles.stationChoice, station.stationId === selectedStationId ? styles.stationChoiceSelected : null]}
            >
              <Text style={styles.stationChoiceName}>{station.name}</Text>
              <Text style={styles.stationChoiceKind}>{station.kind ?? 'Transit station'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selectedStation ? (
        <Text style={styles.stationSelectedSummary}>
          Zone preview: {selectedStation.name} · {selectedScale ? getHidingRadiusMeters(selectedScale) : '—'} m radius
        </Text>
      ) : null}
      {savedHidingZone ? (
        <Text style={styles.stationSelectedSummary}>
          Round zone: {savedHidingZone.stationName} · {savedHidingZone.radiusMeters} m
        </Text>
      ) : null}
      {liveGameplayState && projection?.lifecycleState === 'hide_phase' && (viewerRole === 'hider' || isHostView) && activeZoneStation ? (
        <Pressable
          accessibilityRole="button"
          disabled={state.loadState === 'loading' || savedHidingZone?.stationId === activeZoneStation.stationId}
          onPress={() => {
            if (savedHidingZone?.stationId === activeZoneStation.stationId) return;
            void submitCommand({
              type: 'set_hiding_zone',
              payload: {
                stationId: activeZoneStation.stationId,
                stationName: activeZoneStation.name,
                latitude: activeZoneStation.latitude,
                longitude: activeZoneStation.longitude
              }
            });
          }}
          style={styles.stationSetZoneButton}
        >
          <Text style={styles.stationSetZoneLabel}>
            {savedHidingZone?.stationId === activeZoneStation.stationId ? 'Round zone selected' : 'Set as round zone'}
          </Text>
        </Pressable>
      ) : null}
      {liveGameplayState && projection?.lifecycleState === 'hide_phase' &&
        (viewerRole === 'hider' || isHostView) && savedHidingZone &&
        savedHidingZone.stationId === activeZoneStation?.stationId ? (
          hiderLocationLocked ? (
            <Text style={styles.stationArrivalConfirmed}>
              Station arrival confirmed. Hide phase will end when the clock expires.
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={state.loadState === 'loading'}
              onPress={() => void submitCommand({
                type: 'lock_hider_location',
                payload: {
                  latitude: activeZoneStation.latitude,
                  longitude: activeZoneStation.longitude,
                  accuracyMeters: 10
                }
              })}
              style={styles.stationArrivalButton}
            >
              <Text style={styles.stationArrivalLabel}>I've arrived at {savedHidingZone.stationName}</Text>
            </Pressable>
          )
        ) : null}
      {!stationSearchLoading && !stationSearchError && transitStations.length === 0 ? (
        <Text style={styles.helperCopy}>Station candidates are loaded on demand from OpenStreetMap.</Text>
      ) : null}
    </View>
  ) : null;
  const stationWorkbenchForViewer = canUseStationWorkbench ? stationWorkbench : null;

  return (
    <ScreenContainer
      title={screenTitle}
      hideHeader={liveGameplayState}
      eyebrow={liveGameplayState ? 'Live' : 'Pregame'}
      subtitle={screenSubtitle}
      topSlot={liveGameplayState ? undefined : <ProductNavBar current="map" />}
      bottomSlot={liveGameplayState ? <GameplayTabBar current="map" /> : undefined}
    >
        {!activeMatch ? (
          <StateBanner
            tone="warning"
            title="No active match"
            detail="Create or join a match first. Map changes are applied through the active match connection."
          />
        ) : null}

        {loadedScenario ? (
          <Panel
            title={loadedScenario.name}
            subtitle="Shared map scenario preview. It includes the selected play area and any hiding-zone station marker."
            tone="soft"
          >
            <MapCanvas
              height={Math.max(300, Math.min(Math.round(dimensions.height * 0.58), 620))}
              maxWidth={dimensions.width - 32}
              previewRegion={buildCompositePlayableRegion(loadedScenario.selectedRegions) ?? loadedScenario.selectedRegions[0]}
              selectedStation={scenarioStation}
              hidingRadiusMeters={scenarioHidingRadius}
            />
            <AppButton label="Save Map On This Device" tone="secondary" onPress={() => void handleSaveScenario()} />
            <AppButton label="Share This Map" tone="secondary" onPress={() => void handleShareScenario()} />
            {!activeMatch ? <AppButton label="Start a Game With This Map" onPress={() => router.push('/create-match')} /> : null}
          </Panel>
        ) : null}

        {state.loadState === 'error' && state.errorMessage ? (
          <StateBanner
            tone="error"
            title="Map operation failed"
            detail={state.errorMessage}
          />
        ) : null}

        {onlineIdentityMismatch ? (
          <StateBanner
            tone="warning"
            title="Reconnect to switch online players"
            detail={`This match is still connected as ${activeMatch?.recipient.playerId}. Disconnect the current online match, confirm the saved player profile, then reconnect before changing the playable region.`}
          />
        ) : null}

        {projection?.paused ? <MatchTimingBanner model={timingModel} /> : null}

        {activeMatch && !liveGameplayState ? (
          <View style={styles.setupShell}>
            <View style={styles.setupHero}>
              <Text style={styles.setupStepBadge}>{pregameFlowModel.badge}</Text>
              <Text style={styles.setupHeroTitle}>{pregameFlowModel.title}</Text>
              <Text style={styles.copy}>{pregameFlowModel.detail}</Text>

              <View style={styles.setupChipRow}>
                <View style={[styles.scaleChip, styles.scaleChipRecommended]}>
                  <Text style={[styles.scaleChipLabel, styles.scaleChipLabelRecommended]}>
                    Recommended {formatScaleLabel(scaleGuidance.suggestedScale)}
                  </Text>
                </View>
                <View style={styles.scaleChip}>
                  <Text style={styles.scaleChipLabel}>
                    Room Size {selectedScale ? formatScaleLabel(selectedScale) : 'Waiting'}
                  </Text>
                </View>
                <View style={styles.scaleChip}>
                  <Text style={styles.scaleChipLabel}>
                    {projection?.visibleMap?.displayName ?? 'No play area applied'}
                  </Text>
                </View>
              </View>

              <Text style={styles.helperCopy}>{scaleGuidance.note}</Text>

              {pregameFlowModel.primaryAction ? (
                <AppButton
                  label={state.loadState === 'loading'
                    ? 'Working...'
                    : pregameFlowModel.primaryAction.label}
                  disabled={state.loadState === 'loading'}
                  onPress={() => {
                    switch (pregameFlowModel.primaryAction?.kind) {
                      case 'open_match_room':
                        router.push('/lobby');
                        break;
                      case 'prepare_map':
                        handlePrepareMapSetup();
                        break;
                      case 'apply_region':
                        handleApplyPlayableRegion();
                        break;
                      case 'start_match':
                        handleStartMatch();
                        break;
                      default:
                        break;
                    }
                  }}
                />
              ) : null}

              {(selectedRegions.length > 0 || regionSearch.query.length > 0 || Boolean(regionSearch.selectedRegionId)) &&
              canShowSetupBuilder ? (
                <AppButton
                  label="Clear Draft"
                  tone="ghost"
                  disabled={state.loadState === 'loading'}
                  onPress={clearDraftSelection}
                />
              ) : null}
            </View>

            <Panel
              title="Map Scenarios"
              subtitle="Save a map for later or share its boundary and station-zone overlays with your crew."
              tone="soft"
            >
              <View style={styles.scenarioActions}>
                <AppButton label="Save Map" tone="secondary" onPress={() => void handleSaveScenario()} />
                <AppButton label="Share Map" tone="secondary" onPress={() => void handleShareScenario()} />
              </View>
              {scenarioNotice ? <Text style={styles.helperCopy}>{scenarioNotice}</Text> : null}
              {savedScenarios.length ? (
                <View style={styles.scenarioList}>
                  <Text style={styles.supportEyebrow}>Saved maps · tap to load</Text>
                  {savedScenarios.map((scenario) => (
                    <Pressable
                      key={`${scenario.name}:${scenario.savedAt}`}
                      accessibilityRole="button"
                      onPress={() => handleLoadScenario(scenario)}
                      style={({ pressed }) => [styles.scenarioChoice, pressed ? styles.legendTogglePressed : null]}
                    >
                      <Text style={styles.stationChoiceName}>{scenario.name}</Text>
                      <Text style={styles.stationChoiceKind}>
                        {scenario.selectedRegions.length} region{scenario.selectedRegions.length === 1 ? '' : 's'}
                        {scenario.selectedStation ? ` · ${scenario.selectedStation.name} zone` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : <Text style={styles.helperCopy}>No saved maps yet. Save this map setup to keep it on this device.</Text>}
            </Panel>

            {canShowSetupBuilder ? (
              <Panel
                title={mapHasBeenApplied ? 'Adjust Play Area' : 'Build Play Area'}
                subtitle="Search and add region boundaries, review the preview, then apply the final playable area."
              >
                <SearchableRegionPicker
                  query={regionSearch.query}
                  minimumQueryLengthMet={regionSearch.minimumQueryLengthMet}
                  results={regionSearch.regions}
                  previewRegion={regionSearch.selectedRegion}
                  selectedRegionId={regionSearch.selectedRegionId}
                  selectedRegionCount={selectedRegions.length}
                  sourceLabel={regionSearch.sourceLabel}
                  usingFallback={regionSearch.usingFallback}
                  noticeMessage={regionSearch.noticeMessage}
                  attribution={regionSearch.attribution}
                  isLoading={regionSearch.isLoading}
                  errorMessage={regionSearch.errorMessage}
                  onChangeQuery={regionSearch.setQuery}
                  onRetry={regionSearch.retrySearch}
                  onSelect={(regionId) => {
                    void regionSearch.selectRegion(regionId);
                  }}
                  onAddPreviewRegion={() => {
                    if (!regionSearch.selectedRegion) {
                      return;
                    }

                    setSelectedRegions((currentRegions) =>
                      addRegionToSelection(currentRegions, regionSearch.selectedRegion!)
                    );
                  }}
                  canAddPreviewRegion={Boolean(regionSearch.selectedRegion) && !previewRegionAlreadyAdded}
                  previewRegionAlreadyAdded={previewRegionAlreadyAdded}
                />

                <View style={styles.setupSection}>
                  <Text style={styles.supportEyebrow}>Recommended Game Size</Text>
                  <View style={styles.scaleRow}>
                    {(['small', 'medium', 'large'] as const).map((scale) => {
                      const recommended = scaleGuidance.suggestedScale === scale;
                      const selected = selectedScale === scale;
                      return (
                        <View
                          key={scale}
                          style={[
                            styles.scaleChip,
                            recommended ? styles.scaleChipRecommended : null,
                            selected ? styles.scaleChipSelected : null
                          ]}
                        >
                          <Text
                            style={[
                              styles.scaleChipLabel,
                              recommended ? styles.scaleChipLabelRecommended : null,
                              selected ? styles.scaleChipLabelSelected : null
                            ]}
                          >
                            {formatScaleLabel(scale)}
                            {recommended ? ' Recommended' : selected ? ' Current' : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.copy}>{scaleGuidance.detail}</Text>
                  <Text style={styles.helperCopy}>
                    The room size stays {selectedScale ? formatScaleLabel(selectedScale) : 'the current size'} in this build.
                  </Text>
                </View>

                {draftDiffersFromApplied ? (
                  <StateBanner
                    tone="info"
                    title="A new draft is ready"
                    detail="The preview below is different from the playable area currently applied to the match."
                  />
                ) : null}

                {disconnectedWarning ? (
                  <StateBanner
                    tone="warning"
                    title="Selections appear disconnected"
                    detail={disconnectedWarning.summary}
                  />
                ) : null}

                {compositeDissolveNotice ? (
                  <StateBanner
                    tone="warning"
                    title="Using safe composite fallback"
                    detail={compositeDissolveNotice}
                  />
                ) : null}

                {compositePreviewRegion ? (
                  <View style={styles.selectedSection}>
                    <View style={styles.selectedHeader}>
                      <View style={styles.selectedTextBlock}>
                        <Text style={styles.title}>{compositePreviewRegion.displayName}</Text>
                        <Text style={styles.copy}>{compositePreviewRegion.summary}</Text>
                      </View>
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeLabel}>{selectionBadgeLabel}</Text>
                      </View>
                    </View>

                    <SelectedRegionChipList
                      regions={selectedRegions}
                      onRemove={(regionId) => {
                        setSelectedRegions((currentRegions) => removeRegionFromSelection(currentRegions, regionId));
                      }}
                      onClearAll={clearDraftSelection}
                    />

                    <View style={styles.metricGrid}>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Regions</Text>
                        <Text style={styles.metricValue}>
                          {selectedRegions.length} {selectedRegions.length === 1 ? 'region' : 'regions'}
                        </Text>
                      </View>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Preview</Text>
                        <Text style={styles.metricValue}>{candidateSummary}</Text>
                      </View>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Area</Text>
                        <Text style={styles.metricValue}>{regionSummary}</Text>
                      </View>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Source</Text>
                        <Text style={styles.metricValue}>{selectedSourcesSummary}</Text>
                      </View>
                    </View>

                    {activeSelectionCoverage ? (
                      <Text style={styles.copy}>
                        Coverage: {activeSelectionCoverage}
                        {activeSelectionParentLabel && activeSelectionParentLabel !== compositePreviewRegion.displayName
                          ? ` · ${activeSelectionParentLabel}`
                          : ''}
                      </Text>
                    ) : null}
                  </View>
                ) : regionSearch.selectedRegion ? (
                  <StateBanner
                    tone="info"
                    title="Preview ready"
                    detail="Add this previewed region to the draft if you want it included in the final playable area."
                  />
                ) : mapHasBeenApplied ? (
                  <StateBanner
                    tone="info"
                    title="Playable area already applied"
                    detail="You can still search and add a new draft here if you want to change the map before starting."
                  />
                ) : (
                  <StateBanner
                    tone="info"
                    title="Search for the playable area"
                    detail="Start with a city or region, add it to the draft, and review the preview before applying it."
                  />
                )}

                <View style={styles.previewBlock}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewTextBlock}>
                      <Text style={styles.supportEyebrow}>Preview</Text>
                      <Text style={styles.copy}>
                        This map shows the currently applied boundary and any draft preview that has not been applied yet.
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowLegend((value) => !value)}
                      style={({ pressed }) => [
                        styles.legendToggle,
                        pressed ? styles.legendTogglePressed : null
                      ]}
                    >
                      <Text style={styles.legendToggleLabel}>{showLegend ? 'Hide Legend' : 'Show Legend'}</Text>
                    </Pressable>
                  </View>
                  <MapCanvas
                    height={mapHeight}
                    maxWidth={dimensions.width - 32}
                    visibleMap={projection?.visibleMap}
                    visibleMovementTracks={projection?.visibleMovementTracks}
                    roundStartLocation={projection?.roundStartLocation}
                    previewRegion={canvasPreviewRegion}
                    transitStations={transitStations}
                    selectedStation={mapSelectedStation}
                    hidingRadiusMeters={mapHidingRadius}
                  />
                  {stationWorkbenchForViewer}
                  {showLegend ? (
                    <View style={styles.legendCard}>
                      <MapLegend overlayModel={overlayModel} compact />
                    </View>
                  ) : null}
                </View>
              </Panel>
            ) : null}

            {canShowReadonlySetupPreview ? (
              <Panel
                title="Current Play Area"
                subtitle="The host has the map setup controls. This screen shows the currently applied playable area."
              >
                <View style={styles.scaleRow}>
                  <View style={[styles.scaleChip, styles.scaleChipRecommended]}>
                    <Text style={[styles.scaleChipLabel, styles.scaleChipLabelRecommended]}>
                      Recommended {formatScaleLabel(scaleGuidance.suggestedScale)}
                    </Text>
                  </View>
                  <View style={styles.scaleChip}>
                    <Text style={styles.scaleChipLabel}>
                      Room Size {selectedScale ? formatScaleLabel(selectedScale) : 'Waiting'}
                    </Text>
                  </View>
                </View>
                <MapCanvas
                  height={mapHeight}
                  maxWidth={dimensions.width - 32}
                  visibleMap={projection?.visibleMap}
                  visibleMovementTracks={projection?.visibleMovementTracks}
                  roundStartLocation={projection?.roundStartLocation}
                  previewRegion={undefined}
                />
              </Panel>
            ) : null}
          </View>
        ) : null}

        {activeMatch && liveGameplayState ? (
          <View style={styles.liveShell}>
            <View style={styles.liveHero}>
              <View style={styles.liveHeroHeader}>
                <View style={styles.liveHeroTextBlock}>
                  <Text style={styles.liveHeroEyebrow}>{formatRoleLabel(viewerRole)} · {projection?.lifecycleState === 'hide_phase' ? 'THE GREAT ESCAPE' : 'THE HUNT IS ON'}</Text>
                  <Text style={styles.liveHeroTitle}>
                    {displayedVisibleMap?.displayName ?? 'Live map'}
                  </Text>
                  <Text style={styles.liveHeroSubtitle}>{candidateSummary}</Text>
                </View>
                <View style={styles.liveHeroControls}>
                  <Text style={styles.gameClock}>{projection?.paused ? 'PAUSED' : primaryLiveTimer?.remainingLabel ?? 'LIVE'}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowLegend((value) => !value)}
                    style={({ pressed }) => [
                      styles.liveControlButton,
                      pressed ? styles.legendTogglePressed : null
                    ]}
                  >
                    <Text style={styles.liveControlLabel}>
                      {showLegend ? 'Hide Legend' : 'Legend'}
                    </Text>
                  </Pressable>
                  {isHostView ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        router.push('/status');
                      }}
                      style={({ pressed }) => [
                        styles.liveControlButton,
                        pressed ? styles.legendTogglePressed : null
                      ]}
                    >
                      <Text style={styles.liveControlLabel}>Referee</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <LiveMapInfoChips items={liveStatusItems} />

              <View style={styles.liveMapFrame}>
                <MapCanvas
                  height={mapHeight}
                  maxWidth={dimensions.width - 32}
                  visibleMap={displayedVisibleMap}
                  visibleMovementTracks={projection?.visibleMovementTracks}
                  roundStartLocation={projection?.roundStartLocation}
                  previewRegion={canvasPreviewRegion}
                  transitStations={transitStations}
                  selectedStation={mapSelectedStation}
                  hidingRadiusMeters={mapHidingRadius}
                />
                {stationWorkbenchForViewer}
              </View>

              <LiveEndgameControls />
              <ProtectedRoleHandoffPanel />

              {showLegend ? (
                <View style={styles.liveLegendSheet}>
                  <MapLegend overlayModel={overlayModel} compact />
                </View>
              ) : null}

              <Text style={styles.liveMeta}>
                Constraint layers {String(projection?.visibleMap?.constraintArtifacts.length ?? 0)} · Eliminated areas {String(projection?.visibleMap?.eliminatedAreas.length ?? 0)}
              </Text>

              {liveGuideModelForDisplay ? <LiveMapActionPanel model={{ ...liveGuideModelForDisplay, facts: [] }} /> : null}
            </View>

            <LiveMapInlineActionPanel />

            {latestQuestionEffect ? (
              <LiveMapImpactCard
                model={latestQuestionEffect}
                onOpenDetails={() => {
                  router.push('/questions');
                }}
              />
            ) : null}

            {inlineActionMode !== 'answer' && liveDeckSummary ? (
              <View style={styles.liveSupportCard}>
                <Text style={styles.supportEyebrow}>Hand support</Text>
                <Text style={styles.title}>{liveDeckSummary.title}</Text>
                <Text style={styles.copy}>{liveDeckSummary.detail}</Text>
                <LiveMapInfoChips items={liveDeckSummary.facts} />
                <AppButton
                  label={liveDeckSummary.action.label}
                  tone={liveDeckSummary.action.tone}
                  onPress={() => {
                    router.push(liveDeckSummary.action.href);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scenarioActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scenarioList: { gap: 8 },
  scenarioChoice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
    padding: 10
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  setupShell: {
    gap: 16
  },
  setupHero: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 18,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2
  },
  setupStepBadge: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  setupHeroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  setupChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  setupSection: {
    gap: 10
  },
  supportEyebrow: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  selectedSection: {
    gap: 10
  },
  selectedHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  selectedTextBlock: {
    flex: 1,
    gap: 6
  },
  selectedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  selectedBadgeLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  helperCopy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  previewBlock: {
    gap: 12
  },
  scaleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  scaleChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  scaleChipRecommended: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  scaleChipSelected: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong
  },
  scaleChipLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  scaleChipLabelRecommended: {
    color: colors.accent
  },
  scaleChipLabelSelected: {
    color: colors.text
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metricCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexGrow: 1,
    gap: 4,
    minWidth: '46%',
    padding: 12
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  metricValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  actionGrid: {
    gap: 10
  },
  liveShell: {
    gap: 16
  },
  liveHero: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 16,
    padding: 14,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 3
  },
  liveHeroHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  liveHeroTextBlock: {
    flex: 1,
    gap: 4
  },
  liveHeroEyebrow: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  gameClock: { width: '100%', textAlign: 'right', fontFamily: fonts.mono, color: colors.accentStrong, fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liveHeroTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '800'
  },
  liveHeroSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18
  },
  liveHeroControls: {
    width: 145,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8
  },
  liveControlButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  liveControlLabel: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  liveMapFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    overflow: 'hidden',
    padding: 4
  },
  liveLegendSheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12
  },
  liveMeta: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '700'
  },
  liveSupportCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  previewTextBlock: {
    flex: 1,
    gap: 6
  },
  legendToggle: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  legendTogglePressed: {
    opacity: 0.85
  },
  legendToggleLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  legendCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10
  },
  stationWorkbench: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  stationWorkbenchHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  stationWorkbenchCopy: { flex: 1, gap: 4 },
  stationWorkbenchTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '800'
  },
  stationSearchButton: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accentStrong,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14
  },
  stationSearchLabel: { color: colors.accentStrong, fontSize: 12, fontWeight: '800' },
  stationAttribution: { color: colors.accentStrong, fontSize: 11, textDecorationLine: 'underline' },
  stationSetZoneButton: {
    alignItems: 'center',
    backgroundColor: colors.accentStrong,
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14
  },
  stationSetZoneLabel: { color: colors.inkInverse, fontSize: 13, fontWeight: '800' },
  stationArrivalButton: {
    alignItems: 'center',
    backgroundColor: colors.accentWarmMuted,
    borderColor: colors.accentWarm,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14
  },
  stationArrivalLabel: { color: colors.accentWarm, fontSize: 13, fontWeight: '800' },
  stationArrivalConfirmed: { color: colors.success, fontSize: 13, fontWeight: '800' },
  stationError: { color: colors.danger, fontSize: 13 },
  stationList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stationChoice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
    maxWidth: '48%',
    minWidth: 130,
    padding: 9
  },
  stationChoiceSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accentStrong },
  stationChoiceName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  stationChoiceKind: { color: colors.textMuted, fontSize: 11 },
  stationSelectedSummary: {
    color: colors.accentStrong,
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700'
  }
});
