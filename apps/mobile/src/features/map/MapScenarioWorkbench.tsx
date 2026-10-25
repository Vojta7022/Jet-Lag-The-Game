import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import type { MapScenarioCustomOverlay, MapScenarioCustomStation } from './map-scenarios.ts';
import { parseCustomOverlayGeoJson, parseCustomStationsCsv, parseCustomStationsGeoJson, parseCustomStationsKml } from './map-workbench.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { Field } from '../../ui/Field.tsx';
import { colors } from '../../ui/theme.ts';

const layerPalette = ['#df5948', '#2374ab', '#2d7a52', '#996300', '#7a4baf'];

interface MapScenarioWorkbenchProps {
  customOverlays: MapScenarioCustomOverlay[];
  onCustomOverlaysChange: (value: MapScenarioCustomOverlay[]) => void;
  stationSource: 'osm' | 'custom' | 'both';
  onStationSourceChange: (value: 'osm' | 'custom' | 'both') => void;
  customStations: MapScenarioCustomStation[];
  onCustomStationsChange: (value: MapScenarioCustomStation[]) => void;
}

export function MapScenarioWorkbench(props: MapScenarioWorkbenchProps) {
  const [expanded, setExpanded] = useState(false);
  const [layerName, setLayerName] = useState('Imported layer');
  const [layerColor, setLayerColor] = useState('#df5948');
  const [geoJson, setGeoJson] = useState('');
  const [stationCsv, setStationCsv] = useState('');
  const [stationName, setStationName] = useState('');
  const [stationLatitude, setStationLatitude] = useState('');
  const [stationLongitude, setStationLongitude] = useState('');
  const [notice, setNotice] = useState<string>();

  const pickTextFile = async (type: string[]) => {
    const result = await DocumentPicker.getDocumentAsync({ type, multiple: false, copyToCacheDirectory: true });
    if (result.canceled) return undefined;
    const asset = result.assets[0];
    if (!asset) throw new Error('The selected file did not contain readable content.');
    if ((asset.size ?? 0) > 5 * 1024 * 1024) throw new Error('Map data files must be smaller than 5 MB.');
    const content = asset.file ? await asset.file.text() : await new File(asset.uri).text();
    if (content.length > 5 * 1024 * 1024) throw new Error('Map data files must be smaller than 5 MB.');
    return { content, name: asset.name.toLowerCase() };
  };

  const addLayers = () => {
    try {
      const imported = parseCustomOverlayGeoJson(geoJson, { name: layerName, color: layerColor });
      if (props.customOverlays.length + imported.length > 100) throw new Error('A map can contain at most 100 custom layers.');
      const timestamp = Date.now();
      props.onCustomOverlaysChange([
        ...props.customOverlays,
        ...imported.map((layer, index) => ({ ...layer, id: `layer:${timestamp}:${index}` }))
      ]);
      setGeoJson('');
      setNotice(`Added ${imported.length} map layer${imported.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'GeoJSON could not be added.');
    }
  };

  const importStations = () => {
    try {
      const imported = parseCustomStationsCsv(stationCsv);
      if (props.customStations.length + imported.length > 2000) throw new Error('A map can contain at most 2,000 custom stations.');
      const timestamp = Date.now();
      props.onCustomStationsChange([
        ...props.customStations,
        ...imported.map((station, index) => ({ ...station, id: `csv:${timestamp}:${index}` }))
      ]);
      setStationCsv('');
      setNotice(`Imported ${imported.length} custom station${imported.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Station data could not be imported.');
    }
  };

  const importLayerFile = async () => {
    try {
      const file = await pickTextFile(['application/geo+json', 'application/json', '.geojson', '.json']);
      if (!file) return;
      const imported = parseCustomOverlayGeoJson(file.content, { name: file.name.replace(/\.(geo)?json$/i, ''), color: layerColor });
      if (props.customOverlays.length + imported.length > 100) throw new Error('A map can contain at most 100 custom layers.');
      const timestamp = Date.now();
      props.onCustomOverlaysChange([
        ...props.customOverlays,
        ...imported.map((layer, index) => ({ ...layer, id: `file-layer:${timestamp}:${index}` }))
      ]);
      setNotice(`Imported ${imported.length} layer${imported.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Map layers could not be imported.');
    }
  };

  const importStationFile = async () => {
    try {
      const file = await pickTextFile(['text/csv', 'application/geo+json', 'application/json', 'application/vnd.google-earth.kml+xml', '.csv', '.geojson', '.json', '.kml']);
      if (!file) return;
      const imported = file.name.endsWith('.kml')
        ? parseCustomStationsKml(file.content)
        : file.name.endsWith('.csv')
          ? parseCustomStationsCsv(file.content)
          : parseCustomStationsGeoJson(file.content);
      if (props.customStations.length + imported.length > 2000) throw new Error('A map can contain at most 2,000 custom stations.');
      const timestamp = Date.now();
      props.onCustomStationsChange([
        ...props.customStations,
        ...imported.map((station, index) => ({ ...station, id: `file-station:${timestamp}:${index}` }))
      ]);
      setNotice(`Imported ${imported.length} custom station${imported.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Station list could not be imported.');
    }
  };

  const addStation = () => {
    if (props.customStations.length >= 2000) {
      setNotice('A map can contain at most 2,000 custom stations.');
      return;
    }
    const latitude = Number(stationLatitude);
    const longitude = Number(stationLongitude);
    if (!stationName.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setNotice('Enter a station name and valid latitude/longitude.');
      return;
    }
    props.onCustomStationsChange([...props.customStations, {
      id: `station:${Date.now()}`,
      name: stationName.trim(),
      latitude,
      longitude
    }]);
    setStationName('');
    setStationLatitude('');
    setStationLongitude('');
    setNotice('Custom station added.');
  };

  return (
    <View style={styles.root}>
      <View style={styles.editorHeader}>
        <View style={styles.editorIntro}>
          <Text style={styles.title}>Map editor</Text>
          <Text style={styles.copy}>{props.customOverlays.length} layers · {props.customStations.length} custom stations · {props.stationSource === 'osm' ? 'OpenStreetMap' : props.stationSource === 'custom' ? 'Custom stations' : 'Both sources'}</Text>
        </View>
        <AppButton label={expanded ? 'Close editor' : 'Edit layers & stations'} tone="secondary" onPress={() => setExpanded((value) => !value)} />
      </View>
      {expanded ? <>
      <Text style={styles.title}>Custom map layers</Text>
      <Text style={styles.copy}>Paste GeoJSON geometry, a Feature, or a FeatureCollection. Each feature becomes a layer.</Text>
      <Field label="Layer name" value={layerName} onChangeText={setLayerName} />
      <Field label="Layer color · hex" value={layerColor} onChangeText={setLayerColor} placeholder="#df5948" />
      <Field label="GeoJSON" value={geoJson} onChangeText={setGeoJson} multiline numberOfLines={5} placeholder="Paste GeoJSON here" />
      <AppButton label="Add GeoJSON Layer" tone="secondary" onPress={addLayers} disabled={!geoJson.trim() || props.customOverlays.length >= 100} />
      <AppButton label="Import GeoJSON File" tone="secondary" onPress={() => void importLayerFile()} disabled={props.customOverlays.length >= 100} />
      {props.customOverlays.map((layer) => (
        <View key={layer.id} style={styles.row}>
          <Field
            label="Layer name"
            value={layer.name}
            onChangeText={(name) => props.onCustomOverlaysChange(props.customOverlays.map((item) => item.id === layer.id ? { ...item, name } : item))}
          />
          <View style={styles.swatches}>
            <Text style={styles.copy}>Layer color</Text>
            {layerPalette.map((color) => (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={`Set ${layer.name} layer color`}
                accessibilityState={{ selected: layer.color === color }}
                onPress={() => props.onCustomOverlaysChange(props.customOverlays.map((item) => item.id === layer.id ? { ...item, color } : item))}
                style={[styles.swatch, { backgroundColor: color }, layer.color === color ? styles.swatchSelected : null]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            <AppButton
              label={layer.visible ? 'Hide layer' : 'Show layer'}
              tone="ghost"
              onPress={() => props.onCustomOverlaysChange(props.customOverlays.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item))}
            />
            <AppButton
              label="Remove"
              tone="danger"
              onPress={() => props.onCustomOverlaysChange(props.customOverlays.filter((item) => item.id !== layer.id))}
            />
          </View>
        </View>
      ))}

      <Text style={styles.title}>Station sources</Text>
      <Text style={styles.copy}>Choose which bounded station list appears in the hiding-zone picker.</Text>
      <View style={styles.actions}>
        {(['osm', 'custom', 'both'] as const).map((source) => (
          <AppButton
            key={source}
            label={source === 'osm' ? 'OpenStreetMap' : source === 'custom' ? 'Custom list' : 'Both'}
            tone={props.stationSource === source ? 'primary' : 'secondary'}
            onPress={() => props.onStationSourceChange(source)}
          />
        ))}
      </View>
      <Field label="Station CSV" value={stationCsv} onChangeText={setStationCsv} multiline numberOfLines={4} placeholder={'name,latitude,longitude\nMuseum,50.08,14.43'} />
      <AppButton label="Import Station CSV" tone="secondary" onPress={importStations} disabled={!stationCsv.trim()} />
      <AppButton label="Import CSV, GeoJSON, or KML File" tone="secondary" onPress={() => void importStationFile()} disabled={props.customStations.length >= 2000} />
      <View style={styles.stationFields}>
        <Field label="Station name" value={stationName} onChangeText={setStationName} />
        <Field label="Latitude" value={stationLatitude} onChangeText={setStationLatitude} keyboardType="decimal-pad" />
        <Field label="Longitude" value={stationLongitude} onChangeText={setStationLongitude} keyboardType="decimal-pad" />
      </View>
      <AppButton label="Add Station" tone="secondary" onPress={addStation} />
      {props.customStations.map((station) => (
        <View key={station.id} style={styles.row}>
          <Field label="Station name" value={station.name} onChangeText={(name) => props.onCustomStationsChange(props.customStations.map((item) => item.id === station.id ? { ...item, name } : item))} />
          <View style={styles.stationFields}>
            <Field label="Latitude" value={String(station.latitude)} keyboardType="decimal-pad" onChangeText={(value) => {
              const latitude = Number(value);
              if (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90) props.onCustomStationsChange(props.customStations.map((item) => item.id === station.id ? { ...item, latitude } : item));
            }} />
            <Field label="Longitude" value={String(station.longitude)} keyboardType="decimal-pad" onChangeText={(value) => {
              const longitude = Number(value);
              if (Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) props.onCustomStationsChange(props.customStations.map((item) => item.id === station.id ? { ...item, longitude } : item));
            }} />
          </View>
          <AppButton label="Remove station" tone="danger" onPress={() => props.onCustomStationsChange(props.customStations.filter((item) => item.id !== station.id))} />
        </View>
      ))}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  editorHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  editorIntro: { flex: 1, gap: 4, minWidth: 180 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 10 },
  copy: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  row: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 10, padding: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatches: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { borderColor: colors.borderStrong, borderRadius: 999, borderWidth: 2, height: 30, width: 30 },
  swatchSelected: { borderColor: colors.text, borderWidth: 4 },
  stationFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  notice: { color: colors.text, fontSize: 13, fontWeight: '700' }
});
