const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSource, removeCardFromSet, removeSourceCard, sourceCards } = require('../card-set.js');

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
  assert.deepEqual(updated[0].deletedCardKeys, ['What is encoding?::Memory']);
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

test('removal drops the card from the active set and source-backed Anki queue together', () => {
  const cards = source.draftCards.map((card, index) => ({ ...card, id: `card-${index}`, sourceId: source.id }));
  const result = removeCardFromSet(cards, [source], cards[0]);

  assert.deepEqual(result.cards.map(card => card.id), ['card-1']);
  assert.deepEqual(sourceCards(result.sources).map(card => card.front), ['What is retrieval?']);
});
