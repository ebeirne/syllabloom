const crypto = require('node:crypto');

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const PUT_WINDOW_MS = 15 * 60 * 1000;
const READ_WINDOW_MS = 15 * 60 * 1000;
const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const extensionTypes = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain'
};

let jwksCache;

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

async function requestBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw new Error('The upload request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function clerkHost() {
  const key = String(process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
  const match = key.match(/^pk_(?:test|live)_([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error('Authentication is not configured.');
  const host = Buffer.from(match[1], 'base64url').toString('utf8').replace(/\$$/, '').toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host)) throw new Error('Authentication is not configured.');
  return host;
}

async function authenticatedUser(request) {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1].length > 12000) return null;
  const host = clerkHost();
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const jwksUrl = `https://${host}/.well-known/jwks.json`;
  if (!jwksCache || jwksCache.url !== jwksUrl) {
    jwksCache = { url: jwksUrl, keys: createRemoteJWKSet(new URL(jwksUrl)) };
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], jwksCache.keys, {
      algorithms: ['RS256'],
      issuer: `https://${host}`,
      clockTolerance: 5
    }));
  } catch (error) {
    if (String(error?.code || '').startsWith('ERR_JWT') || String(error?.code || '').startsWith('ERR_JWS')) return null;
    throw error;
  }
  return typeof payload.sub === 'string' && /^user_[A-Za-z0-9_-]{1,250}$/.test(payload.sub)
    ? payload.sub
    : null;
}

module.exports = async function sourceUploadUrl(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Use POST to prepare a document upload.' });
  }
  try {
    const userId = await authenticatedUser(request);
    if (!userId) return sendJson(response, 401, { error: 'Sign in before adding course materials.' });
    if (process.env.SYLLABLOOM_BILLING_ENABLED === 'true') {
      const origin = String(process.env.SYLLABLOOM_APP_URL || '').replace(/\/$/, '');
      if (!origin.startsWith('https://')) throw new Error('Billing origin is not configured.');
      const accessResponse = await fetch(`${origin}/api/billing-access`, {
        headers: { Authorization: request.headers.authorization },
        signal: AbortSignal.timeout(15000), redirect: 'error'
      });
      if (!accessResponse.ok) return sendJson(response, 503, { error: 'Could not verify your plan. Try again shortly.' });
      const access = await accessResponse.json();
      if (access.enabled !== true || access.access !== true) {
        return sendJson(response, 402, { error: 'Choose a plan before adding class material.', code: 'subscription_required' });
      }
    }
    const body = await requestBody(request);
    const name = String(body?.filename || '').split(/[\\/]/).pop().slice(0, 255);
    const extension = name.split('.').pop().toLowerCase();
    const contentType = extensionTypes[extension];
    const size = Number(body?.size);
    if (!contentType || !name) {
      return sendJson(response, 400, { error: 'Use a DOCX, PPTX, PDF, or TXT source.' });
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SOURCE_BYTES) {
      return sendJson(response, 413, { error: 'Each document can be up to 100 MB in this beta.' });
    }
    const pathname = `source-uploads/${userId}/${crypto.randomUUID()}.${extension}`;
    const { issueSignedToken, presignUrl } = await import('@vercel/blob');
    const now = Date.now();
    const sign = async (operation, validUntil, extras = {}, presignExtras = {}) => {
      const token = await issueSignedToken({
        pathname,
        operations: [operation],
        validUntil,
        ...extras
      });
      const result = await presignUrl(token, { pathname, operation, validUntil, ...presignExtras });
      return result.presignedUrl;
    };
    const uploadUrl = await sign('put', now + PUT_WINDOW_MS, {
      allowedContentTypes: [contentType],
      maximumSizeInBytes: size
    }, { addRandomSuffix: false });
    const sourceUrl = await sign('get', now + READ_WINDOW_MS, {}, {access: 'private', useCache: false});
    const deleteUrl = await sign('delete', now + DELETE_WINDOW_MS);
    return sendJson(response, 200, { uploadUrl, sourceUrl, deleteUrl, pathname, contentType, maxBytes: MAX_SOURCE_BYTES });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 503;
    if (status === 503) console.error(`Source upload setup failed: ${error?.name || 'Error'}`);
    return sendJson(response, status, {
      error: status === 400
        ? 'The upload request is invalid.'
        : 'Large-file uploads are temporarily unavailable. Try again shortly.'
    });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '16kb' } } };
