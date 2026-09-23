(function attachCourseMap(root) {
  function normalize(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function unique(values) {
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  }

  function prioritizeTopics(topics = [], missEntries = []) {
    const ordered = unique(topics);
    const labelsByKey = new Map(ordered.map(topic => [normalize(topic), topic]));
    const counts = new Map();
    missEntries.forEach(([topic, count]) => {
      const key = normalize(topic);
      if (key && Number(count) > 0) counts.set(key, (counts.get(key) || 0) + Number(count));
    });
    const priorities = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([key]) => labelsByKey.get(key) || [...missEntries].find(([topic]) => normalize(topic) === key)?.[0])
      .filter(Boolean);
    return unique([...priorities, ...ordered]);
  }

  function buildCourseMap({
    concepts = [],
    cards = [],
    reviewHistory = [],
    className = '',
    classTerm = ''
  } = {}) {
    const cardRefs = cards.filter(card => card && card.id && card.concept);
    const activeHistory = reviewHistory.filter(entry => {
      if (!entry || !entry.cardId) return false;
      if (className && entry.className !== className) return false;
      if (classTerm && entry.classTerm !== classTerm) return false;
      return true;
    });

    return unique(concepts.map(concept => typeof concept === 'string' ? concept : concept?.name))
      .map(name => {
        const normalizedName = normalize(name);
        const matched = cardRefs.filter(card => normalize(card.concept) === normalizedName);
        const cardIds = new Set(matched.map(card => String(card.id)));
        const events = activeHistory
          .filter(entry => cardIds.has(String(entry.cardId)))
          .sort((left, right) => String(left.reviewedAt || '').localeCompare(String(right.reviewedAt || '')));
        const practicedIds = new Set(events.map(entry => String(entry.cardId)));
        const lastEvent = events[events.length - 1] || null;
        const status = !matched.length
          ? 'No cards yet'
          : !lastEvent
            ? 'Not practiced'
            : lastEvent.rating === 'Again'
              ? 'Review next'
              : lastEvent.rating === 'Hard'
                ? 'Needs another look'
                : 'Recent recall';
        const statusKind = !matched.length
          ? 'empty'
          : !lastEvent
            ? 'new'
            : lastEvent.rating === 'Again'
              ? 'review'
              : lastEvent.rating === 'Hard'
                ? 'effortful'
                : 'recent';

        return {
          name,
          cardCount: matched.length,
          practicedCount: practicedIds.size,
          coveragePercent: matched.length ? Math.round(practicedIds.size / matched.length * 100) : 0,
          reviewCount: events.length,
          lastRating: lastEvent?.rating || '',
          status,
          statusKind,
          sourceNames: unique(matched.map(card => card.sourceName))
        };
      });
  }

  const api = { buildCourseMap, normalize, prioritizeTopics };
  root.SyllabloomCourseMap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
