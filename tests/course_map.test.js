const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCourseMap } = require('../course-map.js');

test('course map shows mapped source cards without inventing a mastery score', () => {
  const [concept] = buildCourseMap({
    concepts: ['Market Structures'],
    cards: [
      { id: 'card-1', concept: 'Market structures', sourceName: 'Lecture 4.pdf' },
      { id: 'card-2', concept: 'Market structures', sourceName: 'Lecture 4.pdf' }
    ]
  });

  assert.equal(concept.cardCount, 2);
  assert.equal(concept.practicedCount, 0);
  assert.equal(concept.coveragePercent, 0);
  assert.equal(concept.status, 'Not practiced');
  assert.deepEqual(concept.sourceNames, ['Lecture 4.pdf']);
});

test('course map updates from real quick-check and study responses, counting distinct cards', () => {
  const [concept] = buildCourseMap({
    concepts: [{ name: 'Operating Systems' }],
    cards: [
      { id: 'lecture-card-1', concept: 'Operating systems', sourceName: 'Week 2 slides' },
      { id: 'lecture-card-2', concept: 'Operating systems', sourceName: 'Week 3 slides' }
    ],
    reviewHistory: [
      { cardId: 'lecture-card-1', rating: 'Again', activity: 'quick-check', className: 'CS 340', classTerm: 'Fall 2026', reviewedAt: '2026-09-20T10:00:00Z' },
      { cardId: 'lecture-card-1', rating: 'Good', activity: 'study', className: 'CS 340', classTerm: 'Fall 2026', reviewedAt: '2026-09-21T10:00:00Z' }
    ],
    className: 'CS 340',
    classTerm: 'Fall 2026'
  });

  assert.equal(concept.practicedCount, 1);
  assert.equal(concept.coveragePercent, 50);
  assert.equal(concept.reviewCount, 2);
  assert.equal(concept.status, 'Recent recall');
});

test('course map ignores study responses from another class and separates hard from missed', () => {
  const [concept] = buildCourseMap({
    concepts: ['Cell signaling'],
    cards: [{ id: 'card-a', concept: 'Cell signaling' }],
    reviewHistory: [
      { cardId: 'card-a', rating: 'Again', className: 'Biology', classTerm: 'Spring 2026', reviewedAt: '2026-09-21T10:00:00Z' },
      { cardId: 'card-a', rating: 'Hard', className: 'Biology', classTerm: 'Fall 2026', reviewedAt: '2026-09-22T10:00:00Z' }
    ],
    className: 'Biology',
    classTerm: 'Fall 2026'
  });

  assert.equal(concept.reviewCount, 1);
  assert.equal(concept.status, 'Needs another look');
  assert.equal(concept.statusKind, 'effortful');
});

test('concept association is exact rather than a fuzzy substring match', () => {
  const concepts = buildCourseMap({
    concepts: ['Cell signaling'],
    cards: [{ id: 'card-a', concept: 'Cell signaling pathways' }]
  });

  assert.equal(concepts[0].cardCount, 0);
  assert.equal(concepts[0].status, 'No cards yet');
});

test('weak concepts move ahead of the default agenda based on accumulated misses', () => {
  const prioritized = require('../course-map.js').prioritizeTopics(
    ['Source order', 'Cell signaling', 'Exam review'],
    [['cell signaling', 2], ['Exam review', 1]]
  );

  assert.deepEqual(prioritized, ['Cell signaling', 'Exam review', 'Source order']);
});

test('unscoped legacy answers do not claim practice in a named class', () => {
  const [concept] = buildCourseMap({
    concepts: ['Cell signaling'],
    cards: [{ id: 'card-a', concept: 'Cell signaling' }],
    reviewHistory: [
      { cardId: 'card-a', rating: 'Good', reviewedAt: '2026-09-20T10:00:00Z' },
      { cardId: 'card-a', rating: 'Again', className: 'Biology', classTerm: 'Fall 2026', reviewedAt: '2026-09-21T10:00:00Z' }
    ],
    className: 'Biology',
    classTerm: 'Fall 2026'
  });

  assert.equal(concept.reviewCount, 1);
  assert.equal(concept.status, 'Review next');
});
