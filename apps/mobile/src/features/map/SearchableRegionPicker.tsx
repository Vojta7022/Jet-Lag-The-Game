import { StyleSheet, Text, View } from 'react-native';

import type {
  PlayableRegionCatalogEntry,
  RegionSourceAttribution
} from './region-types.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { StateBanner } from '../../ui/StateBanner.tsx';
import { colors } from '../../ui/theme.ts';

import { RegionSelectionList } from './RegionSelectionList.tsx';

interface SearchableRegionPickerProps {
  query: string;
  minimumQueryLengthMet: boolean;
  results: PlayableRegionCatalogEntry[];
  previewRegion?: PlayableRegionCatalogEntry;
  selectedRegionId?: string;
  selectedRegionCount: number;
  sourceLabel: string;
  usingFallback: boolean;
  noticeMessage?: string;
  attribution?: RegionSourceAttribution;
  isLoading: boolean;
  errorMessage?: string;
  onChangeQuery: (value: string) => void;
  onRetry: () => void;
  onSelect: (regionId: string) => void;
  onAddPreviewRegion: () => void;
  canAddPreviewRegion: boolean;
  previewRegionAlreadyAdded: boolean;
}

export function SearchableRegionPicker(props: SearchableRegionPickerProps) {
  return (
    <View style={styles.container}>
      <Field
        label="Search a city or region"
        value={props.query}
        onChangeText={props.onChangeQuery}
        placeholder="Type Prague or Central Bohemia"
        autoCapitalize="words"
      />
      <Text style={styles.helper}>
        Search by city or larger administrative region name. The app tries live OpenStreetMap-compatible boundaries first, then falls back to bundled regions only when the live lookup is unavailable.
      </Text>

      {props.selectedRegionCount > 0 ? (
        <Text style={styles.meta}>
          Match map: {props.selectedRegionCount === 1 ? '1 region added' : `${props.selectedRegionCount} regions added`}
        </Text>
      ) : null}

      {props.attribution ? (
        <View style={styles.attributionCard}>
          <Text style={styles.attributionLabel}>
            {props.usingFallback ? 'Fallback source' : 'Boundary source'}
          </Text>
          <Text style={styles.attributionTitle}>{props.attribution.label}</Text>
          <Text style={styles.attributionCopy}>{props.attribution.notice}</Text>
          {props.attribution.url ? (
            <Text style={styles.attributionLink}>{props.attribution.url}</Text>
          ) : null}
        </View>
      ) : null}

      {props.noticeMessage ? (
        <View style={styles.stateBlock}>
          <StateBanner
            tone="info"
            title={props.usingFallback ? 'Using bundled fallback regions' : 'Provider search ready'}
            detail={props.noticeMessage}
          />
          {props.usingFallback ? (
            <AppButton label="Retry Live Search" onPress={props.onRetry} tone="secondary" />
          ) : null}
        </View>
      ) : null}

      {!props.minimumQueryLengthMet && props.query.trim().length > 0 ? (
        <StateBanner
          tone="info"
          title="Keep typing"
          detail="Enter at least two characters before the region search runs."
        />
      ) : null}

      {!props.minimumQueryLengthMet && props.query.trim().length === 0 ? (
        <StateBanner
          tone="info"
          title="Search for a playable region"
          detail="Type a city or administrative region name like Prague, Praha, Central Bohemia, or Wien."
        />
      ) : null}

      {props.isLoading ? (
        <StateBanner
          tone="info"
          title="Searching regions"
          detail="Loading matching playable regions for the current query."
        />
      ) : null}

      {!props.isLoading && props.errorMessage ? (
        <View style={styles.stateBlock}>
          <StateBanner
            tone="error"
            title="Region search failed"
            detail={props.errorMessage}
          />
          <AppButton label="Retry Search" onPress={props.onRetry} tone="secondary" />
        </View>
      ) : null}

      {!props.isLoading && !props.errorMessage ? (
        <>
          {props.minimumQueryLengthMet ? (
            <Text style={styles.meta}>
              {props.results.length === 1 ? '1 matching region' : `${props.results.length} matching regions`}
              {props.sourceLabel ? ` · ${props.sourceLabel}` : ''}
            </Text>
          ) : null}
          {props.minimumQueryLengthMet && props.results.length > 0 ? (
            <View style={styles.resultBlock}>
              <RegionSelectionList
                regions={props.results}
                selectedRegionId={props.selectedRegionId}
                onSelect={props.onSelect}
              />
              {props.previewRegion ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewTextBlock}>
                      <Text style={styles.previewTitle}>{props.previewRegion.displayName}</Text>
                      <Text style={styles.previewSummary}>{props.previewRegion.summary}</Text>
                    </View>
                    <View style={styles.previewBadge}>
                      <Text style={styles.previewBadgeLabel}>
                        {props.previewRegionAlreadyAdded ? 'Added' : 'Preview'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.previewMeta}>
                    {props.previewRegion.sourceLabel}
                    {props.previewRegion.countryLabel ? ` · ${props.previewRegion.countryLabel}` : ''}
                    {props.previewRegion.parentRegionLabel &&
                    props.previewRegion.parentRegionLabel !== props.previewRegion.displayName
                      ? ` · ${props.previewRegion.parentRegionLabel}`
                      : ''}
                  </Text>
                  <AppButton
                    label={props.previewRegionAlreadyAdded ? 'Already Added To Match Map' : 'Add Region To Match Map'}
                    onPress={props.onAddPreviewRegion}
                    disabled={!props.canAddPreviewRegion}
                    tone="secondary"
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {props.minimumQueryLengthMet && props.results.length === 0 ? (
            <StateBanner
              tone="warning"
              title="No matching regions"
              detail="Try a city name, an administrative region name, or a broader search phrase."
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12
  },
  helper: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  resultBlock: {
    gap: 12
  },
  attributionCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    gap: 4,
    padding: 12
  },
  attributionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  attributionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  attributionCopy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  attributionLink: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600'
  },
  previewCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    gap: 10,
    padding: 12
  },
  previewHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  previewTextBlock: {
    flex: 1,
    gap: 4
  },
  previewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  previewSummary: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  previewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  previewBadgeLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  previewMeta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  },
  stateBlock: {
    gap: 10
  }
});
