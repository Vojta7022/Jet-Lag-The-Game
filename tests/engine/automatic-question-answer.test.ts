import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  recordLocationUpdate,
  setupMatchToSeekReady
} from './helpers.ts';

function setupRadarMatch() {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 14
  });
  return { aggregate, contentPack };
}

test('Transit Line cannot be asked unless seekers confirm they are riding moving transit', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:transit-line-rule',
        templateId: 'matching-transit-line',
        targetTeamId: 'team-hider'
      }
    }, 16), contentPack), /confirm the seekers are riding moving transit/i);

  const accepted = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:transit-line-confirmed',
        templateId: 'matching-transit-line',
        targetTeamId: 'team-hider',
        confirmedMovingTransit: true
      }
    }, 17), contentPack);
  assert.equal(accepted.aggregate.questionInstances['question:transit-line-confirmed']?.confirmedMovingTransit, true);
  assert.equal(buildMatchProjection(accepted.aggregate, contentPack, {
    scope: 'public_match', viewerPlayerId: 'seeker-1', viewerRole: 'seeker', viewerTeamId: 'team-seeker'
  }).visibleQuestions.find((question) => question.questionInstanceId === 'question:transit-line-confirmed')?.confirmedMovingTransit, true);
});

test('Radar automatically answers from fresh hider and seeker fixes and applies the bounded map deduction', () => {
  const { aggregate, contentPack } = setupRadarMatch();
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;

  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 16), contentPack);
  const resolved = result.aggregate;

  assert.equal(resolved.questionInstances['question:auto-radar']?.status, 'resolved');
  assert.equal(resolved.questionInstances['question:auto-radar']?.answer?.value, 'yes');
  assert.equal(Object.values(resolved.constraints).some((constraint) => constraint.sourceQuestionInstanceId === 'question:auto-radar'), true);
  assert.equal(resolved.searchArea?.history.at(-1)?.summary.includes('Radar'), true);

  const hiderView = buildMatchProjection(resolved, contentPack, {
    scope: 'player_private', viewerPlayerId: 'hider-1', viewerRole: 'hider', viewerTeamId: 'team-hider'
  });
  const seekerView = buildMatchProjection(resolved, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerRole: 'seeker', viewerTeamId: 'team-seeker'
  });
  assert.equal(hiderView.visibleQuestions.find((question) => question.questionInstanceId === 'question:auto-radar')?.answer?.value, 'yes');
  assert.equal(hiderView.visibleMovementTracks.some((track) => track.playerId === 'seeker-1'), true);
  assert.equal(seekerView.visibleMovementTracks.some((track) => track.playerId === 'hider-1'), false);
  assert.equal(seekerView.pendingQuestionReward, undefined);
  const answerEvent = result.events.find((event) => event.event.type === 'question_answered');
  assert.ok(answerEvent && answerEvent.event.type === 'question_answered');
  assert.equal('latitude' in answerEvent.event.payload, false);
  assert.equal('longitude' in answerEvent.event.payload, false);
});

test('Radar Choose freezes the seeker-selected radius for the automatic answer and map deduction', () => {
  const { aggregate, contentPack } = setupRadarMatch();
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;

  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:radar-chosen-distance',
        templateId: 'radar-choose',
        targetTeamId: 'team-hider',
        chosenDistanceMeters: 1500
      }
    }, 16), contentPack);

  const question = result.aggregate.questionInstances['question:radar-chosen-distance'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'yes');
  assert.equal(question?.chosenDistanceMeters, 1500);
  assert.equal(question?.automaticResolution?.thresholdMeters, 1500);
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:radar-chosen-distance'
  );
  assert.equal(constraint?.metadata.radiusMeters, 1500);
});

test('Radar Choose requires a positive distance and fixed Radar prompts reject custom radii', () => {
  const { aggregate, contentPack } = setupRadarMatch();
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  for (const chosenDistanceMeters of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
        type: 'ask_question',
        payload: {
          questionInstanceId: `question:invalid-radar-${String(chosenDistanceMeters)}`,
          templateId: 'radar-choose',
          targetTeamId: 'team-hider',
          ...(chosenDistanceMeters !== undefined ? { chosenDistanceMeters } : {})
        }
      }, 16), contentPack), /choose a distance greater than zero/i);
  }
  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:fixed-radar-customized',
        templateId: 'radar-402',
        targetTeamId: 'team-hider',
        chosenDistanceMeters: 1500
      }
    }, 16), contentPack), /cannot accept a custom radius/i);
});

