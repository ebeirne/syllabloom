(function attachCardSet(root) {
  function cardKey(card) {
    return `${card.front || ''}::${card.section || ''}`;
  }

  function removeSourceCard(sources, card) {
    if (!card?.sourceId) return sources;
    const key = card.sourceKey || cardKey(card);
    return sources.map(source => {
      if (source.id !== card.sourceId) return source;
      const deletedCardKeys = [...new Set([...(source.deletedCardKeys || []), key])];
      return {
        ...source,
        deletedCardKeys,
        draftCards: (source.draftCards || []).filter(item => cardKey(item) !== key)
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
      draftCards: (next.draftCards || []).filter(card => !deleted.has(cardKey(card)))
    };
  }

  function sourceCards(sources) {
    return sources.flatMap(source => {
      const deleted = new Set(source.deletedCardKeys || []);
      return (source.draftCards || [])
        .filter(card => !deleted.has(cardKey(card)))
        .map(card => ({ ...card, sourceId: source.id }));
    });
  }

  function removeCardFromSet(cards, sources, card) {
    return {
      cards: cards.filter(item => item.id !== card.id),
      sources: removeSourceCard(sources, card)
    };
  }

  const api = { cardKey, mergeSource, removeCardFromSet, removeSourceCard, sourceCards };
  root.SyllabloomCardSet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
