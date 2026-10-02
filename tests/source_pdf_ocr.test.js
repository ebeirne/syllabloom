const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function reader(failRender = false) {
  let destroyed = 0;
  let terminated = 0;
  const page = {
    getViewport: () => ({ width: 500, height: 700 }),
    render: () => ({ promise: failRender ? Promise.reject(new Error('render failed')) : Promise.resolve() }),
    cleanup() {}
  };
  // PDF.js 6 document proxies have no destroy method.
  const task = { promise: Promise.resolve({ numPages: 1, getPage: async () => page }), destroy: async () => { destroyed++; } };
  const worker = { recognize: async () => ({ data: { text: 'Scanned source text' } }), terminate: async () => { terminated++; } };
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = source.indexOf('  async function readPdfTextOnDevice(');
  const end = source.indexOf('\n  function renderCalendarImportCandidates', start);
  const context = vm.createContext({
    loadSourcePdfLibrary: async () => ({ getDocument: () => task }),
    loadCalendarOcrLibrary: async () => ({ createWorker: async () => worker }),
    document: { createElement: () => ({ getContext: () => ({}) }) },
    Uint8Array
  });
  vm.runInContext(source.slice(start, end), context);
  return { read: context.readPdfTextOnDevice, counts: () => ({ destroyed, terminated }) };
}

test('PDF.js 6 cleanup preserves successfully read OCR text', async () => {
  const fixture = reader();
  const result = await fixture.read({ arrayBuffer: async () => new ArrayBuffer(0) }, [1], ['Existing text']);
  assert.equal(result.text, 'Existing text\nScanned source text');
  assert.deepEqual(fixture.counts(), { destroyed: 1, terminated: 1 });
});

test('PDF cleanup does not mask the original rendering failure', async () => {
  const fixture = reader(true);
  await assert.rejects(fixture.read({ arrayBuffer: async () => new ArrayBuffer(0) }), /render failed/);
  assert.deepEqual(fixture.counts(), { destroyed: 1, terminated: 1 });
});
