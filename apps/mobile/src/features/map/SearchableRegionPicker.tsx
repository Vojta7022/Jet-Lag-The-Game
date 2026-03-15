import { StyleSheet, Text, View } from 'react-native';

import type { PlayableRegionCatalogEntry } from './region-types.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { StateBanner } from '../../ui/StateBanner.tsx';
import { colors } from '../../ui/theme.ts';

import { RegionSelectionList } from './RegionSelectionList.tsx';

interface SearchableRegionPickerProps {
  query: string;
  minimumQueryLengthMet: boolean;
  results: PlayableRegionCatalogEntry[];
  selectedRegionId?: string;
  sourceLabel: string;
  usingFallback: boolean;
  noticeMessage?: string;
  isLoading: boolean;
  errorMessage?: string;
  onChangeQuery: (value: string) => void;
  onRetry: () => void;
  onSelect: (regionId: string) => void;
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
        Search by city or larger administrative region name. Matching results come from an OSM-compatible provider first, and the selected boundary is still applied through the real `create_map_region` command.
      </Text>

      {props.noticeMessage ? (
        <StateBanner
          tone="info"
          title={props.usingFallback ? 'Using bundled fallback regions' : 'Provider search ready'}
          detail={props.noticeMessage}
        />
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
            <RegionSelectionList
              regions={props.results}
              selectedRegionId={props.selectedRegionId}
              onSelect={props.onSelect}
            />
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
  stateBlock: {
    gap: 10
  }
});
