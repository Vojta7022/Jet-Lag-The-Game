import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';
import { getCardDiscardRequirement } from '../../../packages/domain/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { ensureMobileShellContentPack } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import {
  buildDeckViewModels,
  canRoleUseDeck
} from '../src/features/cards/card-catalog.ts';
import { buildCardFlowBootstrapCommands } from '../src/features/cards/card-flow-bootstrap.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

function findPlayableSmokeCard(contentPack: ContentPack, projection: { visibleCards: Array<{ cardDefinitionId: string; zone: string }> }) {
  return projection.visibleCards.find((card) => {
    if (card.zone !== 'hand') return false;
    const definition = contentPack.cards.find((candidate) => candidate.cardDefinitionId === card.cardDefinitionId);
    return Boolean(definition && definition.kind !== 'time_bonus' && Object.keys(getCardDiscardRequirement(definition)).length === 0);
  });
}

test('cards flow can bootstrap gameplay, draw, play, and discard through the real mobile runtime', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-card-1',
    authUserId: 'auth-host-card-1'
  };

  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-cards-flow',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const prepared = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    buildCardFlowBootstrapCommands(created.initialSync.projectionDelivery.projection, { mode: 'demo' })
  );

  assert.equal(prepared.projectionDelivery.projection.lifecycleState, 'seek_phase');

  let drawn = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'draw_card',
        payload: {
          deckId: 'hider-main'
        }
      }
    ]
  );

  let firstHandCard = findPlayableSmokeCard(contentPack, drawn.projectionDelivery.projection);
  while (!firstHandCard) {
    const handCards = drawn.projectionDelivery.projection.visibleCards.filter((card) => card.zone === 'hand');
    const drawPileCount = drawn.projectionDelivery.projection.visibleCards.filter((card) => card.zone === 'draw_pile').length;
    if (handCards.length >= 6) {
      if (handCards.length === 0) break;
      drawn = await orchestrator.submitCommands(
        created.connection,
        { actorId: hostProfile.playerId, playerId: hostProfile.playerId, role: 'host' },
        [{ type: 'discard_card', payload: { cardInstanceId: handCards[0]!.cardInstanceId } }]
      );
    }
    if (drawPileCount === 0) break;
    drawn = await orchestrator.submitCommands(
      created.connection,
      { actorId: hostProfile.playerId, playerId: hostProfile.playerId, role: 'host' },
      [{ type: 'draw_card', payload: { deckId: 'hider-main' } }]
    );
    firstHandCard = findPlayableSmokeCard(contentPack, drawn.projectionDelivery.projection);
  }

  assert.ok(firstHandCard, 'a shuffled six-card hand should include a playable no-cost card');
  const deckViewModelsAfterDraw = buildDeckViewModels(contentPack, drawn.projectionDelivery.projection, 'host');
  const hiderDeck = deckViewModelsAfterDraw.find((deck) => deck.deck.deckId === 'hider-main');
  assert.ok(hiderDeck?.visibleByZone.hand.some((card) => card.card.cardInstanceId === firstHandCard!.cardInstanceId));
  assert.equal((hiderDeck?.visibleByZone.draw_pile.length ?? 0) > 0, true);

  const afterPlay = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'play_card',
        payload: {
          cardInstanceId: firstHandCard!.cardInstanceId
        }
      }
    ]
  );

  const afterResolution = afterPlay.projectionDelivery.projection.activeCardResolution
    ? await orchestrator.submitCommands(
        created.connection,
        {
          actorId: hostProfile.playerId,
          playerId: hostProfile.playerId,
          role: 'host'
        },
        [
          {
            type: 'resolve_card_window',
            payload: {
              sourceCardInstanceId: firstHandCard!.cardInstanceId
            }
          }
        ]
      )
    : afterPlay;

  assert.equal(afterResolution.projectionDelivery.projection.activeCardResolution, undefined);
  assert.equal(
    afterResolution.projectionDelivery.projection.visibleCards.some(
      (card) => card.cardInstanceId === firstHandCard!.cardInstanceId && card.zone === 'discard_pile'
    ),
    true
  );

  const redrawn = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'draw_card',
        payload: {
          deckId: 'hider-main'
        }
      }
    ]
  );

  const secondHandCard = redrawn.projectionDelivery.projection.visibleCards.find((card) => card.zone === 'hand');
  assert.ok(secondHandCard);

  const afterDiscard = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'discard_card',
        payload: {
          cardInstanceId: secondHandCard!.cardInstanceId
        }
      }
    ]
  );

  const discardCount = afterDiscard.projectionDelivery.projection.visibleCards.filter(
    (card) => card.zone === 'discard_pile'
  ).length;
  assert.equal(discardCount >= 2, true);

  await orchestrator.disconnect(created.connection);
});

test('card deck access helpers stay role-aware for host, hider, seeker, and spectator views', () => {
  const contentPack = loadContentPack();
  const hiderDeck = contentPack.decks.find((deck) => deck.deckId === 'hider-main');

  assert.ok(hiderDeck);
  assert.equal(canRoleUseDeck('host', hiderDeck!), true);
  assert.equal(canRoleUseDeck('hider', hiderDeck!), true);
  assert.equal(canRoleUseDeck('seeker', hiderDeck!), false);
  assert.equal(canRoleUseDeck('spectator', hiderDeck!), false);
});
