import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPregameMapSetupFlowModel } from '../src/features/map/pregame-map-setup-model.ts';

test('pregame map flow sends host to team assignment before map setup', () => {
  const model = buildPregameMapSetupFlowModel({
    isHostView: true,
    rolesReadyForMapSetup: false,
    lifecycleState: 'role_assignment',
    mapHasBeenApplied: false,
    hasDraftSelection: false,
    draftDiffersFromApplied: false
  });

  assert.equal(model.title, 'Choose teams first');
  assert.equal(model.primaryAction?.kind, 'open_match_room');
  assert.equal(model.primaryAction?.label, 'Choose Teams');
});

test('pregame map flow asks host to apply the draft region before starting', () => {
  const model = buildPregameMapSetupFlowModel({
    isHostView: true,
    rolesReadyForMapSetup: true,
    lifecycleState: 'map_setup',
    mapHasBeenApplied: false,
    hasDraftSelection: true,
    draftDiffersFromApplied: false
  });

  assert.equal(model.primaryAction?.kind, 'apply_region');
  assert.equal(model.primaryAction?.label, 'Apply Play Area');
});

test('pregame map flow makes start match the primary action once the map is applied', () => {
  const model = buildPregameMapSetupFlowModel({
    isHostView: true,
    rolesReadyForMapSetup: true,
    lifecycleState: 'map_setup',
    mapHasBeenApplied: true,
    hasDraftSelection: false,
    draftDiffersFromApplied: false
  });

  assert.equal(model.primaryAction?.kind, 'start_match');
  assert.equal(model.title, 'Start the game');
});

test('pregame map flow keeps non-host players in a waiting state while the host finishes setup', () => {
  const model = buildPregameMapSetupFlowModel({
    isHostView: false,
    rolesReadyForMapSetup: true,
    lifecycleState: 'map_setup',
    mapHasBeenApplied: false,
    hasDraftSelection: false,
    draftDiffersFromApplied: false
  });

  assert.equal(model.title, 'Waiting for the playable area');
  assert.equal(model.primaryAction?.kind, 'open_match_room');
});
