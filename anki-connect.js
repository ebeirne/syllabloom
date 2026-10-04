(function attachAnkiConnect(root) {
  const DEFAULT_ENDPOINT = 'http://127.0.0.1:8765';

  function escapeField(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r?\n/g, '<br>');
  }

  function tagList(value) {
    return [...new Set(String(value || '').split(/\s+/).map(tag => tag.replace(/[^\p{L}\p{N}_:-]/gu, '')).filter(Boolean))];
  }

  function createClient({ fetchImpl = root.fetch?.bind(root), endpoint = DEFAULT_ENDPOINT } = {}) {
    if (!fetchImpl) throw new Error('This browser does not support local Anki connections.');

    async function invoke(action, params = {}) {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, version: 6, params })
        });
      } catch (_) {
        throw new Error('Could not reach Anki Desktop on this device. Open Anki, install AnkiConnect, then allow this site in its web origin settings.');
      }
      if (!response.ok) throw new Error(`AnkiConnect returned HTTP ${response.status}. Check that Anki Desktop is open.`);
      const payload = await response.json();
      if (payload?.error) throw new Error(`AnkiConnect: ${payload.error}`);
      return payload?.result;
    }

    async function connect() {
      const version = await invoke('version');
      if (Number(version) < 6) throw new Error('Update AnkiConnect to a version that supports the current card sync actions.');
      return { version: Number(version) };
    }

    async function pushCards(cards, { deckName = 'Syllabloom', format = 'Basic', tags = '' } = {}) {
      const readyCards = (Array.isArray(cards) ? cards : []).filter(card => card?.front && card?.back);
      if (!readyCards.length) return { added: 0, duplicates: 0, synced: false };
      await connect();
      const safeDeckName = String(deckName || 'Syllabloom').trim().slice(0, 120) || 'Syllabloom';
      await invoke('createDeck', { deck: safeDeckName });
      const maps = new Map(), media = new Map(), notes = [];
      const baseTags = tagList(tags);
      for (const card of readyCards) {
        const type = card.noteType || format;
        const isCloze = type === 'Cloze', modelName = isCloze ? 'Cloze' : 'Basic';
        if (!maps.has(modelName)) {
          const fieldNames = await invoke('modelFieldNames', {modelName});
          maps.set(modelName,new Map((Array.isArray(fieldNames)?fieldNames:[]).map(name=>[String(name).toLowerCase(),name])));
        }
        const fieldMap = maps.get(modelName), frontField=fieldMap.get(isCloze?'text':'front'), backField=fieldMap.get(isCloze?'back extra':'back');
        if(!frontField||!backField)throw Error(`Anki's ${modelName} note type is missing its expected fields.`);
        let front=escapeField(card.clozeText||card.front), back=escapeField(`${card.back}${card.source?`\n\nSource: ${card.source}`:''}`);
        if(type==='ImageOcclusion') {
          const advanced=root.SyllabloomAdvancedCards;
          if(!advanced?.validOcclusion(card))throw Error('This diagram needs an edit before syncing.');
          const image=card.occlusion.image;
          if(!media.has(image)) {
            const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(image));
            const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('').slice(0,24);
            const extension=image.match(/^data:image\/(png|jpeg|webp);/)[1],filename=`syllabloom-${hash}.${extension}`;
            await invoke('storeMediaFile',{filename,data:image.split(',')[1]});media.set(image,filename);
          }
          const filename=media.get(image);
          front=advanced.imageHtml(card).replace(escapeField(image),filename);
          back=advanced.imageHtml(card,true).replace(escapeField(image),filename)+'<p>'+back+'</p>';
        }
        notes.push({deckName:safeDeckName,modelName,fields:{[frontField]:front,[backField]:back},options:{allowDuplicate:false},tags:tagList(`${baseTags.join(' ')} ${card.tags||''}`)});
      }
      const addable = await invoke('canAddNotes', { notes });
      if (!Array.isArray(addable) || addable.length !== notes.length) throw new Error('AnkiConnect returned an incomplete duplicate check. No cards were sent.');
      const addableNotes = notes.filter((_, index) => addable[index]);
      const duplicates = notes.length - addableNotes.length;
      const addedIds = addableNotes.length ? await invoke('addNotes', { notes: addableNotes }) : [];
      if (!Array.isArray(addedIds)) throw new Error('AnkiConnect did not confirm the cards it added.');
      const added = addedIds.filter(Boolean).length;
      let syncError = '';
      try {
        await invoke('sync');
      } catch (error) {
        syncError = error.message || 'Anki could not sync with AnkiWeb.';
      }
      return { added, duplicates: duplicates + (addableNotes.length - added), synced: !syncError, syncError };
    }

    return { connect, invoke, pushCards };
  }

  const api = { createClient, escapeField, tagList };
  root.SyllabloomAnkiConnect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
