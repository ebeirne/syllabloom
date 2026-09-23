(function (root) {
  const allowedKinds = new Set(['auto', 'material', 'syllabus', 'assessment']);
  const allowedExtensions = new Set(['docx', 'pptx', 'pdf', 'txt']);
  const maxFileBytes = 12 * 1024 * 1024;
  let nextQueueId = 0;

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
        item.error = 'Use a DOCX, PPTX, PDF, or TXT file.';
      } else if (!item.size) {
        item.status = 'failed';
        item.error = 'This document is empty. Choose a file that contains content.';
      } else if (item.size >= maxFileBytes) {
        item.status = 'failed';
        item.error = 'Each document must be smaller than 12 MB.';
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
        item.retryable = true;
        failed += 1;
      }

      onUpdate(item, { index, total: work.length });
    }

    return { attempted: work.length, succeeded, failed };
  }

  const api = { createQueueItems, processQueue };
  root.SyllabloomSourceBatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
