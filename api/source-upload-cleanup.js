const MAX_BLOBS_PER_RUN = 10000;
const MAX_DELETE_BATCH = 500;
const MINIMUM_AGE_MS = 24 * 60 * 60 * 1000;

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

module.exports = async function cleanupTemporarySources(request, response) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.authorization !== `Bearer ${expected}`) {
    return sendJson(response, 401, { error: 'Unauthorized.' });
  }
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Use GET for scheduled cleanup.' });
  }
  try {
    const { del, list } = await import('@vercel/blob');
    const cutoff = Date.now() - MINIMUM_AGE_MS;
    const expired = [];
    let cursor;
    let inspected = 0;
    let hasMore = true;
    while (hasMore && inspected < MAX_BLOBS_PER_RUN) {
      const page = await list({ prefix: 'source-uploads/', limit: 1000, cursor });
      for (const blob of page.blobs) {
        inspected += 1;
        if (blob.pathname.startsWith('source-uploads/') && new Date(blob.uploadedAt).getTime() < cutoff) {
          expired.push(blob.pathname);
        }
      }
      hasMore = page.hasMore;
      cursor = page.cursor;
    }
    for (let offset = 0; offset < expired.length; offset += MAX_DELETE_BATCH) {
      await del(expired.slice(offset, offset + MAX_DELETE_BATCH));
    }
    return sendJson(response, 200, { inspected, deleted: expired.length, moreToScan: hasMore });
  } catch (error) {
    console.error(`Temporary source cleanup failed: ${error?.name || 'Error'}`);
    return sendJson(response, 503, { error: 'Temporary source cleanup is temporarily unavailable.' });
  }
};
