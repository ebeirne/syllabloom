const test = require('node:test');
const assert = require('node:assert/strict');
const createUploadUrl = require('../api/source-upload-url.js');
const cleanupUploads = require('../api/source-upload-cleanup.js');

function run(handler, request) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
    statusCode: 200
  };
  return Promise.resolve(handler(request, response)).then(() => ({
    status: response.statusCode,
    headers: response.headers,
    body: JSON.parse(response.body || '{}')
  }));
}

test('large-upload URL endpoint requires an authenticated account', async () => {
  const result = await run(createUploadUrl, {
    method: 'POST',
    headers: {},
    body: { filename: 'lecture.pdf', size: 8 * 1024 * 1024 }
  });

  assert.equal(result.status, 401);
  assert.match(result.body.error, /Sign in/i);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});

test('large-upload URL endpoint does not accept unsupported methods', async () => {
  const result = await run(createUploadUrl, { method: 'GET', headers: {} });

  assert.equal(result.status, 405);
  assert.equal(result.headers.Allow, 'POST');
});

test('temporary-upload cleanup is inaccessible without its scheduled secret', async () => {
  const priorSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const result = await run(cleanupUploads, { method: 'GET', headers: {} });
    assert.equal(result.status, 401);
  } finally {
    if (priorSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = priorSecret;
  }
});
