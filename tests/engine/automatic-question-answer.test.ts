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