test('Landmass Matching compares complete island polygons and applies the same map deduction', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.101, longitude: 103.801,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const outer = {
    type: 'Polygon' as const,
    coordinates: [[[103.79, 1.09], [103.81, 1.09], [103.81, 1.11], [103.79, 1.11], [103.79, 1.09]]]
  };
  const enclosed = {
    type: 'Polygon' as const,
    coordinates: [[[103.8005, 1.1005], [103.8015, 1.1005], [103.8015, 1.1015], [103.8005, 1.1015], [103.8005, 1.1005]]]
  };
  const dataset = {
    source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'landmass-test', fetchedAt: '2026-10-25T12:00:00.000Z', coverage: 'approximate' as const,
    features: [
      { featureId: 'osm:way/1', featureClassId: 'landmass', label: 'Island', longitude: 103.8, latitude: 1.1, geometry: outer, geometrySupport: 'polygon' as const, coverage: 'approximate' as const },
      { featureId: 'osm:relation/2', featureClassId: 'landmass', label: 'Islet', longitude: 103.801, latitude: 1.101, geometry: enclosed, geometrySupport: 'polygon' as const, coverage: 'approximate' as const }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question', payload: {
        questionInstanceId: 'question:auto-landmass', templateId: 'matching-landmass', targetTeamId: 'team-hider'
      }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-landmass'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'yes');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:way/1');
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:auto-landmass'
  );
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('Matching automatically compares the nearest same-class features and narrows from the trusted feature snapshot', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.82,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-feature-snapshot-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      { featureId: 'osm:node/1', featureClassId: 'hospital', label: 'West Hospital', longitude: 103.799, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const },
      { featureId: 'osm:node/2', featureClassId: 'hospital', label: 'East Hospital', longitude: 103.821, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-matching', templateId: 'matching-hospital', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  assert.equal(result.aggregate.questionInstances['question:auto-matching']?.status, 'resolved');
  assert.equal(result.aggregate.questionInstances['question:auto-matching']?.answer?.value, 'no');
  assert.equal(result.aggregate.questionInstances['question:auto-matching']?.automaticResolution?.referenceFeatureId, 'osm:node/1');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === 'question:auto-matching');
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.equal(result.aggregate.searchArea?.history.at(-1)?.summary.includes('Matching'), true);
});

test('Street or Path Matching uses the nearest street segment geometry and narrows from the same snapshot', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.82,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-street-path-snapshot-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      {
        featureId: 'osm:street-path/named/101-102', featureClassId: 'street-or-path', label: 'Elm Street',
        longitude: 103.79, latitude: 1.1, geometrySupport: 'line' as const, coverage: 'approximate' as const,
        geometry: { type: 'MultiLineString' as const, coordinates: [
          [[103.79, 1.1], [103.81, 1.1]], [[103.81, 1.1], [103.83, 1.1]]
        ] }
      },
      {
        featureId: 'osm:street-path/named/202', featureClassId: 'street-or-path', label: 'Pine Road',
        longitude: 103.8, latitude: 1.104, geometrySupport: 'line' as const, coverage: 'approximate' as const,
        geometry: { type: 'LineString' as const, coordinates: [[103.79, 1.104], [103.83, 1.104]] }
      }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-matching-street-path', templateId: 'matching-street-or-path', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-matching-street-path'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'yes');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:street-path/named/101-102');
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:auto-matching-street-path'
  );
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('administrative Matching selects a country-hierarchy division and clips the map to the seeker division', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 50.1, longitude: 14.1,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 50.2, longitude: 14.2,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const polygon = (west: number, east: number) => ({
    type: 'MultiPolygon' as const,
    coordinates: [[[[west, 50], [east, 50], [east, 50.4], [west, 50.4], [west, 50]]]]
  });
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-admin-boundaries-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      { featureId: 'osm:relation/country', featureClassId: 'admin-boundary', label: 'Country', longitude: 14.2, latitude: 50.2, geometrySupport: 'polygon' as const, coverage: 'approximate' as const, properties: { adminLevel: 2 }, geometry: polygon(14, 14.4) },
      { featureId: 'osm:relation/state-a', featureClassId: 'admin-boundary', label: 'State A', longitude: 14.1, latitude: 50.2, geometrySupport: 'polygon' as const, coverage: 'approximate' as const, properties: { adminLevel: 4 }, geometry: polygon(14, 14.25) },
      { featureId: 'osm:relation/state-b', featureClassId: 'admin-boundary', label: 'State B', longitude: 14.3, latitude: 50.2, geometrySupport: 'polygon' as const, coverage: 'approximate' as const, properties: { adminLevel: 4 }, geometry: polygon(14.25, 14.4) }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:admin-matching', templateId: 'matching-1st-admin-state', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:admin-matching'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'yes');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:relation/state-a');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === question?.questionInstanceId);
  assert.equal(constraint?.metadata.referenceAdminBoundaryId, 'osm:relation/state-a');
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);

  const incompleteHierarchy = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:admin-missing-level', templateId: 'matching-2nd-admin-county', targetTeamId: 'team-hider' }
    }, 17), contentPack, { ...dataset, features: [dataset.features[0]!, dataset.features[1]!, dataset.features[2]!] });
  assert.equal(incompleteHierarchy.aggregate.questionInstances['question:admin-missing-level']?.status, 'awaiting_answer');
});

