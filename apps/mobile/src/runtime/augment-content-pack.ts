import type {
  ContentPack,
  RulesetDefinition
} from '../../../../packages/shared-types/src/index.ts';

export const mobileShellRulesetId = 'mobile-shell-ruleset';

function buildMobileShellRuleset(packId: string): RulesetDefinition {
  return {
    rulesetId: mobileShellRulesetId,
    packId,
    name: 'Home Game — Base Rules',
    description: 'Base Hide + Seek rules encoded from the printed rulebook and Investigation Book.',
    supportedModes: ['online', 'local_nearby', 'single_device_referee'],
    scaleDefinitions: [
      { scale: 'small', label: 'Small' },
      { scale: 'medium', label: 'Medium' },
      { scale: 'large', label: 'Large' }
    ],
    phasePolicies: {
      hidePhaseDurationSecondsByScale: {
        small: 30 * 60,
        medium: 60 * 60,
        large: 180 * 60
      },
      nextHiderPreparationSeconds: 10 * 60
    },
    questionPolicies: {
      cooldownSeconds: 0,
      answerWindowSeconds: 5 * 60,
      photoAnswerWindowSecondsByScale: {
        small: 10 * 60,
        medium: 10 * 60,
        large: 20 * 60
      },
      allowQuestionRepeats: true,
      repeatRewardGroupsAreSeparate: true
    },
    cardPolicies: {
      stackManualResolutionWindows: false,
      maximumHandSize: 6
    },
    locationPolicies: {
      requireStationCenteredZone: true,
      hiderMustConfirmArrivalAtZoneStation: true,
      hidingZoneRadiusMetersByScale: {
        small: 500,
        medium: 500,
        large: 1000
      },
      finalHidingSpotPathProximityMeters: 3,
      foundDistanceMeters: 2,
      foundRequiresVisualConfirmation: true,
      endgameRequiresOffTransit: true
    },
    chatPolicies: {},
    visibilityPolicies: {},
    winConditions: [],
    transportNotes: {
      source: 'mobile_shell',
      purpose: 'bootstrap_map_setup'
    },
    sourceProvenance: [
      {
        sourceType: 'generated',
        sourceFileName: 'apps/mobile/src/runtime/augment-content-pack.ts',
        notes: 'Fallback base ruleset used when the imported pack has no authored ruleset.'
      }
    ]
  };
}

export function ensureMobileShellContentPack(contentPack: ContentPack): ContentPack {
  if (contentPack.rulesets.length > 0) {
    return contentPack;
  }

  return {
    ...contentPack,
    rulesets: [buildMobileShellRuleset(contentPack.packId)]
  };
}
