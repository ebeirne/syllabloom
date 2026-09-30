const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const { createStore } = require('../source-import-store.js');

test('unfinished imports survive a new store with file contents and completed batches', async () => {
  const factory = new IDBFactory();
  await createStore(factory).save('alice', [{ id: 'one', status: 'processing',
    file: new Blob(['lecture contents']), name: 'lecture.pdf',
    generationCache: { batches: { 0: { cards: [{ front: 'Saved question' }] } } }
  }]);
  const [item] = await createStore(factory).load('alice');
  assert.equal(item.status, 'failed');
  assert.equal(item.retryable, true);
  assert.equal(await item.file.text(), 'lecture contents');
  assert.equal(item.generationCache.batches[0].cards[0].front, 'Saved question');
  assert.deepEqual(await createStore(factory).load('bob'), []);
});

test('finished and removed queues release their saved files', async () => {
  const store = createStore(new IDBFactory());
  await store.save('alice', [{ id: 1, status: 'queued' }]);
  await store.save('alice', [{ id: 1, status: 'done' }]);
  assert.deepEqual(await store.load('alice'), []);
  await store.save('alice', [{ id: 2, status: 'queued' }]);
  await store.save('alice', []);
  assert.deepEqual(await store.load('alice'), []);
});

test('writes snapshot immediately and preserve call order', async () => {
  const store = createStore(new IDBFactory());
  const items = [{ id: 1, status: 'queued' }];
  const first = store.save('alice', items);
  items[0].id = 2;
  await first;
  assert.equal((await store.load('alice'))[0].id, 1);
  const second = store.save('alice', items);
  const third = store.save('alice', [{ id: 3, status: 'queued' }]);
  await Promise.all([second, third]);
  assert.equal((await store.load('alice'))[0].id, 3);
});

test('expired queues disappear and replacement of an expired queue survives cleanup', async () => {
  const store = createStore(new IDBFactory());
  const now = Date.now;
  try {
    await store.save('alice', [{ id: 1, status: 'queued' }]);
    await store.save('bob', [{ id: 2, status: 'queued' }]);
    Date.now = () => now() + 25 * 60 * 60 * 1000;
    await store.save('alice', [{ id: 3, status: 'queued' }]);
    assert.equal((await store.load('alice'))[0].id, 3);
    assert.deepEqual(await store.load('bob'), []);
  } finally { Date.now = now; }
});

test('storage failure rejects and does not permanently block later saves', async () => {
  const real = new IDBFactory();
  let fail = true;
  const store = createStore({ open(...args) {
    if (fail) { fail = false; throw Error('Storage unavailable'); }
    return real.open(...args);
  } });
  await assert.rejects(store.save('alice', [{ status: 'queued' }]), /Storage unavailable/);
  await store.save('alice', [{ status: 'queued' }]);
  assert.equal((await store.load('alice')).length, 1);
});
