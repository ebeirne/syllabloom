(() => {
  const source = window.MUSCLE_SOURCE;
  const records = source.records;
  const savedClassProfile = storedJson('syllabloom-class-profile', {
    mode: 'sample',
    className: 'Human Anatomy',
    term: 'Fall 2023',
    syllabusName: 'Anatomy syllabus example',
    useDemoSyllabus: true,
    includeSampleMaterial: true
  });
  const demoSyllabusSource = {
    id: 'demo-anatomy-syllabus',
    name: 'Anatomy syllabus example',
    kind: 'syllabus',
    format: 'EXAMPLE',
    unitCount: 14,
    unitLabel: 'course dates',
    wordCount: 860,
    objectiveCount: 8,
    draftCards: [],
    sample: true,
    storage: 'example'
  };
  const sampleMaterialSource = {
    id: 'sample-muscles-fall-2023',
    name: source.document,
    kind: 'material',
    format: 'DOCX',
    unitCount: source.muscleCount,
    unitLabel: 'muscles',
    wordCount: 2380,
    objectiveCount: 0,
    draftCards: [],
    sample: true,
    storage: 'example'
  };

  const storedReviewHistory = storedJson('syllabloom-review-history', []);
  const savedReviewHistory = Array.isArray(storedReviewHistory) ? storedReviewHistory : [];

  function storedJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function localIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateAfter(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return localIsoDate(date);
  }

  const defaultAnkiPreferences = {
    deck: 'Human Anatomy',
    setName: 'Exam 1, Upper Limb',
    presetName: 'Syllabloom FSRS',
    format: 'Basic',
    answerStyle: 'Concise',
    dailyLimit: 20,
    newPerDay: 20,
    reviewsPerDay: 9999,
    tags: 'human-anatomy::fall-2023',
    newCardsIgnoreReviewLimit: false,
    limitsStartFromTop: false,
    learningSteps: [1, 10],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    minimumInterval: 1,
    leechThreshold: 8,
    leechAction: 'suspend',
    releaseStrategy: 'weakest-deadline',
    insertionOrder: 'sequential',
    gatherOrder: 'deck',
    sortOrder: 'template',
    newReviewOrder: 'after',
    interdayOrder: 'mix',
    reviewOrder: 'due',
    buryNew: true,
    buryReviews: true,
    buryInterday: true,
    easyDays: [1, 1, 1, 1, 1, 1, 0.5],
    fsrsEnabled: true,
    desiredRetention: 0.9,
    historicalRetention: 0.9,
    ignoreBefore: '',
    fsrsParameters: [],
    rescheduleOnChange: false,
    maximumInterval: 36500,
    disableAutoplay: false,
    skipQuestionAudio: false,
    showTimer: false,
    stopTimerOnAnswer: false,
    maximumAnswerSeconds: 60,
    questionSeconds: 0,
    questionAction: 'show-answer',
    answerSeconds: 0,
    answerAction: 'bury',
    waitForAudio: true,
    startingEase: 2.5,
    easyBonus: 1.3,
    intervalModifier: 1,
    hardInterval: 1.2,
    newInterval: 0
  };

  const initialCalendarEvents = [
    { id: 'lecture-upper-limb', date: dateAfter(1), type: 'lecture', title: 'Upper limb lecture' },
    { id: 'quiz-attachments', date: dateAfter(5), type: 'quiz', title: 'Attachment quiz' },
    { id: 'exam-one', date: dateAfter(12), type: 'exam', title: 'Exam 1' }
  ];

  const state = {
    view: 'home',
    selectedId: records[0].id,
    field: 'attachment',
    statuses: {},
    edits: {},
    studyIndex: 0,
    reviewCount: 146 + savedReviewHistory.length,
    reviewHistory: savedReviewHistory,
    planCorrections: 0,
    setupStep: 1,
    className: savedClassProfile.className || 'Human Anatomy',
    classTerm: savedClassProfile.term || 'Fall 2023',
    classMode: savedClassProfile.mode || 'sample',
    syllabusName: savedClassProfile.syllabusName || 'No syllabus added',
    useDemoSyllabus: Boolean(savedClassProfile.useDemoSyllabus),
    includeSampleMaterial: savedClassProfile.includeSampleMaterial !== false,
    assessmentIndex: 0,
    assessmentScore: 0,
    baselineScore: 62,
    lectureCards: [],
    sources: storedJson('syllabloom-sources', []),
    latestSessionId: null,
    anki: { ...defaultAnkiPreferences, ...storedJson('syllabloom-anki-preferences', {}) },
    calendarEvents: storedJson('syllabloom-calendar-events', initialCalendarEvents),
    calendarCursor: new Date(),
    dailyStudyMinutes: 35,
    selectedTypes: ['attachment', 'action', 'innervation'],
    creatingClass: false,
    pendingClassSetup: false,
    cloudBeta: false,
    missCounts: storedJson('syllabloom-miss-counts', {}),
    missedItem: null,
    account: {
      plan: 'free',
      classLimit: 1,
      classesUsed: 0,
      ...storedJson('syllabloom-account', {}),
      signedIn: false,
      email: '',
      userId: '',
      displayName: '',
      imageUrl: ''
    }
  };

  const appViews = new Set(['home', 'capture', 'source', 'knowledge', 'profile', 'billing', 'cards', 'study']);
  const marketingHashes = new Set(['landing', 'how-it-works', 'anki-first', 'made-for-class', 'pricing']);
  let restoringShellHistory = false;

  function shellRoute() {
    return window.history.state?.syllabloom || null;
  }

  function syncShellHistory(surface, view = state.view, mode = 'push') {
    if (!mode || restoringShellHistory) return;
    const currentHash = window.location.hash.replace(/^#/, '');
    const routeHash = surface === 'app'
      ? (appViews.has(view) ? view : 'home')
      : surface === 'onboarding'
        ? `setup-${Math.max(1, Number(state.setupStep) || 1)}`
        : marketingHashes.has(currentHash)
          ? currentHash
          : 'landing';
    const snapshot = {
      ...(window.history.state || {}),
      syllabloom: { surface, view, step: state.setupStep }
    };
    const routeUrl = `${window.location.pathname}${window.location.search}#${routeHash}`;
    window.history[mode === 'replace' ? 'replaceState' : 'pushState'](snapshot, '', routeUrl);
  }

  const assessmentQuestions = [
    {
      question: 'What innervates the masseter?',
      options: ['Facial nerve', 'Masseteric nerve of the mandibular division of trigeminal', 'Hypoglossal nerve', 'Femoral nerve'],
      correct: 1,
      explanation: 'The source lists the masseteric nerve from the mandibular division of the trigeminal nerve.'
    },
    {
      question: 'Which muscle elevates and retracts the mandible?',
      options: ['Temporalis', 'Buccinator', 'Lateral pterygoid', 'Platysma'],
      correct: 0,
      explanation: 'The temporalis elevates and retracts the mandible.'
    },
    {
      question: 'Where does tibialis anterior attach?',
      options: [
        'Calcaneus to the proximal phalanges',
        'Fibula to the fifth metatarsal',
        'Lateral tibia and interosseous membrane to the medial cuneiform and first metatarsal',
        'Femoral condyles to the calcaneus'
      ],
      correct: 2,
      explanation: 'The source connects the lateral tibia and interosseous membrane to the medial cuneiform and first metatarsal.'
    }
  ];

  function sourceAssessmentQuestions() {
    const cards = state.lectureCards.filter(card => card.front && card.back).slice(0, 12);
    return cards.slice(0, 3).map((card, index) => {
      const correctAnswer = shortCue(card.back, 220);
      const distractors = [...new Set(cards
        .filter(candidate => candidate !== card)
        .map(candidate => shortCue(candidate.back, 220))
        .filter(answer => answer && answer !== correctAnswer))].slice(0, 3);
      if (!distractors.length) distractors.push('I need to review this topic');
      const choices = [correctAnswer, ...distractors];
      const rotation = index % choices.length;
      const options = [...choices.slice(rotation), ...choices.slice(0, rotation)];
      const sourceLabel = card.source || (card.slideNumber ? `slide ${card.slideNumber}` : 'your uploaded material');
      return {
        question: card.front,
        options,
        correct: options.indexOf(correctAnswer),
        explanation: `${card.back} Source: ${sourceLabel}.`
      };
    });
  }

  function activeAssessmentQuestions() {
    return state.includeSampleMaterial ? assessmentQuestions : sourceAssessmentQuestions();
  }

  function sourceConceptNames() {
    return [...new Set(state.sources.flatMap(sourceItem => (sourceItem.concepts || [])
      .map(concept => String(concept?.name || concept || '').trim())
      .filter(Boolean)))];
  }

  function updateAssessmentIntro() {
    const title = document.querySelector('#assessmentIntroTitle');
    const copy = document.querySelector('#assessmentIntroCopy');
    const start = document.querySelector('#startAssessment');
    if (!title || !copy || !start) return;
    const questions = activeAssessmentQuestions();
    const latestSource = [...state.sources].reverse().find(item => item.draftCards?.length);
    if (!state.includeSampleMaterial && latestSource) {
      title.textContent = `Quick check from ${latestSource.name}`;
      copy.textContent = `${questions.length} question${questions.length === 1 ? '' : 's'} made from the cards that are already ready to study.`;
    } else if (!state.includeSampleMaterial) {
      title.textContent = 'Add material to start your check';
      copy.textContent = 'Upload slides, notes, a syllabus, or an authorized assessment. Your first questions will appear here with the ready cards.';
    } else {
      title.textContent = 'Quick starting check';
      copy.textContent = 'Three questions from the anatomy example. Add your own material to replace them with questions from your class.';
    }
    start.disabled = questions.length === 0;
    start.textContent = questions.length ? 'Check what I know' : 'Waiting for class material';
  }

  const fieldLabels = {
    attachment: 'Attachment',
    action: 'Action',
    innervation: 'Innervation',
    identify: 'Identify the muscle'
  };

  function questionFor(record, field) {
    if (field === 'attachment') return `Where does ${record.muscle} attach?`;
    if (field === 'action') return `What is the action of ${record.muscle}?`;
    if (field === 'innervation') return `What innervates ${record.muscle}?`;
    return `Which muscle matches these facts?`;
  }

  function answerFor(record, field) {
    if (field === 'identify') {
      return `${record.muscle}\n\nAttachment: ${record.attachment}\nAction: ${record.action}\nInnervation: ${record.innervation}`;
    }
    return record[field];
  }

  function keyFor(record, field = state.field) {
    return `${record.id}-${field}`;
  }

  function labelCase(value) {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('open');
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => toast.classList.remove('open'), 1800);
  }

  function numberValue(selector, fallback) {
    const value = Number(document.querySelector(selector)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function parseSteps(value) {
    if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
    return String(value || '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(step => {
        const match = step.trim().match(/^(\d+(?:\.\d+)?)([smhd]?)$/i);
        if (!match) return NaN;
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 's') return amount / 60;
        if (unit === 'h') return amount * 60;
        if (unit === 'd') return amount * 1440;
        return amount;
      })
      .filter(Number.isFinite);
  }

  function formatSteps(steps) {
    return (steps || []).map(minutes => {
      if (minutes < 1) return `${Math.round(minutes * 60)}s`;
      if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}d`;
      if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
      return `${minutes}m`;
    }).join(' ');
  }

  function fullAnkiDeckName() {
    const deck = state.anki.deck.trim() || 'Syllabloom';
    const setName = state.anki.setName.trim();
    return setName ? `${deck}::${setName}` : deck;
  }

  function syncAnkiFormFromState() {
    const values = {
      '#ankiDeckNameFull': state.anki.deck,
      '#ankiSetNameFull': state.anki.setName,
      '#ankiPresetName': state.anki.presetName,
      '#ankiTagsFull': state.anki.tags,
      '#ankiFormatFull': state.anki.format,
      '#ankiAnswerStyleFull': state.anki.answerStyle,
      '#ankiNewPerDay': state.anki.newPerDay,
      '#ankiReviewsPerDay': state.anki.reviewsPerDay,
      '#ankiLearningSteps': formatSteps(state.anki.learningSteps),
      '#ankiRelearningSteps': formatSteps(state.anki.relearningSteps),
      '#ankiGraduatingInterval': state.anki.graduatingInterval,
      '#ankiEasyInterval': state.anki.easyInterval,
      '#ankiMinimumInterval': state.anki.minimumInterval,
      '#ankiLeechThreshold': state.anki.leechThreshold,
      '#ankiLeechAction': state.anki.leechAction,
      '#ankiReleaseStrategy': state.anki.releaseStrategy,
      '#releaseStrategy': state.anki.releaseStrategy,
      '#ankiInsertionOrder': state.anki.insertionOrder,
      '#ankiGatherOrder': state.anki.gatherOrder,
      '#ankiSortOrder': state.anki.sortOrder,
      '#ankiNewReviewOrder': state.anki.newReviewOrder,
      '#ankiInterdayOrder': state.anki.interdayOrder,
      '#ankiReviewOrder': state.anki.reviewOrder,
      '#ankiDesiredRetention': state.anki.desiredRetention,
      '#ankiHistoricalRetention': state.anki.historicalRetention,
      '#ankiIgnoreBefore': state.anki.ignoreBefore,
      '#ankiMaximumInterval': state.anki.maximumInterval,
      '#ankiFsrsParameters': (state.anki.fsrsParameters || []).join(', '),
      '#ankiMaximumAnswerSeconds': state.anki.maximumAnswerSeconds,
      '#ankiQuestionSeconds': state.anki.questionSeconds,
      '#ankiQuestionAction': state.anki.questionAction,
      '#ankiAnswerSeconds': state.anki.answerSeconds,
      '#ankiAnswerAction': state.anki.answerAction,
      '#ankiStartingEase': state.anki.startingEase,
      '#ankiEasyBonus': state.anki.easyBonus,
      '#ankiIntervalModifier': state.anki.intervalModifier,
      '#ankiHardInterval': state.anki.hardInterval,
      '#ankiNewInterval': state.anki.newInterval
    };
    Object.entries(values).forEach(([selector, value]) => {
      const input = document.querySelector(selector);
      if (input) input.value = value ?? '';
    });
    const checks = {
      '#ankiNewIgnoreReviewLimit': state.anki.newCardsIgnoreReviewLimit,
      '#ankiLimitsStartTop': state.anki.limitsStartFromTop,
      '#ankiBuryNew': state.anki.buryNew,
      '#ankiBuryReviews': state.anki.buryReviews,
      '#ankiBuryInterday': state.anki.buryInterday,
      '#ankiFsrsEnabled': state.anki.fsrsEnabled,
      '#ankiRescheduleOnChange': state.anki.rescheduleOnChange,
      '#ankiDisableAutoplay': state.anki.disableAutoplay,
      '#ankiSkipQuestionAudio': state.anki.skipQuestionAudio,
      '#ankiShowTimer': state.anki.showTimer,
      '#ankiStopTimer': state.anki.stopTimerOnAnswer,
      '#ankiWaitForAudio': state.anki.waitForAudio
    };
    Object.entries(checks).forEach(([selector, checked]) => {
      const input = document.querySelector(selector);
      if (input) input.checked = Boolean(checked);
    });
    document.querySelectorAll('[data-easy-day]').forEach(select => {
      select.value = String(state.anki.easyDays[Number(select.dataset.easyDay)] ?? 1);
    });
    updateAnkiConditionalFields();
    updateAnkiExportSurface();
    refreshAnkiLearningPreview();
  }

  function syncAnkiStateFromForm() {
    const text = selector => document.querySelector(selector).value.trim();
    const checked = selector => document.querySelector(selector).checked;
    state.anki = {
      ...state.anki,
      deck: text('#ankiDeckNameFull') || 'Syllabloom',
      setName: text('#ankiSetNameFull'),
      presetName: text('#ankiPresetName') || 'Syllabloom',
      tags: text('#ankiTagsFull'),
      format: document.querySelector('#ankiFormatFull').value,
      answerStyle: document.querySelector('#ankiAnswerStyleFull').value,
      dailyLimit: Math.max(0, numberValue('#ankiNewPerDay', 20)),
      newPerDay: Math.max(0, numberValue('#ankiNewPerDay', 20)),
      reviewsPerDay: Math.max(0, numberValue('#ankiReviewsPerDay', 9999)),
      newCardsIgnoreReviewLimit: checked('#ankiNewIgnoreReviewLimit'),
      limitsStartFromTop: checked('#ankiLimitsStartTop'),
      learningSteps: parseSteps(text('#ankiLearningSteps')),
      relearningSteps: parseSteps(text('#ankiRelearningSteps')),
      graduatingInterval: Math.max(1, numberValue('#ankiGraduatingInterval', 1)),
      easyInterval: Math.max(1, numberValue('#ankiEasyInterval', 4)),
      minimumInterval: Math.max(1, numberValue('#ankiMinimumInterval', 1)),
      leechThreshold: Math.max(1, numberValue('#ankiLeechThreshold', 8)),
      leechAction: document.querySelector('#ankiLeechAction').value,
      releaseStrategy: document.querySelector('#ankiReleaseStrategy').value,
      insertionOrder: document.querySelector('#ankiInsertionOrder').value,
      gatherOrder: document.querySelector('#ankiGatherOrder').value,
      sortOrder: document.querySelector('#ankiSortOrder').value,
      newReviewOrder: document.querySelector('#ankiNewReviewOrder').value,
      interdayOrder: document.querySelector('#ankiInterdayOrder').value,
      reviewOrder: document.querySelector('#ankiReviewOrder').value,
      buryNew: checked('#ankiBuryNew'),
      buryReviews: checked('#ankiBuryReviews'),
      buryInterday: checked('#ankiBuryInterday'),
      easyDays: [...document.querySelectorAll('[data-easy-day]')].map(select => Number(select.value)),
      fsrsEnabled: checked('#ankiFsrsEnabled'),
      desiredRetention: Math.min(0.99, Math.max(0.7, numberValue('#ankiDesiredRetention', 0.9))),
      historicalRetention: Math.min(0.99, Math.max(0.7, numberValue('#ankiHistoricalRetention', 0.9))),
      ignoreBefore: text('#ankiIgnoreBefore'),
      maximumInterval: Math.min(36500, Math.max(1, numberValue('#ankiMaximumInterval', 36500))),
      fsrsParameters: text('#ankiFsrsParameters').split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite),
      rescheduleOnChange: checked('#ankiRescheduleOnChange'),
      disableAutoplay: checked('#ankiDisableAutoplay'),
      skipQuestionAudio: checked('#ankiSkipQuestionAudio'),
      showTimer: checked('#ankiShowTimer'),
      stopTimerOnAnswer: checked('#ankiStopTimer'),
      maximumAnswerSeconds: Math.max(0, numberValue('#ankiMaximumAnswerSeconds', 60)),
      questionSeconds: Math.max(0, numberValue('#ankiQuestionSeconds', 0)),
      questionAction: document.querySelector('#ankiQuestionAction').value,
      answerSeconds: Math.max(0, numberValue('#ankiAnswerSeconds', 0)),
      answerAction: document.querySelector('#ankiAnswerAction').value,
      waitForAudio: checked('#ankiWaitForAudio'),
      startingEase: Math.max(1.3, numberValue('#ankiStartingEase', 2.5)),
      easyBonus: Math.max(1, numberValue('#ankiEasyBonus', 1.3)),
      intervalModifier: Math.max(0.1, numberValue('#ankiIntervalModifier', 1)),
      hardInterval: Math.max(1, numberValue('#ankiHardInterval', 1.2)),
      newInterval: Math.min(1, Math.max(0, numberValue('#ankiNewInterval', 0)))
    };
    localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
    updateAnkiExportSurface();
    renderClassPlanner();
  }

  function syncOnboardingAnkiToState() {
    const deck = document.querySelector('#ankiDeckName').value.trim();
    state.anki.deck = deck || state.anki.deck;
    state.anki.format = document.querySelector('input[name="ankiFormat"]:checked').value;
    state.anki.answerStyle = document.querySelector('input[name="answerStyle"]:checked').value;
    state.anki.newPerDay = Number(document.querySelector('#ankiDailyLimit').value) || 20;
    state.anki.dailyLimit = state.anki.newPerDay;
    state.anki.tags = document.querySelector('#ankiTags').value.trim();
  }

  function syncStateToOnboardingAnki() {
    document.querySelector('#ankiDeckName').value = state.anki.deck;
    document.querySelector('#ankiDailyLimit').value = state.anki.newPerDay;
    document.querySelector('#ankiTags').value = state.anki.tags;
    const format = document.querySelector(`input[name="ankiFormat"][value="${state.anki.format}"]`);
    const answerStyle = document.querySelector(`input[name="answerStyle"][value="${state.anki.answerStyle}"]`);
    if (format) format.checked = true;
    if (answerStyle) answerStyle.checked = true;
  }

  function updateAnkiConditionalFields() {
    const fsrsEnabled = document.querySelector('#ankiFsrsEnabled')?.checked;
    document.querySelectorAll('.sm2-only, .sm2-only-group').forEach(element => {
      element.classList.toggle('anki-setting-muted', fsrsEnabled);
    });
    refreshAnkiLearningPreview();
  }

  function releaseStrategyLabel(value) {
    return ({
      'weakest-deadline': 'weak topics near the next deadline',
      weakest: 'weakest topics first',
      syllabus: 'syllabus order',
      'recent-source': 'the most recent source first'
    })[value] || 'weak topics near the next deadline';
  }

  function refreshAnkiLearningPreview() {
    const fsrsInput = document.querySelector('#ankiFsrsEnabled');
    const retentionInput = document.querySelector('#ankiDesiredRetention');
    const orderInput = document.querySelector('#ankiNewReviewOrder');
    const strategyInput = document.querySelector('#ankiReleaseStrategy');
    const enabled = fsrsInput ? fsrsInput.checked : state.anki.fsrsEnabled;
    const retention = retentionInput ? Number(retentionInput.value || state.anki.desiredRetention) : state.anki.desiredRetention;
    const order = orderInput ? orderInput.value : state.anki.newReviewOrder;
    const strategy = strategyInput ? strategyInput.value : state.anki.releaseStrategy;
    const orderLabels = {
      after: 'Due reviews first, then new cards',
      before: 'New cards first, then due reviews',
      mix: 'Due reviews and new cards mixed'
    };
    const status = document.querySelector('#ankiLearningStatus');
    const scheduler = document.querySelector('#ankiSchedulerReadout');
    const history = document.querySelector('#ankiHistoryReadout');
    if (status) status.textContent = enabled ? `FSRS · ${Math.round(retention * 100)}% target` : 'SM-2 preset';
    if (scheduler) scheduler.textContent = `${orderLabels[order] || orderLabels.after}. New cards follow ${releaseStrategyLabel(strategy)}.`;
    if (history) history.textContent = enabled
      ? `Demo history: ${state.reviewCount} answers. Keep default FSRS parameters until there are several hundred real reviews.`
      : 'FSRS is off. Anki will use the legacy scheduler settings below.';
  }

  function updateAnkiExportSurface() {
    const approved = collectApprovedCards().length;
    const fullDeck = fullAnkiDeckName();
    const summary = `${fullDeck}, ${state.anki.presetName}, ${state.anki.newPerDay} new cards per day`;
    const approvedLabel = `${approved} ready card${approved === 1 ? '' : 's'}`;
    const count = document.querySelector('#approvedSetCount');
    const exportSummary = document.querySelector('#ankiExportSummary');
    const settingsCount = document.querySelector('#ankiSettingsCardCount');
    const settingsDestination = document.querySelector('#ankiSettingsDestination');
    if (count) count.textContent = approvedLabel;
    if (exportSummary) exportSummary.textContent = summary;
    if (settingsCount) settingsCount.textContent = approvedLabel;
    if (settingsDestination) settingsDestination.textContent = `${fullDeck} · ${state.anki.presetName}`;
  }

  function openAnkiSettings(fromOnboarding = false) {
    if (fromOnboarding) syncOnboardingAnkiToState();
    const dialog = document.querySelector('#ankiSettingsDialog');
    dialog.dataset.context = fromOnboarding ? 'onboarding' : 'app';
    syncAnkiFormFromState();
    dialog.showModal();
  }

  function updateWorkflowCompanion(view) {
    document.querySelector('#mainApp').dataset.currentView = view;
  }

  function calendarEventsSorted() {
    return [...state.calendarEvents].sort((left, right) => left.date.localeCompare(right.date));
  }

  function nextExamEvent() {
    const today = localIsoDate(new Date());
    return calendarEventsSorted().find(event => event.type === 'exam' && event.date >= today)
      || calendarEventsSorted().find(event => event.date >= today);
  }

  function renderClassPlanner() {
    const monthDate = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth(), 1, 12);
    const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthDate);
    document.querySelector('#calendarMonthLabel').textContent = monthLabel;
    const firstWeekday = (monthDate.getDay() + 6) % 7;
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const today = localIsoDate(new Date());
    const cells = [];
    for (let index = 0; index < firstWeekday; index += 1) cells.push('<span class="calendar-day calendar-day-empty"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = localIsoDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 12));
      const events = state.calendarEvents.filter(event => event.date === date);
      cells.push(`<button type="button" class="calendar-day${date === today ? ' is-today' : ''}${events.length ? ' has-event' : ''}" data-calendar-date="${date}" aria-label="${date}${events.length ? `, ${events.map(event => event.title).join(', ')}` : ''}"><span>${day}</span>${events.slice(0, 2).map(event => `<i class="event-${escapeHtml(event.type)}">${escapeHtml(event.title)}</i>`).join('')}</button>`);
    }
    document.querySelector('#calendarGrid').innerHTML = cells.join('');

    const upcoming = calendarEventsSorted().filter(event => event.date >= today).slice(0, 5);
    document.querySelector('#upcomingEvents').innerHTML = upcoming.length
      ? upcoming.map(event => {
        const date = new Date(`${event.date}T12:00:00`);
        const label = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
        return `<div class="upcoming-event"><span class="event-dot event-${escapeHtml(event.type)}"></span><div><strong>${escapeHtml(event.title)}</strong><small>${label} · ${labelCase(event.type)}</small></div><button type="button" data-remove-event="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">Remove</button></div>`;
      }).join('')
      : '<p>No upcoming class dates. Add the next lecture or exam.</p>';

    const exam = nextExamEvent();
    const examDate = exam ? new Date(`${exam.date}T12:00:00`) : new Date(Date.now() + 12 * 86400000);
    const daysLeft = Math.max(1, Math.ceil((examDate - new Date()) / 86400000));
    const cardSupply = state.includeSampleMaterial ? 42 : state.lectureCards.length;
    const availableNew = cardSupply
      ? Math.max(1, Math.min(state.anki.newPerDay, Math.floor(state.dailyStudyMinutes / 2), Math.ceil(cardSupply / daysLeft)))
      : 0;
    const topicOrders = {
      'weakest-deadline': ['Upper-limb attachments', 'Forearm innervation', 'Muscles of mastication', 'Facial expression actions', 'Lower-limb actions', 'Mixed recall', 'Catch-up and card edits'],
      weakest: ['Upper-limb attachments', 'Forearm innervation', 'Muscles of mastication', 'Facial expression actions', 'Lower-limb actions', 'Weak-topic recheck', 'Catch-up and card edits'],
      syllabus: ['Muscles of facial expression', 'Muscles of mastication', 'Upper limb', 'Forearm and hand', 'Trunk', 'Lower limb', 'Mixed syllabus check'],
      'recent-source': ['Latest lecture highlights', 'Latest lecture weak points', 'New slide terminology', 'Source-linked recall', 'Earlier source gaps', 'Mixed recall', 'Catch-up and card edits']
    };
    const customTopics = sourceConceptNames();
    const topics = state.includeSampleMaterial
      ? (topicOrders[state.anki.releaseStrategy] || topicOrders['weakest-deadline'])
      : customTopics.length
        ? customTopics
        : ['Add class material', 'Build the first ready set', 'Take a quick check', 'Set the next deadline'];
    const rows = [];
    let releasedCards = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      const iso = localIsoDate(date);
      const event = state.calendarEvents.find(item => item.date === iso);
      const dayLabel = offset === 0 ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
      const remainingCards = Math.max(0, cardSupply - releasedCards);
      const newCards = event?.type === 'exam' || !cardSupply
        ? 0
        : Math.max(0, Math.min(remainingCards, state.anki.newPerDay, availableNew + (event?.type === 'lecture' ? 2 : 0)));
      releasedCards += newCards;
      const focus = event?.type === 'exam' ? event.title : event ? `${event.title}: ${topics[offset % topics.length]}` : topics[offset % topics.length];
      rows.push(`<div class="release-plan-row"><strong>${escapeHtml(dayLabel)}</strong><span>${escapeHtml(focus)}</span><b>${newCards}</b><em>Due in Anki</em></div>`);
    }
    document.querySelector('#releasePlanRows').innerHTML = rows.join('');
    const nextLabel = exam ? `${exam.title} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'No exam date yet';
    document.querySelector('#releasePlanSummary').textContent = `${nextLabel}. Up to ${availableNew} new card${availableNew === 1 ? '' : 's'} a day, ordered by ${releaseStrategyLabel(state.anki.releaseStrategy)}. Due reviews remain in Anki.`;
    renderKnowledgeModel();
    renderProfileSchedule();
  }

  function renderKnowledgeModel() {
    const list = document.querySelector('#knowledgeRows');
    if (!list) return;
    const concepts = sourceConceptNames().slice(0, 8);
    if (!state.includeSampleMaterial) {
      document.querySelector('#baselineScore').textContent = state.baselineScore ? `${state.baselineScore}%` : 'New';
      document.querySelector('#knowledgeObjectiveCount').textContent = String(concepts.length);
      document.querySelector('#knowledgeSessionLength').textContent = `${state.dailyStudyMinutes} min`;
      list.innerHTML = concepts.length
        ? concepts.map(concept => `<div class="knowledge-row"><strong>${escapeHtml(concept)}</strong><div class="mastery-track"><span style="width:0%"></span></div><span class="knowledge-score">New</span><span>Not assessed</span></div>`).join('')
        : '<div class="knowledge-empty"><strong>No learning map yet</strong><span>Add slides, notes, or a syllabus and the concepts will appear here.</span></div>';
      return;
    }
    document.querySelector('#baselineScore').textContent = `${state.baselineScore}%`;
    document.querySelector('#knowledgeObjectiveCount').textContent = '3';
    document.querySelector('#knowledgeSessionLength').textContent = '28 min';
    list.innerHTML = `
      <div class="knowledge-row"><strong>Upper-limb attachments</strong><div class="mastery-track"><span style="width:42%"></span></div><span class="knowledge-score">42%</span><span>Priority</span></div>
      <div class="knowledge-row"><strong>Forearm innervation</strong><div class="mastery-track"><span style="width:55%"></span></div><span class="knowledge-score">55%</span><span>Review</span></div>
      <div class="knowledge-row"><strong>Muscles of mastication</strong><div class="mastery-track"><span style="width:68%"></span></div><span class="knowledge-score">68%</span><span>Developing</span></div>
      <div class="knowledge-row"><strong>Facial expression actions</strong><div class="mastery-track"><span style="width:84%"></span></div><span class="knowledge-score">84%</span><span>Stable</span></div>
      <div class="knowledge-row"><strong>Lower-limb actions</strong><div class="mastery-track"><span style="width:91%"></span></div><span class="knowledge-score">91%</span><span>Solid</span></div>`;
  }

  function renderProfileSchedule() {
    const target = document.querySelector('#profileUpcomingEvents');
    if (!target) return;
    const today = localIsoDate(new Date());
    const upcoming = calendarEventsSorted().filter(event => event.date >= today).slice(0, 6);
    target.innerHTML = upcoming.length
      ? upcoming.map(event => {
        const date = new Date(`${event.date}T12:00:00`);
        const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
        const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
        return `<article class="profile-event"><time datetime="${escapeHtml(event.date)}"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(weekday)}</span></time><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(labelCase(event.type))}</span></div><button type="button" data-profile-remove-event="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">Remove</button></article>`;
      }).join('')
      : '<div class="profile-schedule-empty"><strong>No dates yet</strong><span>Add the first exam, quiz, or lecture below.</span></div>';
  }

  function renderProfile() {
    const studentPlan = state.account.plan === 'student';
    const tierName = studentPlan ? 'Student' : 'Free';
    const used = Math.max(0, Number(state.account.classesUsed) || 0);
    const signedInName = state.account.displayName || state.account.email?.split('@')[0] || 'Your Syllabloom account';
    const emailText = state.account.signedIn
      ? state.account.email || 'Signed-in account'
      : 'Sign in to manage your account. Class files and study settings stay in this browser during beta.';
    const avatar = document.querySelector('#profileAvatar');
    avatar.src = state.account.imageUrl || 'assets/syllabloom-mark.svg';
    avatar.alt = state.account.imageUrl ? `${signedInName} profile photo` : 'Syllabloom account mark';
    document.querySelector('#profileIdentityHeading').textContent = signedInName;
    document.querySelector('#profileEmail').textContent = emailText;
    document.querySelector('#profileTierBadge').textContent = tierName;
    document.querySelector('#profileTierName').textContent = tierName;
    document.querySelector('#profileTierDescription').textContent = studentPlan
      ? 'Unlimited classes, course-source imports, and the complete class-to-Anki workflow.'
      : '1 active class, course-source imports, lecture storage, and Anki export.';
    document.querySelector('#profileClassUsage').textContent = studentPlan ? `${Math.max(used, state.classMode === 'custom' ? 1 : 0)} active` : `${used} of 1`;
    document.querySelector('#manageClerkProfile').textContent = state.account.signedIn ? 'Account & security' : 'Sign in';

    const exam = nextExamEvent();
    const examLabel = exam
      ? `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${exam.date}T12:00:00`))} · ${exam.title}`
      : 'No exam date yet';
    const sourceTotal = state.includeSampleMaterial ? 3 : state.sources.length;
    document.querySelector('#profileClassList').innerHTML = `<article class="profile-class-item"><span class="profile-class-mark" aria-hidden="true"><img src="assets/syllabloom-mark.svg" width="50" height="50" alt="" /></span><div><strong>${escapeHtml(state.className)}</strong><span>${escapeHtml(state.classTerm)} · ${state.classMode === 'sample' ? 'Sample class' : 'Active class'}</span></div><dl><div><dt>Sources</dt><dd>${sourceTotal}</dd></div><div><dt>Next date</dt><dd>${escapeHtml(examLabel)}</dd></div></dl><button class="button" type="button" data-open-current-class>Open class</button></article>`;
    renderProfileSchedule();
  }

  function syncBillingSummary() {
    const studentPlan = state.account.plan === 'student';
    const tierName = studentPlan ? 'Student' : 'Free';
    document.querySelector('#billingTierBadge').textContent = tierName;
    document.querySelector('#billingCurrentDescription').textContent = studentPlan
      ? 'Unlimited classes and course-source imports are active on this account.'
      : 'You have 1 active class and can export ready cards to Anki.';
    document.querySelector('#billingCurrentPrice').textContent = studentPlan ? '$9' : '$0';
    document.querySelector('#billingCurrentCadence').textContent = studentPlan ? 'per month, billed yearly' : 'forever';
    document.querySelector('#billingManageAccount').textContent = state.account.signedIn ? 'Payment & statements' : 'Sign in to manage';
  }

  async function renderBillingPage() {
    syncBillingSummary();
    const status = document.querySelector('#billingConnectionStatus');
    const mount = document.querySelector('#clerkPricingTable');
    const fallback = document.querySelector('#billingPlanFallback');
    const upgradeButton = document.querySelector('#billingSetupPending');
    const finePrint = document.querySelector('#billingFinePrint');
    mount.hidden = true;
    fallback.hidden = false;
    upgradeButton.disabled = false;
    delete upgradeButton.dataset.checkoutReady;
    if (!state.account.signedIn) {
      status.textContent = 'Free beta access';
      upgradeButton.textContent = 'Sign in to choose Student';
      finePrint.textContent = 'The public beta is free. Sign in to manage your account; class files and study settings stay in this browser.';
      return;
    }
    if (state.account.plan === 'student') {
      status.textContent = 'Student plan active';
      upgradeButton.textContent = 'Student is active';
      upgradeButton.disabled = true;
      finePrint.textContent = 'Manage payment methods and statements from Account & security.';
      return;
    }
    status.textContent = 'Checking billing status';
    mount.hidden = false;
    const result = await window.SyllabloomAuth?.mountBilling?.(mount);
    if (state.view !== 'billing') return;
    if (result?.ready) {
      status.textContent = 'Secure checkout by Clerk + Stripe';
      upgradeButton.textContent = 'Choose Student';
      upgradeButton.dataset.checkoutReady = 'true';
      finePrint.textContent = 'Payments are processed by Stripe through Clerk Billing. Syllabloom never stores card numbers.';
      return;
    }
    mount.hidden = true;
    upgradeButton.disabled = true;
    if (result?.reason === 'billing-preview') {
      upgradeButton.textContent = 'Student billing opens after beta';
      status.textContent = 'Free public beta';
      finePrint.textContent = 'This build uses Clerk test mode. No live payment can be submitted.';
      return;
    }
    upgradeButton.textContent = 'Billing setup pending';
    status.textContent = result?.reason === 'no-plans' ? 'Plans are not configured yet' : 'Billing is not connected yet';
    finePrint.textContent = 'Checkout stays closed until Clerk Billing has a live plan and production keys.';
  }

  async function detectRuntimeCapabilities() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) return;
      const capabilities = await response.json();
      if (capabilities.mode !== 'beta-cloud') return;

      state.cloudBeta = true;
      document.documentElement.dataset.runtime = 'cloud-beta';
      document.querySelector('#cloudBetaNotice').hidden = false;
      document.querySelector('#useTestAudio').disabled = true;
      document.querySelector('#useTestAudio').textContent = 'Sample needs desktop transcription';
      document.querySelector('#captureState').textContent = 'Ready to record or upload';
      document.querySelector('#recordingSafety').textContent = 'Saved under your account on this device';
      const captureStatus = document.querySelector('.capture-status');
      captureStatus.querySelector('strong').textContent = 'Device library';
      captureStatus.querySelector('span:last-child').textContent = 'Per-user media storage';
    } catch (_) {
      // The local prototype intentionally continues with the desktop feature set.
    }
  }

  function applyPlanFeedback(feedback) {
    const plans = {
      'too-long': {
        headline: 'Upper-limb attachments',
        copy: 'Session shortened. Recall will be compared with the previous 28-minute plan.',
        duration: '20 minutes',
        steps: [
          ['Check', 'Answer cold. No hints and no cards yet.', '4 questions · 4 min'],
          ['Work the gaps', 'Edit only the cards that failed the check.', '10 cards · 12 min'],
          ['Recheck', 'Repeat the misses in a different order.', '4 questions · 4 min']
        ]
      },
      'wrong-focus': {
        headline: 'Choose today’s focus',
        copy: 'The next plan will ask for a priority whenever the syllabus and review evidence do not agree.',
        duration: 'Not set',
        steps: [
          ['Choose focus', 'Pick the objective that matters today.', 'Select one objective'],
          ['Check evidence', 'Compare your choice with the exam scope.', 'Review exam scope'],
          ['Build session', 'Set the length and card mix before starting.', 'Set length and cards']
        ]
      },
      'already-know': {
        headline: 'Mixed recall',
        copy: 'Introductory cards removed. The session now starts with harder questions from the next exam objectives.',
        duration: '24 minutes',
        steps: [
          ['Mixed recall', 'Start beyond the introductory prompts.', '12 questions · 8 min'],
          ['Hard cards', 'Keep only cards that still cause hesitation.', '10 cards · 10 min'],
          ['Recheck', 'Repeat misses without the original cue.', '6 questions · 6 min']
        ]
      },
      'need-context': {
        headline: 'Concept review',
        copy: 'A short explanation now comes before recall practice.',
        duration: '28 minutes',
        steps: [
          ['Concept review', 'Read one explanation before recall begins.', 'One explanation · 5 min'],
          ['Work the gaps', 'Edit only the cards that failed the check.', '12 cards · 15 min'],
          ['Recheck', 'Repeat the misses in a different order.', '6 questions · 8 min']
        ]
      }
    };
    const plan = plans[feedback];
    document.querySelector('#planHeadline').textContent = plan.headline;
    document.querySelector('#planCopy').textContent = plan.copy;
    document.querySelector('#planDurationValue').textContent = plan.duration;
    [
      ['#stepOneTitle', '#stepOneCopy', '#stepOneMeta', plan.steps[0]],
      ['#stepTwoTitle', '#stepTwoCopy', '#stepTwoMeta', plan.steps[1]],
      ['#stepThreeTitle', '#stepThreeCopy', '#stepThreeMeta', plan.steps[2]]
    ].forEach(([titleSelector, copySelector, metaSelector, step]) => {
      document.querySelector(titleSelector).textContent = step[0];
      document.querySelector(copySelector).textContent = step[1];
      document.querySelector(metaSelector).textContent = step[2];
    });
    document.querySelector('#planFeedback').classList.remove('open');
    state.planCorrections += 1;
    showToast('Plan updated');
  }

  function showSetupStep(step) {
    const stepNames = ['Class details', 'Syllabus', 'Materials', 'Quick check', 'Anki setup', 'Review'];
    const setupCompanions = {
      1: ['assets/rounds-mascot-listening.webp', 'The Syllabloom companion listening as you name your class'],
      2: ['assets/syllabloom-mascot-materials.webp', 'The Syllabloom companion checking a syllabus and class documents'],
      3: ['assets/syllabloom-mascot-materials.webp', 'The Syllabloom companion organizing class materials'],
      4: ['assets/syllabloom-mascot-detective.webp', 'The Syllabloom companion looking closely for gaps in your knowledge'],
      5: ['assets/rounds-mascot-anki.webp', 'The Syllabloom companion packing ready cards for Anki'],
      6: ['assets/rounds-mascot-celebrate.webp', 'The Syllabloom companion celebrating a finished class setup']
    };
    state.setupStep = Math.max(1, Math.min(6, step));
    document.querySelectorAll('[data-setup-panel]').forEach(panel => {
      panel.classList.toggle('active', Number(panel.dataset.setupPanel) === state.setupStep);
    });
    document.querySelectorAll('[data-setup-label]').forEach(label => {
      const labelStep = Number(label.dataset.setupLabel);
      label.classList.toggle('active', labelStep === state.setupStep);
      label.classList.toggle('complete', labelStep < state.setupStep);
      label.querySelector('span:first-child').textContent = labelStep < state.setupStep ? '✓' : labelStep;
    });
    document.querySelector('#setupStepName').textContent = stepNames[state.setupStep - 1];
    const onboardingCompanion = document.querySelector('#onboardingCompanion');
    const [companionSource, companionAlt] = setupCompanions[state.setupStep];
    onboardingCompanion.setAttribute('src', companionSource);
    onboardingCompanion.setAttribute('alt', companionAlt);

    if (state.setupStep === 4) updateAssessmentIntro();

    if (state.setupStep === 6) {
      syncOnboardingAnkiToState();
      const className = document.querySelector('#classNameInput').value.trim() || 'Untitled class';
      const term = document.querySelector('#termInput').value.trim() || 'Term not set';
      document.querySelector('#summaryClass').textContent = className;
      document.querySelector('#summaryTerm').textContent = term;
      document.querySelector('#summarySyllabus').textContent = state.syllabusName;
      document.querySelector('#summarySyllabusMeta').textContent = activeSyllabus()
        ? 'Calendar and objectives are ready to map'
        : 'Calendar and objectives can be added later';
      document.querySelector('#summaryBaseline').textContent = `${state.baselineScore}% starting point`;
      document.querySelector('#summaryBaselineMeta').textContent = state.baselineScore === 100
        ? 'Start with new material and let later misses refine the plan'
        : state.baselineScore === 0
          ? 'Foundation review shapes the first session'
          : 'Missed topics shape the first session';
      document.querySelector('#summaryAnki').textContent = `${state.anki.format} · ${state.anki.newPerDay} new per day`;
    }
    document.querySelector('#onboarding').scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (shellRoute()?.surface === 'onboarding') syncShellHistory('onboarding', state.view, 'replace');
  }

  function openOnboarding(step = 1, historyMode = 'push') {
    document.querySelector('#landing').classList.add('hidden');
    document.querySelector('#onboarding').classList.remove('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('marketing-mode');
    showSetupStep(step);
    syncShellHistory('onboarding', state.view, historyMode);
  }

  function saveAccount() {
    localStorage.setItem('syllabloom-account', JSON.stringify(state.account));
  }

  function setClassLabels(className, term) {
    state.className = className;
    state.classTerm = term;
    document.querySelector('#currentClassName').textContent = className;
    document.querySelector('#currentClassNameMobile').textContent = className;
    document.querySelector('#currentClassTerm').textContent = term;
    document.querySelectorAll('[data-class-name]').forEach(element => { element.textContent = className; });
    document.querySelector('#classSwitcher').setAttribute('aria-label', `Open ${className} class materials`);
    const recordingTitle = document.querySelector('#recordingTitle');
    if (recordingTitle && (!mediaRecorder || mediaRecorder.state === 'inactive')) recordingTitle.value = defaultRecordingTitle();
  }

  function classTag(value) {
    return String(value || 'class').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
  }

  function renderHomeForActiveClass() {
    const custom = !state.includeSampleMaterial;
    const concepts = sourceConceptNames();
    const latestSource = [...state.sources].reverse().find(item => item.draftCards?.length || item.notes?.length);
    const cardCount = state.lectureCards.length;
    const approved = state.lectureCards.filter(card => card.reviewStatus === 'approved').length;
    const firstConcept = concepts[0] || 'your new material';
    const sourceTotal = state.includeSampleMaterial ? 3 : state.sources.length;
    const next = nextExamEvent();
    const examSummary = document.querySelector('#homeExamSummary');
    document.querySelector('#home .study-workspace').classList.toggle('is-custom', custom);
    document.querySelector('#homeSourceButton').textContent = `${sourceTotal} source${sourceTotal === 1 ? '' : 's'}`;
    examSummary.innerHTML = next
      ? `<b>${Math.max(0, Math.ceil((new Date(`${next.date}T12:00:00`) - new Date()) / 86400000))} days</b> to ${escapeHtml(next.title.toLowerCase())}`
      : '<b>No deadline</b> set yet';
    const daysToNext = next ? Math.max(0, Math.ceil((new Date(`${next.date}T12:00:00`) - new Date()) / 86400000)) : null;
    document.querySelector('#captureExamContext').textContent = next ? `${daysToNext} day${daysToNext === 1 ? '' : 's'}` : 'No date set';
    document.querySelector('#captureSourceContext').textContent = state.includeSampleMaterial
      ? 'Muscle list'
      : latestSource?.name || 'No source yet';
    document.querySelectorAll('.sample-home-detail').forEach(element => { element.hidden = custom; });
    document.querySelector('#adjustPlan').hidden = custom;
    if (custom) document.querySelector('#planFeedback').hidden = true;
    const heroImage = document.querySelector('#todayHeroImage');
    document.querySelector('#todayHeroArt').setAttribute('aria-label', custom
      ? 'A college student organizing class cards with the Syllabloom study companion'
      : 'A medical student sorting anatomy flashcards with the Syllabloom study companion');
    heroImage.src = custom ? 'assets/rounds-study-scene-general.webp' : 'assets/rounds-study-scene.png';
    heroImage.alt = custom
      ? 'A college student and the Syllabloom study companion organizing class cards'
      : 'A medical student and a small green study companion sorting anatomy flashcards';
    document.querySelector('#todayHeroCopy').textContent = custom
      ? latestSource
        ? `${cardCount} ready card${cardCount === 1 ? '' : 's'} from ${latestSource.name}. Start with a quick check, then study here or export to Anki.`
        : 'Add your first slides, notes, syllabus, or authorized assessment to build a ready study set.'
      : 'One focused pass through upper-limb attachments, built around the questions you still miss.';
    if (!custom) {
      document.querySelector('#planHeadline').textContent = 'Upper-limb attachments';
      document.querySelector('#planCopy').textContent = 'Start with a cold check, repair only the misses, then test them again before adding cards.';
      const sampleSteps = [
        ['Check', 'Answer cold. No hints and no cards yet.', '6 questions · 5 min'],
        ['Work the gaps', 'Edit only the cards that failed the check.', '12 cards · 15 min'],
        ['Recheck', 'Repeat the misses in a different order.', '6 questions · 8 min']
      ];
      sampleSteps.forEach((step, index) => {
        const number = ['One', 'Two', 'Three'][index];
        document.querySelector(`#step${number}Title`).textContent = step[0];
        document.querySelector(`#step${number}Copy`).textContent = step[1];
        document.querySelector(`#step${number}Meta`).textContent = step[2];
      });
      document.querySelector('#planPassRule').textContent = 'Pass when 5 of 6 are correct twice';
      document.querySelector('#planDurationValue').textContent = '28 minutes';
      return;
    }
    document.querySelector('#planHeadline').textContent = concepts.length ? firstConcept : 'Add your first class source';
    document.querySelector('#planCopy').textContent = cardCount
      ? 'Start with a quick recall check made from your source, then use the ready set here or send it to Anki.'
      : 'Your next session will take shape as soon as Syllabloom can read the first source.';
    const steps = [
      ['Quick check', 'Answer a few source-linked questions before reviewing.', `${Math.min(3, cardCount)} question${Math.min(3, cardCount) === 1 ? '' : 's'}`],
      ['Study the set', 'Use the cards as-is or change anything you want.', `${approved} ready card${approved === 1 ? '' : 's'}`],
      ['Send to Anki', 'Export with your saved deck, tags, limits, and card format.', state.anki.format]
    ];
    steps.forEach((step, index) => {
      const number = ['One', 'Two', 'Three'][index];
      document.querySelector(`#step${number}Title`).textContent = step[0];
      document.querySelector(`#step${number}Copy`).textContent = step[1];
      document.querySelector(`#step${number}Meta`).textContent = step[2];
    });
    document.querySelector('#planPassRule').textContent = cardCount ? 'Use the set now or edit anything you want' : 'Waiting for class material';
    document.querySelector('#planDurationValue').textContent = cardCount ? `${Math.max(10, Math.min(30, Math.ceil(cardCount / 2)))} minutes` : 'Not scheduled';
  }

  function persistClassProfile() {
    localStorage.setItem('syllabloom-class-profile', JSON.stringify({
      mode: state.classMode,
      className: state.className,
      term: state.classTerm,
      syllabusName: state.syllabusName,
      useDemoSyllabus: state.useDemoSyllabus,
      includeSampleMaterial: state.includeSampleMaterial
    }));
  }

  function prepareNewClassSetup() {
    state.classMode = 'custom';
    state.includeSampleMaterial = false;
    state.useDemoSyllabus = false;
    state.syllabusName = 'No syllabus added';
    state.sources = [];
    state.lectureCards = [];
    state.statuses = {};
    state.edits = {};
    state.studyIndex = 0;
    state.baselineScore = 0;
    state.calendarEvents = [];
    state.anki.deck = '';
    state.anki.tags = '';
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
    persistClassSources();
    document.querySelector('#classNameInput').value = '';
    document.querySelector('#termInput').value = '';
    document.querySelector('#ankiDeckName').value = '';
    document.querySelector('#ankiTags').value = '';
    renderStoredSources();
  }

  function loadSampleClass() {
    state.classMode = 'sample';
    state.includeSampleMaterial = true;
    state.useDemoSyllabus = true;
    state.syllabusName = demoSyllabusSource.name;
    state.sources = [];
    state.lectureCards = [];
    state.studyIndex = 0;
    state.anki.deck = 'Human Anatomy';
    state.anki.tags = 'human-anatomy::fall-2023';
    setClassLabels('Human Anatomy', 'Fall 2023');
    renderSource();
    updateGenerationCount();
    closeOnboarding(shellRoute()?.surface === 'onboarding' ? 'replace' : 'push');
  }

  function showClassLimit() {
    const dialog = document.querySelector('#classLimitDialog');
    const used = Math.max(1, Number(state.account.classesUsed) || 0);
    const limit = Math.max(1, Number(state.account.classLimit) || 1);
    document.querySelector('#classLimitReadout').textContent = `${used} of ${limit} free class used`;
    dialog.showModal();
  }

  function startClassSetup() {
    if (!state.account.signedIn) {
      state.pendingClassSetup = true;
      window.dispatchEvent(new CustomEvent('syllabloom:auth-request', { detail: { intent: 'create-class' } }));
      return;
    }
    const limit = state.account.plan === 'student' ? Number.MAX_SAFE_INTEGER : Math.max(1, Number(state.account.classLimit) || 1);
    if ((Number(state.account.classesUsed) || 0) >= limit) {
      showClassLimit();
      return;
    }
    prepareNewClassSetup();
    state.creatingClass = true;
    openOnboarding(1);
  }

  function showPricing() {
    document.querySelector('#classLimitDialog').close();
    openAccountPage('billing');
  }

  function openAccountPage(view = 'profile') {
    const alreadyInApp = shellRoute()?.surface === 'app';
    state.creatingClass = false;
    document.querySelector('#landing').classList.add('hidden');
    document.querySelector('#onboarding').classList.add('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = false;
    app.setAttribute('aria-hidden', 'false');
    document.body.classList.remove('marketing-mode');
    navigate(view, alreadyInApp ? 'push' : null);
    if (!alreadyInApp) syncShellHistory('app', view, 'push');
  }

  function closeOnboarding(historyMode = 'replace') {
    localStorage.setItem('rounds-onboarded', '1');
    state.creatingClass = false;
    document.querySelector('#landing').classList.add('hidden');
    document.querySelector('#onboarding').classList.add('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = false;
    app.setAttribute('aria-hidden', 'false');
    document.body.classList.remove('marketing-mode');
    navigate('home', null);
    syncShellHistory('app', 'home', historyMode);
  }

  function showLanding(historyMode = 'push') {
    state.creatingClass = false;
    document.querySelector('#landing').classList.remove('hidden');
    document.querySelector('#onboarding').classList.add('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    document.body.classList.add('marketing-mode');
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('syllabloom:landing-shown'));
    syncShellHistory('landing', state.view, historyMode);
    window.SyllabloomAuth?.refresh?.();
  }

  function restoreShellRoute(route) {
    restoringShellHistory = true;
    try {
      if (route?.surface === 'app') {
        document.querySelector('#landing').classList.add('hidden');
        document.querySelector('#onboarding').classList.add('hidden');
        const app = document.querySelector('#mainApp');
        app.inert = false;
        app.setAttribute('aria-hidden', 'false');
        document.body.classList.remove('marketing-mode');
        navigate(appViews.has(route.view) ? route.view : 'home');
      } else if (route?.surface === 'onboarding') {
        openOnboarding(Number(route.step) || 1, null);
      } else {
        showLanding(null);
      }
    } finally {
      restoringShellHistory = false;
    }
    window.SyllabloomAuth?.refresh?.();
  }

  function initializeShellRouting() {
    const current = shellRoute();
    const hashView = window.location.hash.replace(/^#/, '');
    if (appViews.has(hashView)) {
      syncShellHistory('app', hashView, 'replace');
      restoreShellRoute({ surface: 'app', view: hashView });
      return;
    }
    if (current?.surface) {
      restoreShellRoute(current);
      return;
    }
    showLanding('replace');
  }

  function navigate(view, historyMode = 'push') {
    const previousView = state.view;
    state.view = view;
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === view));
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const inClassContext = view === 'source' || view === 'knowledge';
    const inAccountContext = view === 'profile' || view === 'billing';
    document.querySelector('#classSwitcher').classList.toggle('active-context', inClassContext);
    document.querySelector('.mobile-class-button').classList.toggle('active-context', inClassContext);
    document.querySelector('.account-nav-action').classList.toggle('active-context', inAccountContext);
    document.querySelector('.mobile-account-button').classList.toggle('active-context', inAccountContext);
    document.querySelector('#classSwitcher').toggleAttribute('aria-current', inClassContext);
    document.querySelector('.mobile-class-button').toggleAttribute('aria-current', inClassContext);
    document.querySelector('#mobileNav').value = view;
    if (view === 'cards') {
      renderEditor();
      window.requestAnimationFrame(() => document.querySelectorAll('#lectureDraftQueue textarea').forEach(autoSizeTextArea));
    }
    if (view === 'study') renderStudy();
    if (view === 'knowledge') renderClassPlanner();
    if (view === 'profile') renderProfile();
    if (view === 'billing') renderBillingPage();
    updateWorkflowCompanion(view);
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('syllabloom:view-changed', { detail: { view } }));
    if (historyMode && shellRoute()?.surface === 'app') {
      syncShellHistory('app', view, previousView === view ? 'replace' : historyMode);
    }
  }

  function renderSource() {
    updateReviewSurface();
    document.querySelector('#homeMuscleCount').textContent = state.includeSampleMaterial ? source.muscleCount : state.sources.length;
    document.querySelector('#homeCardCount').textContent = state.includeSampleMaterial ? source.focusedCardCount : state.lectureCards.length;
    document.querySelector('#homeSectionCount').textContent = state.includeSampleMaterial
      ? Object.keys(source.sections).length
      : state.sources.reduce((total, item) => total + (item.notes?.length || 0), 0);

    document.querySelector('#schema').innerHTML = source.schema.map(label => `<div>${label}</div>`).join('');
    document.querySelector('#sectionList').innerHTML = Object.entries(source.sections)
      .map(([section, count]) => `<div class="section-row"><strong>${section}</strong><span>${count} muscles</span></div>`)
      .join('');
    renderStoredSources();
    renderHomeForActiveClass();
    renderClassPlanner();
  }

  function updateGenerationCount() {
    const selected = [...document.querySelectorAll('.card-type:checked')].map(input => input.value);
    state.selectedTypes = selected;
    document.querySelector('#generationCount').textContent = state.includeSampleMaterial
      ? source.muscleCount * selected.length
      : state.lectureCards.length;
  }

  function filteredRecords() {
    const query = document.querySelector('#muscleSearch').value.trim().toLowerCase();
    return records.filter(record => {
      const haystack = `${record.muscle} ${record.section} ${record.group}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderMuscleList() {
    const filtered = filteredRecords();
    const list = document.querySelector('#muscleList');
    list.innerHTML = filtered.map(record => {
      const storedStatus = state.statuses[keyFor(record)] || 'Draft';
      const status = storedStatus === 'Approved' ? 'Ready' : storedStatus;
      return `<button class="muscle-button ${record.id === state.selectedId ? 'active' : ''}" data-id="${record.id}">
        <strong>${record.muscle}</strong><span>${fieldLabels[state.field]} · ${status}</span>
      </button>`;
    }).join('');

    list.querySelectorAll('.muscle-button').forEach(button => button.addEventListener('click', () => {
      state.selectedId = Number(button.dataset.id);
      renderEditor();
    }));
  }

  function currentRecord() {
    return records.find(record => record.id === state.selectedId) || records[0];
  }

  function renderEditor() {
    renderMuscleList();
    const record = currentRecord();
    const key = keyFor(record);
    const edit = state.edits[key] || {};
    const location = record.group ? `${labelCase(record.section)} · ${labelCase(record.group)}` : labelCase(record.section);

    document.querySelector('#editorMuscle').textContent = record.muscle;
    document.querySelector('#editorLocation').textContent = location;
    const storedStatus = state.statuses[key] || 'Draft';
    document.querySelector('#editorStatus').textContent = storedStatus === 'Approved' ? 'Ready' : storedStatus;
    document.querySelector('#frontText').value = edit.front || questionFor(record, state.field);
    document.querySelector('#backText').value = edit.back || answerFor(record, state.field);
    autoSizeTextArea(document.querySelector('#frontText'));
    autoSizeTextArea(document.querySelector('#backText'));
    document.querySelector('#sourceAttachment').textContent = record.attachment;
    document.querySelector('#sourceAction').textContent = record.action;
    document.querySelector('#sourceInnervation').textContent = record.innervation;
    document.querySelectorAll('.field-tab').forEach(button => button.classList.toggle('active', button.dataset.field === state.field));
    updateStatusCounts();
  }

  function saveCurrent(silent = false) {
    const record = currentRecord();
    state.edits[keyFor(record)] = {
      front: document.querySelector('#frontText').value.trim(),
      back: document.querySelector('#backText').value.trim()
    };
    if (!silent) showToast('Changes saved');
  }

  function advanceRecord() {
    const index = records.findIndex(record => record.id === state.selectedId);
    state.selectedId = records[(index + 1) % records.length].id;
    renderEditor();
  }

  function updateStatusCounts() {
    const values = Object.values(state.statuses);
    const readyFromSample = state.includeSampleMaterial ? values.filter(value => value === 'Approved').length : 0;
    const skippedFromSample = state.includeSampleMaterial ? values.filter(value => value === 'Skipped').length : 0;
    document.querySelector('#approvedCount').textContent = readyFromSample + state.lectureCards.filter(card => card.reviewStatus === 'approved').length;
    document.querySelector('#skippedCount').textContent = skippedFromSample + state.lectureCards.filter(card => card.reviewStatus === 'skipped').length;
  }

  function studyCards() {
    const approved = [];
    if (state.includeSampleMaterial) {
      Object.entries(state.statuses).forEach(([key, status]) => {
        if (status !== 'Approved') return;
        const [id, field] = key.split('-');
        const record = records.find(item => item.id === Number(id));
        if (record) approved.push({ record, field });
      });
    }
    state.lectureCards
      .filter(card => card.reviewStatus === 'approved')
      .forEach(card => approved.push({ directCard: card }));
    if (approved.length) return approved.slice(0, state.anki.dailyLimit);
    if (!state.includeSampleMaterial) return [];
    const weakMaterial = records.filter(record => {
      const section = record.section.toUpperCase();
      return section.includes('ARM') || section.includes('FOREARM') || section.includes('WRIST, HAND');
    }).slice(0, Math.min(18, state.anki.dailyLimit));
    return weakMaterial.map((record, index) => ({
      record,
      field: index % 3 === 2 ? 'innervation' : 'attachment'
    }));
  }

  function studyCardKey(item) {
    return item.directCard ? `lecture-${item.directCard.id}` : keyFor(item.record, item.field);
  }

  function recordStudyRating(item, rating) {
    const entry = {
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cardId: studyCardKey(item),
      rating,
      className: state.className,
      classTerm: state.classTerm,
      reviewedAt: new Date().toISOString()
    };
    state.reviewHistory.push(entry);
    state.reviewHistory = state.reviewHistory.slice(-2000);
    try {
      localStorage.setItem('syllabloom-review-history', JSON.stringify(state.reviewHistory));
      return true;
    } catch (_) {
      return false;
    }
  }

  function resetRatingControls() {
    document.querySelectorAll('.rating').forEach(button => {
      button.disabled = false;
      button.classList.remove('is-recorded');
      button.setAttribute('aria-pressed', 'false');
    });
  }

  function hideRatingReceipt() {
    const receipt = document.querySelector('#studyRatingReceipt');
    receipt.hidden = true;
    receipt.removeAttribute('data-rating');
  }

  function showRatingReceipt(rating, persisted) {
    const receipt = document.querySelector('#studyRatingReceipt');
    const descriptions = {
      Again: 'Saved as a miss. Use the explanation below before trying again.',
      Hard: 'Saved as difficult. This hesitation is now part of your study history.',
      Good: 'Saved as a solid recall. Your study history has been updated.',
      Easy: 'Saved as an easy recall. Your study history has been updated.'
    };
    receipt.dataset.rating = rating;
    document.querySelector('#studyRatingReceiptTitle').textContent = persisted
      ? `${rating} recorded`
      : `${rating} selected`;
    document.querySelector('#studyRatingReceiptDetail').textContent = persisted
      ? descriptions[rating]
      : 'This answer is active for this session, but browser storage was unavailable.';
    receipt.hidden = false;
  }

  function shortCue(value, maximum = 170) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maximum) return clean;
    return `${clean.slice(0, maximum - 3).trim()}...`;
  }

  function studyCardExplanation(item) {
    const directCard = item.directCard;
    if (directCard) {
      const section = labelCase(directCard.section || 'lecture');
      const sourceLabel = directCard.source
        || (directCard.slideNumber ? `Lecture slides · Slide ${directCard.slideNumber}` : `Lecture transcript · ${section}`);
      return {
        label: fieldLabels[directCard.field] || 'source',
        answer: directCard.back,
        why: `This answer comes from ${sourceLabel}. Read the source wording once, cover it, then restate the idea in your own words before retrying.`,
        cue: shortCue(directCard.back),
        source: sourceLabel
      };
    }

    const { record, field } = item;
    const answer = (state.edits[keyFor(record, field)] || {}).back || answerFor(record, field);
    const sourceLabel = `List of muscles Fall 2023.docx · ${labelCase(record.section)} · ${fieldLabels[field] || 'Source card'}`;
    const explanation = {
      label: (fieldLabels[field] || 'source').toLowerCase(),
      answer,
      source: sourceLabel,
      why: `The course source pairs ${record.muscle} with this answer. Keep the tested fact attached to the muscle name, then say the pair aloud before retrying.`,
      cue: `${record.muscle}: ${shortCue(answer, 130)}`
    };

    if (field === 'attachment') {
      explanation.why = `This card tests the complete attachment path for ${record.muscle}. Keep the starting and ending structures together as one route instead of memorizing two disconnected place names.`;
      explanation.cue = `${record.muscle}: trace the whole route from start to finish.`;
    } else if (field === 'action') {
      explanation.why = `The course source pairs ${record.muscle} with this movement. Recall the muscle and movement as one link, then compare it with nearby muscles before retrying.`;
      explanation.cue = `${record.muscle} does ${shortCue(answer, 120)}.`;
    } else if (field === 'innervation') {
      explanation.why = `The course source assigns this nerve to ${record.muscle}. Tie the nerve to the muscle and its section so similar nerve names do not blur together.`;
      explanation.cue = `${record.muscle} is supplied by ${shortCue(answer, 120)}.`;
    } else if (field === 'identify') {
      explanation.why = `The attachment, action, and innervation clues all point back to ${record.muscle}. Use the clues together before naming the muscle.`;
      explanation.cue = `${record.muscle}: attachment, action, nerve.`;
    }

    return explanation;
  }

  function hideMissExplanation() {
    const panel = document.querySelector('#missExplanation');
    panel.hidden = true;
    document.querySelector('#study .study-controls').classList.remove('is-explaining');
    state.missedItem = null;
  }

  function showMissExplanation(item) {
    const details = studyCardExplanation(item);
    const key = studyCardKey(item);
    state.missCounts[key] = (state.missCounts[key] || 0) + 1;
    localStorage.setItem('syllabloom-miss-counts', JSON.stringify(state.missCounts));
    state.missedItem = item;

    document.querySelector('#missExplanationIntro').textContent = `You marked this ${details.label} card as missed. Here is the distinction to keep.`;
    document.querySelector('#missCorrectAnswer').textContent = details.answer;
    document.querySelector('#missWhyText').textContent = details.why;
    document.querySelector('#missMemoryHook').textContent = details.cue;
    document.querySelector('#missSourceText').textContent = details.source;
    document.querySelector('#missRepeatNote').hidden = state.missCounts[key] < 2;

    const panel = document.querySelector('#missExplanation');
    panel.hidden = false;
    document.querySelector('#study .study-controls').classList.add('is-explaining');
    window.dispatchEvent(new CustomEvent('syllabloom:miss-explained', { detail: { count: state.missCounts[key] } }));
    window.requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      document.querySelector('#retryMissedCard').focus({ preventScroll: true });
    });
  }

  function renderAssessmentQuestion() {
    const questions = activeAssessmentQuestions();
    const item = questions[state.assessmentIndex];
    if (!item) return;
    document.querySelector('#assessmentProgress').textContent = `Question ${state.assessmentIndex + 1} of ${questions.length}`;
    document.querySelector('#assessmentQuestion').textContent = item.question;
    document.querySelector('#assessmentResult').innerHTML = '';
    const options = document.querySelector('#assessmentOptions');
    options.innerHTML = item.options.map((option, index) => (
      `<button class="button answer-option" data-answer="${index}">${escapeHtml(option)}</button>`
    )).join('');
    options.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => {
      const answer = Number(button.dataset.answer);
      const correct = answer === item.correct;
      if (correct) state.assessmentScore += 1;
      options.querySelector(`[data-answer="${item.correct}"]`)?.classList.add('correct-answer');
      if (!correct) button.classList.add('selected-wrong');
      options.querySelectorAll('button').forEach(option => { option.disabled = true; });
      const finalQuestion = state.assessmentIndex === questions.length - 1;
      document.querySelector('#assessmentResult').innerHTML = `
        <p><strong>${correct ? 'Correct.' : 'Not quite.'}</strong> ${escapeHtml(item.explanation)}</p>
        <button id="assessmentNext" class="button primary">${finalQuestion ? 'Finish assessment' : 'Next question'}</button>`;
      document.querySelector('#assessmentNext').addEventListener('click', () => {
        if (!finalQuestion) {
          state.assessmentIndex += 1;
          renderAssessmentQuestion();
          return;
        }
        state.baselineScore = Math.round((state.assessmentScore / questions.length) * 100);
        document.querySelector('#baselineScore').textContent = `${state.baselineScore}%`;
        const baselinePlan = state.assessmentScore === questions.length
          ? 'Your first session will begin with new material and use later misses to adjust the plan.'
          : state.assessmentScore === 0
            ? 'Your first session will rebuild these foundations before adding more cards.'
            : 'Your first session will circle back to the missed topics before adding more cards.';
        document.querySelector('#assessmentBox').innerHTML = `
          <h2>Baseline complete</h2>
          <p>You answered ${state.assessmentScore} of ${questions.length} question${questions.length === 1 ? '' : 's'} correctly. ${baselinePlan}</p>`;
        document.querySelector('#baselineContinue').disabled = false;
      });
    }));
  }

  function csvCell(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function directiveValue(value) {
    return String(value).replace(/[\r\n]+/g, ' ').trim();
  }

  function collectApprovedCards() {
    const approved = [];
    if (state.includeSampleMaterial) {
      Object.entries(state.statuses).forEach(([key, status]) => {
        if (status !== 'Approved') return;
        const separator = key.lastIndexOf('-');
        const id = Number(key.slice(0, separator));
        const field = key.slice(separator + 1);
        const record = records.find(item => item.id === id);
        if (!record) return;
        const edit = state.edits[key] || {};
        const front = edit.front || questionFor(record, field);
        const back = edit.back || answerFor(record, field);
        const isCloze = state.anki.format === 'Cloze';
        approved.push({
          front: isCloze ? `${front}\n{{c1::${back}}}` : front,
          back: isCloze ? `Source: ${record.section}` : back,
          tags: `${state.anki.tags} ${record.section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          source: `${source.document} · ${record.section}`
        });
      });
    }

    state.lectureCards.forEach(card => {
      if (card.reviewStatus !== 'approved') return;
      approved.push({
        front: card.front,
        back: card.back,
        tags: `${state.anki.tags} ${card.slideNumber ? 'slides-draft' : 'lecture-draft'} ${String(card.section || 'lecture').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        source: card.source || (card.status === 'provisional' ? 'Lecture transcript · student checked' : 'Lecture + class source')
      });
    });
    return approved;
  }

  async function exportApprovedCards() {
    const approved = collectApprovedCards();

    if (!approved.length) {
      showToast('No ready cards to export yet');
      return;
    }
    const exportButton = document.querySelector('#exportAnki');
    exportButton.disabled = true;
    exportButton.textContent = 'Building package…';
    try {
      const response = await fetch('/api/export-anki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: approved, preferences: state.anki })
      });
      if (!response.ok) {
        const problem = await response.json();
        throw new Error(problem.error || 'Anki export failed');
      }
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'syllabloom.apkg';
      const blob = await response.blob();
      if (!blob.size || blob.type === 'application/json') throw new Error('Anki returned an empty package');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`${approved.length} ready card${approved.length === 1 ? '' : 's'} exported to Anki`);
    } catch (error) {
      showToast(error.message);
    } finally {
      exportButton.textContent = 'Export to Anki';
      updateReviewSurface();
    }
  }

  function renderStudy({ preserveRatingReceipt = false } = {}) {
    const cards = studyCards();
    const hasCards = cards.length > 0;
    document.querySelector('#studyEmpty').hidden = hasCards;
    document.querySelector('#studyMeta').hidden = !hasCards;
    document.querySelector('#studyProgressTrack').hidden = !hasCards;
    document.querySelector('#studyCardStage').hidden = !hasCards;
    document.querySelector('#studyControls').hidden = !hasCards;
    hideMissExplanation();
    resetRatingControls();
    if (!preserveRatingReceipt) hideRatingReceipt();
    if (!hasCards) return;
    if (state.studyIndex >= cards.length) state.studyIndex = 0;
    const item = cards[state.studyIndex];
    const directCard = item.directCard;
    const key = directCard ? directCard.id : keyFor(item.record, item.field);
    const edit = directCard ? {} : (state.edits[key] || {});
    document.querySelector('#studyPosition').textContent = `Card ${state.studyIndex + 1} of ${cards.length}`;
    document.querySelector('#studySection').textContent = labelCase(directCard?.section || item.record.section);
    document.querySelector('#studyProgress').style.width = `${((state.studyIndex + 1) / cards.length) * 100}%`;
    document.querySelector('#studyQuestion').textContent = directCard?.front || edit.front || questionFor(item.record, item.field);
    document.querySelector('#studyMuscle').textContent = directCard
      ? (fieldLabels[directCard.field] || 'Source card')
      : fieldLabels[item.field];
    document.querySelector('#studyAnswer').textContent = directCard?.back || edit.back || answerFor(item.record, item.field);
    document.querySelector('#studyAnswer').classList.remove('open');
    document.querySelector('#showAnswer').hidden = false;
    document.querySelector('#ratingControls').classList.remove('open');
  }

  let mediaRecorder = null;
  let microphoneStream = null;
  let recordingStartedAt = 0;
  let recordingPausedAt = 0;
  let recordingPausedTotal = 0;
  let recordingTimer = null;
  let waveformFrame = null;
  let waveformAudioContext = null;
  let recordingWakeLock = null;
  let lectureMarkers = [];
  let captureAudioUrl = null;
  let libraryMediaUrl = null;
  let libraryMediaId = null;
  let editingMediaId = null;
  let pendingRemoveMediaId = null;
  let activeRecordingTitle = '';
  let lastTranscript = '';
  const MEDIA_DATABASE = 'syllabloom-media';
  const MEDIA_STORE = 'lectures';
  const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
  let mediaDatabasePromise = null;

  function currentMediaOwner() {
    return state.account.signedIn && state.account.userId
      ? `clerk:${state.account.userId}`
      : 'browser-guest';
  }

  function openMediaDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('This browser cannot save lecture files.'));
    if (mediaDatabasePromise) return mediaDatabasePromise;
    const pending = new Promise((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DATABASE, 1);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        const store = database.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        store.createIndex('owner', 'owner', { unique: false });
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('Lecture storage could not open.')), { once: true });
      request.addEventListener('blocked', () => reject(new Error('Close other Syllabloom tabs, then try saving again.')), { once: true });
    });
    mediaDatabasePromise = pending.catch(error => {
      mediaDatabasePromise = null;
      throw error;
    });
    return mediaDatabasePromise;
  }

  async function mediaStoreWrite(action) {
    const database = await openMediaDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(MEDIA_STORE, 'readwrite');
      action(transaction.objectStore(MEDIA_STORE));
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('The lecture could not be saved.')), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error || new Error('The lecture could not be saved.')), { once: true });
    });
  }

  async function listMediaAssets() {
    const database = await openMediaDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(MEDIA_STORE, 'readonly');
      const request = transaction.objectStore(MEDIA_STORE).index('owner').getAll(IDBKeyRange.only(currentMediaOwner()));
      request.addEventListener('success', () => resolve(request.result.sort((left, right) => right.createdAt - left.createdAt)), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('Saved lectures could not be read.')), { once: true });
    });
  }

  async function getMediaAsset(id) {
    const database = await openMediaDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).get(id);
      request.addEventListener('success', () => {
        const item = request.result;
        resolve(item?.owner === currentMediaOwner() ? item : null);
      }, { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('The lecture could not be opened.')), { once: true });
    });
  }

  async function deleteMediaAsset(id) {
    const item = await getMediaAsset(id);
    if (!item) return;
    await mediaStoreWrite(store => store.delete(id));
  }

  function formatFileSize(bytes) {
    const size = Math.max(0, Number(bytes) || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
    return `${(size / 1024 ** 3).toFixed(1)} GB`;
  }

  function mediaLooksLikeVideo(item) {
    const type = String(item.type || '');
    return type.startsWith('video/') || (!type.startsWith('audio/') && /\.(mp4|mov|m4v)$/i.test(item.name || ''));
  }

  async function saveMediaAsset(blob, filename, origin, markers = [], title = '') {
    if (!blob?.size) throw new Error('This media file is empty.');
    if (blob.size > MAX_MEDIA_BYTES) throw new Error('Keep each lecture under 500 MB for the browser beta.');
    const asset = {
      id: crypto.randomUUID ? crypto.randomUUID() : `media-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      owner: currentMediaOwner(),
      name: filename || `lecture-${Date.now()}.webm`,
      title: cleanLectureTitle(title || lectureName(filename)),
      type: blob.type || 'application/octet-stream',
      size: blob.size,
      createdAt: Date.now(),
      origin,
      className: state.className,
      classTerm: state.classTerm,
      markers,
      blob
    };
    await mediaStoreWrite(store => store.put(asset));
    await renderMediaLibrary();
    return asset;
  }

  function closeMediaPreview() {
    if (libraryMediaUrl) URL.revokeObjectURL(libraryMediaUrl);
    libraryMediaUrl = null;
    libraryMediaId = null;
    const audio = document.querySelector('#libraryAudio');
    const video = document.querySelector('#libraryVideo');
    audio.pause();
    video.pause();
    audio.removeAttribute('src');
    video.removeAttribute('src');
    audio.hidden = true;
    video.hidden = true;
    document.querySelector('#mediaLibraryPlayer').hidden = true;
  }

  async function openMediaPreview(id) {
    const item = await getMediaAsset(id);
    if (!item) throw new Error('This lecture is no longer available for this account.');
    closeMediaPreview();
    libraryMediaId = id;
    libraryMediaUrl = URL.createObjectURL(item.blob);
    const video = mediaLooksLikeVideo(item);
    const player = document.querySelector(video ? '#libraryVideo' : '#libraryAudio');
    player.src = libraryMediaUrl;
    player.hidden = false;
    document.querySelector('#mediaPlayerTitle').textContent = mediaDisplayTitle(item);
    document.querySelector('#mediaLibraryPlayer').hidden = false;
  }

  async function renderMediaLibrary() {
    const list = document.querySelector('#mediaLibraryList');
    const label = document.querySelector('#mediaOwnerLabel');
    const summary = document.querySelector('#mediaStorageSummary');
    if (!list || !label || !summary) return;
    label.textContent = state.account.signedIn
      ? (state.account.email || 'Signed-in account')
      : 'This browser';
    try {
      const items = await listMediaAssets();
      const totalBytes = items.reduce((total, item) => total + Number(item.size || 0), 0);
      summary.textContent = items.length
        ? `${items.length} file${items.length === 1 ? '' : 's'} · ${formatFileSize(totalBytes)} on this device`
        : state.account.signedIn ? 'No saved lectures for this account' : 'Sign in to keep files separated';
      list.classList.toggle('is-empty', items.length === 0);
      list.innerHTML = items.length ? items.map(item => {
        const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt));
        const mediaLabel = mediaLooksLikeVideo(item) ? 'Video' : 'Audio';
        const isEditing = editingMediaId === item.id;
        const title = mediaDisplayTitle(item);
        return `<article class="media-library-item${isEditing ? ' is-renaming' : ''}">
          <span class="media-kind" aria-hidden="true">${mediaLooksLikeVideo(item) ? '▶' : '♫'}</span>
          ${isEditing ? `<form class="media-rename-form" data-rename-form="${escapeHtml(item.id)}"><label for="rename-${escapeHtml(item.id)}">Lecture name</label><input id="rename-${escapeHtml(item.id)}" name="title" maxlength="100" value="${escapeHtml(title)}" required /><span><button type="submit">Save name</button><button type="button" data-cancel-rename>Cancel</button></span></form>` : `<div><strong>${escapeHtml(title)}</strong><span>${mediaLabel} · ${formatFileSize(item.size)} · ${escapeHtml(item.className || 'Class')}</span><small>${item.origin === 'recording' ? 'Recorded' : 'Uploaded'} ${escapeHtml(date)}</small></div>`}
          <div class="media-library-actions"${isEditing ? ' hidden' : ''}><button type="button" data-open-media="${escapeHtml(item.id)}">Play</button><button type="button" data-rename-media="${escapeHtml(item.id)}">Rename</button><button type="button" data-delete-media="${escapeHtml(item.id)}">Remove</button></div>
        </article>`;
      }).join('') : '<div class="media-library-empty"><strong>No saved lectures yet</strong><span>Start recording or upload an audio or video file.</span></div>';
      if (editingMediaId) window.requestAnimationFrame(() => list.querySelector('[data-rename-form] input')?.select());
    } catch (error) {
      summary.textContent = 'Storage is unavailable';
      list.classList.add('is-empty');
      list.innerHTML = `<div class="media-library-empty"><strong>This browser blocked lecture storage</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clock(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function lectureName(filename) {
    const words = String(filename || 'Lecture')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ');
    const title = words.map((word, index) => {
      if (word.toLowerCase() === 'cc') return 'CC';
      if (index && ['and', 'of', 'by'].includes(word.toLowerCase())) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    return title.replace(/\s+CC by \d+(?:\.\d+)?$/i, '');
  }

  function cleanLectureTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function mediaDisplayTitle(item) {
    return cleanLectureTitle(item?.title) || lectureName(item?.name);
  }

  async function openRemoveLectureDialog(id) {
    const item = await getMediaAsset(id);
    if (!item) throw new Error('This lecture is no longer available for this account.');
    pendingRemoveMediaId = id;
    document.querySelector('#removeLectureName').textContent = mediaDisplayTitle(item);
    const dialog = document.querySelector('#removeLectureDialog');
    if (!dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => document.querySelector('#cancelRemoveLecture')?.focus());
  }

  function closeRemoveLectureDialog() {
    const dialog = document.querySelector('#removeLectureDialog');
    pendingRemoveMediaId = null;
    if (dialog.open) dialog.close();
  }

  function defaultRecordingTitle() {
    const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date());
    return `${state.className || 'Class'} lecture, ${date}`;
  }

  function recordingFilename(title, type = '') {
    const extension = String(type).includes('mp4') ? 'm4a' : 'webm';
    const slug = cleanLectureTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lecture';
    return `${slug}-${Date.now()}.${extension}`;
  }

  async function updateMediaAssetTitle(id, title) {
    const item = await getMediaAsset(id);
    if (!item) throw new Error('This lecture is no longer available for this account.');
    item.title = cleanLectureTitle(title);
    item.updatedAt = Date.now();
    await mediaStoreWrite(store => store.put(item));
    if (libraryMediaId === id) document.querySelector('#mediaPlayerTitle').textContent = item.title;
    return item;
  }

  function drawWaveform(points = []) {
    const canvas = document.querySelector('#waveformCanvas');
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#c8c8c1';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    if (!points.length) return;
    const gap = width / points.length;
    context.strokeStyle = '#34784d';
    context.lineWidth = Math.max(1, Math.min(3, gap * .55));
    points.forEach((point, index) => {
      const amplitude = Math.max(2, Number(point) * height * .42);
      const x = gap * index + gap / 2;
      context.beginPath();
      context.moveTo(x, height / 2 - amplitude);
      context.lineTo(x, height / 2 + amplitude);
      context.stroke();
    });
  }

  function drawLiveWaveform(stream) {
    waveformAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = waveformAudioContext.createAnalyser();
    analyser.fftSize = 256;
    waveformAudioContext.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const canvas = document.querySelector('#waveformCanvas');
    const context = canvas.getContext('2d');
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#34784d';
      context.lineWidth = 2;
      context.beginPath();
      data.forEach((value, index) => {
        const x = index / (data.length - 1) * canvas.width;
        const y = value / 255 * canvas.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      waveformFrame = window.requestAnimationFrame(draw);
    };
    draw();
  }

  function setAudioBusy(busy, label) {
    const recorder = document.querySelector('#recorderPanel');
    recorder.classList.toggle('processing', busy);
    document.querySelector('#recordButton').disabled = busy;
    document.querySelector('#useTestAudio').disabled = busy;
    document.querySelector('#audioInput').disabled = busy;
    document.querySelector('.import-button').classList.toggle('disabled', busy);
    if (label) document.querySelector('#captureState').textContent = label;
  }

  function renderWarnings(warnings = []) {
    const warningBox = document.querySelector('#transcriptWarnings');
    warningBox.hidden = warnings.length === 0;
    warningBox.innerHTML = warnings.map(warning => `
      <div class="transcript-warning"><time>${clock(warning.time)}</time><span>${escapeHtml(warning.message)}</span></div>
    `).join('');
  }

  function lectureCardKey(card) {
    return `${card.front || ''}::${card.section || ''}`;
  }

  function autoSizeTextArea(field) {
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.max(field.scrollHeight, 84)}px`;
  }

  function savedLectureReview() {
    if (!state.latestSessionId) return [];
    try {
      return JSON.parse(localStorage.getItem(`rounds-review-${state.latestSessionId}`) || '[]');
    } catch (_) {
      return [];
    }
  }

  function saveLectureReview() {
    if (!state.latestSessionId) return;
    const review = state.lectureCards.map(card => ({
      key: card.sourceKey || lectureCardKey(card),
      front: card.front,
      back: card.back,
      reviewStatus: card.reviewStatus
    }));
    localStorage.setItem(`rounds-review-${state.latestSessionId}`, JSON.stringify(review));
  }

  function syncLectureCards(cards = []) {
    const prior = new Map(state.lectureCards.map(card => [card.sourceKey || lectureCardKey(card), card]));
    savedLectureReview().forEach(card => prior.set(card.key, card));
    state.lectureCards = cards.map((card, index) => {
      const existing = prior.get(lectureCardKey(card));
      return {
        ...card,
        id: existing?.id || `lecture-${index}-${Math.abs(Array.from(card.front || '').reduce((total, character) => total + character.charCodeAt(0), 0))}`,
        sourceKey: lectureCardKey(card),
        front: existing?.front || card.front,
        back: existing?.back || card.back,
        reviewStatus: existing?.reviewStatus === 'skipped'
          ? 'skipped'
          : existing?.reviewStatus === 'approved' || card.status !== 'provisional'
            ? 'approved'
            : 'waiting'
      };
    });
    document.querySelector('#audioCardCountInline').textContent = state.lectureCards.length;
    document.querySelector('#lectureResultBar').hidden = state.lectureCards.length === 0;
    renderLectureDraftQueue();
    updateAssessmentIntro();
  }

  function updateReviewSurface() {
    const total = state.lectureCards.length;
    const waiting = state.lectureCards.filter(card => card.reviewStatus === 'waiting').length;
    const approved = collectApprovedCards().length;
    document.querySelector('#reviewEmpty').hidden = total > 0 || approved > 0;
    const exportButton = document.querySelector('#exportAnki');
    const studyButton = document.querySelector('#studyAccepted');
    const lectureExportButton = document.querySelector('#lectureExportAnki');
    exportButton.disabled = approved === 0;
    studyButton.disabled = approved === 0;
    if (lectureExportButton) lectureExportButton.disabled = approved === 0;
    exportButton.hidden = total === 0 && approved === 0;
    studyButton.hidden = total === 0 && approved === 0;
    document.querySelector('#homeReviewSummary').textContent = total
      ? `${approved} ready${waiting ? ` · ${waiting} need a source check` : ''}`
      : approved
        ? `${approved} ready from your course source`
        : 'No lecture cards yet';
    document.querySelector('#reviewPageDescription').textContent = total
      ? `${approved} card${approved === 1 ? '' : 's'} are ready to study or export${waiting ? `. ${waiting} lecture-only card${waiting === 1 ? '' : 's'} need a quick check` : '. Look through the set only if you want to'}.`
      : approved
        ? `${approved} source-matched card${approved === 1 ? ' is' : 's are'} ready to study here or export to Anki.`
        : 'Record or import a lecture. Anki-ready cards will appear here.';
    updateStatusCounts();
    updateAnkiExportSurface();
  }

  function renderLectureDraftQueue() {
    const section = document.querySelector('#lectureDraftSection');
    const queue = document.querySelector('#lectureDraftQueue');
    updateReviewSurface();
    if (!state.lectureCards.length) {
      section.hidden = true;
      queue.innerHTML = '';
      return;
    }
    section.hidden = false;
    const waiting = state.lectureCards.filter(card => card.reviewStatus === 'waiting').length;
    const approved = state.lectureCards.filter(card => card.reviewStatus === 'approved').length;
    document.querySelector('#lectureDraftCount').textContent = `${approved} ready${waiting ? ` · ${waiting} need a check` : ''}`;
    const statusOrder = { waiting: 0, approved: 1, skipped: 2 };
    const orderedCards = [...state.lectureCards].sort((left, right) => statusOrder[left.reviewStatus] - statusOrder[right.reviewStatus]);
    queue.innerHTML = orderedCards.map((card, index) => `
      <article class="lecture-draft-card ${escapeHtml(card.reviewStatus)}" data-lecture-card="${escapeHtml(card.id)}">
        <div class="lecture-draft-index"><b>${String(index + 1).padStart(2, '0')}</b><span class="lecture-draft-evidence">${card.status === 'provisional' ? 'Review only' : 'Course source'}${card.slideNumber ? ` · Slide ${card.slideNumber}` : ''}</span></div>
        <div class="lecture-draft-body">
          <label>Front<textarea data-lecture-field="front">${escapeHtml(card.front)}</textarea></label>
          <label>Back<textarea data-lecture-field="back">${escapeHtml(card.back)}</textarea></label>
        </div>
        <div class="lecture-draft-actions">
          <button class="button primary" data-lecture-action="approve">${card.reviewStatus === 'approved' ? 'Ready' : 'Add to ready set'}</button>
          <button class="button" data-lecture-action="skip">${card.reviewStatus === 'skipped' ? 'Left out' : 'Leave out'}</button>
        </div>
      </article>
    `).join('');
    window.requestAnimationFrame(() => queue.querySelectorAll('textarea').forEach(autoSizeTextArea));
  }

  function updateSourceGate(concepts = []) {
    const gate = document.querySelector('#sourceGate');
    const verified = concepts.filter(concept => (typeof concept === 'string' ? 'verified' : concept.status) !== 'provisional').length;
    const provisional = concepts.length - verified;
    if (!concepts.length) {
      gate.className = 'source-gate waiting';
      gate.innerHTML = '<strong>No source match yet</strong><span>The transcript is saved, but no cards were created without enough course evidence.</span>';
      return;
    }
    if (verified && !provisional) {
      gate.className = 'source-gate matched';
      gate.innerHTML = `<strong>Ready set created</strong><span>${verified} concept${verified === 1 ? '' : 's'} traced to the class library. The cards are ready now and still editable before export.</span>`;
      return;
    }
    if (verified) {
      gate.className = 'source-gate review';
      gate.innerHTML = `<strong>Ready set with exceptions</strong><span>${verified} traced cards are ready. ${provisional} lecture-only card${provisional === 1 ? '' : 's'} need a quick check.</span>`;
      return;
    }
    gate.className = 'source-gate review';
    gate.innerHTML = `<strong>Needs a source check</strong><span>${provisional} lecture concept${provisional === 1 ? '' : 's'} found outside the active class source. Add the cards you trust to the ready set.</span>`;
  }

  function renderLectureInsights({ concepts = [], notes = [], cards = [] }) {
    const verifiedNotes = notes.filter(note => note.status !== 'provisional').length;
    const provisionalNotes = notes.length - verifiedNotes;
    const conceptBox = document.querySelector('#detectedConcepts');
    document.querySelector('#conceptCount').textContent = `${concepts.length} found`;
    conceptBox.className = concepts.length ? '' : 'empty-result';
    conceptBox.innerHTML = concepts.length
      ? concepts.slice(-8).map(concept => {
        const item = typeof concept === 'string' ? { name: concept, status: 'verified' } : concept;
        return `<div class="concept-row"><strong>${escapeHtml(item.name)}</strong><span>${item.status === 'provisional' ? 'lecture · review' : 'in course source'}</span></div>`;
      }).join('')
      : 'No course terms matched this lecture.';

    const noteBox = document.querySelector('#liveNotes');
    document.querySelector('#noteCount').textContent = provisionalNotes
      ? `${verifiedNotes} verified · ${provisionalNotes} review`
      : `${verifiedNotes} verified`;
    noteBox.className = notes.length ? 'live-note-list' : 'empty-result';
    noteBox.innerHTML = notes.length
      ? notes.slice(-4).map(note => `<article class="live-note${note.status === 'provisional' ? ' provisional' : ''}"><span>${note.heardAt == null ? 'COURSE SOURCE' : `${clock(note.heardAt)} · ${note.status === 'provisional' ? 'LECTURE · NEEDS SOURCE CHECK' : 'COURSE SOURCE'}`}</span><strong>${escapeHtml(note.title)}</strong>${note.lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</article>`).join('')
      : 'Notes appear when the lecture matches your course material.';

    document.querySelector('#captureUnit').textContent = cards.length
      ? labelCase(cards[0].section)
      : 'No course match';
    const cardBox = document.querySelector('#audioCardDrafts');
    const readyCards = cards.filter(card => card.status !== 'provisional').length;
    const checkCards = cards.length - readyCards;
    document.querySelector('#audioCardCount').textContent = `${readyCards} ready${checkCards ? ` · ${checkCards} check` : ''}`;
    document.querySelector('#audioCardCountInline').textContent = cards.length;
    document.querySelector('#lectureResultBar').hidden = cards.length === 0;
    cardBox.className = cards.length ? 'audio-card-list' : 'empty-result';
    cardBox.innerHTML = cards.length
      ? cards.slice(-3).map(card => `<div class="audio-card-mini"><span>${card.status === 'provisional' ? 'lecture · review' : `${escapeHtml(card.field)} · course document`}</span><strong>${escapeHtml(card.front)}</strong><p>${escapeHtml(card.back)}</p></div>`).join('')
      : 'No cards were drafted because no course terms matched.';
    document.querySelector('#reviewAudioCards').disabled = cards.length === 0;
    syncLectureCards(cards);
    updateSourceGate(concepts);
  }

  function drawLectureProgress(processed, duration) {
    const canvas = document.querySelector('#waveformCanvas');
    const context = canvas.getContext('2d');
    const ratio = duration ? Math.min(1, processed / duration) : 0;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#191b1e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#3a3d42';
    context.fillRect(18, canvas.height / 2 - 2, canvas.width - 36, 4);
    context.fillStyle = '#34784d';
    context.fillRect(18, canvas.height / 2 - 2, (canvas.width - 36) * ratio, 4);
    context.beginPath();
    context.arc(18 + (canvas.width - 36) * ratio, canvas.height / 2, 7, 0, Math.PI * 2);
    context.fill();
  }

  function renderAudioResult(result) {
    lastTranscript = result.transcript;
    const warnings = result.qualityWarnings || [];
    document.querySelector('#captureState').textContent = 'Transcript ready';
    document.querySelector('#captureTimer').textContent = clock(result.durationSeconds);
    document.querySelector('#transcriptMeta').textContent = `${clock(result.durationSeconds)} audio · ${result.processingSeconds}s local processing · ${warnings.length} term${warnings.length === 1 ? '' : 's'} to review`;
    document.querySelector('#copyTranscript').disabled = false;
    drawWaveform(result.waveform || []);

    renderWarnings(warnings);

    const transcript = document.querySelector('#transcriptContent');
    transcript.classList.remove('empty');
    transcript.innerHTML = result.segments.map(segment => `
      <div class="transcript-segment${segment.needsReview ? ' needs-review' : ''}">
        <span class="transcript-time">${clock(segment.start)}</span>
        <p>${escapeHtml(segment.text)}</p>
      </div>`).join('');

    renderLectureInsights({
      concepts: result.detectedConcepts || [],
      notes: result.notes || [],
      cards: result.cards || []
    });
  }

  async function processAudio(blob, filename, markers = [], options = {}) {
    const displayTitle = cleanLectureTitle(options.title || lectureName(filename));
    setAudioBusy(true, 'Checking lecture file');
    document.querySelector('#transcriptPanel').classList.remove('transcript-collapsed');
    document.querySelector('#toggleTranscript').textContent = 'Hide transcript';
    document.querySelector('#lastLectureSummary').hidden = false;
    document.querySelector('#lectureTitle').textContent = displayTitle;
    document.querySelector('#lectureSubtitle').textContent = `${state.className} · checking source alignment`;
    document.querySelector('#transcriptMeta').textContent = `${filename} · checking for an audio track`;
    document.querySelector('#transcriptContent').className = 'transcript-content empty';
    document.querySelector('#transcriptContent').innerHTML = '<p>Preparing a local, progressive transcript…</p>';
    document.querySelector('#transcriptWarnings').hidden = true;
    renderLectureInsights({});
    drawLectureProgress(0, 1);
    if (captureAudioUrl) URL.revokeObjectURL(captureAudioUrl);
    captureAudioUrl = URL.createObjectURL(blob);
    const audioPlayer = document.querySelector('#captureAudio');
    const videoPlayer = document.querySelector('#captureVideo');
    const mediaType = String(blob.type || '');
    const video = mediaType.startsWith('video/') || (!mediaType.startsWith('audio/') && /\.(mp4|mov|m4v)$/i.test(filename || ''));
    audioPlayer.pause();
    videoPlayer.pause();
    audioPlayer.hidden = video;
    videoPlayer.hidden = !video;
    const player = video ? videoPlayer : audioPlayer;
    player.src = captureAudioUrl;

    let storageError = null;
    if (options.persist !== false) {
      try {
        await saveMediaAsset(blob, filename, options.origin || 'upload', markers, displayTitle);
      } catch (error) {
        storageError = error;
        showToast(error.message || 'The lecture could not be saved');
      }
    }

    if (state.cloudBeta) {
      document.querySelector('#captureState').textContent = storageError ? 'Preview only' : 'Saved to your library';
      document.querySelector('#lectureSubtitle').textContent = storageError
        ? `${state.className} · this file was not saved`
        : `${state.className} · saved for this account on this device`;
      document.querySelector('#transcriptMeta').textContent = storageError
        ? `${displayTitle} · storage failed`
        : `${displayTitle} · ready for playback`;
      document.querySelector('#transcriptContent').innerHTML = `<div class="transcript-error media-saved-message"><strong>${storageError ? 'The media is available only in this preview.' : 'Your lecture is saved.'}</strong><span>${storageError ? escapeHtml(storageError.message) : 'Play it from your lecture library anytime. Automatic transcription and card drafting are coming next for the hosted beta.'}</span></div>`;
      document.querySelector('#recordingSafety').textContent = storageError
        ? 'Could not save this file on this device'
        : 'Saved under your account on this device';
      if (!storageError) showToast('Lecture saved to your library');
      setAudioBusy(false);
      return;
    }

    try {
      const body = new FormData();
      body.append('audio', blob, filename);
      body.append('markers', JSON.stringify(markers));
      const response = await fetch('/api/transcribe-stream', { method: 'POST', body });
      if (!response.ok) {
        const failure = await response.json();
        const error = new Error(failure.error || 'Transcription failed');
        error.code = failure.code;
        throw error;
      }

      const session = { filename, segments: [], concepts: [], notes: [], cards: [], duration: 0 };
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const handleEvent = event => {
        if (event.type === 'metadata') {
          session.duration = event.durationSeconds;
          document.querySelector('#captureState').textContent = 'Transcribing lecture';
          document.querySelector('#captureTimer').textContent = clock(session.duration);
          document.querySelector('#transcriptMeta').textContent = `00:00 of ${clock(session.duration)} processed · notes and cards update live`;
          document.querySelector('#lectureSubtitle').textContent = `${state.className} · ${clock(session.duration)} source recording`;
          return;
        }
        if (event.type === 'segment') {
          session.segments.push(event.segment);
          const transcript = document.querySelector('#transcriptContent');
          if (session.segments.length === 1) {
            transcript.classList.remove('empty');
            transcript.innerHTML = '';
          }
          transcript.insertAdjacentHTML('beforeend', `<div class="transcript-segment${event.segment.needsReview ? ' needs-review' : ''}"><span class="transcript-time">${clock(event.segment.start)}</span><p>${escapeHtml(event.segment.text)}</p></div>`);
          document.querySelector('#transcriptMeta').textContent = `${clock(event.processedSeconds)} of ${clock(event.durationSeconds)} processed · ${session.cards.length} cards ready`;
          drawLectureProgress(event.processedSeconds, event.durationSeconds);
          return;
        }
        if (event.type === 'concept') {
          session.concepts.push({ name: event.concept, status: event.status || 'verified' });
          session.notes.push(...event.notes);
          session.cards.push(...event.cards);
          renderLectureInsights(session);
          return;
        }
        if (event.type === 'complete') {
          state.latestSessionId = event.sessionId || null;
          lastTranscript = event.transcript;
          renderWarnings(event.qualityWarnings || []);
          document.querySelector('#captureState').textContent = 'Transcript ready';
          document.querySelector('#captureTimer').textContent = clock(event.durationSeconds);
          const readyCards = session.cards.filter(card => card.status !== 'provisional').length;
          const checkCards = session.cards.length - readyCards;
          document.querySelector('#transcriptMeta').textContent = `${clock(event.durationSeconds)} lecture · ${event.processingSeconds}s local · ${readyCards} cards ready${checkCards ? ` · ${checkCards} need a check` : ''}`;
          document.querySelector('#copyTranscript').disabled = false;
          drawLectureProgress(event.durationSeconds, event.durationSeconds);
          const verifiedCount = session.notes.filter(note => note.status !== 'provisional').length;
          const reviewCount = session.notes.length - verifiedCount;
          document.querySelector('#lectureSubtitle').textContent = `${state.className} · ${clock(event.durationSeconds)} lecture · saved locally`;
          showToast(`${verifiedCount} source-matched · ${reviewCount} review-only · ${session.cards.length} cards`);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        lines.filter(Boolean).forEach(line => handleEvent(JSON.parse(line)));
        if (done) break;
      }
      if (pending.trim()) handleEvent(JSON.parse(pending));
    } catch (error) {
      const noAudio = error.code === 'NO_AUDIO_TRACK';
      document.querySelector('#captureState').textContent = noAudio ? 'No audio track found' : 'Could not transcribe';
      document.querySelector('#transcriptMeta').textContent = noAudio ? `${filename} · video only` : 'Lecture was not processed';
      document.querySelector('#transcriptContent').innerHTML = `<div class="transcript-error"><strong>${noAudio ? 'This YouTube download is video-only.' : 'The lecture could not be processed.'}</strong><span>${escapeHtml(error.message)}</span></div>`;
      showToast(noAudio ? 'Download the merged video + audio file' : 'Lecture test failed');
    } finally {
      setAudioBusy(false);
    }
  }

  function sourceMeta(sourceItem) {
    const units = `${Number(sourceItem.unitCount || 0).toLocaleString()} ${sourceItem.unitLabel || 'items'}`;
    const words = `${Number(sourceItem.wordCount || 0).toLocaleString()} words`;
    const objectives = sourceItem.objectiveCount ? ` · ${sourceItem.objectiveCount} objective cues` : '';
    const concepts = sourceItem.concepts?.length ? ` · ${sourceItem.concepts.length} concepts` : '';
    const notes = sourceItem.notes?.length ? ` · ${sourceItem.notes.length} note${sourceItem.notes.length === 1 ? '' : 's'}` : '';
    const drafts = sourceItem.draftCards?.length ? ` · ${sourceItem.draftCards.length} cards ready` : '';
    const processing = sourceItem.sample
      ? 'example'
      : sourceItem.storage === 'session'
        ? 'cards saved in this browser; original file not stored'
        : 'saved in this browser';
    return `${sourceItem.kind} · ${units} · ${words}${objectives}${concepts}${notes}${drafts} · ${processing}`;
  }

  function persistClassSources() {
    localStorage.setItem('syllabloom-sources', JSON.stringify(state.sources));
  }

  function activeSyllabus() {
    return state.sources.find(item => item.kind === 'syllabus') || (state.useDemoSyllabus ? demoSyllabusSource : null);
  }

  function classMaterials() {
    const uploaded = state.sources.filter(item => item.kind !== 'syllabus');
    return state.includeSampleMaterial ? [sampleMaterialSource, ...uploaded] : uploaded;
  }

  function sourceRow(sourceItem, options = {}) {
    const status = sourceItem.sample ? 'Example' : (sourceItem.draftCards?.length ? `${sourceItem.draftCards.length} cards` : 'Parsed');
    const replace = options.syllabus
      ? '<label for="syllabusInput" class="button" role="button" tabindex="0">Replace</label>'
      : '';
    return `
      <div class="surface file-row" data-source-id="${escapeHtml(sourceItem.id)}">
        <div><strong${options.syllabus ? ' id="syllabusName"' : ''}>${escapeHtml(sourceItem.name)}</strong><span${options.syllabus ? ' id="syllabusMeta"' : ''}>${escapeHtml(sourceMeta(sourceItem))}</span></div>
        <div class="actions">
          <span${options.syllabus ? ' id="syllabusStatus"' : ''} class="status">${escapeHtml(status)}</span>
          ${replace}
          <button class="button source-remove" type="button" data-remove-source="${escapeHtml(sourceItem.id)}">Remove</button>
        </div>
      </div>`;
  }

  function renderOnboardingMaterials() {
    const list = document.querySelector('#onboardingMaterialList');
    const materials = classMaterials();
    list.innerHTML = materials.length
      ? materials.map(item => `
          <div class="setup-material-row" data-onboarding-source-id="${escapeHtml(item.id)}">
            <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(sourceMeta(item))}</span></div>
            <button class="button" type="button" data-remove-source="${escapeHtml(item.id)}">Remove</button>
          </div>`).join('')
      : '<div class="setup-material-empty"><strong>No class materials yet.</strong><span>Add your own files or use the anatomy example to see the workflow.</span></div>';

    const syllabus = activeSyllabus();
    document.querySelector('#onboardingSyllabusName').textContent = syllabus?.name || 'Choose a syllabus';
    document.querySelector('#onboardingSyllabusStatus').textContent = syllabus?.sample ? 'Anatomy example selected' : 'Ready to map';
    document.querySelector('#onboardingSyllabusSelection').hidden = !syllabus;
  }

  function renderStoredSources() {
    const library = document.querySelector('#sourceLibrary');
    const syllabus = activeSyllabus();
    const materials = classMaterials();
    const rows = [];
    if (syllabus) rows.push(sourceRow(syllabus, { syllabus: true }));
    materials.forEach(item => rows.push(sourceRow(item)));
    library.innerHTML = rows.length
      ? rows.join('')
      : '<div class="surface source-library-empty"><strong>This class is empty.</strong><span>Add a syllabus, slide deck, notes, or an authorized assessment above.</span></div>';
    const total = rows.length;
    document.querySelector('#sourceCount').textContent = String(total);
    document.querySelector('#sourceMiniText').textContent = materials[0]?.name?.replace(/\.[^.]+$/, '') || 'No class material';
    document.querySelectorAll('.sample-source-detail').forEach(element => { element.hidden = !state.includeSampleMaterial; });
    const toggle = document.querySelector('#toggleClassCards');
    toggle.hidden = !state.includeSampleMaterial;
    if (!state.includeSampleMaterial) document.querySelector('#classCardWorkspace').hidden = true;
    renderSourceStudyOutput();
    renderOnboardingMaterials();
  }

  function renderSourceStudyOutput(preferredSource = null) {
    const panel = document.querySelector('#sourceStudyOutput');
    if (!panel) return;
    const sourceItem = preferredSource || [...state.sources].reverse().find(item => item.notes?.length || item.draftCards?.length);
    if (!sourceItem) {
      panel.hidden = true;
      return;
    }
    const concepts = Array.isArray(sourceItem.concepts) ? sourceItem.concepts : [];
    const notes = Array.isArray(sourceItem.notes) ? sourceItem.notes : [];
    const cards = Array.isArray(sourceItem.draftCards) ? sourceItem.draftCards : [];
    panel.hidden = false;
    document.querySelector('#sourceStudyOutputEyebrow').textContent = sourceItem.name;
    document.querySelector('#sourceStudyOutputTitle').textContent = `${cards.length} ready card${cards.length === 1 ? '' : 's'} from this source`;
    document.querySelector('#sourceStudyOutputSummary').textContent = `${concepts.length} concept${concepts.length === 1 ? '' : 's'} and ${notes.length} note section${notes.length === 1 ? '' : 's'} were traced back to the uploaded file.`;
    document.querySelector('#sourceStudyConcepts').innerHTML = concepts.length
      ? concepts.slice(0, 12).map(concept => `<span>${escapeHtml(concept.name || concept)}</span>`).join('')
      : '<p>No named concepts were found.</p>';
    document.querySelector('#sourceStudyNotes').innerHTML = notes.length
      ? notes.slice(0, 8).map(note => `<article><span>${note.slideNumber ? `Slide ${note.slideNumber}` : 'Source note'}</span><strong>${escapeHtml(note.title)}</strong>${(note.lines || []).slice(0, 4).map(line => `<p>${escapeHtml(line)}</p>`).join('')}</article>`).join('')
      : '<p>No notes were created from this source.</p>';
  }

  function removeClassSource(sourceId) {
    if (sourceId === demoSyllabusSource.id) {
      state.useDemoSyllabus = false;
      state.syllabusName = 'No syllabus added';
    } else if (sourceId === sampleMaterialSource.id) {
      state.includeSampleMaterial = false;
      state.statuses = {};
      state.edits = {};
    } else {
      const removed = state.sources.find(item => item.id === sourceId);
      state.sources = state.sources.filter(item => item.id !== sourceId);
      state.lectureCards = state.lectureCards.filter(card => card.sourceId !== sourceId);
      if (removed?.kind === 'syllabus') state.syllabusName = 'No syllabus added';
    }
    persistClassSources();
    persistClassProfile();
    renderSource();
    updateGenerationCount();
    updateReviewSurface();
    renderStudy();
    updateAssessmentIntro();
    showToast('Source removed from this class');
  }

  function sourceCardsFromLibrary() {
    return state.sources.flatMap(sourceItem => (sourceItem.draftCards || []).map(card => ({
      ...card,
      sourceId: sourceItem.id
    })));
  }

  async function loadStoredSources() {
    const cardSources = state.sources.filter(sourceItem => sourceItem.draftCards?.length);
    const cards = sourceCardsFromLibrary();
    if (cards.length) {
      const latestSource = cardSources[cardSources.length - 1];
      const hadSampleIdentity = state.classMode === 'sample' || (state.className === 'Human Anatomy' && state.classTerm === 'Fall 2023');
      state.includeSampleMaterial = false;
      state.classMode = 'custom';
      state.useDemoSyllabus = false;
      if (!state.sources.some(item => item.kind === 'syllabus')) state.syllabusName = 'No syllabus added';
      if (hadSampleIdentity) {
        const inferredClassName = lectureName(latestSource.name) || 'Untitled class';
        setClassLabels(inferredClassName, 'Term not set');
        if (!state.anki.deck || state.anki.deck === 'Human Anatomy') state.anki.deck = inferredClassName;
        if (!state.anki.tags || state.anki.tags === 'human-anatomy::fall-2023') state.anki.tags = classTag(inferredClassName);
        state.calendarEvents = [];
        state.baselineScore = 0;
        localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
        localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
        syncAnkiFormFromState();
      }
      state.latestSessionId = `source-${latestSource.id}`;
      syncLectureCards(cards);
      persistClassProfile();
    }
    renderSource();
    updateGenerationCount();
    renderStudy();
    updateAssessmentIntro();
  }

  async function uploadSource(file, kind = 'material') {
    const label = document.querySelector('#sourceUploadLabel');
    const priorText = label.textContent;
    label.textContent = 'Reading source…';
    label.classList.add('disabled');
    try {
      const body = new FormData();
      body.append('source', file, file.name);
      body.append('kind', kind);
      const response = await fetch('/api/source', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The document could not be read');
      if (kind === 'syllabus') {
        state.sources = state.sources.filter(item => item.kind !== 'syllabus');
        state.useDemoSyllabus = false;
        state.syllabusName = payload.source.name;
      }
      const wasUsingSample = state.includeSampleMaterial;
      const wasSampleClass = state.classMode === 'sample';
      state.includeSampleMaterial = false;
      state.classMode = 'custom';
      state.useDemoSyllabus = false;
      if (kind !== 'syllabus' && !state.sources.some(item => item.kind === 'syllabus')) state.syllabusName = 'No syllabus added';
      if (wasUsingSample) {
        state.statuses = {};
        state.edits = {};
        state.baselineScore = 0;
        state.calendarEvents = [];
        localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
      }
      if (wasSampleClass) {
        const inferredClassName = lectureName(file.name) || 'Untitled class';
        setClassLabels(inferredClassName, 'Term not set');
        state.anki.deck = inferredClassName;
        state.anki.setName = '';
        state.anki.tags = classTag(inferredClassName);
        localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
        syncAnkiFormFromState();
      }
      state.sources = state.sources.filter(item => item.id !== payload.source.id);
      state.sources.push(payload.source);
      persistClassSources();
      persistClassProfile();
      const sourceCards = (payload.source.draftCards || []).map(card => ({ ...card, sourceId: payload.source.id }));
      if (sourceCards.length) {
        state.latestSessionId = `source-${payload.source.id}`;
        const retainedCards = state.lectureCards.filter(card => card.sourceId !== payload.source.id);
        const merged = [...retainedCards, ...sourceCards];
        const unique = [...new Map(merged.map(card => [lectureCardKey(card), card])).values()];
        syncLectureCards(unique);
      }
      renderSource();
      updateGenerationCount();
      updateReviewSurface();
      renderStudy();
      updateAssessmentIntro();
      renderSourceStudyOutput(payload.source);
      showToast(sourceCards.length
        ? `${file.name} · ${sourceCards.length} cards and ${(payload.source.notes || []).length} note sections ready`
        : `${file.name} was read, but it did not contain enough study text`);
      return payload.source;
    } catch (error) {
      showToast(error.message);
      throw error;
    } finally {
      label.textContent = priorText;
      label.classList.remove('disabled');
    }
  }

  async function restoreLatestSession() {
    if (state.classMode === 'custom') return;
    try {
      const response = await fetch('/api/sessions/latest');
      if (!response.ok) return;
      const payload = await response.json();
      const session = payload.session;
      if (!session?.segments?.length) return;
      state.latestSessionId = session.id;
      lastTranscript = session.transcript || '';
      document.querySelector('#lastLectureSummary').hidden = false;
      document.querySelector('#lectureTitle').textContent = lectureName(session.filename);
      document.querySelector('#lectureSubtitle').textContent = `${state.className} · ${clock(session.durationSeconds)} lecture · saved locally`;
      document.querySelector('#captureState').textContent = 'Ready to record';
      document.querySelector('#captureTimer').textContent = '00:00';
      document.querySelector('#transcriptMeta').textContent = `${clock(session.durationSeconds)} lecture · ${session.processingSeconds}s local · restored`;
      document.querySelector('#copyTranscript').disabled = !lastTranscript;
      const savedMarkers = Array.isArray(session.markers) ? session.markers : [];
      const markerHistory = document.querySelector('#lastLectureMarkers');
      markerHistory.hidden = savedMarkers.length === 0;
      markerHistory.innerHTML = savedMarkers.length
        ? `<strong>${savedMarkers.length} important moment${savedMarkers.length === 1 ? '' : 's'}</strong>${savedMarkers.map(marker => `<span>${clock(marker)}</span>`).join('')}`
        : '';
      const transcript = document.querySelector('#transcriptContent');
      transcript.classList.remove('empty');
      transcript.innerHTML = session.segments.map(segment => `
        <div class="transcript-segment${segment.needsReview ? ' needs-review' : ''}">
          <span class="transcript-time">${clock(segment.start)}</span><p>${escapeHtml(segment.text)}</p>
        </div>`).join('');
      renderWarnings(session.qualityWarnings || []);
      renderLectureInsights({ concepts: session.concepts || [], notes: session.notes || [], cards: session.cards || [] });
    } catch (_) {
      // A first run has no saved lecture yet.
    }
  }

  async function requestRecordingWakeLock() {
    if (!('wakeLock' in navigator)) return null;
    const lock = await navigator.wakeLock.request('screen').catch(() => null);
    recordingWakeLock = lock;
    lock?.addEventListener('release', () => {
      if (recordingWakeLock === lock) recordingWakeLock = null;
    }, { once: true });
    return lock;
  }

  async function toggleRecording() {
    const button = document.querySelector('#recordButton');
    const titleInput = document.querySelector('#recordingTitle');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      button.classList.remove('recording');
      button.innerHTML = '<span></span><b>Start recording</b>';
      window.clearInterval(recordingTimer);
      if (waveformFrame) window.cancelAnimationFrame(waveformFrame);
      if (waveformAudioContext) await waveformAudioContext.close();
      microphoneStream.getTracks().forEach(track => track.stop());
      document.querySelector('#recorderPanel').classList.remove('is-recording', 'is-paused');
      document.querySelector('#liveRecordingTools').hidden = true;
      document.querySelector('#recordingPill').hidden = true;
      document.querySelector('#mobileRecordingPill').hidden = true;
      document.querySelector('#recordingPill').classList.remove('paused');
      document.querySelector('#mobileRecordingPill').classList.remove('paused');
      document.querySelector('.mobile-class-button').hidden = false;
      document.querySelector('#recordingSafety').textContent = 'Saved under your account on this device';
      if (recordingWakeLock) {
        await recordingWakeLock.release().catch(() => {});
        recordingWakeLock = null;
      }
      return;
    }

    const requestedTitle = cleanLectureTitle(titleInput.value);
    if (!requestedTitle) {
      titleInput.setAttribute('aria-invalid', 'true');
      titleInput.focus();
      showToast('Name this lecture before recording');
      return;
    }
    titleInput.removeAttribute('aria-invalid');
    titleInput.value = requestedTitle;
    titleInput.disabled = true;
    activeRecordingTitle = requestedTitle;

    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      lectureMarkers = [];
      recordingPausedAt = 0;
      recordingPausedTotal = 0;
      document.querySelector('#markerSummary').hidden = true;
      document.querySelector('#markerList').innerHTML = '';
      mediaRecorder = new MediaRecorder(microphoneStream);
      mediaRecorder.addEventListener('dataavailable', event => {
        if (event.data.size) chunks.push(event.data);
      });
      mediaRecorder.addEventListener('stop', async () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const savedMarkers = [...lectureMarkers];
        const savedTitle = activeRecordingTitle;
        mediaRecorder = null;
        try {
          await processAudio(blob, recordingFilename(savedTitle, blob.type), savedMarkers, { origin: 'recording', title: savedTitle });
        } finally {
          activeRecordingTitle = '';
          titleInput.disabled = false;
          titleInput.value = defaultRecordingTitle();
        }
      }, { once: true });
      mediaRecorder.start(1000);
      recordingStartedAt = Date.now();
      document.querySelector('#captureState').textContent = 'Recording';
      document.querySelector('#recorderPanel').classList.add('is-recording');
      document.querySelector('#liveRecordingTools').hidden = false;
      document.querySelector('#pauseRecording').textContent = 'Pause';
      document.querySelector('#recordingPill').hidden = false;
      document.querySelector('#recordingPill em').textContent = 'Recording';
      document.querySelector('#mobileRecordingPill').hidden = false;
      document.querySelector('.mobile-class-button').hidden = true;
      button.classList.add('recording');
      button.innerHTML = '<span></span><b>Finish recording</b>';
      recordingTimer = window.setInterval(() => {
        const end = recordingPausedAt || Date.now();
        const elapsed = Math.max(0, (end - recordingStartedAt - recordingPausedTotal) / 1000);
        const formatted = clock(elapsed);
        document.querySelector('#captureTimer').textContent = formatted;
        document.querySelector('#recordingPillTime').textContent = formatted;
        document.querySelector('#mobileRecordingPillTime').textContent = formatted;
      }, 250);
      drawLiveWaveform(microphoneStream);
      await requestRecordingWakeLock();
      document.querySelector('#recordingSafety').textContent = recordingWakeLock
        ? 'Recording to your device library · screen kept awake'
        : 'Recording to your device library · keep this screen open';
    } catch (error) {
      activeRecordingTitle = '';
      titleInput.disabled = false;
      document.querySelector('#captureState').textContent = 'Microphone unavailable';
      showToast('Microphone access was not granted');
    }
  }

  function toggleRecordingPause() {
    if (!mediaRecorder || !['recording', 'paused'].includes(mediaRecorder.state)) return;
    const recorder = document.querySelector('#recorderPanel');
    const pauseButton = document.querySelector('#pauseRecording');
    if (mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      recordingPausedAt = Date.now();
      recorder.classList.add('is-paused');
      document.querySelector('#recordingPill').classList.add('paused');
      document.querySelector('#mobileRecordingPill').classList.add('paused');
      document.querySelector('#recordingPill em').textContent = 'Paused';
      document.querySelector('#captureState').textContent = 'Paused';
      pauseButton.textContent = 'Resume';
      return;
    }
    recordingPausedTotal += Date.now() - recordingPausedAt;
    recordingPausedAt = 0;
    mediaRecorder.resume();
    recorder.classList.remove('is-paused');
    document.querySelector('#recordingPill').classList.remove('paused');
    document.querySelector('#mobileRecordingPill').classList.remove('paused');
    document.querySelector('#recordingPill em').textContent = 'Recording';
    document.querySelector('#captureState').textContent = 'Recording';
    pauseButton.textContent = 'Pause';
  }

  function markImportantMoment() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    const elapsed = Math.max(0, (Date.now() - recordingStartedAt - recordingPausedTotal) / 1000);
    lectureMarkers.push(elapsed);
    const summary = document.querySelector('#markerSummary');
    summary.hidden = false;
    document.querySelector('#markerList').innerHTML = lectureMarkers
      .map((marker, index) => `<span><b>${index + 1}</b>${clock(marker)}</span>`)
      .join('');
    showToast(`Important moment marked at ${clock(elapsed)}`);
  }

  window.addEventListener('beforeunload', event => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('popstate', event => {
    restoreShellRoute(event.state?.syllabloom || { surface: 'landing' });
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !mediaRecorder || mediaRecorder.state === 'inactive' || recordingWakeLock || !('wakeLock' in navigator)) return;
    await requestRecordingWakeLock();
  });

  document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
  document.querySelectorAll('[data-open-profile]').forEach(button => button.addEventListener('click', () => openAccountPage('profile')));
  document.querySelectorAll('[data-open-billing]').forEach(button => button.addEventListener('click', () => openAccountPage('billing')));
  document.querySelectorAll('[data-account-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.accountView)));
  window.addEventListener('syllabloom:open-profile', () => openAccountPage('profile'));
  document.querySelectorAll('[data-start-onboarding]').forEach(button => button.addEventListener('click', startClassSetup));
  document.querySelectorAll('[data-open-sample]').forEach(button => button.addEventListener('click', loadSampleClass));
  document.querySelectorAll('[data-back-home]').forEach(button => button.addEventListener('click', showLanding));
  document.querySelector('#mobileNav').addEventListener('change', event => navigate(event.target.value));
  document.querySelector('#openAnkiSettings').addEventListener('click', () => openAnkiSettings(false));
  document.querySelector('#openAnkiSettingsOnboarding').addEventListener('click', () => openAnkiSettings(true));
  document.querySelector('#closeAnkiSettings').addEventListener('click', () => document.querySelector('#ankiSettingsDialog').close());
  document.querySelector('#cancelAnkiSettings').addEventListener('click', () => {
    syncAnkiFormFromState();
    document.querySelector('#ankiSettingsDialog').close();
  });
  document.querySelector('#ankiSettingsDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector('#ankiSettingsForm').addEventListener('submit', event => {
    event.preventDefault();
    const dialog = document.querySelector('#ankiSettingsDialog');
    syncAnkiStateFromForm();
    if (dialog.dataset.context === 'onboarding') syncStateToOnboardingAnki();
    dialog.close();
    showToast('Anki export settings saved');
  });
  document.querySelector('#ankiFsrsEnabled').addEventListener('change', updateAnkiConditionalFields);
  document.querySelector('#ankiSettingsForm').addEventListener('input', event => {
    if (event.target.matches('#ankiFsrsEnabled, #ankiDesiredRetention, #ankiNewReviewOrder, #ankiReleaseStrategy')) refreshAnkiLearningPreview();
  });

  document.querySelector('#calendarEventForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = document.querySelector('#calendarEventTitle').value.trim();
    const date = document.querySelector('#calendarEventDate').value;
    const type = document.querySelector('#calendarEventType').value;
    if (!title || !date) return;
    state.calendarEvents.push({ id: `event-${Date.now()}`, title, date, type });
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    event.currentTarget.reset();
    document.querySelector('#calendarEventDate').value = dateAfter(1);
    renderClassPlanner();
    showToast('Class date added to the plan');
  });
  document.querySelector('#upcomingEvents').addEventListener('click', event => {
    const id = event.target.dataset.removeEvent;
    if (!id) return;
    state.calendarEvents = state.calendarEvents.filter(item => item.id !== id);
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    renderClassPlanner();
    showToast('Class date removed');
  });
  document.querySelector('#calendarGrid').addEventListener('click', event => {
    const day = event.target.closest('[data-calendar-date]');
    if (!day) return;
    document.querySelector('#calendarEventDate').value = day.dataset.calendarDate;
    document.querySelector('#calendarEventTitle').focus();
  });
  document.querySelector('#calendarPrev').addEventListener('click', () => {
    state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1, 12);
    renderClassPlanner();
  });
  document.querySelector('#calendarNext').addEventListener('click', () => {
    state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1, 12);
    renderClassPlanner();
  });
  document.querySelector('#calendarToday').addEventListener('click', () => {
    state.calendarCursor = new Date();
    renderClassPlanner();
  });
  document.querySelector('#dailyStudyMinutes').addEventListener('input', event => {
    state.dailyStudyMinutes = Math.min(240, Math.max(10, Number(event.target.value) || 35));
    renderClassPlanner();
  });
  document.querySelector('#releaseStrategy').addEventListener('change', event => {
    state.anki.releaseStrategy = event.target.value;
    localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
    document.querySelector('#ankiReleaseStrategy').value = state.anki.releaseStrategy;
    renderClassPlanner();
    refreshAnkiLearningPreview();
  });

  document.querySelectorAll('.setup-next').forEach(button => button.addEventListener('click', () => showSetupStep(state.setupStep + 1)));
  document.querySelectorAll('.setup-back').forEach(button => button.addEventListener('click', () => showSetupStep(state.setupStep - 1)));
  document.querySelector('#previewClass').addEventListener('click', loadSampleClass);
  document.querySelector('#addClass').addEventListener('click', startClassSetup);
  document.querySelector('#addClassFromSource').addEventListener('click', startClassSetup);
  document.querySelector('#classSwitcher').addEventListener('click', () => navigate('source'));
  document.querySelectorAll('[data-close-class-limit]').forEach(button => button.addEventListener('click', () => document.querySelector('#classLimitDialog').close()));
  document.querySelector('[data-see-pricing]').addEventListener('click', showPricing);
  document.querySelector('#classLimitDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  window.addEventListener('syllabloom:auth-change', event => {
    const detail = event.detail || {};
    const priorUserId = state.account.userId;
    state.account.signedIn = Boolean(detail.signedIn);
    state.account.email = detail.email || '';
    state.account.userId = detail.userId || '';
    state.account.displayName = detail.displayName || '';
    state.account.imageUrl = detail.imageUrl || '';
    if (state.account.signedIn && state.account.userId && priorUserId !== state.account.userId) {
      state.account.classesUsed = 0;
    }
    state.account.plan = detail.plan === 'student' ? 'student' : 'free';
    saveAccount();
    closeMediaPreview();
    renderMediaLibrary();
    renderProfile();
    if (state.view === 'billing') renderBillingPage();
    if (state.account.signedIn && state.pendingClassSetup) {
      state.pendingClassSetup = false;
      window.setTimeout(startClassSetup, 0);
    }
  });
  document.querySelector('#manageClerkProfile').addEventListener('click', () => window.SyllabloomAuth?.openClerkProfile?.());
  document.querySelector('#billingManageAccount').addEventListener('click', () => window.SyllabloomAuth?.openClerkProfile?.());
  document.querySelector('#billingSetupPending').addEventListener('click', () => {
    if (!state.account.signedIn) return window.SyllabloomAuth?.open?.();
    const button = document.querySelector('#billingSetupPending');
    if (button.dataset.checkoutReady === 'true') {
      const dialog = document.querySelector('#billingCheckoutDialog');
      if (!dialog.open) dialog.showModal();
      return;
    }
    showToast('The beta is free. Live Student billing is not open yet.');
  });
  document.querySelectorAll('[data-close-billing-checkout]').forEach(button => button.addEventListener('click', () => {
    const dialog = document.querySelector('#billingCheckoutDialog');
    if (dialog.open) dialog.close();
  }));
  document.querySelector('#billingCheckoutDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.querySelector('[data-profile-add-class]').addEventListener('click', startClassSetup);
  document.querySelector('#profileClassList').addEventListener('click', event => {
    if (event.target.closest('[data-open-current-class]')) navigate('home');
  });
  document.querySelector('#profileScheduleForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = document.querySelector('#profileEventTitle').value.trim();
    const date = document.querySelector('#profileEventDate').value;
    const type = document.querySelector('#profileEventType').value;
    if (!title || !date) return;
    state.calendarEvents.push({ id: `event-${Date.now()}`, title, date, type });
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    event.currentTarget.reset();
    document.querySelector('#profileEventDate').value = dateAfter(1);
    renderClassPlanner();
    renderProfile();
    showToast('Important date added');
  });
  document.querySelector('#profileUpcomingEvents').addEventListener('click', event => {
    const button = event.target.closest('[data-profile-remove-event]');
    if (!button) return;
    state.calendarEvents = state.calendarEvents.filter(item => item.id !== button.dataset.profileRemoveEvent);
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    renderClassPlanner();
    renderProfile();
    showToast('Important date removed');
  });
  document.querySelectorAll('label[role="button"]').forEach(label => label.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    label.click();
  }));
  document.querySelector('#recordButton').addEventListener('click', toggleRecording);
  document.querySelector('#pauseRecording').addEventListener('click', toggleRecordingPause);
  document.querySelector('#markMoment').addEventListener('click', markImportantMoment);
  document.querySelector('#audioInput').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    processAudio(file, file.name, [], { origin: 'upload', title: lectureName(file.name) });
    event.target.value = '';
  });
  document.querySelector('#mediaLibraryList').addEventListener('click', async event => {
    const openButton = event.target.closest('[data-open-media]');
    const renameButton = event.target.closest('[data-rename-media]');
    const cancelRenameButton = event.target.closest('[data-cancel-rename]');
    const deleteButton = event.target.closest('[data-delete-media]');
    try {
      if (openButton) {
        await openMediaPreview(openButton.dataset.openMedia);
        return;
      }
      if (renameButton) {
        editingMediaId = renameButton.dataset.renameMedia;
        await renderMediaLibrary();
        return;
      }
      if (cancelRenameButton) {
        editingMediaId = null;
        await renderMediaLibrary();
        return;
      }
      if (!deleteButton) return;
      await openRemoveLectureDialog(deleteButton.dataset.deleteMedia);
    } catch (error) {
      showToast(error.message || 'The lecture library could not be updated');
    }
  });
  document.querySelectorAll('[data-cancel-remove-lecture]').forEach(button => button.addEventListener('click', closeRemoveLectureDialog));
  document.querySelector('#removeLectureDialog').addEventListener('close', () => {
    pendingRemoveMediaId = null;
  });
  document.querySelector('#removeLectureDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeRemoveLectureDialog();
  });
  document.querySelector('#confirmRemoveLecture').addEventListener('click', async event => {
    const id = pendingRemoveMediaId;
    if (!id) return closeRemoveLectureDialog();
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Removing…';
    try {
      if (libraryMediaId === id) closeMediaPreview();
      await deleteMediaAsset(id);
      closeRemoveLectureDialog();
      await renderMediaLibrary();
      showToast('Lecture removed from this device');
    } catch (error) {
      showToast(error.message || 'The lecture could not be removed');
    } finally {
      button.disabled = false;
      button.textContent = 'Remove lecture';
    }
  });
  document.querySelector('#mediaLibraryList').addEventListener('submit', async event => {
    const form = event.target.closest('[data-rename-form]');
    if (!form) return;
    event.preventDefault();
    const title = cleanLectureTitle(new FormData(form).get('title'));
    if (!title) return form.querySelector('input')?.focus();
    try {
      await updateMediaAssetTitle(form.dataset.renameForm, title);
      editingMediaId = null;
      await renderMediaLibrary();
      showToast('Lecture renamed');
    } catch (error) {
      showToast(error.message || 'The lecture name could not be saved');
    }
  });
  document.querySelector('#closeMediaPlayer').addEventListener('click', closeMediaPreview);
  document.querySelector('#useTestAudio').addEventListener('click', async () => {
    try {
      setAudioBusy(true, 'Loading real anatomy audio');
      const response = await fetch('test-audio/kenhub-tibialis-anterior-cc-by-3.webm');
      if (!response.ok) throw new Error('The included audio sample could not be loaded.');
      const blob = await response.blob();
      await processAudio(blob, 'kenhub-tibialis-anterior-cc-by-3.webm', [], { origin: 'sample', persist: false });
    } catch (error) {
      setAudioBusy(false, 'Ready to record');
      showToast(error.message);
    }
  });
  document.querySelector('#copyTranscript').addEventListener('click', async () => {
    if (!lastTranscript) return;
    await navigator.clipboard.writeText(lastTranscript);
    showToast('Transcript copied');
  });
  document.querySelector('#toggleTranscript').addEventListener('click', () => {
    const panel = document.querySelector('#transcriptPanel');
    const collapsed = panel.classList.toggle('transcript-collapsed');
    document.querySelector('#toggleTranscript').textContent = collapsed ? 'Show transcript' : 'Hide transcript';
  });

  document.querySelector('#onboardingSyllabus').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    state.syllabusName = file.name;
    document.querySelector('#onboardingSyllabusName').textContent = file.name;
    document.querySelector('#onboardingSyllabusStatus').textContent = 'Reading syllabus';
    document.querySelector('#onboardingSyllabusSelection').hidden = false;
    await uploadSource(file, 'syllabus').catch(() => {});
    event.target.value = '';
  });
  document.querySelector('#useDemoSyllabus').addEventListener('click', () => {
    state.sources = state.sources.filter(item => item.kind !== 'syllabus');
    state.useDemoSyllabus = true;
    state.syllabusName = demoSyllabusSource.name;
    persistClassSources();
    renderStoredSources();
    showToast('Anatomy syllabus example added');
  });
  document.querySelector('#removeOnboardingSyllabus').addEventListener('click', () => {
    const syllabus = activeSyllabus();
    if (syllabus) removeClassSource(syllabus.id);
  });
  document.querySelector('#onboardingMaterials').addEventListener('change', async event => {
    const files = [...event.target.files];
    for (const file of files) {
      await uploadSource(file, 'material').catch(() => {});
    }
    event.target.value = '';
  });
  document.querySelector('#useSampleMaterial').addEventListener('click', () => {
    state.includeSampleMaterial = true;
    renderStoredSources();
    updateGenerationCount();
    showToast('Anatomy material example added');
  });
  document.querySelectorAll('#sourceLibrary, #onboardingMaterialList').forEach(container => container.addEventListener('click', event => {
    const sourceId = event.target.dataset.removeSource;
    if (sourceId) removeClassSource(sourceId);
  }));
  document.querySelector('#startAssessment').addEventListener('click', () => {
    if (!activeAssessmentQuestions().length) return showToast('Add class material before starting the quick check');
    state.assessmentIndex = 0;
    state.assessmentScore = 0;
    document.querySelector('#assessmentIntro').hidden = true;
    document.querySelector('#assessmentBox').hidden = false;
    document.querySelector('#assessmentBox').innerHTML = `
      <div id="assessmentProgress" class="assessment-progress"></div>
      <h2 id="assessmentQuestion"></h2>
      <div id="assessmentOptions" class="answer-options"></div>
      <div id="assessmentResult" class="assessment-result"></div>`;
    renderAssessmentQuestion();
  });
  document.querySelector('#baselineContinue').addEventListener('click', () => showSetupStep(5));
  document.querySelector('#focusedAssessment').addEventListener('click', () => openOnboarding(4));
  document.querySelector('#finishSetup').addEventListener('click', () => {
    const className = document.querySelector('#classNameInput').value.trim() || 'Untitled class';
    const term = document.querySelector('#termInput').value.trim() || 'Term not set';
    syncOnboardingAnkiToState();
    state.anki.deck = state.anki.deck || className;
    localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
    const examDate = document.querySelector('#examDateInput').value;
    if (examDate) {
      const priorExam = state.calendarEvents.find(event => event.type === 'exam');
      if (priorExam) priorExam.date = examDate;
      else state.calendarEvents.push({ id: `exam-${Date.now()}`, date: examDate, type: 'exam', title: 'Next exam' });
      localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    }
    setClassLabels(className, term);
    state.classMode = 'custom';
    persistClassProfile();
    persistClassSources();
    renderSource();
    updateGenerationCount();
    if (state.creatingClass) {
      state.account.classesUsed = Math.max(1, Number(state.account.classesUsed) || 0);
      saveAccount();
    }
    closeOnboarding();
    showToast(`${className} is ready`);
  });

  document.querySelector('#adjustPlan').addEventListener('click', () => {
    document.querySelector('#planFeedback').classList.toggle('open');
  });
  document.querySelectorAll('.plan-feedback').forEach(button => button.addEventListener('click', () => {
    applyPlanFeedback(button.dataset.feedback);
  }));

  document.querySelector('#syllabusInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await uploadSource(file, 'syllabus');
    } catch (_) {
      showToast('Could not parse this syllabus');
    }
    event.target.value = '';
  });

  document.querySelector('#sourceUpload').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    await uploadSource(file, document.querySelector('#sourceKind').value).catch(() => {});
    event.target.value = '';
  });

  document.querySelector('#lectureDraftQueue').addEventListener('input', event => {
    const field = event.target.dataset.lectureField;
    if (!field) return;
    const cardElement = event.target.closest('[data-lecture-card]');
    const card = state.lectureCards.find(item => item.id === cardElement?.dataset.lectureCard);
    if (card) {
      card[field] = event.target.value;
      autoSizeTextArea(event.target);
      saveLectureReview();
    }
  });
  document.querySelector('#lectureDraftQueue').addEventListener('click', event => {
    const action = event.target.dataset.lectureAction;
    if (!action) return;
    const cardElement = event.target.closest('[data-lecture-card]');
    const card = state.lectureCards.find(item => item.id === cardElement?.dataset.lectureCard);
    if (!card) return;
    card.reviewStatus = action === 'approve' ? 'approved' : 'skipped';
    saveLectureReview();
    renderLectureDraftQueue();
    showToast(action === 'approve' ? 'Card added to the ready set' : 'Card left out');
  });
  document.querySelector('#reviewAudioCards').addEventListener('click', () => {
    window.setTimeout(() => document.querySelector('#lectureDraftSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  });

  document.querySelectorAll('.card-type').forEach(input => input.addEventListener('change', updateGenerationCount));
  document.querySelector('#generateCards').addEventListener('click', () => {
    if (!state.selectedTypes.length) return showToast('Choose at least one card type');
    if (!state.includeSampleMaterial) {
      const drafts = state.lectureCards.filter(card => card.reviewStatus === 'waiting').length;
      const ready = state.lectureCards.filter(card => card.reviewStatus === 'approved').length;
      if (ready) {
        navigate('cards');
        return showToast(`${ready} ready card${ready === 1 ? '' : 's'} opened`);
      }
      if (drafts) {
        navigate('cards');
        window.requestAnimationFrame(() => document.querySelector('#lectureDraftSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        return showToast(`${drafts} card draft${drafts === 1 ? '' : 's'} ready for review`);
      }
      return showToast('Add a source that produces ready cards first');
    }
    records.forEach(record => state.selectedTypes.forEach(field => {
      const key = keyFor(record, field);
      if (state.statuses[key] !== 'Skipped') state.statuses[key] = 'Approved';
    }));
    if (!state.selectedTypes.includes(state.field)) state.field = state.selectedTypes[0];
    document.querySelector('#classCardWorkspace').hidden = false;
    document.querySelector('#toggleClassCards').textContent = 'Close the full class card library';
    updateReviewSurface();
    renderEditor();
    navigate('cards');
    showToast(`${collectApprovedCards().length} source-matched cards ready`);
  });

  document.querySelector('#toggleClassCards').addEventListener('click', () => {
    const workspace = document.querySelector('#classCardWorkspace');
    workspace.hidden = !workspace.hidden;
    document.querySelector('#toggleClassCards').textContent = workspace.hidden ? 'Open the full class card library' : 'Close the full class card library';
    if (!workspace.hidden) window.setTimeout(() => workspace.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  });

  document.querySelector('#muscleSearch').addEventListener('input', renderMuscleList);
  document.querySelector('#frontText').addEventListener('input', event => autoSizeTextArea(event.target));
  document.querySelector('#backText').addEventListener('input', event => autoSizeTextArea(event.target));
  document.querySelectorAll('.field-tab').forEach(button => button.addEventListener('click', () => {
    saveCurrent(true);
    state.field = button.dataset.field;
    renderEditor();
  }));

  document.querySelector('#saveCard').addEventListener('click', () => saveCurrent(false));
  document.querySelector('#exportAnki').addEventListener('click', exportApprovedCards);
  document.querySelector('#lectureExportAnki').addEventListener('click', exportApprovedCards);
  document.querySelector('#skipCard').addEventListener('click', () => {
    saveCurrent(true);
    state.statuses[keyFor(currentRecord())] = 'Skipped';
    updateReviewSurface();
    showToast('Card skipped');
    advanceRecord();
  });
  document.querySelector('#approveCard').addEventListener('click', () => {
    saveCurrent(true);
    state.statuses[keyFor(currentRecord())] = 'Approved';
    updateReviewSurface();
    showToast('Card kept in the ready set');
    advanceRecord();
  });

  document.querySelector('#showAnswer').addEventListener('click', () => {
    hideRatingReceipt();
    resetRatingControls();
    document.querySelector('#studyAnswer').classList.add('open');
    document.querySelector('#showAnswer').hidden = true;
    document.querySelector('#ratingControls').classList.add('open');
  });

  document.querySelectorAll('.rating').forEach(button => button.addEventListener('click', () => {
    const cards = studyCards();
    const item = cards[state.studyIndex];
    if (!item || button.disabled) return;
    const rating = button.dataset.rating;
    const persisted = recordStudyRating(item, rating);
    document.querySelectorAll('.rating').forEach(control => {
      control.disabled = true;
      control.classList.toggle('is-recorded', control === button);
      control.setAttribute('aria-pressed', control === button ? 'true' : 'false');
    });
    state.reviewCount += 1;
    document.querySelector('#reviewCount').textContent = state.reviewCount;
    showRatingReceipt(rating, persisted);
    if (rating === 'Again') {
      showMissExplanation(item);
      return;
    }
    window.setTimeout(() => {
      state.studyIndex = (state.studyIndex + 1) % cards.length;
      renderStudy({ preserveRatingReceipt: true });
      document.querySelector('#showAnswer').focus({ preventScroll: true });
    }, 180);
  }));

  document.querySelector('#retryMissedCard').addEventListener('click', () => {
    hideMissExplanation();
    hideRatingReceipt();
    resetRatingControls();
    document.querySelector('#studyAnswer').classList.remove('open');
    document.querySelector('#showAnswer').hidden = false;
    document.querySelector('#ratingControls').classList.remove('open');
    document.querySelector('#showAnswer').focus();
  });

  document.querySelector('#continueAfterMiss').addEventListener('click', () => {
    const cards = studyCards();
    state.studyIndex = (state.studyIndex + 1) % cards.length;
    renderStudy();
  });

  document.querySelector('#editMissedCard').addEventListener('click', () => {
    const item = state.missedItem;
    if (!item) return;
    if (item.record) {
      state.selectedId = item.record.id;
      state.field = item.field;
    }
    navigate('cards');
    if (item.directCard) {
      window.requestAnimationFrame(() => {
        document.querySelector(`[data-lecture-card="${CSS.escape(item.directCard.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  });

  setClassLabels(state.className, state.classTerm);
  renderSource();
  updateGenerationCount();
  renderEditor();
  renderStudy();
  drawWaveform();
  syncStateToOnboardingAnki();
  syncAnkiFormFromState();
  document.querySelector('#examDateInput').value = nextExamEvent()?.date || dateAfter(12);
  document.querySelector('#calendarEventDate').value = dateAfter(1);
  document.querySelector('#profileEventDate').value = dateAfter(1);
  document.querySelector('#recordingTitle').value = defaultRecordingTitle();
  renderClassPlanner();
  renderProfile();
  syncBillingSummary();
  updateWorkflowCompanion('home');
  initializeShellRouting();
  detectRuntimeCapabilities();
  loadStoredSources();
  restoreLatestSession();
  renderMediaLibrary();
  window.SyllabloomAuth?.refresh?.();
})();
