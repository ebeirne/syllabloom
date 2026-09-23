const test = require('node:test');
const assert = require('node:assert/strict');
const { getUsFederalHolidays, parseDatedSchedule } = require('../calendar-features.js');

test('U.S. federal holidays include the published 2026 observed dates', () => {
  const holidays = getUsFederalHolidays(2026);
  assert.equal(holidays.length, 11);
  assert.equal(holidays.find(event => event.title === 'Independence Day').date, '2026-07-03');
  assert.equal(holidays.find(event => event.title === 'Birthday of Martin Luther King, Jr.').date, '2026-01-19');
  assert.equal(holidays.find(event => event.title === 'Thanksgiving Day').date, '2026-11-26');
  assert.ok(holidays.every(event => event.type === 'holiday' && event.federalReference));
});

test('fixed-date holidays correctly roll into the prior year when Saturday is observed Friday', () => {
  const holidays = getUsFederalHolidays(2022);
  assert.equal(holidays.find(event => event.title === "New Year's Day").date, '2021-12-31');
});

test('schedule OCR parser extracts explicit and yearless dates with editable event types', () => {
  const events = parseDatedSchedule([
    'Week 1: Sep 10, 2026 — Lecture 1',
    'Quiz 2: 9/17/2026',
    'Project due 10/2',
    'Final exam — October 15, 2026',
    'September 31, 2026 is not a real date',
    'September 10–12, 2026 is a date range, not a single event',
    'September 20 through October 2, 2026 is not a single date'
  ].join('\n'), 2026);

  assert.deepEqual(events.map(event => [event.date, event.type]), [
    ['2026-09-10', 'lecture'],
    ['2026-09-17', 'quiz'],
    ['2026-10-02', 'assignment'],
    ['2026-10-15', 'exam']
  ]);
  assert.equal(events[0].title, 'Lecture 1');
  assert.equal(events[1].title, 'Quiz 2');
});

test('schedule OCR parser deduplicates repeated lines and ignores lines without a useful title', () => {
  const events = parseDatedSchedule('Sep 10 Lecture 1\nSep 10 Lecture 1\n09/11\nBring notes', 2026);
  assert.equal(events.length, 1);
  assert.equal(events[0].date, '2026-09-10');
});
