export type PregameMapSetupAction =
  | 'open_match_room'
  | 'prepare_map'
  | 'apply_region'
  | 'start_match';

export interface PregameMapSetupFlowModel {
  badge: string;
  title: string;
  detail: string;
  primaryAction?: {
    kind: PregameMapSetupAction;
    label: string;
  };
}

interface BuildPregameMapSetupFlowArgs {
  isHostView: boolean;
  rolesReadyForMapSetup: boolean;
  lifecycleState?: string;
  mapHasBeenApplied: boolean;
  hasDraftSelection: boolean;
  draftDiffersFromApplied: boolean;
}

function isMapSetupLifecycle(lifecycleState: string | undefined) {
  return lifecycleState === 'map_setup';
}

export function buildPregameMapSetupFlowModel(
  args: BuildPregameMapSetupFlowArgs
): PregameMapSetupFlowModel {
  if (!args.isHostView) {
    if (!args.rolesReadyForMapSetup) {
      return {
        badge: 'Step 1 of 3',
        title: 'Waiting for teams',
        detail: 'The host still needs to choose one hider and at least one seeker before map setup can begin.',
        primaryAction: {
          kind: 'open_match_room',
          label: 'Back To Match Room'
        }
      };
    }

    if (!args.mapHasBeenApplied) {
      return {
        badge: 'Step 2 of 3',
        title: 'Waiting for the playable area',
        detail: 'The host is still choosing and applying the playable region for this match.',
        primaryAction: {
          kind: 'open_match_room',
          label: 'Back To Match Room'
        }
      };
    }

    return {
      badge: 'Step 3 of 3',
      title: 'Waiting for the game to begin',
      detail: 'The playable area is ready. The host can start the match as soon as everyone is set.'
    };
  }

  if (!args.rolesReadyForMapSetup) {
    return {
      badge: 'Step 1 of 3',
      title: 'Choose teams first',
      detail: 'Pick one hider and at least one seeker before opening map setup.',
      primaryAction: {
        kind: 'open_match_room',
        label: 'Choose Teams'
      }
    };
  }

  if (!isMapSetupLifecycle(args.lifecycleState)) {
    return {
      badge: 'Step 2 of 3',
      title: 'Start map setup',
      detail: 'Open map setup, choose the playable area, and review the suggested game size before starting.',
      primaryAction: {
        kind: 'prepare_map',
        label: 'Start Map Setup'
      }
    };
  }

  if (args.hasDraftSelection && (!args.mapHasBeenApplied || args.draftDiffersFromApplied)) {
    return {
      badge: 'Step 2 of 3',
      title: args.mapHasBeenApplied ? 'Apply the updated play area' : 'Apply the play area',
      detail: 'Review the preview on the map, then apply it so everyone sees the same playable region.',
      primaryAction: {
        kind: 'apply_region',
        label: args.mapHasBeenApplied ? 'Apply Updated Play Area' : 'Apply Play Area'
      }
    };
  }

  if (args.mapHasBeenApplied) {
    return {
      badge: 'Step 3 of 3',
      title: 'Start the game',
      detail: 'Teams are ready and the playable area is applied. Start the match to move everyone into live play.',
      primaryAction: {
        kind: 'start_match',
        label: 'Start Match'
      }
    };
  }

  return {
    badge: 'Step 2 of 3',
    title: 'Choose the playable area',
    detail: 'Search for one or more regions, add them to the draft, and preview the result before applying it.'
  };
}
