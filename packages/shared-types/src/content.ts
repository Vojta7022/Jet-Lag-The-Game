export type ScaleKey = 'small' | 'medium' | 'large';

export type ContentPackStatus = 'draft' | 'published' | 'archived';

export type SupportedMode = 'online' | 'local_nearby' | 'single_device_referee';

export type CardKind = 'time_bonus' | 'power_up' | 'curse' | 'blank' | 'custom';

export type AutomationLevel = 'manual' | 'assisted' | 'authoritative';

export type ProjectionScope =
  | 'authority'
  | 'host_admin'
  | 'team_private'
  | 'player_private'
  | 'public_match'
  | 'event_feed_public';

export type QuestionResolverKind =
  | 'nearest_feature_match'
  | 'comparative_distance'
  | 'hotter_colder'
  | 'threshold_distance'
  | 'nearest_candidate'
  | 'photo_challenge'
  | 'custom';

export type ConstraintKind =
  | 'inside_polygon'
  | 'outside_polygon'
  | 'within_distance'
  | 'beyond_distance'
  | 'nearest_feature_match'
  | 'comparative_distance'
  | 'hotter_colder'
  | 'same_admin_region'
  | 'nearest_candidate'
  | 'metadata_only'
  | 'photo_evidence'
  | 'custom';

export type ImportIssueSeverity = 'info' | 'warning' | 'error';

export interface SourceProvenance {
  sourceType: 'xlsx' | 'csv' | 'json' | 'generated';
  sourceFileName: string;
  sheetName?: string;
  rowNumber?: number;
  columnName?: string;
  cellAddress?: string;
  rawLabel?: string;
  rawValue?: string | number | boolean | null;
  notes?: string;
}

export interface ScaleSet {
  appliesTo: ScaleKey[];
  rawLabel?: string;
}

export interface DistanceValue {
  meters: number;
  rawText: string;
  milesText?: string;
  metricText?: string;
}

export interface TimeValue {
  seconds: number;
  rawText: string;
}

export interface TimerPolicyRef {
  kind: 'fixed' | 'by_scale';
  durationSeconds?: number;
  durationSecondsByScale?: Partial<Record<ScaleKey, number>>;
  pauseBehavior?: 'freeze' | 'continue';
  extensionPolicy?: 'manual_only' | 'ruleset_defined' | 'not_allowed';
}

export interface VisibilityPolicyRef {
  visibleTo: ProjectionScope[];
  hiddenFrom?: ProjectionScope[];
}

export interface FeatureClassRef {
  featureClassId: string;
  label: string;
  rawLabel?: string;
}

export interface RequirementDefinition {
  requirementType: 'raw_text' | 'photo' | 'dice' | 'location' | 'manual_approval' | 'condition';
  description: string;
  rawText?: string | null;
}

export interface CardEffectDefinition {
  effectType: string;
  description: string;
  automationLevel: AutomationLevel;
  rawText?: string | null;
  payload?: Record<string, unknown>;
}

export interface DeckEntry {
  cardDefinitionId: string;
  quantity: number;
  weight?: number;
  notes?: string;
  sourceProvenance: SourceProvenance[];
}

export interface DeckDefinition {
  deckId: string;
  packId: string;
  name: string;
  ownerScope: 'hider_team' | 'seeker_team' | 'hider_player' | 'seeker_player' | 'shared_public' | 'host_only';
  drawPolicy: {
    shuffleOnCreate: boolean;
    reshuffleDiscardIntoDraw: boolean;
    initialDrawCount?: number;
  };
  visibilityPolicy: VisibilityPolicyRef;
  entries: DeckEntry[];
  summary?: Record<string, unknown>;
  sourceProvenance: SourceProvenance[];
}

export interface CardDefinition {
  cardDefinitionId: string;
  packId: string;
  deckId: string;
  kind: CardKind;
  subtype?: string;
  name: string;
  shortName?: string;
  description: string;
  automationLevel: AutomationLevel;
  timingWindow?: {
    allowedPhases?: string[];
    trigger?: string;
  };
  castingCost?: RequirementDefinition[];
  preconditions?: RequirementDefinition[];
  effects: CardEffectDefinition[];
  rewardsOrPenalties?: CardEffectDefinition[];
  requirements?: {
    requiresPhotoUpload?: boolean;
    requiresDiceRoll?: boolean;
    requiresLocationSelection?: boolean;
    requiresManualApproval?: boolean;
  };
  durationPolicy?: TimerPolicyRef;
  visibilityPolicy: VisibilityPolicyRef;
  tags?: string[];
  sourceProvenance: SourceProvenance[];
}

