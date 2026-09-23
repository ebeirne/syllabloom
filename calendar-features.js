(function attachCalendarFeatures(root) {
  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function nthWeekday(year, month, weekday, occurrence) {
    const first = new Date(year, month - 1, 1, 12).getDay();
    return 1 + ((weekday - first + 7) % 7) + (occurrence - 1) * 7;
  }

  function lastWeekday(year, month, weekday) {
    const last = new Date(year, month, 0, 12);
    return last.getDate() - ((last.getDay() - weekday + 7) % 7);
  }

  function observedDate(year, month, day) {
    const date = new Date(year, month - 1, day, 12);
    if (date.getDay() === 6) date.setDate(date.getDate() - 1);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    return isoDate(date);
  }

  function getUsFederalHolidays(year) {
    const fixed = [
      ["New Year's Day", 1, 1],
      ['Juneteenth National Independence Day', 6, 19],
      ['Independence Day', 7, 4],
      ['Veterans Day', 11, 11],
      ['Christmas Day', 12, 25]
    ];
    const holidays = fixed.map(([title, month, day]) => ({
      id: `federal-${year}-${month}-${day}`,
      title,
      date: observedDate(year, month, day),
      type: 'holiday',
      federalReference: true
    }));
    holidays.push(
      { id: `federal-${year}-mlk`, title: 'Birthday of Martin Luther King, Jr.', date: isoDate(new Date(year, 0, nthWeekday(year, 1, 1, 3), 12)), type: 'holiday', federalReference: true },
      { id: `federal-${year}-washington`, title: "Washington's Birthday", date: isoDate(new Date(year, 1, nthWeekday(year, 2, 1, 3), 12)), type: 'holiday', federalReference: true },
      { id: `federal-${year}-memorial`, title: 'Memorial Day', date: isoDate(new Date(year, 4, lastWeekday(year, 5, 1), 12)), type: 'holiday', federalReference: true },
      { id: `federal-${year}-labor`, title: 'Labor Day', date: isoDate(new Date(year, 8, nthWeekday(year, 9, 1, 1), 12)), type: 'holiday', federalReference: true },
      { id: `federal-${year}-columbus`, title: 'Columbus Day', date: isoDate(new Date(year, 9, nthWeekday(year, 10, 1, 2), 12)), type: 'holiday', federalReference: true },
      { id: `federal-${year}-thanksgiving`, title: 'Thanksgiving Day', date: isoDate(new Date(year, 10, nthWeekday(year, 11, 4, 4), 12)), type: 'holiday', federalReference: true }
    );
    return holidays.sort((left, right) => left.date.localeCompare(right.date));
  }

  const datePatterns = [
    {
      regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
      parse: (match, defaultYear) => ({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) })
    },
    {
      regex: /(?<!\d)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?!\d)/,
      parse: (match, defaultYear) => {
        let year = match[3] ? Number(match[3]) : defaultYear;
        if (year < 100) year += year < 80 ? 2000 : 1900;
        return { year, month: Number(match[1]), day: Number(match[2]) };
      }
    },
    {
      regex: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember|t)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
      parse: (match, defaultYear) => {
        const month = match[1].slice(0, 3).toLowerCase();
        const monthNumber = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month) + 1;
        return { year: Number(match[3] || defaultYear), month: monthNumber, day: Number(match[2]) };
      }
    }
  ];

  function findDate(line, defaultYear) {
    let found = null;
    for (const pattern of datePatterns) {
      const match = pattern.regex.exec(line);
      if (match && (!found || match.index < found.match.index)) found = { match, pattern };
    }
    if (!found) return null;
    const { match, pattern } = found;
    if (/^\s*(?:-|–|—|to|through|until)\s*(?:\d{1,2}\b|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember|t)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b)/i.test(line.slice(match.index + match[0].length))) return null;
    const { year, month, day } = pattern.parse(match, defaultYear);
    if (year < 1900 || year > 2200) return null;
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { date: isoDate(date), start: match.index, end: match.index + match[0].length };
  }

  function inferEventType(text) {
    if (/\b(exam|midterm|final|test|practical)\b/i.test(text)) return 'exam';
    if (/\b(quiz|quick check)\b/i.test(text)) return 'quiz';
    if (/\b(lecture|class|lab|section)\b/i.test(text)) return 'lecture';
    if (/\b(holiday|break|no class|campus closed)\b/i.test(text)) return 'holiday';
    return 'assignment';
  }

  function parseDatedSchedule(text, defaultYear) {
    const deduplicated = new Map();
    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const found = findDate(line, Number(defaultYear));
      if (!found) continue;
      const title = line.slice(0, found.start) + ' ' + line.slice(found.end);
      const cleanedTitle = title
        .replace(/\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b[:,]?/gi, ' ')
        .replace(/^\s*week\s+[a-z0-9]+\s*[:.)-]?/i, ' ')
        .replace(/^[\s\-–—|,:;•*]+|[\s\-–—|,:;•*]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanedTitle.length < 3 || cleanedTitle.length > 120) continue;
      const type = inferEventType(cleanedTitle);
      const key = `${found.date}|${cleanedTitle.toLocaleLowerCase()}`;
      if (!deduplicated.has(key)) deduplicated.set(key, { date: found.date, title: cleanedTitle, type, sourceLine: line });
    }
    return [...deduplicated.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 60);
  }

  const api = { getUsFederalHolidays, parseDatedSchedule };
  root.SyllabloomCalendarFeatures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
