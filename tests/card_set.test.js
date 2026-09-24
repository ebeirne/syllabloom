const test = require('node:test');
const assert = require('node:assert/strict');
const { cardKey, legacyCardKey, mergeSource, removeCardFromSet, removeSourceCard, sourceCards } = require('../card-set.js');

const source = {
  id: 'source-1',
  draftCards: [
    { front: 'What is encoding?', back: 'Putting information into memory.', section: 'Memory' },
    { front: 'What is retrieval?', back: 'Accessing stored information.', section: 'Memory' }
  ]
};

test('deleting a source card removes it from the source and records an exclusion', () => {
  const card = { ...source.draftCards[0], sourceId: source.id, sourceKey: 'What is encoding?::Memory' };
  const updated = removeSourceCard([source], card);

  assert.equal(updated[0].draftCards.length, 1);
  assert.deepEqual(updated[0].deletedCardKeys, [cardKey(source.draftCards[0])]);
  assert.deepEqual(sourceCards(updated).map(item => item.front), ['What is retrieval?']);
});

test('re-importing the same source does not silently restore a removed card', () => {
  const removed = removeSourceCard([source], {
    ...source.draftCards[0], sourceId: source.id, sourceKey: 'What is encoding?::Memory'
  })[0];
  const refreshed = mergeSource(removed, { ...source, draftCards: [...source.draftCards] });

  assert.deepEqual(sourceCards([refreshed]).map(item => item.front), ['What is retrieval?']);
});

test('deletion is scoped to its source and card identity', () => {
  const otherSource = { id: 'source-2', draftCards: [source.draftCards[0]] };
  const updated = removeSourceCard([source, otherSource], {
    ...source.draftCards[0], sourceId: source.id
  });

  assert.equal(updated[0].draftCards.length, 1);
  assert.equal(updated[1].draftCards.length, 1);
});

test('same question with different answers remains as separate, individually removable cards', () => {
  const first = { id: 'source-1', draftCards: [{ front: 'What is encoding?', back: 'Putting information into memory.', section: 'Memory' }] };
  const second = { id: 'source-2', draftCards: [{ front: 'What is encoding?', back: 'Transforming information into a usable code.', section: 'Memory' }] };
  const cards = sourceCards([first, second]);

  assert.equal(cards.length, 2);
  const updated = removeSourceCard([first, second], cards[0]);
  assert.equal(sourceCards(updated).length, 1);
  assert.equal(sourceCards(updated)[0].back, second.draftCards[0].back);
});

test('legacy question-and-section deletion records still suppress the old card', () => {
  const legacyDeletedSource = {
    ...source,
    deletedCardKeys: [legacyCardKey(source.draftCards[0])]
  };

  assert.deepEqual(sourceCards([legacyDeletedSource]).map(card => card.front), ['What is retrieval?']);
});

test('identical question and answer cards from separate materials are kept once with both sources', () => {
  const first = { id: 'source-1', name: 'Homework 1.pdf', draftCards: [source.draftCards[0]] };
  const second = { id: 'source-2', name: 'Homework 2.pdf', draftCards: [
    { ...source.draftCards[0], section: 'Memory retrieval' },
    { front: 'What is retrieval?', back: 'Accessing stored information.', section: 'Memory' }
  ] };

  const cards = sourceCards([first, second]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].sourceId, 'source-1');
  assert.deepEqual(cards[0].duplicateSourceRefs, [{
    sourceId: 'source-2',
    key: cardKey(source.draftCards[0]),
    sourceName: 'Homework 2.pdf'
  }]);
  assert.equal(cards[1].sourceId, 'source-2');
});

test('deleting a deduplicated card excludes every source copy and keeps unrelated cards', () => {
  const first = { id: 'source-1', draftCards: [source.draftCards[0], source.draftCards[1]] };
  const second = { id: 'source-2', draftCards: [{ ...source.draftCards[0], section: 'Memory retrieval' }] };
  const card = sourceCards([first, second])[0];
  const updated = removeSourceCard([first, second], card);

  assert.equal(updated[0].draftCards.length, 1);
  assert.equal(updated[1].draftCards.length, 0);
  assert.deepEqual(sourceCards(updated).map(item => item.front), ['What is retrieval?']);
});

test('removal drops the card from the active set and source-backed Anki queue together', () => {
  const cards = source.draftCards.map((card, index) => ({ ...card, id: `card-${index}`, sourceId: source.id }));
  const result = removeCardFromSet(cards, [source], cards[0]);

  assert.deepEqual(result.cards.map(card => card.id), ['card-1']);
  assert.deepEqual(sourceCards(result.sources).map(card => card.front), ['What is retrieval?']);
});