test('administrative-border Measuring compares distance to the same shared boundary and updates the map', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 50.2, longitude: 14.1,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 50.2, longitude: 14.14,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-admin-boundaries-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [{
      featureId: 'osm:admin-border/4/900',
      featureClassId: 'a-1st-admin-border-state',
      label: '1st Admin State Border',
      longitude: 14.15,
      latitude: 50.2,
      geometrySupport: 'line' as const,
      coverage: 'approximate' as const,
      properties: { adminLevel: 4 },
      geometry: { type: 'MultiLineString', coordinates: [[[14.15, 50], [14.15, 50.4]]] }
    }]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:admin-border-distance', templateId: 'measuring-a-1st-admin-border-state', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:admin-border-distance'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'closer');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:admin-border/4/900');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === question?.questionInstanceId);
  assert.equal(constraint?.metadata.distanceToleranceMeters, 10);
  assert.ok(constraint);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('International Border Measuring compares both fixes to a shared country border and updates the map', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.79,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.805,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-international-border-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [{
      featureId: 'osm:admin-border/2/100', featureClassId: 'an-international-border', label: 'International Border',
      longitude: 103.81, latitude: 1.1, geometrySupport: 'line' as const, coverage: 'approximate' as const,
      geometry: { type: 'LineString' as const, coordinates: [[103.81, 1], [103.81, 1.2]] }
    }]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:auto-international-border',
        templateId: 'measuring-an-international-border',
        targetTeamId: 'team-hider'
      }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-international-border'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'closer');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:admin-border/2/100');
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:auto-international-border'
  );
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('Body of Water Measuring compares distance to the named water boundary and updates the map', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.78,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.792,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-water-shape-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [{
      featureId: 'osm:way/301', featureClassId: 'a-body-of-water', label: 'Blue Lake',
      longitude: 103.8025, latitude: 1.1, geometrySupport: 'polygon' as const, coverage: 'approximate' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[
        [103.795, 1.095], [103.81, 1.095], [103.81, 1.105], [103.795, 1.105], [103.795, 1.095]
      ]] }
    }, {
      featureId: 'osm:way/304', featureClassId: 'a-body-of-water', label: 'Named River',
      longitude: 103.785, latitude: 1.1, geometrySupport: 'line' as const, coverage: 'approximate' as const,
      geometry: { type: 'LineString' as const, coordinates: [[103.785, 1.09], [103.785, 1.11]] }
    }]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:auto-body-of-water',
        templateId: 'measuring-a-body-of-water',
        targetTeamId: 'team-hider'
      }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-body-of-water'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'further');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:way/304');
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:auto-body-of-water'
  );
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal(constraint?.metadata.referenceFeatureId, 'osm:way/304');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('Coastline Measuring compares distance to the mapped shoreline and updates the map', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.78,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.792,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-coastline-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [{
      featureId: 'osm:way/501', featureClassId: 'a-coastline', label: 'Mapped coastline',
      longitude: 103.8, latitude: 1.1, geometrySupport: 'line' as const, coverage: 'approximate' as const,
      geometry: { type: 'LineString' as const, coordinates: [[103.8, 1.08], [103.8, 1.12]] }
    }]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: {
        questionInstanceId: 'question:auto-coastline',
        templateId: 'measuring-a-coastline',
        targetTeamId: 'team-hider'
      }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-coastline'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'closer');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:way/501');
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:auto-coastline'
  );
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('Sea Level uses the shared Copernicus grid for a confidence-bounded answer and map deduction', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.75,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.79,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'Open-Meteo / Copernicus DEM GLO-90' as const,
    sourceUrl: 'https://open-meteo.com/en/docs/elevation-api',
    sourceVersion: 'copernicus-dem-glo90-egm2008',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      { featureId: 'dem:seeker', featureClassId: 'sea-level', label: 'Elevation', longitude: 103.75, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const, geometry: { type: 'Point', coordinates: [103.75, 1.1] }, properties: { elevationMeters: 100, verticalDatum: 'EGM2008', absoluteVerticalErrorMeters: 4, gridSpacingMeters: 1000 } },
      { featureId: 'dem:hider', featureClassId: 'sea-level', label: 'Elevation', longitude: 103.79, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const, geometry: { type: 'Point', coordinates: [103.79, 1.1] }, properties: { elevationMeters: 20, verticalDatum: 'EGM2008', absoluteVerticalErrorMeters: 4, gridSpacingMeters: 1000 } },
      { featureId: 'dem:closer', featureClassId: 'sea-level', label: 'Elevation', longitude: 103.82, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const, geometry: { type: 'Point', coordinates: [103.82, 1.1] }, properties: { elevationMeters: 25, verticalDatum: 'EGM2008', absoluteVerticalErrorMeters: 4, gridSpacingMeters: 1000 } },
      { featureId: 'dem:further', featureClassId: 'sea-level', label: 'Elevation', longitude: 103.85, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const, geometry: { type: 'Point', coordinates: [103.85, 1.1] }, properties: { elevationMeters: 130, verticalDatum: 'EGM2008', absoluteVerticalErrorMeters: 4, gridSpacingMeters: 1000 } }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-sea-level', templateId: 'measuring-sea-level', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-sea-level'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'closer');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'dem:seeker');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === 'question:auto-sea-level');
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal(constraint?.metadata.featureDatasetSource, 'Open-Meteo / Copernicus DEM GLO-90');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('Sea Level falls back to manual answering when altitude uncertainty overlaps', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.75,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.79,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const sample = (featureId: string, longitude: number, elevationMeters: number) => ({
    featureId, featureClassId: 'sea-level', label: 'Elevation', longitude, latitude: 1.1,
    geometrySupport: 'point' as const, coverage: 'approximate' as const,
    properties: { elevationMeters, verticalDatum: 'EGM2008', absoluteVerticalErrorMeters: 4, gridSpacingMeters: 1000 }
  });
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:ambiguous-sea-level', templateId: 'measuring-sea-level', targetTeamId: 'team-hider' }
    }, 16), contentPack, {
      source: 'Open-Meteo / Copernicus DEM GLO-90',
      sourceUrl: 'https://open-meteo.com/en/docs/elevation-api',
      sourceVersion: 'copernicus-dem-glo90-egm2008',
      retrievedAt: new Date(16_000).toISOString(), coverage: 'approximate',
      features: [sample('dem:seeker', 103.75, 20), sample('dem:hider', 103.79, 23)]
    });

  assert.equal(result.aggregate.questionInstances['question:ambiguous-sea-level']?.status, 'awaiting_answer');
  assert.equal(result.aggregate.questionInstances['question:ambiguous-sea-level']?.automaticResolution, undefined);

});

