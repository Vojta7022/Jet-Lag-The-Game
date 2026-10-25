import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  CompleteDistantCuisineChallengeCommand,
  DistantCuisineChallengeModel,
  ReportDistantCuisineDistanceCommand,
  ReviewDistantCuisineTargetCommand,
  SetDistantCuisineOriginCommand,
  SubmitDistantCuisineTargetCommand,
  VisibleMapProjection
} from '../../../../../packages/shared-types/src/index.ts';
import { distanceToGeometryMeters } from '../../../../../packages/geo/src/index.ts';
import { MapCanvas } from '../map/MapCanvas';
import type { MapCoordinate } from '../map/map-geometry.ts';
import { mobileRegionDataSource } from '../map/region-data-source.ts';
import { isCountryBoundaryRegion, type PlayableRegionCatalogEntry } from '../map/region-types.ts';
import { useLocationSharing } from '../../providers/LocationSharingProvider.tsx';
import type { DeviceLocationSample } from '../location/location-state.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { Panel } from '../../ui/Panel.tsx';
import { StateBanner } from '../../ui/StateBanner.tsx';
import { colors } from '../../ui/theme.ts';

interface Props {
  challenge: DistantCuisineChallengeModel;
  visibleMap?: VisibleMapProjection;
  players: Array<{ playerId: string; displayName: string }>;
  viewerRole?: string;
  viewerPlayerId?: string;
  disabled: boolean;
  onSetOrigin: (sample: DeviceLocationSample, payload: SetDistantCuisineOriginCommand['payload']) => Promise<boolean>;
  onSubmitTarget: (payload: SubmitDistantCuisineTargetCommand['payload']) => Promise<boolean>;
  onReportDistance: (sample: DeviceLocationSample, payload: ReportDistantCuisineDistanceCommand['payload']) => Promise<boolean>;
  onReview: (payload: ReviewDistantCuisineTargetCommand['payload']) => Promise<boolean>;
  onComplete: (sample: DeviceLocationSample, payload: CompleteDistantCuisineChallengeCommand['payload']) => Promise<boolean>;
}

