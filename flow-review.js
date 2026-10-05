(function(root) {
  function select(cards, source = '', status = 'all', query = '') {
    const needle = query.trim().toLowerCase();
    return cards.filter(card => (!source || card.sourceId === source || (card.duplicateSourceRefs || []).some(ref => ref.sourceId === source)) &&
      (status === 'all' || (status === 'check' ? card.reviewStatus === 'waiting' : card.reviewStatus === status)) &&
      (!needle || [card.front, card.back, card.clozeText, card.sourceName, card.concept].join(' ').toLowerCase().includes(needle)));
  }
  function nextId(cards, id) {
    const index = cards.findIndex(card => card.id === id);
    return cards[index + 1]?.id || cards[index - 1]?.id || null;
  }
  const api = {select, nextId};
  root.SyllabloomReviewFlow = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