test('Station-name-length Matching compares nearest names by character count and clips by that same rule', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.82,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-feature-snapshot-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      { featureId: 'osm:node/1', featureClassId: 'stations-name-length', label: 'Café', longitude: 103.799, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const },
      { featureId: 'osm:node/2', featureClassId: 'stations-name-length', label: 'Cafe\u0301', longitude: 103.821, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const },
      { featureId: 'osm:node/3', featureClassId: 'stations-name-length', label: 'Broadway', longitude: 103.81, latitude: 1.1, geometrySupport: 'point' as const, coverage: 'approximate' as const }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-station-name-length', templateId: 'matching-stations-name-length', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  assert.equal(result.aggregate.questionInstances['question:auto-station-name-length']?.status, 'resolved');
  assert.equal(result.aggregate.questionInstances['question:auto-station-name-length']?.answer?.value, 'yes');
  assert.equal(result.aggregate.questionInstances['question:auto-station-name-length']?.automaticResolution?.referenceFeatureId, 'osm:node/1');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === 'question:auto-station-name-length');
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.match(constraint?.explanation.summary ?? '', /nearest station name/i);
});

test('Matching leaves an empty approximate feature dataset to the hider instead of guessing null', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-matching-null', templateId: 'matching-hospital', targetTeamId: 'team-hider' }
    }, 16), contentPack, {
      source: 'OpenStreetMap',
      sourceUrl: 'https://www.openstreetmap.org/copyright',
      sourceVersion: 'test-feature-snapshot-v1',
      retrievedAt: new Date(16_000).toISOString(),
      coverage: 'approximate',
      features: []
    });

  assert.equal(result.aggregate.questionInstances['question:auto-matching-null']?.status, 'awaiting_answer');
  assert.equal(result.aggregate.questionInstances['question:auto-matching-null']?.answer, undefined);
  assert.equal(Object.values(result.aggregate.constraints).some((item) => item.sourceQuestionInstanceId === 'question:auto-matching-null'), false);
  assert.equal(result.events.some((event) => event.event.type === 'question_null_answer_resolved'), false);
});

