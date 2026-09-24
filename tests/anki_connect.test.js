const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../anki-connect.js');

function makeFetch(responses, calls) {
  return async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    const result = responses[request.action];
    if (result instanceof Error) throw result;
    return { ok: true, status: 200, json: async () => ({ result: typeof result === 'function' ? result(request) : result, error: null }) };
  };
}

test('Anki Desktop push skips existing notes, adds new ones, and requests AnkiWeb sync', async () => {
  const calls = [];
  const client = createClient({ fetchImpl: makeFetch({
    version: 6,
    createDeck: 11,
    modelFieldNames: ['Front', 'Back'],
    canAddNotes: [true, false],
    addNotes: [101],
    sync: null
  }, calls) });
  const result = await client.pushCards([
    { front: 'What is percolation?', back: 'A model of fluid flow.', source: 'cosA1.pdf Page 2' },
    { front: 'What is a union-find structure?', back: 'A data structure for connected components.' }
  ], { deckName: 'COS 226', tags: 'spring-2026 cos226' });

  assert.deepEqual(result, { added: 1, duplicates: 1, synced: true, syncError: '' });
  assert.deepEqual(calls.map(call => call.action), ['version', 'createDeck', 'modelFieldNames', 'canAddNotes', 'addNotes', 'sync']);
  const note = calls.find(call => call.action === 'addNotes').params.notes[0];
  assert.equal(note.deckName, 'COS 226');
  assert.match(note.fields.Back, /Source: cosA1\.pdf Page 2/);
  assert.deepEqual(note.tags, ['spring-2026', 'cos226']);
});

test('Anki Desktop bridge supports the Cloze model and escapes note fields', async () => {
  const calls = [];
  const client = createClient({ fetchImpl: makeFetch({
    version: 6,
    createDeck: 1,
    modelFieldNames: ['Text', 'Back Extra'],
    canAddNotes: [true],
    addNotes: [17],
    sync: null
  }, calls) });
  await client.pushCards([{ front: 'Fluid {{c1::flows}} through connected sites.', back: '<script>bad</script>' }], { format: 'Cloze' });
  const note = calls.find(call => call.action === 'addNotes').params.notes[0];

  assert.equal(note.modelName, 'Cloze');
  assert.equal(note.fields.Text, 'Fluid {{c1::flows}} through connected sites.');
  assert.equal(note.fields['Back Extra'], '&lt;script&gt;bad&lt;/script&gt;');
});

test('Anki Desktop connection failures explain the required local setup', async () => {
  const client = createClient({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(client.connect(), /Open Anki, install AnkiConnect/);
});
