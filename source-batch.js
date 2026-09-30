(function (root) {
  const allowedKinds = new Set(['auto', 'material', 'syllabus', 'assessment']);
  const allowedExtensions = new Set(['docx', 'pptx', 'pdf', 'txt']);
  const maxFileBytes = 100 * 1024 * 1024;
  let nextQueueId = 0;

  // Refresh between upload, OCR and generation. Only replay a request rejected
  // by authentication, never a network failure or uncertain provider response.
  async function authenticatedRequest(url, options, auth, request = fetch) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await auth?.getToken?.(attempt ? { skipCache: true } : undefined);
      const headers = { ...options.headers };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await request(url, { ...options, headers });
      if (response.status !== 401 || attempt === 1 || !auth?.getToken) return response;
    }
  }

  function generationKey(source, filename, questionStyle) {
    return JSON.stringify([source.fileFingerprint, source.fingerprint, source.kind,
      filename, questionStyle, source.preflight?.batchCount]);
  }

  function createQueueItems(files, defaultKind = 'auto') {
    const kind = allowedKinds.has(defaultKind) ? defaultKind : 'auto';
    return Array.from(files || [], file => {
      const extension = String(file.name || '').split('.').pop().toLowerCase();
      const item = {
        id: 'source-file-' + Date.now().toString(36) + '-' + (++nextQueueId),
        file,
        name: file.name || 'Untitled document',
        size: Number(file.size) || 0,
        kind,
        status: 'queued',
        error: '',
        retryable: false,
        result: null
      };

      if (!allowedExtensions.has(extension)) {
        item.status = 'failed';
        item.error = ['ppt', 'pptw'].includes(extension)
          ? 'Save this PowerPoint as .pptx or export it as a PDF, then upload that file. Renaming the extension will not convert it.'
          : 'Use a DOCX, PPTX, PDF, or TXT file.';
      } else if (!item.size) {
        item.status = 'failed';
        item.error = 'This document is empty. Choose a file that contains content.';
      } else if (item.size > maxFileBytes) {
        item.status = 'failed';
        item.error = 'Each document can be up to 100 MB in this beta.';
      }
      return item;
    });
  }

  async function processQueue(items, importer, onUpdate = () => {}) {
    const work = (items || []).filter(item => item.status === 'queued' || (item.status === 'failed' && item.retryable));
    let succeeded = 0;
    let failed = 0;

    for (let index = 0; index < work.length; index += 1) {
      const item = work[index];
      item.status = 'processing';
      item.error = '';
      item.retryable = false;
      onUpdate(item, { index, total: work.length });

      try {
        item.result = await importer(item);
        item.status = 'done';
        succeeded += 1;
      } catch (error) {
        item.status = 'failed';
        item.error = error?.message || 'This document could not be read. Try again or remove it.';
        item.retryable = error?.retryable !== false;
        failed += 1;
      }

      onUpdate(item, { index, total: work.length });
    }

    return { attempted: work.length, succeeded, failed };
  }

  const api = { createQueueItems, processQueue, authenticatedRequest, generationKey };
  root.SyllabloomSourceBatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