test('Measuring automatically compares fresh player locations to the seeker selected feature and clips from that snapshot', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.81,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-feature-snapshot-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      { featureId: 'osm:way/9', featureClassId: 'a-commercial-airport', label: 'Changi Airport', longitude: 103.82, latitude: 1.1, geometrySupport: 'mixed' as const, coverage: 'approximate' as const }
    ]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-measuring', templateId: 'measuring-a-commercial-airport', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  assert.equal(result.aggregate.questionInstances['question:auto-measuring']?.status, 'resolved');
  assert.equal(result.aggregate.questionInstances['question:auto-measuring']?.answer?.value, 'closer');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === 'question:auto-measuring');
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal((constraint?.metadata.automaticResolution as { referenceFeatureId?: string }).referenceFeatureId, 'osm:way/9');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.equal(result.aggregate.searchArea?.history.at(-1)?.summary.includes('Measuring'), true);
});

test('High-Speed Train Line Measuring compares both fixes to one mapped rail segment and narrows the map', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1, longitude: 103.75,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.79,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-feature-snapshot-v2',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [{
      featureId: 'osm:way/801', featureClassId: 'a-high-speed-train-line', label: 'Fast Line',
      longitude: 103.76, latitude: 1.1, geometrySupport: 'line' as const, coverage: 'approximate' as const,
      geometry: { type: 'LineString' as const, coordinates: [[103.76, 1.05], [103.76, 1.15]] }
    }]
  };
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-high-speed', templateId: 'measuring-a-high-speed-train-line', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-high-speed'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, 'further');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:way/801');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === question?.questionInstanceId);
  assert.equal(constraint?.resolutionMode, 'approximate');
  assert.equal(constraint?.metadata.referenceFeatureId, 'osm:way/801');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.ok(result.aggregate.searchArea?.remainingArea.geometry);
});