export interface QuestionCategoryDefinition {
  categoryId: string;
  packId: string;
  name: string;
  resolverKind: QuestionResolverKind;
  promptTemplate: string;
  drawRule: {
    drawCount: number;
    pickCount: number;
    rawText: string;
  };
  defaultTimerPolicy: TimerPolicyRef;
  defaultAnswerSchema: Record<string, unknown>;
  visibilityPolicy: VisibilityPolicyRef;
  scaleSet: ScaleSet;
  defaultConstraintRefs?: string[];
  notes?: string;
  sourceProvenance: SourceProvenance[];
}

export interface QuestionTemplateDefinition {
  templateId: string;
  packId: string;
  categoryId: string;
  name: string;
  promptOverrides?: Record<string, unknown>;
  featureClassRefs?: FeatureClassRef[];
  parameters?: Record<string, unknown>;
  answerSchema: Record<string, unknown>;
  resolverConfig: Record<string, unknown>;
  constraintRefs: string[];
  requirements?: RequirementDefinition[];
  scaleSet: ScaleSet;
  visibilityPolicy: VisibilityPolicyRef;
  sourceProvenance: SourceProvenance[];
}

export interface RulesetDefinition {
  rulesetId: string;
  packId: string;
  name: string;
  description?: string;
  supportedModes: SupportedMode[];
  scaleDefinitions: Array<{
    scale: ScaleKey;
    label: string;
    notes?: string;
  }>;
  phasePolicies: Record<string, unknown>;
  questionPolicies: Record<string, unknown>;
  cardPolicies: Record<string, unknown>;
  locationPolicies: Record<string, unknown>;
  chatPolicies: Record<string, unknown>;
  visibilityPolicies: Record<string, unknown>;
  winConditions: Record<string, unknown>[];
  transportNotes?: Record<string, unknown>;
  sourceProvenance: SourceProvenance[];
}

export interface MapPresetDefinition {
  mapPresetId: string;
  packId: string;
  name: string;
  description?: string;
  geometry: Record<string, unknown>;
  forbiddenRegions?: Record<string, unknown>[];
  featureDatasetRefs: string[];
  layerPolicies: Record<string, unknown>;
  locationPrecisionPolicy: Record<string, unknown>;
  travelPolicies?: Record<string, unknown>;
  sourceProvenance: SourceProvenance[];
}

export interface ConstraintDefinition {
  constraintId: string;
  packId: string;
  name: string;
  kind: ConstraintKind;
  inputSchema: Record<string, unknown>;
  outputArtifactKinds: Array<'geometry' | 'metadata' | 'explanation' | 'manual_review'>;
  confidencePolicy: Record<string, unknown>;
  explanationTemplate: string;
  visibilityPolicy: VisibilityPolicyRef;
  sourceProvenance: SourceProvenance[];
}

export interface FeatureTaxonomyEntry {
  featureClassId: string;
  label: string;
  aliases?: string[];
  sourceProvenance: SourceProvenance[];
}

export interface ContentPackProvenance {
  sourceType: 'xlsx' | 'csv' | 'json';
  sourceFileName: string;
  importedAt: string;
  sourceSheets: string[];
  unmappedSheets: string[];
  normalizationWarnings: string[];
}

export interface PackCompatibility {
  supportedModes: SupportedMode[];
  supportsDraftPlaceholders: boolean;
  requiresFeatureDatasets: boolean;
}

export interface ContentPack {
  schemaVersion: string;
  packId: string;
  packVersion: string;
  title: string;
  summary?: string;
  status: ContentPackStatus;
  sourceFingerprint: string;
  importerVersion: string;
  mappingProfileId: string;
  provenance: ContentPackProvenance;
  rulesets: RulesetDefinition[];
  decks: DeckDefinition[];
  cards: CardDefinition[];
  questionCategories: QuestionCategoryDefinition[];
  questionTemplates: QuestionTemplateDefinition[];
  mapPresets: MapPresetDefinition[];
  constraints: ConstraintDefinition[];
  featureTaxonomy?: FeatureTaxonomyEntry[];
  compatibility: PackCompatibility;
}
