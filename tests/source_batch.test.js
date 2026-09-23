const test = require('node:test');
const assert = require('node:assert/strict');
const { createQueueItems, processQueue } = require('../source-batch.js');

function file(name, size = 2048) {
  return { name, size };
}

test('creates a mixed-document queue with a separately editable type per file', () => {
  const items = createQueueItems([
    file('lecture-6.pdf'),
    file('syllabus.docx'),
    file('quiz.pptx')
  ], 'auto');

  assert.equal(items.length, 3);
  assert.deepEqual(items.map(item => item.kind), ['auto', 'auto', 'auto']);
  items[0].kind = 'material';
  items[1].kind = 'syllabus';
  items[2].kind = 'assessment';
  assert.deepEqual(items.map(item => item.kind), ['material', 'syllabus', 'assessment']);
  assert.ok(items.every(item => item.status === 'queued'));
});

test('marks empty, unsupported, and oversized files before submission', () => {
  const items = createQueueItems([
    file('empty.pdf', 0),
    file('photo.png'),
    file('too-large.pdf', 12 * 1024 * 1024)
  ]);

  assert.deepEqual(items.map(item => item.status), ['failed', 'failed', 'failed']);
  assert.match(items[0].error, /empty/i);
  assert.match(items[1].error, /DOCX, PPTX, PDF, or TXT/i);
  assert.match(items[2].error, /smaller than 12 MB/i);
  assert.ok(items.every(item => !item.retryable));
});

test('imports sequentially and continues after one document fails', async () => {
  const items = createQueueItems([
    file('one.pdf'),
    file('two.docx'),
    file('three.pptx')
  ]);
  const started = [];
  let inFlight = 0;
  let peakInFlight = 0;
  const result = await processQueue(items, async item => {
    started.push(item.name);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    if (item.name === 'two.docx') throw new Error('Unreadable document');
    return { name: item.name };
  });

  assert.deepEqual(started, ['one.pdf', 'two.docx', 'three.pptx']);
  assert.equal(peakInFlight, 1);
  assert.deepEqual(result, { attempted: 3, succeeded: 2, failed: 1 });
  assert.deepEqual(items.map(item => item.status), ['done', 'failed', 'done']);
  assert.equal(items[0].result.name, 'one.pdf');
  assert.equal(items[1].retryable, true);
  assert.equal(items[1].error, 'Unreadable document');
});

test('retry processes only retryable failures and keeps completed results', async () => {
  const items = createQueueItems([file('good.pdf'), file('retry.pdf')]);
  items[0].status = 'done';
  items[0].result = { name: 'good.pdf' };
  items[1].status = 'failed';
  items[1].retryable = true;
  let calls = 0;

  const result = await processQueue(items, async item => {
    calls += 1;
    return { name: item.name };
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, { attempted: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(items.map(item => item.status), ['done', 'done']);
  assert.equal(items[0].result.name, 'good.pdf');
  assert.equal(items[1].result.name, 'retry.pdf');
});