test('Tentacles automatically picks the closest reachable mapped place and narrows from the same seeker-anchored set', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack, 'medium');
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 50.2, longitude: 14.2045,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 50.2, longitude: 14.2,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-feature-snapshot-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      { featureId: 'osm:node/10', featureClassId: 'museums', label: 'Near Museum', longitude: 14.205, latitude: 50.2, geometrySupport: 'point' as const, coverage: 'approximate' as const },
      { featureId: 'osm:node/11', featureClassId: 'museums', label: 'Farther Museum', longitude: 14.208, latitude: 50.2, geometrySupport: 'point' as const, coverage: 'approximate' as const },
      { featureId: 'osm:node/12', featureClassId: 'museums', label: 'Outside Reach Museum', longitude: 14.23, latitude: 50.2, geometrySupport: 'point' as const, coverage: 'approximate' as const }
    ]
  };
  const before = prompted.searchArea?.remainingArea.geometry;
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-tentacles', templateId: 'tentacles-museums-1600', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-tentacles'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.selectedFeatureId, 'osm:node/10');
  assert.equal(question?.answer?.value, 'Near Museum');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:node/10');
  const constraint = Object.values(result.aggregate.constraints).find((item) => item.sourceQuestionInstanceId === 'question:auto-tentacles');
  assert.equal(constraint?.metadata.selectedFeatureId, 'osm:node/10');
  assert.equal('featureData' in (constraint?.metadata ?? {}), false);
  assert.notDeepEqual(result.aggregate.searchArea?.remainingArea.geometry, before);
});

test('Metro Lines Tentacles uses the same route geometries for reach, answer, and map deduction', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack, 'large');
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 50.21, longitude: 14.3,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 50.2, longitude: 14.2,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test-metro-routes-v1',
    retrievedAt: new Date(16_000).toISOString(),
    coverage: 'approximate' as const,
    features: [
      {
        featureId: 'osm:metro-line/Metro%20City:A', featureClassId: 'metro-lines', label: 'A',
        longitude: 14.205, latitude: 50.2, geometrySupport: 'line' as const, coverage: 'approximate' as const,
        geometry: { type: 'LineString' as const, coordinates: [[14.205, 50.0], [14.205, 50.4]] }
      },
      {
        featureId: 'osm:metro-line/Metro%20City:B', featureClassId: 'metro-lines', label: 'B',
        longitude: 14.3, latitude: 50.21, geometrySupport: 'line' as const, coverage: 'approximate' as const,
        geometry: { type: 'LineString' as const, coordinates: [[14.2, 50.21], [14.4, 50.21]] }
      }
    ]
  };
  const before = prompted.searchArea?.remainingArea.geometry;
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-metro-tentacles', templateId: 'tentacles-metro-lines-24140', targetTeamId: 'team-hider' }
    }, 16), contentPack, dataset);

  const question = result.aggregate.questionInstances['question:auto-metro-tentacles'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.selectedFeatureId, 'osm:metro-line/Metro%20City:B');
  assert.equal(question?.answer?.value, 'B');
  assert.equal(question?.automaticResolution?.referenceFeatureId, 'osm:metro-line/Metro%20City:B');
  const constraint = Object.values(result.aggregate.constraints).find(
    (item) => item.sourceQuestionInstanceId === 'question:auto-metro-tentacles'
  );
  assert.equal(constraint?.metadata.selectedFeatureId, 'osm:metro-line/Metro%20City:B');
  assert.notDeepEqual(result.aggregate.searchArea?.remainingArea.geometry, before);
});

test('Tentacles records the valid out-of-reach response without drawing a map constraint', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack, 'medium');
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 50.2, longitude: 14.24,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 50.2, longitude: 14.2,
    accuracyMeters: 5, source: 'device', step: 14
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;
  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-tentacles-out-of-reach', templateId: 'tentacles-museums-1600', targetTeamId: 'team-hider' }
    }, 16), contentPack, {
      source: 'OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/copyright',
      sourceVersion: 'test-feature-snapshot-v1', retrievedAt: new Date(16_000).toISOString(),
      coverage: 'approximate', features: [
        { featureId: 'osm:node/10', featureClassId: 'museums', label: 'Near Museum', longitude: 14.205, latitude: 50.2, geometrySupport: 'point', coverage: 'approximate' }
      ]
    });

  const question = result.aggregate.questionInstances['question:auto-tentacles-out-of-reach'];
  assert.equal(question?.status, 'resolved');
  assert.equal(question?.answer?.value, null);
  assert.equal(question?.answer?.reason, 'not_within_reach');
  assert.equal(Object.values(result.aggregate.constraints).some((item) => item.sourceQuestionInstanceId === question?.questionInstanceId), false);
  const dealtReward = executeCommand(result.aggregate, makeEnvelope(result.aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'deal_question_reward', payload: { questionInstanceId: question!.questionInstanceId }
    }, 17), contentPack).aggregate;
  assert.equal(dealtReward.pendingQuestionReward?.sets[0]?.cardInstanceIds.length, 4);
  assert.equal(dealtReward.pendingQuestionReward?.sets[0]?.pickCount, 2);
});

