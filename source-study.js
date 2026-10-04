(function attachSourceStudy(root) {
  const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
  const PAGE_RE = /^page\s+\d+(?:\s+of\s+\d+)?\.?$/i;
  const TIMESTAMP_HEADING_RE = /^.{2,120}\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:am|pm)$/i;
  const META_QUESTION_RE = /^(?:what is (?:the )?following question|what question (?:follows|comes next)|what is asked next)\b/i;
  const BROAD_SUMMARY_QUESTION_RE = /^what are the (?:key|main) (?:ideas|points)\s+(?:about|in|of)\b/i;
  const MULTI_TASK_QUESTION_RE = /\b(?:and\s+(?:what|why|how|when|where|which)|also\s+(?:what|why|how))\b/i;
  const ADMIN_INSTRUCTION_RE = /\b(?:due date|late penalty|autograder|grader|assignment requirements|project requirements|identical set of public methods and signatures|public methods and signatures.{0,30}exactly as (?:the )?specification requires|implement(?:ation)?\s+(?:the\s+)?API\s+exactly\s+as\s+specified|submit\b.{0,60}\b(?:code|program|assignment|solution|project))\b/i;

  function normalize(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function isBoilerplate(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return !text
      || /[\uE000-\uF8FF\uFFFD]/u.test(text)
      || PAGE_RE.test(text)
      || TIMESTAMP_HEADING_RE.test(text)
      || /^(?:https?:\/\/|www\.)/i.test(text);
  }

  function cleanLine(value) {
    const text = String(value || '').replace(URL_RE, ' ').replace(/\s+/g, ' ').trim();
    return isBoilerplate(text) || text.length < 3 ? '' : text;
  }

  function isUsefulConcept(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const normalized = text.toLowerCase();
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    if (!text || /[\uE000-\uF8FF\uFFFD]/u.test(text) || /\b(?:page\s*\d+|project files|requirements|client should|java-algs4|open sites|submit)\b/i.test(text)) return false;
    if (/^(?:\d|\(|[~/>])/.test(text) || /[<>\/\\]/.test(text)) return false;
    if (/^(?:install|set up|submit|implement|create|read|write|use|download|run)\b/i.test(text)) return false;
    if (/\b(?:and|or|of|to|with|our|the|a|an|in|by|from|is|are|be|as|for)$/i.test(text)) return false;
    if (words.length < 1 || words.length > 5 || text.length > 80) return false;
    return normalized !== 'project' && normalized !== 'assignment';
  }

  function cleanConcepts(concepts) {
    const unique = new Map();
    (Array.isArray(concepts) ? concepts : []).forEach(concept => {
      const raw = typeof concept === 'string' ? concept : concept?.name;
      const name = cleanLine(raw);
      const key = normalize(name);
      if (name && key && isUsefulConcept(name) && !unique.has(key)) unique.set(key, name);
    });
    return [...unique.values()];
  }

  function cleanNotes(notes) {
    const grouped = new Map();
    (Array.isArray(notes) ? notes : []).forEach(note => {
      const rawTitle = cleanLine(note?.title);
      const incompleteTitle = /\b(?:and|or|of|to|with|our|the|a|an|in|by|from|is|are|be|as|for)$/i.test(rawTitle || '');
      const pageNumber = Number.isInteger(Number(note?.pageNumber)) && Number(note.pageNumber) > 0 ? Number(note.pageNumber) : null;
      const fallbackTitle = pageNumber ? `Page ${pageNumber}` : (cleanLine(note?.source) || 'Source notes');
      const pageLabelTitle = pageNumber && /^(?:.+\s*[·|-]\s*)?page\s+\d+$/i.test(rawTitle);
      const title = rawTitle && rawTitle.length <= 100 && !incompleteTitle && !pageLabelTitle && !URL_RE.test(rawTitle)
        ? rawTitle
        : pageNumber ? 'Source notes' : fallbackTitle;
      URL_RE.lastIndex = 0;
      const key = pageNumber && title === 'Source notes' ? `page-${pageNumber}` : normalize(title) || 'source notes';
      const lines = (Array.isArray(note?.lines) ? note.lines : [])
        .map(cleanLine)
        .filter(Boolean)
        .filter(line => normalize(line) !== normalize(note?.title));
      const existing = grouped.get(key) || { title, slideNumber: note?.slideNumber || null, pageNumber, lines: [], lineKeys: new Set() };
      lines.forEach(line => {
        const lineKey = normalize(line);
        if (lineKey && !existing.lineKeys.has(lineKey)) {
          existing.lineKeys.add(lineKey);
          existing.lines.push(line);
        }
      });
      grouped.set(key, existing);
    });
    return [...grouped.values()].map(({ lineKeys, ...note }) => note).filter(note => note.title !== 'Source notes' || note.lines.length);
  }

  function isUsableCard(card) {
    if (card?.noteType === 'Cloze') return /\{\{c1::[^{}]+\}\}/.test(card.clozeText || '') && Boolean(card.back);
    if (card?.noteType === 'ImageOcclusion') return Boolean(card.occlusion?.target && card.back);
    const rawFront = String(card?.front || '');
    const rawBack = String(card?.back || '');
    const hasLink = URL_RE.test(`${rawFront} ${rawBack}`);
    URL_RE.lastIndex = 0;
    const front = cleanLine(rawFront);
    const back = cleanLine(rawBack);
    if (!front || !back || hasLink || back.endsWith('?') || ADMIN_INSTRUCTION_RE.test(`${front} ${back}`)) {
      URL_RE.lastIndex = 0;
      return false;
    }
    if (PAGE_RE.test(front) || PAGE_RE.test(back) || TIMESTAMP_HEADING_RE.test(front) || TIMESTAMP_HEADING_RE.test(back)) return false;
    if (META_QUESTION_RE.test(front) || BROAD_SUMMARY_QUESTION_RE.test(front) || MULTI_TASK_QUESTION_RE.test(front)) return false;
    if (front.length < 12 || back.length < 8) return false;
    return !/^what\s+is\s+(?:https?|www\.)\b/i.test(front);
  }

  function quickCheckItems(cards, limit = 3, options = {}) {
    const candidates = (Array.isArray(cards) ? cards : []).filter(card => {
      const answer = String(card?.back || '').replace(/\s+/g, ' ').trim();
      const words = answer.match(/\b\w+\b/g) || [];
      return card?.reviewStatus !== 'skipped'
        && isUsableCard(card)
        && String(card.front || '').trim().endsWith('?')
        && answer.length <= 260
        && words.length >= 2
        && words.length <= 36;
    });
    const sectionCards = candidates.filter((card, index) => {
      const section = String(card.section || card.concept || '').trim();
      const key = section || card.slideNumber && `slide-${card.slideNumber}` || card.id || `card-${index}`;
      return candidates.findIndex((candidate, candidateIndex) => {
        const candidateSection = String(candidate.section || candidate.concept || '').trim();
        const candidateKey = candidateSection || candidate.slideNumber && `slide-${candidate.slideNumber}` || candidate.id || `card-${candidateIndex}`;
        return candidateKey === key;
      }) === index;
    });
    const pool = sectionCards.length >= limit ? sectionCards : candidates;
    const missCounts = options?.missCounts && typeof options.missCounts === 'object' ? options.missCounts : {};
    const offset = Math.max(0, Number(options?.offset) || 0);
    const rotated = pool.map((card, index) => ({ card, index, rotation: pool.length ? (index - (offset % pool.length) + pool.length) % pool.length : index }));
    rotated.sort((left, right) => {
      const leftId = String(left.card.id || '');
      const rightId = String(right.card.id || '');
      const leftMisses = Math.max(0, Number(missCounts[`lecture-${leftId}`] ?? missCounts[leftId]) || 0);
      const rightMisses = Math.max(0, Number(missCounts[`lecture-${rightId}`] ?? missCounts[rightId]) || 0);
      return rightMisses - leftMisses || left.rotation - right.rotation || left.index - right.index;
    });
    return rotated.slice(0, Math.max(0, limit)).map(({ card }) => {
      const rawSourceName = card.source || (card.slideNumber ? `slide ${card.slideNumber}` : 'your uploaded material');
      URL_RE.lastIndex = 0;
      const sourceName = URL_RE.test(rawSourceName)
        ? 'your uploaded material'
        : rawSourceName.replace(/\s*[·–-]\s*(?:page|slide)\s+\d+\s*$/i, '');
      URL_RE.lastIndex = 0;
      const locatorMatch = String(rawSourceName).match(/\s*[·–-]\s*((?:page|slide)\s+\d+)\s*$/i);
      return {
        mode: 'recall',
        question: card.front,
        answer: card.back,
        cardId: `lecture-${card.id}`,
        concept: card.section || card.concept || '',
        sourceName,
        sourceLocation: card.sourceLocation || (card.pageNumber ? `Page ${card.pageNumber}` : card.slideNumber ? `Slide ${card.slideNumber}` : locatorMatch?.[1] || ''),
        sourceQuote: String(card.sourceQuote || '')
      };
    });
  }

  const api = { cleanConcepts, cleanNotes, isBoilerplate, isUsefulConcept, isUsableCard, normalize, quickCheckItems };
  root.SyllabloomSourceStudy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
