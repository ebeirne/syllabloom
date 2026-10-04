(function attachCardSet(root) {
  function cardKey(card) {
    return contentKey(card) || legacyCardKey(card);
  }

  function legacyCardKey(card) {
    return `${card.front || ''}::${card.section || ''}`;
  }

  function normalizedContent(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function contentKey(card) {
    if (card.noteType === 'ImageOcclusion') return `image-occlusion::${card.id}`;
    const front = normalizedContent(card.front);
    const back = normalizedContent(card.back);
    return front && back ? `${front}::${back}` : '';
  }

  function cardIsDeleted(card, deletedCardKeys) {
    return deletedCardKeys.has(cardKey(card)) || deletedCardKeys.has(legacyCardKey(card));
  }

  function removeSourceCard(sources, card) {
    if (!card?.sourceId) return sources;
    const references = [
      { sourceId: card.sourceId, key: card.sourceDeletionKey || cardKey(card) },
      ...(Array.isArray(card.duplicateSourceRefs) ? card.duplicateSourceRefs : [])
    ];
    const keysBySource = new Map();
    references.forEach(reference => {
      if (!reference?.sourceId || !reference?.key) return;
      const keys = keysBySource.get(reference.sourceId) || new Set();
      keys.add(reference.key);
      keysBySource.set(reference.sourceId, keys);
    });
    return sources.map(source => {
      const keys = keysBySource.get(source.id);
      if (!keys) return source;
      const deletedCardKeys = [...new Set([...(source.deletedCardKeys || []), ...keys])];
      const deleted = new Set(deletedCardKeys);
      return {
        ...source,
        deletedCardKeys,
        draftCards: (source.draftCards || []).filter(item => !cardIsDeleted(item, deleted))
      };
    });
  }

  function mergeSource(previous, next) {
    if (!previous || previous.id !== next?.id) return next;
    const deletedCardKeys = [...new Set([...(previous.deletedCardKeys || []), ...(next.deletedCardKeys || [])])];
    const deleted = new Set(deletedCardKeys);
    return {
      ...next,
      deletedCardKeys,
      draftCards: (next.draftCards || []).filter(card => !cardIsDeleted(card, deleted))
    };
  }

  function sourceCards(sources) {
    const cards = [];
    const cardsByContent = new Map();
    sources.forEach(source => {
      const deleted = new Set(source.deletedCardKeys || []);
      (source.draftCards || []).forEach(card => {
        const sourceRef = { sourceId: source.id, key: cardKey(card), sourceName: source.name || '' };
        if (cardIsDeleted(card, deleted)) return;
        const key = contentKey(card);
        const existing = key ? cardsByContent.get(key) : null;
        if (existing) {
          if (!existing.duplicateSourceRefs.some(reference => reference.sourceId === source.id && reference.key === sourceRef.key)) {
            existing.duplicateSourceRefs.push(sourceRef);
          }
          return;
        }
        const sourcedCard = {
          ...card,
          ...(card.occlusion ? {occlusion: {...card.occlusion, image: source.occlusionImage}} : {}),
          sourceId: source.id,
          sourceName: source.name || '',
          sourceDeletionKey: sourceRef.key,
          duplicateSourceRefs: []
        };
        cards.push(sourcedCard);
        if (key) cardsByContent.set(key, sourcedCard);
      });
    });
    return cards;
  }

  function removeCardFromSet(cards, sources, card) {
    return {
      cards: cards.filter(item => item.id !== card.id),
      sources: removeSourceCard(sources, card)
    };
  }

  const api = { cardKey, contentKey, legacyCardKey, mergeSource, normalizedContent, removeCardFromSet, removeSourceCard, sourceCards };
  root.SyllabloomCardSet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
