import type { QuestionFeatureDatasetModel, QuestionFeatureRecordModel } from '../../../shared-types/src/domain/match.ts';

import { geometryBoundingBox, pointInGeometry, representativePointFromGeometry } from '../geometry/geojson.ts';
import type { QuestionFeatureDataRequest, QuestionFeatureDataProvider } from './openstreetmap-question-feature-provider.ts';

export interface OpenMeteoElevationFeatureProviderOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  now?: () => string;
  maxSamples?: number;
  baseGridSpacingMeters?: number;
  cacheMilliseconds?: number;
}

const ELEVATION_CLASS_ID = 'sea-level';
const ELEVATION_API_ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
const ELEVATION_SOURCE = 'Open-Meteo / Copernicus DEM GLO-90';
const ELEVATION_SOURCE_URL = 'https://open-meteo.com/en/docs/elevation-api';
const COPERNICUS_VERTICAL_DATUM = 'EGM2008';
const COPERNICUS_ABSOLUTE_VERTICAL_ERROR_METERS = 4;
const MAX_COORDINATES_PER_REQUEST = 100;
const MAX_GRID_SPACING_METERS = 5_000;

type GridPoint = { latitude: number; longitude: number };

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function gridSpacingFor(box: NonNullable<ReturnType<typeof geometryBoundingBox>>, args: {
  baseSpacingMeters: number;
  maxSamples: number;
}): number | undefined {
  const middleLatitude = (box.minLat + box.maxLat) / 2;
  const metersPerDegreeLatitude = 111_132;
  const metersPerDegreeLongitude = Math.max(1, 111_320 * Math.cos(middleLatitude * Math.PI / 180));
  const widthMeters = (box.maxLon - box.minLon) * metersPerDegreeLongitude;
  const heightMeters = (box.maxLat - box.minLat) * metersPerDegreeLatitude;
  let spacing = args.baseSpacingMeters;
  const estimateSampleCount = (candidateSpacing: number) =>
    Math.max(1, Math.ceil(widthMeters / candidateSpacing)) * Math.max(1, Math.ceil(heightMeters / candidateSpacing));

  if (estimateSampleCount(spacing) > args.maxSamples) {
    spacing = Math.ceil(Math.sqrt((widthMeters * heightMeters) / args.maxSamples) / 100) * 100;
  }
  while (estimateSampleCount(spacing) > args.maxSamples && spacing <= MAX_GRID_SPACING_METERS) spacing += 100;
  if (spacing > MAX_GRID_SPACING_METERS) return undefined;
  return Math.max(args.baseSpacingMeters, spacing);
}

function sampleGrid(request: QuestionFeatureDataRequest, spacingMeters: number, maxSamples: number): GridPoint[] | undefined {
  const box = geometryBoundingBox(request.regionGeometry);
  if (!box) return undefined;
  const middleLatitude = (box.minLat + box.maxLat) / 2;
  const latitudeStep = spacingMeters / 111_132;
  const longitudeStep = spacingMeters / Math.max(1, 111_320 * Math.cos(middleLatitude * Math.PI / 180));
  const points: GridPoint[] = [];

  for (let latitude = box.minLat + latitudeStep / 2; latitude < box.maxLat; latitude += latitudeStep) {
    for (let longitude = box.minLon + longitudeStep / 2; longitude < box.maxLon; longitude += longitudeStep) {
      if (!pointInGeometry([longitude, latitude], request.regionGeometry)) continue;
      points.push({ latitude, longitude });
      if (points.length > maxSamples) return undefined;
    }
  }

  if (points.length === 0) {
    const representative = representativePointFromGeometry(request.regionGeometry);
    if (representative) points.push({ longitude: representative[0], latitude: representative[1] });
  }
  return points.length > 0 && points.length <= maxSamples ? points : undefined;
}

function datasetFeature(point: GridPoint, elevationMeters: number, spacingMeters: number): QuestionFeatureRecordModel {
  const longitude = Number(point.longitude.toFixed(6));
  const latitude = Number(point.latitude.toFixed(6));
  return {
    featureId: `copernicus:glo90:${longitude}:${latitude}`,
    featureClassId: ELEVATION_CLASS_ID,
    label: 'Copernicus 90 m elevation sample',
    longitude,
    latitude,
    geometrySupport: 'point',
    coverage: 'approximate',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: {
      elevationMeters,
      verticalDatum: COPERNICUS_VERTICAL_DATUM,
      absoluteVerticalErrorMeters: COPERNICUS_ABSOLUTE_VERTICAL_ERROR_METERS,
      sourceResolutionMeters: 90,
      gridSpacingMeters: spacingMeters
    }
  };
}