export function DistantCuisinePanel(props: Props) {
  const challenge = props.challenge;
  const origin = challenge.origin;
  const target = challenge.target;
  const location = useLocationSharing();
  const [originRestaurant, setOriginRestaurant] = useState('');
  const [originCountry, setOriginCountry] = useState<PlayableRegionCatalogEntry>();
  const [originPoint, setOriginPoint] = useState<MapCoordinate>();
  const [originAttested, setOriginAttested] = useState(false);
  const [targetRestaurant, setTargetRestaurant] = useState('');
  const [targetCountry, setTargetCountry] = useState<PlayableRegionCatalogEntry>();
  const [targetPoint, setTargetPoint] = useState<MapCoordinate>();
  const [targetAttested, setTargetAttested] = useState(false);
  const [measureBusy, setMeasureBusy] = useState(false);
  const [measureError, setMeasureError] = useState<string>();
  const ownDistance = props.viewerPlayerId ? challenge.distanceByPlayerId[props.viewerPlayerId] : undefined;
  const ownVisit = props.viewerPlayerId ? challenge.completedAtByPlayerId[props.viewerPlayerId] : undefined;
  const hasAllDistances = challenge.requiredSeekerPlayerIds.every((playerId) => challenge.distanceByPlayerId[playerId]);
  const pendingTarget = Boolean(target && target.reviewApproved === undefined);

  return (
    <Panel title="Curse of the Distant Cuisine" subtitle="Find a restaurant whose cuisine country is at least as far away." tone="accent">
      <Text style={styles.copy}>The hider records the restaurant where this curse was played and the country its public material names. The seekers find another restaurant naming one country or a region inside one country. Broad labels such as “Asian” do not qualify.</Text>
      <Text style={styles.source}>Country outlines and nearest-boundary distances use OpenStreetMap Nominatim data. Distance is measured from your fresh phone location to the nearest point in each country, never to a country center. The hider checks the restaurant’s public-facing evidence.</Text>

      {!origin && (props.viewerRole === 'hider' || props.viewerRole === 'host') ? (
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Record the restaurant where the curse was played</Text>
          <Field label="Restaurant name" value={originRestaurant} onChangeText={setOriginRestaurant} placeholder="Name shown on the restaurant" autoCapitalize="words" />
          <CountryBoundaryPicker label="Cuisine country named by the restaurant" selected={originCountry} onSelect={setOriginCountry} />
          <Text style={styles.copy}>Pin this restaurant on the game map. The hider’s phone must be at this pin when setting the origin.</Text>
          <MapCanvas visibleMap={props.visibleMap} height={260} selectable selectedCoordinate={originPoint} onCoordinateSelect={setOriginPoint} />
          <Attestation label="The restaurant’s public-facing material explicitly identifies this single country or a region within it." checked={originAttested} onPress={() => setOriginAttested(!originAttested)} />
          <AppButton label="Set original restaurant and country" disabled={props.disabled || !originRestaurant.trim() || !originCountry || !originPoint || !originAttested || location.state.permissionState !== 'granted'} onPress={() => {
            if (!originCountry || !originPoint) return;
            void location.captureCurrentPosition().then((sample) => sample && props.onSetOrigin(sample, {
              sourceCardInstanceId: challenge.sourceCardInstanceId,
              restaurantName: originRestaurant.trim(),
              restaurantLatitude: originPoint.latitude,
              restaurantLongitude: originPoint.longitude,
              cuisineCountryName: originCountry.displayName,
              cuisineCountryRegionId: originCountry.regionId,
              publicSingleCountryReferenceAttested: true
            }));
          }} />
          {location.state.permissionState !== 'granted' ? <AppButton label="Allow location access" tone="secondary" onPress={() => void location.requestForegroundPermission()} /> : null}
        </View>
      ) : null}

      {origin ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Original restaurant</Text>
          <Text style={styles.copy}>{origin.restaurantName} · cuisine country: {origin.cuisineCountryName}</Text>
          <MapCanvas visibleMap={props.visibleMap} height={210} selectedCoordinate={{ latitude: origin.restaurantLatitude, longitude: origin.restaurantLongitude }} />
        </View>
      ) : null}

      {origin && (!target || target.reviewApproved === false) && props.viewerRole === 'seeker' ? (
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>{target ? 'Find a farther cuisine country' : 'Choose a qualifying restaurant'}</Text>
          <Field label="Target restaurant" value={targetRestaurant} onChangeText={setTargetRestaurant} placeholder="Name shown at the restaurant" autoCapitalize="words" />
          <CountryBoundaryPicker label="Cuisine country named publicly by the restaurant" selected={targetCountry} onSelect={setTargetCountry} />
          <MapCanvas visibleMap={props.visibleMap} height={260} selectable selectedCoordinate={targetPoint} onCoordinateSelect={setTargetPoint} />
          <Attestation label="Its public-facing material explicitly identifies one country or a region inside one country, not a multi-country cuisine label." checked={targetAttested} onPress={() => setTargetAttested(!targetAttested)} />
          <AppButton label="Submit restaurant for hider review" disabled={props.disabled || !targetRestaurant.trim() || !targetCountry || !targetPoint || !targetAttested} onPress={() => {
            if (!targetCountry || !targetPoint) return;
            void props.onSubmitTarget({
              sourceCardInstanceId: challenge.sourceCardInstanceId,
              restaurantName: targetRestaurant.trim(),
              restaurantLatitude: targetPoint.latitude,
              restaurantLongitude: targetPoint.longitude,
              cuisineCountryName: targetCountry.displayName,
              cuisineCountryRegionId: targetCountry.regionId,
              publicSingleCountryReferenceAttested: true
            });
          }} />
        </View>
      ) : null}

      {target ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proposed restaurant</Text>
          <Text style={styles.copy}>{target.restaurantName} · cuisine country: {target.cuisineCountryName}</Text>
          <MapCanvas visibleMap={props.visibleMap} height={210} selectedCoordinate={{ latitude: target.restaurantLatitude, longitude: target.restaurantLongitude }} />
          {target.reviewApproved === undefined ? <Text style={styles.status}>Waiting for each seeker’s country-distance check and hider review.</Text> : target.reviewApproved ? <Text style={styles.status}>Approved. Each seeker must visit this restaurant from their own phone.</Text> : <Text style={styles.status}>The hider asked the seekers to find another qualifying restaurant.</Text>}

          {props.viewerRole === 'seeker' && pendingTarget && !ownDistance ? (
            <>
              <Text style={styles.copy}>Your phone will compare both country boundaries from your current exact location before you head to the restaurant.</Text>
              {measureError ? <StateBanner tone="error" title="Country distance unavailable" detail={measureError} /> : null}
              {location.state.permissionState !== 'granted' ? <AppButton label="Allow location access" tone="secondary" onPress={() => void location.requestForegroundPermission()} /> : null}
              <AppButton label={measureBusy ? 'Loading country boundaries…' : 'Measure both countries from my location'} disabled={props.disabled || measureBusy || location.state.permissionState !== 'granted'} onPress={() => void measureDistances()} />
            </>
          ) : null}
          {ownDistance && origin ? <Text style={styles.distance}>Your exact-location result: {formatDistance(ownDistance.targetCountryDistanceMeters)} to {target.cuisineCountryName}, compared with {formatDistance(ownDistance.sourceCountryDistanceMeters)} to {origin.cuisineCountryName}.</Text> : null}

          {(props.viewerRole === 'hider' || props.viewerRole === 'host') && pendingTarget ? (
            <>
              {challenge.requiredSeekerPlayerIds.map((playerId) => {
                const player = props.players.find((candidate) => candidate.playerId === playerId);
                const distance = challenge.distanceByPlayerId[playerId];
                return <Text key={playerId} style={styles.copy}>{player?.displayName ?? 'Seeker'}: {distance ? `${formatDistance(distance.targetCountryDistanceMeters)} vs ${formatDistance(distance.sourceCountryDistanceMeters)} from their exact location` : 'country distance not measured yet'}</Text>;
              })}
              <View style={styles.actions}>
                <AppButton label="Find a farther country" tone="secondary" disabled={props.disabled} onPress={() => void props.onReview({ sourceCardInstanceId: challenge.sourceCardInstanceId, approved: false })} />
                <AppButton label="Approve restaurant and country" disabled={props.disabled || !hasAllDistances} onPress={() => void props.onReview({ sourceCardInstanceId: challenge.sourceCardInstanceId, approved: true })} />
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {target?.reviewApproved === true ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Restaurant visit</Text>
          {challenge.requiredSeekerPlayerIds.map((playerId) => {
            const player = props.players.find((candidate) => candidate.playerId === playerId);
            return <Text key={playerId} style={styles.copy}>{player?.displayName ?? 'Seeker'}: {challenge.completedAtByPlayerId[playerId] ? 'visit reported' : 'not there yet'}</Text>;
          })}
          {props.viewerRole === 'seeker' && !ownVisit && !challenge.completedAt ? (
            <>
              <Text style={styles.copy}>After you reach the restaurant, refresh your phone location and report the visit. The app checks that you are within 50 m.</Text>
              {measureError ? <StateBanner tone="error" title="Visit could not be reported" detail={measureError} /> : null}
              <AppButton label="I visited this restaurant" disabled={props.disabled || location.state.permissionState !== 'granted'} onPress={() => void reportVisit()} />
            </>
          ) : null}
        </View>
      ) : null}

      {challenge.completedAt ? <Text style={styles.status}>Curse complete. The seekers can ask their next question.</Text> : null}
    </Panel>
  );

  async function measureDistances() {
    if (!origin || !target) return;
    setMeasureBusy(true);
    setMeasureError(undefined);
    try {
      const [sourceRegion, targetRegion] = await Promise.all([
        mobileRegionDataSource.getRegionById(origin.cuisineCountryRegionId),
        mobileRegionDataSource.getRegionById(target.cuisineCountryRegionId)
      ]);
      if (!isCountryBoundaryRegion(sourceRegion) || !isCountryBoundaryRegion(targetRegion)) {
        throw new Error('Nominatim could not load a complete country outline for one of these countries. Check the country names and retry.');
      }
      const sample = await location.captureCurrentPosition();
      if (!sample) throw new Error('Allow foreground location access and try again.');
      const point: [number, number] = [sample.longitude, sample.latitude];
      const sourceDistance = distanceToGeometryMeters(point, sourceRegion.geometry);
      const targetDistance = distanceToGeometryMeters(point, targetRegion.geometry);
      if (sourceDistance === undefined || targetDistance === undefined) throw new Error('The selected country outline does not contain polygon boundary data.');
      const accepted = await props.onReportDistance(sample, {
        sourceCardInstanceId: challenge.sourceCardInstanceId,
        sourceCountryDistanceMeters: sourceDistance,
        targetCountryDistanceMeters: targetDistance
      });
      if (!accepted) setMeasureError('The distance report was rejected. Refresh the map and location, then try again.');
    } catch (error) {
      setMeasureError(error instanceof Error ? error.message : 'Unable to calculate the country distances.');
    } finally {
      setMeasureBusy(false);
    }
  }

  async function reportVisit() {
    setMeasureError(undefined);
    const sample = await location.captureCurrentPosition();
    if (!sample) {
      setMeasureError('Allow foreground location access and try again.');
      return;
    }
    const accepted = await props.onComplete(sample, { sourceCardInstanceId: challenge.sourceCardInstanceId });
    if (!accepted) setMeasureError('The visit was rejected. Refresh your location when you are at the restaurant and try again.');
  }
}

function CountryBoundaryPicker(props: { label: string; selected?: PlayableRegionCatalogEntry; onSelect: (region?: PlayableRegionCatalogEntry) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayableRegionCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <View style={styles.form}>
      <Field label={props.label} value={props.selected?.displayName ?? query} onChangeText={(value) => { props.onSelect(undefined); setQuery(value); }} placeholder="Search the country name" autoCapitalize="words" />
      {!props.selected ? <AppButton label={loading ? 'Searching countries…' : 'Search country boundaries'} tone="secondary" disabled={loading || query.trim().length < 2} onPress={() => {
        setLoading(true); setError(undefined);
        void mobileRegionDataSource.searchRegions(query.trim()).then((response) => {
          const countries = response.regions.filter(isCountryBoundaryRegion);
          setResults(countries);
          if (countries.length === 0) setError('No country boundary found. Try the country’s full official name.');
        }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Country search failed.')).finally(() => setLoading(false));
      }} /> : <AppButton label="Change country" tone="secondary" onPress={() => props.onSelect(undefined)} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!props.selected ? results.map((region) => (
        <Pressable key={region.regionId} accessibilityRole="button" onPress={() => { props.onSelect(region); setResults([]); setQuery(region.displayName); }} style={styles.countryResult}>
          <Text style={styles.countryName}>{region.displayName}</Text>
          <Text style={styles.copy}>Country outline · OpenStreetMap · {region.regionId}</Text>
        </Pressable>
      )) : null}
    </View>
  );
}

function Attestation(props: { label: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: props.checked }} onPress={props.onPress} style={styles.attestation}><View style={[styles.checkbox, props.checked ? styles.checkboxChecked : null]}>{props.checked ? <Text style={styles.check}>✓</Text> : null}</View><Text style={styles.copy}>{props.label}</Text></Pressable>;
}

function formatDistance(distanceMeters: number) {
  return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${Math.round(distanceMeters)} m`;
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
  attestation: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  checkbox: { alignItems: 'center', borderColor: colors.accentStrong, borderRadius: 6, borderWidth: 1, height: 24, justifyContent: 'center', width: 24 },
  checkboxChecked: { backgroundColor: colors.accentStrong },
  check: { color: colors.surface, fontWeight: '800' },
  copy: { color: colors.text, fontSize: 14, lineHeight: 21 },
  countryName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  countryResult: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 4, padding: 12 },
  distance: { color: colors.accentStrong, fontSize: 14, fontWeight: '800', lineHeight: 21 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  form: { gap: 12 },
  section: { gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  source: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  status: { color: colors.accentStrong, fontSize: 14, fontWeight: '800', lineHeight: 20 }
});