test('Thermometer automatically compares the seekers previous and current locations with the hider', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.12, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.109, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 14
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 15
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 16
  });
  const startSampleId = aggregate.locationSamples.find((sample) => sample.playerId === 'seeker-1')?.sampleId;
  const currentSampleId = [...aggregate.locationSamples].reverse().find((sample) => sample.playerId === 'seeker-1')?.sampleId;
  const hiderSampleId = aggregate.locationSamples.find((sample) => sample.playerId === 'hider-1')?.sampleId;
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 17), contentPack).aggregate;

  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-thermometer', templateId: 'thermometer-1000', targetTeamId: 'team-hider' }
    }, 18), contentPack);

  assert.equal(result.aggregate.questionInstances['question:auto-thermometer']?.status, 'resolved');
  assert.equal(result.aggregate.questionInstances['question:auto-thermometer']?.answer?.value, 'hotter');
  assert.deepEqual(result.aggregate.questionInstances['question:auto-thermometer']?.automaticResolution?.sourceSampleIds,
    [startSampleId, currentSampleId, hiderSampleId]);
  const thermometerConstraint = Object.values(result.aggregate.constraints)
    .find((constraint) => constraint.sourceQuestionInstanceId === 'question:auto-thermometer');
  assert.equal(thermometerConstraint?.status, 'active');
  assert.equal((thermometerConstraint?.metadata.automaticResolution as { movementStartSampleId?: string }).movementStartSampleId, startSampleId);
  assert.match(result.aggregate.searchArea?.history.at(-1)?.summary ?? '', /Thermometer/i);
  assert.match(thermometerConstraint?.explanation.reasoningSteps.join(' ') ?? '', /frozen Thermometer start and end locations/i);
});

test('Thermometer refuses to answer until the printed minimum distance is proven by GPS', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.12, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 23
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 24
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.115, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 25
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 26), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:short-thermometer', templateId: 'thermometer-1000', targetTeamId: 'team-hider' }
    }, 27), contentPack), /travel at least 1 km/i);
});

test('Thermometer asks for better GPS when positional uncertainty overlaps the travel minimum', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.12, longitude: 103.8,
    accuracyMeters: 10, source: 'device', step: 33
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.11, longitude: 103.8,
    accuracyMeters: 10, source: 'device', step: 34
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.111, longitude: 103.8,
    accuracyMeters: 10, source: 'device', step: 35
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 36), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:uncertain-thermometer', templateId: 'thermometer-1000', targetTeamId: 'team-hider' }
    }, 37), contentPack), /GPS uncertainty overlaps the Thermometer travel minimum/i);
});

test('Radar refuses to guess when either location fix is stale or too imprecise', () => {
  const { aggregate, contentPack } = setupRadarMatch();
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 60), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:stale-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 61), contentPack), /fresh and accurate location fix/i);
});

test('Radar refuses a location fix whose reported accuracy exceeds the configured bound', () => {
  const { aggregate: initial, contentPack } = setupRadarMatch();
  const aggregate = recordLocationUpdate(initial, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 120, source: 'device', step: 15
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 16), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:imprecise-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 17), contentPack), /fresh and accurate location fix/i);
});

test('Radar returns no and applies the outside-radius constraint when the hider is beyond the threshold', () => {
  const { aggregate: initial, contentPack } = setupRadarMatch();
  const aggregate = recordLocationUpdate(initial, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.11, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 15
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 16), contentPack).aggregate;
  const resolved = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:outside-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 17), contentPack).aggregate;

  assert.equal(resolved.questionInstances['question:outside-radar']?.answer?.value, 'no');
  assert.equal(Object.values(resolved.constraints).some((constraint) => constraint.constraintId === 'outside-radius'), true);
});

test('Radar asks for refreshed fixes when GPS uncertainty overlaps the question threshold', () => {
  const { aggregate: initial, contentPack } = setupRadarMatch();
  const aggregate = recordLocationUpdate(initial, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1036, longitude: 103.8,
    accuracyMeters: 30, source: 'device', step: 15
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 16), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:ambiguous-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 17), contentPack), /overlaps the Radar boundary/i);
});
