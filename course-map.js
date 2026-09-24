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

  const commonWords = new Set(['about', 'after', 'against', 'also', 'among', 'and', 'are', 'around', 'because', 'before', 'being', 'between', 'both', 'can', 'class', 'course', 'describe', 'determine', 'different', 'during', 'each', 'explain', 'for', 'from', 'have', 'identify', 'into', 'its', 'know', 'learn', 'make', 'more', 'most', 'only', 'other', 'over', 'recognize', 'should', 'some', 'such', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'understand', 'use', 'using', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'within']);

  function contentWords(value) {
    return normalize(value).split(' ').filter(word => word.length > 2 && !commonWords.has(word));
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
    const cardRefs = cards.filter(card => card && card.id && card.concept && card.skipped !== true);
    const activeHistory = reviewHistory.filter(entry => {
      if (!entry || !entry.cardId) return false;
      if (className && entry.className !== className) return false;
      if (classTerm && entry.classTerm !== classTerm) return false;
      return true;
    });

    const conceptNames = concepts.map(concept => typeof concept === 'string' ? concept : concept?.name);
    const seenConcepts = new Set();
    return conceptNames
      .filter(name => {
        const key = normalize(name);
        if (!key || seenConcepts.has(key)) return false;
        seenConcepts.add(key);
        return true;
      })
      .map(name => {
        const normalizedName = normalize(name);
        const matched = cardRefs.filter(card => normalize(card.concept) === normalizedName);
        const cardIds = new Set(matched.map(card => String(card.id)));
        const events = activeHistory
          .filter(entry => cardIds.has(String(entry.cardId)))
          .sort((left, right) => String(left.reviewedAt || '').localeCompare(String(right.reviewedAt || '')));
        const latestByCard = new Map();
        events.forEach(entry => latestByCard.set(String(entry.cardId), entry));
        const latestEvents = [...latestByCard.values()];
        const practicedIds = new Set(latestByCard.keys());
        const lastEvent = events[events.length - 1] || null;
        const missedCount = latestEvents.filter(entry => entry.rating === 'Again').length;
        const hardCount = latestEvents.filter(entry => entry.rating === 'Hard').length;
        const readyCount = matched.filter(card => card.ready === true).length;
        const pendingCount = matched.filter(card => card.ready !== true && card.skipped !== true).length;
        const status = !matched.length
          ? 'No cards yet'
          : missedCount
            ? 'Review next'
            : hardCount
              ? 'Needs another look'
              : latestEvents.length < matched.length
                ? 'Not practiced'
                : 'Recent recall';
        const statusKind = !matched.length
          ? 'empty'
          : missedCount
            ? 'review'
            : hardCount
              ? 'effortful'
              : latestEvents.length < matched.length
                ? 'new'
                : 'recent';

        const reason = !matched.length
          ? 'This course topic has no cards linked to it yet.'
          : missedCount
            ? `${missedCount} card${missedCount === 1 ? '' : 's'} was most recently marked Again.`
            : hardCount
              ? `${hardCount} card${hardCount === 1 ? '' : 's'} was most recently marked Hard.`
              : latestEvents.length < matched.length
                ? `${matched.length - latestEvents.length} ready card${matched.length - latestEvents.length === 1 ? ' has' : 's have'} not been checked or studied yet.`
                : 'Every mapped card has a recorded recall response.';

        return {
          name,
          cardCount: matched.length,
          readyCount,
          pendingCount,
          practicedCount: practicedIds.size,
          coveragePercent: matched.length ? Math.round(practicedIds.size / matched.length * 100) : 0,
          reviewCount: events.length,
          missedCount,
          hardCount,
          lastRating: lastEvent?.rating || '',
          lastReviewedAt: lastEvent?.reviewedAt || '',
          status,
          statusKind,
          reason,
          sourceNames: unique(matched.map(card => card.sourceName)),
          locations: unique(matched.map(card => card.location)),
          sourceReferences: [...new Map(matched
            .filter(card => card.sourceName)
            .map(card => {
              const reference = { name: String(card.sourceName), location: String(card.location || '') };
              return [`${normalize(reference.name)}|${normalize(reference.location)}`, reference];
            })).values()]
        };
      });
  }

  function recommendNext(topics = []) {
    const rank = { review: 0, effortful: 1, new: 2, recent: 3, empty: 4 };
    const candidates = [...topics].sort((left, right) => {
      const rankDifference = (rank[left.statusKind] ?? 5) - (rank[right.statusKind] ?? 5);
      if (rankDifference) return rankDifference;
      if ((right.missedCount || 0) !== (left.missedCount || 0)) return (right.missedCount || 0) - (left.missedCount || 0);
      if ((right.hardCount || 0) !== (left.hardCount || 0)) return (right.hardCount || 0) - (left.hardCount || 0);
      if ((left.cardCount > 0) !== (right.cardCount > 0)) return left.cardCount > 0 ? -1 : 1;
      return (left.lastReviewedAt || '').localeCompare(right.lastReviewedAt || '');
    });
    return candidates.find(topic => topic.cardCount > 0) || candidates[0] || null;
  }

  function mapObjectiveCues(objectiveCues = [], topics = []) {
    const map = new Map(topics.map(topic => [normalize(topic.name), topic]));
    return unique(objectiveCues).map(text => {
      const cueWords = new Set(contentWords(text));
      const matches = [...map.values()].filter(topic => {
        const words = [...new Set(contentWords(topic.name))];
        if (!words.length) return false;
        const threshold = words.length > 1 ? 2 : 1;
        return words.filter(word => cueWords.has(word)).length >= threshold;
      });
      return { text, topics: matches.map(topic => topic.name) };
    });
  }

  const api = { buildCourseMap, mapObjectiveCues, normalize, prioritizeTopics, recommendNext };
  root.SyllabloomCourseMap = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
