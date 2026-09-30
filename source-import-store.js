(function (root) {
  const lifetime = 24 * 60 * 60 * 1000;
  function restoredItems(items) {
    return (items || []).filter(item => item.status !== 'done').map(item => ({
      ...item,
      ...(item.status === 'failed' && /\.(ppt|pptw)$/i.test(item.name || '')
        && /Save this PowerPoint as \.pptx/.test(item.error || '')
        && item.file?.size > 0 && item.file.size <= 100 * 1024 * 1024
        ? { status: 'queued', retryable: false, error: '' } : {}),
      ...(item.status === 'processing' ? {
        status: 'failed', retryable: true,
        error: 'Import paused. Choose Resume import to recover completed work.'
      } : {})
    }));
  }
  function createStore(factory = root.indexedDB) {
    let tail = Promise.resolve();
    async function transaction(owner, items) {
      if (!owner) return [];
      const db = await new Promise((resolve, reject) => {
        const request = factory.open('syllabloom-import-recovery', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('queues');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('queues', 'readwrite');
          const store = tx.objectStore('queues');
          let result = [];
          const sweep = store.openCursor();
          sweep.onsuccess = () => {
            const cursor = sweep.result;
            if (cursor) {
              if (cursor.value.expiresAt <= Date.now() && !(items !== undefined && cursor.key === owner)) cursor.delete();
              cursor.continue();
            }
          };
          if (items !== undefined) {
            const pending = items.filter(item => item.status !== 'done');
            if (pending.length) store.put({ items: pending, expiresAt: Date.now() + lifetime }, owner);
            else store.delete(owner);
          } else {
            const read = store.get(owner);
            read.onsuccess = () => {
              if (read.result?.expiresAt > Date.now()) result = restoredItems(read.result.items);
            };
          }
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || Error('Import storage was interrupted.'));
        });
      } finally { db.close(); }
    }
    return {
      load: owner => {
        const next = tail.then(() => transaction(owner));
        tail = next.catch(() => {}); return next;
      },
      save: (owner, items) => {
        // Snapshot before an async operation can change the queue or account.
        const snapshot = structuredClone(items);
        const next = tail.then(() => transaction(owner, snapshot));
        tail = next.catch(() => {}); return next;
      }
    };
  }
  root.SyllabloomImportStore = { createStore, restoredItems };
  if (typeof module !== 'undefined') module.exports = root.SyllabloomImportStore;
})(typeof window !== 'undefined' ? window : globalThis);
