const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanConcepts, cleanNotes, isUsableCard, quickCheckItems } = require('../source-study.js');

test('source concept chips omit links, page footers, timestamps, and duplicates', () => {
  assert.deepEqual(cleanConcepts([
    'https://www.cs.princeton.edu/courses/archive/spring26/cos226/assignments/percolation/specification.php Page 5 of 18',
    'Percolation Assignment 9/23/26, 11:46 PM',
    'Percolation model',
    'Percolation model',
    'PercolationStats client should work with our',
    '2. Weighted quick-union implementation. Re-implement',
    '50 open sites 100 open sites',
    '(cid:0) PERCOLATIONSTATS REQUIREMENTS',
    '~/Desktop/percolation> java-algs4 PercolationVisualizer input20.txt',
    'Project files',
    'Monte Carlo simulation'
  ]), ['Percolation model', 'Monte Carlo simulation']);
});

test('repeated PDF headers and link-only lines are removed and notes are merged', () => {
  const notes = cleanNotes([
    { title: 'Percolation Assignment 9/23/26, 11:46 PM', lines: [
      'Percolation Assignment 9/23/26, 11:46 PM',
      'https://www.cs.princeton.edu/courses/archive/spring26/cos226/assignments/percolation/specification.php Page 5 of 18',
      'Implement a percolation model with a union-find data structure.'
    ] },
    { title: 'Percolation Assignment 9/23/26, 11:46 PM', lines: [
      'Implement a percolation model with a union-find data structure.',
      'Use the prescribed API for the assignment.'
    ] },
    { title: 'PRCOLATION Project Submit', source: 'Percolation assignment · Page 3', pageNumber: 3, lines: ['PRCOLATION Project Submit', 'A percolation model connects open sites.'] }
  ]);

  assert.equal(notes.length, 2);
  assert.equal(notes[0].title, 'Source notes');
  assert.deepEqual(notes[0].lines, [
    'Implement a percolation model with a union-find data structure.',
    'Use the prescribed API for the assignment.'
  ]);
  assert.equal(notes[1].title, 'Source notes');
  assert.equal(notes[1].pageNumber, 3);
  assert.deepEqual(notes[1].lines, ['A percolation model connects open sites.']);
});

test('source cards with link answers or PDF running headers cannot enter study checks', () => {
  assert.equal(isUsableCard({ front: 'What is https?', back: 'https://example.edu/spec Page 18 of 18' }), false);
  assert.equal(isUsableCard({ front: 'What is the assignment?', back: 'Percolation Assignment 9/23/26, 11:46 PM' }), false);
  assert.equal(isUsableCard({ front: 'What is percolation?', back: 'A model of fluid flow through a system of connected sites.' }), true);
});

test('custom quick checks use exact source answers and never manufacture cross-card choices', () => {
  const items = quickCheckItems([
    { id: '1', front: 'What is percolation?', back: 'A model of fluid flow through a porous system.', section: 'Percolation', source: 'Lecture 1' },
    { id: '2', front: 'What does the union-find structure track?', back: 'Connected components in the grid.', section: 'Union-find', source: 'Lecture 2' },
    { id: '3', front: 'When does the system percolate?', back: 'When a full path connects the top row to the bottom row.', section: 'Percolation', source: 'Lecture 1' }
  ]);

  assert.equal(items.length, 3);
  assert.ok(items.every(item => item.mode === 'recall'));
  assert.deepEqual(items.map(item => item.answer), [
    'A model of fluid flow through a porous system.',
    'Connected components in the grid.',
    'When a full path connects the top row to the bottom row.'
  ]);
  assert.ok(items.every(item => !Object.hasOwn(item, 'options')));
});

test('AI-generated quick-check prompts reuse the reviewed card and preserve its page source', () => {
  const sourceQuote = 'During systems consolidation, new episodic memories initially depend on the hippocampus, then become more distributed across neocortical networks over time.';
  const card = {
    id: 'ai-systems-consolidation',
    front: 'How does systems consolidation change where episodic memories depend on over time?',
    back: 'They first depend on the hippocampus, then become more distributed across neocortical networks as time passes.',
    section: 'Systems consolidation',
    source: 'Cognition lecture.pdf · Page 1',
    sourceLocation: 'Page 1',
    sourceQuote,
    generatedBy: 'openai'
  };
  const items = quickCheckItems([card]);

  assert.equal(items.length, 1);
  assert.equal(items[0].question, card.front);
  assert.equal(items[0].answer, card.back);
  assert.equal(items[0].sourceName, card.source);
  assert.ok(card.sourceQuote.includes('systems consolidation'));
});
