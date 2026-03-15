import type {
  ContentPack,
  RulesetDefinition
} from '../../../../packages/shared-types/src/index.ts';

export const mobileShellRulesetId = 'mobile-shell-ruleset';

function buildMobileShellRuleset(packId: string): RulesetDefinition {
  return {
    rulesetId: mobileShellRulesetId,
    packId,
    name: 'Mobile Shell Ruleset',
    description: 'Minimal ruleset injected by the mobile shell so map setup and transport flows can run before full authored rulesets exist.',
    supportedModes: ['online', 'local_nearby', 'single_device_referee'],
    scaleDefinitions: [
      { scale: 'small', label: 'Small' },
      { scale: 'medium', label: 'Medium' },
      { scale: 'large', label: 'Large' }
    ],
    phasePolicies: {
      hidePhaseDurationSeconds: 120
    },
    questionPolicies: {
      cooldownSeconds: 45
    },
    cardPolicies: {
      stackManualResolutionWindows: false
    },
    locationPolicies: {},
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
        notes: 'Injected fallback ruleset for app-shell flows.'
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
