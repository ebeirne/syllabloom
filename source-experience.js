(function(root) {
  function coverage(source, cards) {
    return (source.studySections || []).map(section => {
      const count = cards.filter(card => String(card.sourceLocation || '') === section.label).length;
      return { ...section, count, readable: Boolean(section.text?.trim()),
        status: !section.text?.trim() ? 'No readable text' : count ? `${count} cited card${count === 1 ? '' : 's'}` : 'No cited cards' };
    });
  }
  function chooseSession(cards, history = [], excluded = []) {
    const omit = new Set(excluded);
    const remaining = cards.filter(card => !omit.has(card.id));
    const pool = remaining.length ? remaining : cards;
    const seen = new Set(history.map(item => item.cardId));
    return [...pool.filter(card => !seen.has(`lecture-${card.id}`)), ...pool.filter(card => seen.has(`lecture-${card.id}`))].slice(0, 5);
  }
  function mergeAdditional(previous, generated, cardSet) {
    if (!previous) throw new Error('This source was removed. Add it again before generating more cards.');
    const seen = new Set();
    const draftCards = [...(previous.draftCards || []), ...(generated.draftCards || [])].filter(card => {
      const key = cardSet.contentKey(card);
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
    let studySheet = previous.studySheet;
    if (generated.studySheet) {
      if (!studySheet) studySheet = generated.studySheet;
      else {
        const seenFacts = new Set();
        const facts = [...studySheet.facts,...generated.studySheet.facts].filter(fact=>{
          const key=String(fact.locator).toLowerCase()+'::'+String(fact.answer).toLowerCase();
          if(seenFacts.has(key))return false;seenFacts.add(key);return true;
        });
        studySheet={...studySheet,facts,preferences:generated.studySheet.preferences || studySheet.preferences};
      }
    }
    return cardSet.mergeSource(previous, { ...previous, draftCards, ...(studySheet?{studySheet}:{}),generation:generated.generation || previous.generation });
  }
  const api = { coverage, chooseSession, mergeAdditional };
  if (typeof module !== 'undefined') module.exports = api;
  root.SyllabloomSourceExperience = api;
})(typeof window === 'undefined' ? globalThis : window);