export class OpenMeteoElevationFeatureProvider implements QuestionFeatureDataProvider {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private readonly maxSamples: number;
  private readonly baseGridSpacingMeters: number;
  private readonly cacheMilliseconds: number;
  private readonly cache = new Map<string, { expiresAt: number; dataset: QuestionFeatureDatasetModel }>();
  private readonly inFlight = new Map<string, Promise<QuestionFeatureDatasetModel | undefined>>();

  constructor(options: OpenMeteoElevationFeatureProviderOptions = {}) {
    this.endpoint = options.endpoint ?? ELEVATION_API_ENDPOINT;
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxSamples = positiveInteger(options.maxSamples, 1_200);
    this.baseGridSpacingMeters = positiveInteger(options.baseGridSpacingMeters, 500);
    this.cacheMilliseconds = positiveInteger(options.cacheMilliseconds, 5 * 60_000);
  }

  async load(request: QuestionFeatureDataRequest): Promise<QuestionFeatureDatasetModel | undefined> {
    if (!request.featureClassIds.includes(ELEVATION_CLASS_ID)) return undefined;
    const box = geometryBoundingBox(request.regionGeometry);
    if (!box) return undefined;
    const key = JSON.stringify({ regionGeometry: request.regionGeometry, baseGridSpacingMeters: this.baseGridSpacingMeters });
    const nowMs = Date.parse(this.now());
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > nowMs) return cached.dataset;
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const pendingLoad = this.loadUncached(request, box).catch(() => undefined).then((dataset) => {
      if (dataset) this.cache.set(key, { dataset, expiresAt: nowMs + this.cacheMilliseconds });
      return dataset;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pendingLoad);
    return pendingLoad;
  }

  private async loadUncached(
    request: QuestionFeatureDataRequest,
    box: NonNullable<ReturnType<typeof geometryBoundingBox>>
  ): Promise<QuestionFeatureDatasetModel | undefined> {
    const spacingMeters = gridSpacingFor(box, {
      baseSpacingMeters: this.baseGridSpacingMeters,
      maxSamples: this.maxSamples
    });
    if (!spacingMeters) return undefined;
    const points = sampleGrid(request, spacingMeters, this.maxSamples);
    if (!points) return undefined;

    const features: QuestionFeatureRecordModel[] = [];
    for (let index = 0; index < points.length; index += MAX_COORDINATES_PER_REQUEST) {
      const batch = points.slice(index, index + MAX_COORDINATES_PER_REQUEST);
      const url = new URL(this.endpoint);
      url.searchParams.set('latitude', batch.map((point) => point.latitude.toFixed(6)).join(','));
      url.searchParams.set('longitude', batch.map((point) => point.longitude.toFixed(6)).join(','));
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Open-Meteo elevation lookup failed with HTTP ${response.status}.`);
      const payload = await response.json() as { elevation?: unknown };
      if (!Array.isArray(payload.elevation) || payload.elevation.length !== batch.length ||
        !payload.elevation.every((height) => typeof height === 'number' && Number.isFinite(height))) {
        throw new Error('Open-Meteo elevation response did not match the requested coordinates.');
      }
      for (let sampleIndex = 0; sampleIndex < batch.length; sampleIndex += 1) {
        features.push(datasetFeature(batch[sampleIndex]!, payload.elevation[sampleIndex] as number, spacingMeters));
      }
    }

    return {
      source: ELEVATION_SOURCE,
      sourceUrl: ELEVATION_SOURCE_URL,
      sourceVersion: 'copernicus-dem-glo90-egm2008',
      retrievedAt: this.now(),
      coverage: 'approximate',
      features
    };
  }
}

export class CompositeQuestionFeatureDataProvider implements QuestionFeatureDataProvider {
  private readonly providers: QuestionFeatureDataProvider[];

  constructor(providers: QuestionFeatureDataProvider[]) {
    this.providers = providers;
  }

  async load(request: QuestionFeatureDataRequest): Promise<QuestionFeatureDatasetModel | undefined> {
    for (const provider of this.providers) {
      const dataset = await provider.load(request);
      if (dataset) return dataset;
    }
    return undefined;
  }
}
