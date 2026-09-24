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
  assert.equal(concept.status, 'Not practiced');
  assert.equal(concept.statusKind, 'new');
  assert.equal(concept.reason, '1 ready card has not been checked or studied yet.');
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

test('course map counts only the latest response per card and exposes source and ready-set evidence', () => {
  const [concept] = buildCourseMap({
    concepts: ['Cell signaling'],
    cards: [
      { id: 'card-a', concept: 'Cell signaling', sourceName: 'Week 2 slides', location: 'Slide 5', ready: true },
      { id: 'card-b', concept: 'Cell signaling', sourceName: 'Week 3 notes', location: 'Page 2', ready: false }
    ],
    reviewHistory: [
      { cardId: 'card-a', rating: 'Again', className: 'Biology', classTerm: 'Fall 2026', reviewedAt: '2026-09-20T10:00:00Z' },
      { cardId: 'card-a', rating: 'Good', className: 'Biology', classTerm: 'Fall 2026', reviewedAt: '2026-09-21T10:00:00Z' },
      { cardId: 'card-b', rating: 'Hard', className: 'Biology', classTerm: 'Fall 2026', reviewedAt: '2026-09-22T10:00:00Z' }
    ],
    className: 'Biology',
    classTerm: 'Fall 2026'
  });

  assert.equal(concept.missedCount, 0);
  assert.equal(concept.hardCount, 1);
  assert.equal(concept.readyCount, 1);
  assert.equal(concept.pendingCount, 1);
  assert.equal(concept.status, 'Needs another look');
  assert.equal(concept.reason, '1 card was most recently marked Hard.');
  assert.deepEqual(concept.sourceNames, ['Week 2 slides', 'Week 3 notes']);
  assert.deepEqual(concept.locations, ['Slide 5', 'Page 2']);
});

test('latest Good or Easy response clears an old miss for recommendation purposes', () => {
  const [concept] = buildCourseMap({
    concepts: ['Memory'],
    cards: [{ id: 'card-a', concept: 'Memory', ready: true }],
    reviewHistory: [
      { cardId: 'card-a', rating: 'Again', reviewedAt: '2026-09-20T10:00:00Z' },
      { cardId: 'card-a', rating: 'Easy', reviewedAt: '2026-09-21T10:00:00Z' }
    ]
  });

  assert.equal(concept.missedCount, 0);
  assert.equal(concept.status, 'Recent recall');
  assert.equal(concept.statusKind, 'recent');
});

test('recommended topic follows actual miss, effortful recall, then untouched ready cards', () => {
  const topics = [
    { name: 'Unseen', statusKind: 'new', cardCount: 2, missedCount: 0, hardCount: 0 },
    { name: 'Effortful', statusKind: 'effortful', cardCount: 1, missedCount: 0, hardCount: 1 },
    { name: 'Missed', statusKind: 'review', cardCount: 1, missedCount: 1, hardCount: 0 }
  ];

  assert.equal(require('../course-map.js').recommendNext(topics).name, 'Missed');
  topics[2].statusKind = 'recent';
  assert.equal(require('../course-map.js').recommendNext(topics).name, 'Effortful');
  topics[1].statusKind = 'recent';
  assert.equal(require('../course-map.js').recommendNext(topics).name, 'Unseen');
});

test('syllabus cues connect only to concepts with exact meaningful words in common', () => {
  const mapped = require('../course-map.js').mapObjectiveCues(
    ['Explain how cell signaling changes gene expression.', 'Compare memory encoding and retrieval.'],
    [
      { name: 'Cell signaling', cardCount: 4 },
      { name: 'Memory retrieval', cardCount: 2 },
      { name: 'Photosynthesis', cardCount: 5 }
    ]
  );

  assert.deepEqual(mapped, [
    { text: 'Explain how cell signaling changes gene expression.', topics: ['Cell signaling'] },
    { text: 'Compare memory encoding and retrieval.', topics: ['Memory retrieval'] }
  ]);
});

test('concept names that differ only by case collapse into one course-map row', () => {
  const topics = buildCourseMap({
    concepts: ['Cell Signaling', 'cell signaling'],
    cards: [{ id: 'card-a', concept: 'cell signaling' }]
  });

  assert.equal(topics.length, 1);
});
