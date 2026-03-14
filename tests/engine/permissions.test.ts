import assert from 'node:assert/strict';
import test from 'node:test';

import { EngineCommandError, executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToHidePhase, setupMatchToSeekReady } from './helpers.ts';

test('permission checks block seeker-only and spectator-forbidden actions', () => {
  const contentPack = loadEngineTestContentPack();
  const hidePhaseAggregate = setupMatchToHidePhase(contentPack);

  assert.throws(
    () =>
      executeCommand(
        hidePhaseAggregate,
        makeEnvelope(
          hidePhaseAggregate.matchId,
          { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
          {
            type: 'lock_hider_location',
            payload: {
              latitude: 1,
              longitude: 1
            }
          },
          20
        ),
        contentPack
      ),
    (error: unknown) => {
      assert.ok(error instanceof EngineCommandError);
      assert.equal(error.issues[0]?.code, 'FORBIDDEN');
      return true;
    }
  );

  const aggregate = setupMatchToSeekReady(contentPack);

  assert.throws(
    () =>
      executeCommand(
        aggregate,
        makeEnvelope(
          aggregate.matchId,
          { actorId: 'spectator-1', playerId: 'spectator-1', role: 'spectator' },
          { type: 'begin_question_prompt', payload: {} },
          21
        ),
        contentPack
      ),
    (error: unknown) => {
      assert.ok(error instanceof EngineCommandError);
      assert.equal(error.issues[0]?.code, 'FORBIDDEN');
      return true;
    }
  );
});
