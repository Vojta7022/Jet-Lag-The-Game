export const CONTENT_SCHEMA_VERSION = '1.0.0';

export const schemaPaths = {
  common: new URL('../schemas/common.schema.json', import.meta.url),
  contentPack: new URL('../schemas/content-pack.schema.json', import.meta.url),
  deckDefinition: new URL('../schemas/deck-definition.schema.json', import.meta.url),
  cardDefinition: new URL('../schemas/card-definition.schema.json', import.meta.url),
  questionCategory: new URL('../schemas/question-category.schema.json', import.meta.url),
  questionTemplate: new URL('../schemas/question-template.schema.json', import.meta.url),
  ruleset: new URL('../schemas/ruleset.schema.json', import.meta.url),
  mapPreset: new URL('../schemas/map-preset.schema.json', import.meta.url),
  constraintDefinition: new URL('../schemas/constraint-definition.schema.json', import.meta.url)
};
