const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const batch = require('../source-batch.js');

test('each import stage obtains a current token, including after slow OCR', async () => {
  let token = 'before-ocr';
  const sent = [];
  const auth = { getToken: async () => token };
  const request = async (_url, options) => { sent.push(options.headers.Authorization); return { status: 200 }; };
  await batch.authenticatedRequest('/api/source', { method: 'POST' }, auth, request);
  token = 'after-ocr';
  await batch.authenticatedRequest('/api/source', { method: 'POST' }, auth, request);
  assert.deepEqual(sent, ['Bearer before-ocr', 'Bearer after-ocr']);
});

test('401 refreshes once, but uncertain generation is never automatically repeated', async () => {
  const options = [];
  const auth = { getToken: async value => { options.push(value); return 'token'; } };
  let calls = 0;
  await batch.authenticatedRequest('/api/source', {}, auth, async () => ({ status: ++calls === 1 ? 401 : 200 }));
  assert.equal(calls, 2);
  assert.deepEqual(options, [undefined, { skipCache: true }]);
  for (const status of [402, 429, 502, 504]) {
    calls = 0;
    await batch.authenticatedRequest('/api/source', {}, auth, async () => { calls++; return { status }; });
    assert.equal(calls, 1);
  }
  calls = 0;
  await assert.rejects(batch.authenticatedRequest('/api/source', {}, auth, async () => { calls++; throw Error('offline'); }), /offline/);
  assert.equal(calls, 1);
});

test('import retry keeps inspection and successful batches, then produces one source', async () => {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const code = source.slice(source.indexOf('  async function checkedSourceResponse('), source.indexOf('  async function restoreLatestSession('));
  const requests = [];
  let fail = true;
  const inspection = { source: {
    id: 'lecture', kind: 'material', fileFingerprint: 'file', fingerprint: 'text',
    preflight: { requiresCards: true, batchCount: 2, unitCount: 3, unitLabel: 'slides', inputCharacters: 100, chunkCount: 5 }
  }, extractedText: 'Lecture text', extractedUnits: {} };
  const request = async (_url, options) => {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    requests.push(body.operation === 'generate-batch' ? body.batchIndex : 'inspect');
    if (body.batchIndex === 1 && fail) return { ok: false, status: 503, json: async () => ({ error: 'temporarily unavailable', retryable: true }) };
    return { ok: true, status: 200, json: async () => body.operation === 'generate-batch'
      ? { result: { cards: [{ front: `Question ${body.batchIndex}?`, back: 'Answer' }], concepts: [] } }
      : structuredClone(inspection) };
  };
  const state = { anki: {}, sources: [], classMode: 'custom', className: 'Biology', lectureCards: [], account: {} };
  const context = {
    state, Date, Set, Map, structuredClone, FormData: class { append() {} },
    document: { querySelector: () => ({ textContent: '', classList: { add() {}, remove() {} } }) },
    window: { location: { hostname: 'beta.example' }, SyllabloomAuth: { getToken: async () => 'token' },
      SyllabloomSourceBatch: { ...batch, authenticatedRequest: (url, opts, auth) => batch.authenticatedRequest(url, opts, auth, request) },
      SyllabloomCardSet: { contentKey: c => c.front, mergeSource: (_old, value) => value } },
    normalizedQuestionStyle: () => 'balanced', ankiDesktopSettings: { autoSync: false },
    sourceCardsFromLibrary: () => state.sources.flatMap(s => s.draftCards),
    syncLectureCards: cards => { state.lectureCards = cards; }
  };
  for (const name of ['persistClassSources','persistClassProfile','syncAccountClassUsage','renderSource',
    'updateGenerationCount','updateReviewSurface','renderStudy','updateAssessmentIntro','renderSourceStudyOutput']) context[name] = () => {};
  vm.createContext(context); vm.runInContext(code, context);
  const file = { name: 'lecture.pptx', size: 1024 };
  const queueItem = {};
  const opts = { silent: true, manageButton: false, queueItem };
  await assert.rejects(context.uploadSource(file, 'auto', opts), /temporarily unavailable/);
  assert.equal(state.sources.length, 0);
  fail = false;
  await context.uploadSource(file, 'auto', opts);
  assert.deepEqual(requests, ['inspect', 0, 1, 1]);
  assert.equal(state.sources.length, 1);
  assert.equal(state.lectureCards.length, 2);
  await context.uploadSource(file, 'auto', opts);
  assert.equal(state.sources.length, 1);
  assert.deepEqual(requests, ['inspect', 0, 1, 1]);
});

test('changed OCR text, document type or question style invalidates batch results', () => {
  const source = { fileFingerprint: 'same-file', fingerprint: 'first-text', kind: 'material', preflight: { batchCount: 2 } };
  const original = batch.generationKey(source, 'lecture.pdf', 'balanced');
  assert.notEqual(original, batch.generationKey({ ...source, fingerprint: 'new-ocr' }, 'lecture.pdf', 'balanced'));
  assert.notEqual(original, batch.generationKey({ ...source, kind: 'assessment' }, 'lecture.pdf', 'balanced'));
  assert.notEqual(original, batch.generationKey(source, 'lecture.pdf', 'apply'));
});
