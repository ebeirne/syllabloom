(() => {
  const source = window.MUSCLE_SOURCE;
  const records = source.records;

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
    reviewCount: 146,
    planCorrections: 0,
    setupStep: 1,
    syllabusName: 'Demo syllabus',
    assessmentIndex: 0,
    assessmentScore: 0,
    baselineScore: 62,
    lectureCards: [],
    sources: [],
    latestSessionId: null,
    anki: { ...defaultAnkiPreferences, ...storedJson('syllabloom-anki-preferences', {}) },
    calendarEvents: storedJson('syllabloom-calendar-events', initialCalendarEvents),
    calendarCursor: new Date(),
    dailyStudyMinutes: 35,
    selectedTypes: ['attachment', 'action', 'innervation'],
    creatingClass: false,
    account: {
      signedIn: false,
      email: '',
      userId: '',
      plan: 'free',
      classLimit: 1,
      classesUsed: 0,
      ...storedJson('syllabloom-account', {})
    }
  };

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
    const approvedLabel = `${approved} accepted card${approved === 1 ? '' : 's'}`;
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
    const availableNew = Math.max(1, Math.min(state.anki.newPerDay, Math.floor(state.dailyStudyMinutes / 2), Math.ceil(42 / daysLeft)));
    const topicOrders = {
      'weakest-deadline': ['Upper-limb attachments', 'Forearm innervation', 'Muscles of mastication', 'Facial expression actions', 'Lower-limb actions', 'Mixed recall', 'Catch-up and card edits'],
      weakest: ['Upper-limb attachments', 'Forearm innervation', 'Muscles of mastication', 'Facial expression actions', 'Lower-limb actions', 'Weak-topic recheck', 'Catch-up and card edits'],
      syllabus: ['Muscles of facial expression', 'Muscles of mastication', 'Upper limb', 'Forearm and hand', 'Trunk', 'Lower limb', 'Mixed syllabus check'],
      'recent-source': ['Latest lecture highlights', 'Latest lecture weak points', 'New slide terminology', 'Source-linked recall', 'Earlier source gaps', 'Mixed recall', 'Catch-up and card edits']
    };
    const topics = topicOrders[state.anki.releaseStrategy] || topicOrders['weakest-deadline'];
    const rows = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      const iso = localIsoDate(date);
      const event = state.calendarEvents.find(item => item.date === iso);
      const dayLabel = offset === 0 ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
      const newCards = event?.type === 'exam' ? 0 : Math.max(0, Math.min(state.anki.newPerDay, availableNew + (event?.type === 'lecture' ? 2 : 0)));
      const focus = event?.type === 'exam' ? event.title : event ? `${event.title}: ${topics[offset % topics.length]}` : topics[offset % topics.length];
      rows.push(`<div class="release-plan-row"><strong>${escapeHtml(dayLabel)}</strong><span>${escapeHtml(focus)}</span><b>${newCards}</b><em>Due in Anki</em></div>`);
    }
    document.querySelector('#releasePlanRows').innerHTML = rows.join('');
    const nextLabel = exam ? `${exam.title} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'No exam date yet';
    document.querySelector('#releasePlanSummary').textContent = `${nextLabel}. Up to ${availableNew} new cards a day, ordered by ${releaseStrategyLabel(state.anki.releaseStrategy)}. Due reviews remain in Anki.`;
  }

  async function detectRuntimeCapabilities() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) return;
      const capabilities = await response.json();
      if (capabilities.mode !== 'beta-cloud') return;

      document.documentElement.dataset.runtime = 'cloud-beta';
      document.querySelector('#cloudBetaNotice').hidden = false;
      document.querySelector('#audioInput').disabled = true;
      document.querySelector('#recordButton').disabled = true;
      document.querySelector('#useTestAudio').disabled = true;
      document.querySelector('#captureState').textContent = 'Desktop pilot required';
      document.querySelector('#recordingSafety').textContent = 'Lecture transcription runs in the desktop pilot';
      const captureStatus = document.querySelector('.capture-status');
      captureStatus.querySelector('strong').textContent = 'Public beta';
      captureStatus.querySelector('span:last-child').textContent = 'Session-only source processing';
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
      5: ['assets/rounds-mascot-anki.webp', 'The Syllabloom companion packing approved cards for Anki'],
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

    if (state.setupStep === 6) {
      syncOnboardingAnkiToState();
      const className = document.querySelector('#classNameInput').value.trim() || 'Untitled class';
      const term = document.querySelector('#termInput').value.trim() || 'Term not set';
      document.querySelector('#summaryClass').textContent = className;
      document.querySelector('#summaryTerm').textContent = term;
      document.querySelector('#summarySyllabus').textContent = state.syllabusName;
      document.querySelector('#summaryBaseline').textContent = `${state.baselineScore}% starting point`;
      document.querySelector('#summaryAnki').textContent = `${state.anki.format} · ${state.anki.newPerDay} new per day`;
    }
    document.querySelector('#onboarding').scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function openOnboarding(step = 1) {
    document.querySelector('#landing').classList.add('hidden');
    document.querySelector('#onboarding').classList.remove('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('marketing-mode');
    showSetupStep(step);
  }

  function saveAccount() {
    localStorage.setItem('syllabloom-account', JSON.stringify(state.account));
  }

  function showClassLimit() {
    const dialog = document.querySelector('#classLimitDialog');
    const used = Math.max(1, Number(state.account.classesUsed) || 0);
    const limit = Math.max(1, Number(state.account.classLimit) || 1);
    document.querySelector('#classLimitReadout').textContent = `${used} of ${limit} free class used`;
    dialog.showModal();
  }

  function startClassSetup() {
    const limit = state.account.plan === 'student' ? Number.MAX_SAFE_INTEGER : Math.max(1, Number(state.account.classLimit) || 1);
    if ((Number(state.account.classesUsed) || 0) >= limit) {
      showClassLimit();
      return;
    }
    state.creatingClass = true;
    openOnboarding(1);
  }

  function showPricing() {
    document.querySelector('#classLimitDialog').close();
    showLanding();
    window.setTimeout(() => document.querySelector('#pricing').scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }

  function closeOnboarding() {
    localStorage.setItem('rounds-onboarded', '1');
    state.creatingClass = false;
    document.querySelector('#landing').classList.add('hidden');
    document.querySelector('#onboarding').classList.add('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = false;
    app.setAttribute('aria-hidden', 'false');
    document.body.classList.remove('marketing-mode');
    navigate('home');
  }

  function showLanding() {
    state.creatingClass = false;
    document.querySelector('#landing').classList.remove('hidden');
    document.querySelector('#onboarding').classList.add('hidden');
    const app = document.querySelector('#mainApp');
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    document.body.classList.add('marketing-mode');
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('syllabloom:landing-shown'));
  }

  function navigate(view) {
    state.view = view;
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === view));
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    const inClassContext = view === 'source' || view === 'knowledge';
    document.querySelector('#classSwitcher').classList.toggle('active-context', inClassContext);
    document.querySelector('.mobile-class-button').classList.toggle('active-context', inClassContext);
    document.querySelector('#classSwitcher').toggleAttribute('aria-current', inClassContext);
    document.querySelector('.mobile-class-button').toggleAttribute('aria-current', inClassContext);
    document.querySelector('#mobileNav').value = view;
    if (view === 'cards') {
      renderEditor();
      window.requestAnimationFrame(() => document.querySelectorAll('#lectureDraftQueue textarea').forEach(autoSizeTextArea));
    }
    if (view === 'study') renderStudy();
    if (view === 'knowledge') renderClassPlanner();
    updateWorkflowCompanion(view);
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('syllabloom:view-changed', { detail: { view } }));
  }

  function renderSource() {
    document.querySelector('#sourceCount').textContent = source.muscleCount;
    updateReviewSurface();
    document.querySelector('#homeMuscleCount').textContent = source.muscleCount;
    document.querySelector('#homeCardCount').textContent = source.focusedCardCount;
    document.querySelector('#homeSectionCount').textContent = Object.keys(source.sections).length;
    document.querySelector('#documentName').textContent = source.document;
    document.querySelector('#sourceMiniText').textContent = source.document.replace(/\.docx$/i, '');

    document.querySelector('#schema').innerHTML = source.schema.map(label => `<div>${label}</div>`).join('');
    document.querySelector('#sectionList').innerHTML = Object.entries(source.sections)
      .map(([section, count]) => `<div class="section-row"><strong>${section}</strong><span>${count} muscles</span></div>`)
      .join('');
  }

  function updateGenerationCount() {
    const selected = [...document.querySelectorAll('.card-type:checked')].map(input => input.value);
    state.selectedTypes = selected;
    document.querySelector('#generationCount').textContent = source.muscleCount * selected.length;
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
      const status = state.statuses[keyFor(record)] || 'Draft';
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
    document.querySelector('#editorStatus').textContent = state.statuses[key] || 'Draft';
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
    document.querySelector('#approvedCount').textContent = values.filter(value => value === 'Approved').length;
    document.querySelector('#skippedCount').textContent = values.filter(value => value === 'Skipped').length;
  }

  function studyCards() {
    const approved = [];
    Object.entries(state.statuses).forEach(([key, status]) => {
      if (status !== 'Approved') return;
      const [id, field] = key.split('-');
      const record = records.find(item => item.id === Number(id));
      if (record) approved.push({ record, field });
    });
    state.lectureCards
      .filter(card => card.reviewStatus === 'approved')
      .forEach(card => approved.push({ directCard: card }));
    if (approved.length) return approved.slice(0, state.anki.dailyLimit);
    const weakMaterial = records.filter(record => {
      const section = record.section.toUpperCase();
      return section.includes('ARM') || section.includes('FOREARM') || section.includes('WRIST, HAND');
    }).slice(0, Math.min(18, state.anki.dailyLimit));
    return weakMaterial.map((record, index) => ({
      record,
      field: index % 3 === 2 ? 'innervation' : 'attachment'
    }));
  }

  function renderAssessmentQuestion() {
    const item = assessmentQuestions[state.assessmentIndex];
    document.querySelector('#assessmentProgress').textContent = `Question ${state.assessmentIndex + 1} of ${assessmentQuestions.length}`;
    document.querySelector('#assessmentQuestion').textContent = item.question;
    document.querySelector('#assessmentResult').innerHTML = '';
    const options = document.querySelector('#assessmentOptions');
    options.innerHTML = item.options.map((option, index) => (
      `<button class="button answer-option" data-answer="${index}">${option}</button>`
    )).join('');
    options.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => {
      const answer = Number(button.dataset.answer);
      const correct = answer === item.correct;
      if (correct) state.assessmentScore += 1;
      options.querySelector(`[data-answer="${item.correct}"]`)?.classList.add('correct-answer');
      if (!correct) button.classList.add('selected-wrong');
      options.querySelectorAll('button').forEach(option => { option.disabled = true; });
      const finalQuestion = state.assessmentIndex === assessmentQuestions.length - 1;
      document.querySelector('#assessmentResult').innerHTML = `
        <p><strong>${correct ? 'Correct.' : 'Not quite.'}</strong> ${item.explanation}</p>
        <button id="assessmentNext" class="button primary">${finalQuestion ? 'Finish assessment' : 'Next question'}</button>`;
      document.querySelector('#assessmentNext').addEventListener('click', () => {
        if (!finalQuestion) {
          state.assessmentIndex += 1;
          renderAssessmentQuestion();
          return;
        }
        state.baselineScore = Math.round((state.assessmentScore / assessmentQuestions.length) * 100);
        document.querySelector('#baselineScore').textContent = `${state.baselineScore}%`;
        document.querySelector('#assessmentBox').innerHTML = `
          <h2>Baseline complete</h2>
          <p>You answered ${state.assessmentScore} of ${assessmentQuestions.length} sample questions correctly. Your first session will circle back to the shaky topics before adding more cards.</p>`;
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
        source: `List of muscles Fall 2023.docx · ${record.section}`
      });
    });

    state.lectureCards.forEach(card => {
      if (card.reviewStatus !== 'approved') return;
      approved.push({
        front: card.front,
        back: card.back,
        tags: `${state.anki.tags} ${card.slideNumber ? 'slides-draft' : 'lecture-draft'} ${String(card.section || 'lecture').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        source: card.source || (card.status === 'provisional' ? 'Lecture transcript · student approved' : 'Lecture + class source')
      });
    });
    return approved;
  }

  async function exportApprovedCards() {
    const approved = collectApprovedCards();

    if (!approved.length) {
      showToast('Approve at least one card before exporting');
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`${approved.length} approved card${approved.length === 1 ? '' : 's'} exported to Anki`);
    } catch (error) {
      showToast(error.message);
    } finally {
      exportButton.textContent = 'Export this set';
      updateReviewSurface();
    }
  }

  function renderStudy() {
    const cards = studyCards();
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
    document.querySelector('#showAnswer').style.display = 'inline-flex';
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
  let lastTranscript = '';

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
        reviewStatus: existing?.reviewStatus || 'waiting'
      };
    });
    document.querySelector('#audioCardCountInline').textContent = state.lectureCards.length;
    document.querySelector('#lectureResultBar').hidden = state.lectureCards.length === 0;
    renderLectureDraftQueue();
  }

  function updateReviewSurface() {
    const total = state.lectureCards.length;
    const waiting = state.lectureCards.filter(card => card.reviewStatus === 'waiting').length;
    const approved = collectApprovedCards().length;
    document.querySelector('#reviewEmpty').hidden = total > 0;
    const exportButton = document.querySelector('#exportAnki');
    const studyButton = document.querySelector('#studyAccepted');
    exportButton.disabled = approved === 0;
    studyButton.disabled = approved === 0;
    exportButton.hidden = total === 0 && approved === 0;
    studyButton.hidden = total === 0 && approved === 0;
    document.querySelector('#homeReviewSummary').textContent = waiting
      ? `${waiting} card${waiting === 1 ? '' : 's'} need your eyes before Anki`
      : total
        ? 'Your latest lecture is fully reviewed'
        : 'No lecture cards waiting';
    document.querySelector('#reviewPageDescription').textContent = waiting
      ? `${waiting} card${waiting === 1 ? '' : 's'} need your eyes. Keep, tweak, or toss each one before anything reaches Anki.`
      : total
        ? `All ${total} cards from your latest lecture are reviewed. Export the ones you accepted whenever you are ready.`
        : 'Nothing reaches Anki until you approve it.';
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
    document.querySelector('#lectureDraftCount').textContent = `${waiting} waiting · ${approved} accepted`;
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
          <button class="button primary" data-lecture-action="approve">${card.reviewStatus === 'approved' ? 'Accepted' : 'Accept card'}</button>
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
      gate.innerHTML = '<strong>No source match yet</strong><span>The transcript is saved, but no cards enter the deck without a matched source or your approval.</span>';
      return;
    }
    if (verified && !provisional) {
      gate.className = 'source-gate matched';
      gate.innerHTML = `<strong>Course source matched</strong><span>${verified} concept${verified === 1 ? '' : 's'} traced to the class library. Cards are still editable before export.</span>`;
      return;
    }
    if (verified) {
      gate.className = 'source-gate review';
      gate.innerHTML = `<strong>Partial source match</strong><span>${verified} traced · ${provisional} lecture-only. The lecture-only set stays in review.</span>`;
      return;
    }
    gate.className = 'source-gate review';
    gate.innerHTML = `<strong>Outside the active class source</strong><span>${provisional} lecture concept${provisional === 1 ? '' : 's'} found. These cards are quarantined until you accept them.</span>`;
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
    document.querySelector('#audioCardCount').textContent = `${cards.length} ready`;
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

  async function processAudio(blob, filename, markers = []) {
    setAudioBusy(true, 'Checking lecture file');
    document.querySelector('#transcriptPanel').classList.remove('transcript-collapsed');
    document.querySelector('#toggleTranscript').textContent = 'Hide transcript';
    document.querySelector('#lastLectureSummary').hidden = false;
    document.querySelector('#lectureTitle').textContent = lectureName(filename);
    document.querySelector('#lectureSubtitle').textContent = 'Human Anatomy · checking source alignment';
    document.querySelector('#transcriptMeta').textContent = `${filename} · checking for an audio track`;
    document.querySelector('#transcriptContent').className = 'transcript-content empty';
    document.querySelector('#transcriptContent').innerHTML = '<p>Preparing a local, progressive transcript…</p>';
    document.querySelector('#transcriptWarnings').hidden = true;
    renderLectureInsights({});
    drawLectureProgress(0, 1);
    if (captureAudioUrl) URL.revokeObjectURL(captureAudioUrl);
    captureAudioUrl = URL.createObjectURL(blob);
    const player = document.querySelector('#captureAudio');
    player.src = captureAudioUrl;
    player.hidden = false;

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
          document.querySelector('#lectureSubtitle').textContent = `Human Anatomy · ${clock(session.duration)} source recording`;
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
          document.querySelector('#transcriptMeta').textContent = `${clock(event.durationSeconds)} lecture · ${event.processingSeconds}s local · ${session.cards.length} cards · review required`;
          document.querySelector('#copyTranscript').disabled = false;
          drawLectureProgress(event.durationSeconds, event.durationSeconds);
          const verifiedCount = session.notes.filter(note => note.status !== 'provisional').length;
          const reviewCount = session.notes.length - verifiedCount;
          document.querySelector('#lectureSubtitle').textContent = `Human Anatomy · ${clock(event.durationSeconds)} lecture · saved locally`;
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
    const units = `${sourceItem.unitCount.toLocaleString()} ${sourceItem.unitLabel}`;
    const words = `${sourceItem.wordCount.toLocaleString()} words`;
    const objectives = sourceItem.objectiveCount ? ` · ${sourceItem.objectiveCount} objective cues` : '';
    const drafts = sourceItem.draftCards?.length ? ` · ${sourceItem.draftCards.length} card drafts` : '';
    const processing = sourceItem.storage === 'session' ? 'session only' : 'on device';
    return `${sourceItem.kind} · ${units} · ${words}${objectives}${drafts} · ${processing}`;
  }

  function renderStoredSources() {
    document.querySelectorAll('.source-file-new').forEach(item => item.remove());
    const library = document.querySelector('#sourceLibrary');
    const defaultDocument = document.querySelector('#documentName')?.closest('.file-row');
    state.sources.forEach(sourceItem => {
      if (sourceItem.name === document.querySelector('#documentName')?.textContent) {
        defaultDocument.querySelector('span').textContent = sourceMeta(sourceItem);
        defaultDocument.querySelector('.status').textContent = 'Parsed';
        return;
      }
      const row = document.createElement('div');
      row.className = 'surface file-row source-file-new';
      row.innerHTML = `
        <div><strong>${escapeHtml(sourceItem.name)}</strong><span>${escapeHtml(sourceMeta(sourceItem))}</span></div>
        <span class="status">Parsed</span>`;
      library.appendChild(row);
    });
    document.querySelector('#sourceCount').textContent = `${2 + state.sources.filter(item => item.name !== document.querySelector('#documentName')?.textContent).length}`;
  }

  async function loadStoredSources() {
    try {
      const response = await fetch('/api/sources');
      if (!response.ok) return;
      const payload = await response.json();
      state.sources = payload.sources || [];
      renderStoredSources();
    } catch (_) {
      // Static preview remains usable when the local service is not running.
    }
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
      state.sources = state.sources.filter(item => item.id !== payload.source.id);
      state.sources.push(payload.source);
      renderStoredSources();
      const sourceCards = payload.source.draftCards || [];
      if (sourceCards.length) {
        state.latestSessionId = `source-${payload.source.id}`;
        const merged = [...state.lectureCards, ...sourceCards];
        const unique = [...new Map(merged.map(card => [lectureCardKey(card), card])).values()];
        syncLectureCards(unique);
      }
      showToast(sourceCards.length
        ? `${file.name} parsed · ${sourceCards.length} cards ready for review`
        : `${file.name} parsed locally`);
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
      document.querySelector('#lectureSubtitle').textContent = `Human Anatomy · ${clock(session.durationSeconds)} lecture · saved locally`;
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
      document.querySelector('#recordingSafety').textContent = 'Audio stays on this computer';
      if (recordingWakeLock) {
        await recordingWakeLock.release().catch(() => {});
        recordingWakeLock = null;
      }
      return;
    }

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
      mediaRecorder.addEventListener('stop', () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const savedMarkers = [...lectureMarkers];
        mediaRecorder = null;
        processAudio(blob, `lecture-${Date.now()}.webm`, savedMarkers);
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
        ? 'Recording locally · screen kept awake'
        : 'Recording locally · keep this screen open';
    } catch (error) {
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

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !mediaRecorder || mediaRecorder.state === 'inactive' || recordingWakeLock || !('wakeLock' in navigator)) return;
    await requestRecordingWakeLock();
  });

  document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
  document.querySelectorAll('[data-start-onboarding]').forEach(button => button.addEventListener('click', startClassSetup));
  document.querySelectorAll('[data-open-sample]').forEach(button => button.addEventListener('click', closeOnboarding));
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
  document.querySelector('#previewClass').addEventListener('click', closeOnboarding);
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
    state.account.signedIn = Boolean(detail.signedIn);
    state.account.email = detail.email || '';
    state.account.userId = detail.userId || '';
    saveAccount();
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
    processAudio(file, file.name);
    event.target.value = '';
  });
  document.querySelector('#useTestAudio').addEventListener('click', async () => {
    try {
      setAudioBusy(true, 'Loading real anatomy audio');
      const response = await fetch('test-audio/kenhub-tibialis-anterior-cc-by-3.webm');
      if (!response.ok) throw new Error('The included audio sample could not be loaded.');
      const blob = await response.blob();
      await processAudio(blob, 'kenhub-tibialis-anterior-cc-by-3.webm');
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

  document.querySelector('#onboardingSyllabus').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    state.syllabusName = file.name;
    document.querySelector('#onboardingSyllabusName').textContent = file.name;
    uploadSource(file, 'syllabus').catch(() => {});
  });
  document.querySelector('#useDemoSyllabus').addEventListener('click', () => {
    state.syllabusName = 'Demo syllabus';
    document.querySelector('#onboardingSyllabusName').textContent = 'Demo syllabus selected';
    showToast('Demo syllabus added');
  });
  document.querySelectorAll('.mock-connect').forEach(button => button.addEventListener('click', () => {
    button.textContent = 'Planned';
    button.disabled = true;
  }));
  document.querySelector('#startAssessment').addEventListener('click', () => {
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
    document.querySelector('#currentClassName').textContent = className;
    document.querySelector('#currentClassNameMobile').textContent = className;
    document.querySelector('#currentClassTerm').textContent = term;
    document.querySelector('#syllabusName').textContent = state.syllabusName;
    document.querySelector('#syllabusMeta').textContent = state.syllabusName === 'Demo syllabus'
      ? 'Demo syllabus used for this prototype'
      : 'Added during class setup · ready for the syllabus parser';
    document.querySelector('#syllabusStatus').textContent = state.syllabusName === 'Demo syllabus' ? 'Mapped' : 'Selected';
    document.querySelector('#classSwitcher').setAttribute('aria-label', `Open ${className} class materials`);
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
    document.querySelector('#syllabusName').textContent = file.name;
    document.querySelector('#syllabusMeta').textContent = 'Reading locally…';
    document.querySelector('#syllabusStatus').textContent = 'Reading';
    try {
      const sourceItem = await uploadSource(file, 'syllabus');
      document.querySelector('#syllabusMeta').textContent = sourceMeta(sourceItem);
      document.querySelector('#syllabusStatus').textContent = 'Parsed';
    } catch (_) {
      document.querySelector('#syllabusMeta').textContent = 'Could not parse this syllabus';
      document.querySelector('#syllabusStatus').textContent = 'Check file';
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
    showToast(action === 'approve' ? 'Lecture card accepted' : 'Lecture card left out');
  });
  document.querySelector('#reviewAudioCards').addEventListener('click', () => {
    window.setTimeout(() => document.querySelector('#lectureDraftSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  });

  document.querySelectorAll('.card-type').forEach(input => input.addEventListener('change', updateGenerationCount));
  document.querySelector('#generateCards').addEventListener('click', () => {
    if (!state.selectedTypes.length) return showToast('Choose at least one card type');
    if (!state.selectedTypes.includes(state.field)) state.field = state.selectedTypes[0];
    document.querySelector('#classCardWorkspace').hidden = false;
    document.querySelector('#toggleClassCards').textContent = 'Close the full class card library';
    navigate('cards');
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
    showToast('Card approved');
    advanceRecord();
  });

  document.querySelector('#showAnswer').addEventListener('click', () => {
    document.querySelector('#studyAnswer').classList.add('open');
    document.querySelector('#showAnswer').style.display = 'none';
    document.querySelector('#ratingControls').classList.add('open');
  });

  document.querySelectorAll('.rating').forEach(button => button.addEventListener('click', () => {
    const cards = studyCards();
    state.reviewCount += 1;
    document.querySelector('#reviewCount').textContent = state.reviewCount;
    showToast(`${button.dataset.rating} recorded`);
    state.studyIndex = (state.studyIndex + 1) % cards.length;
    renderStudy();
  }));

  renderSource();
  updateGenerationCount();
  renderEditor();
  renderStudy();
  drawWaveform();
  syncStateToOnboardingAnki();
  syncAnkiFormFromState();
  document.querySelector('#examDateInput').value = nextExamEvent()?.date || dateAfter(12);
  document.querySelector('#calendarEventDate').value = dateAfter(1);
  renderClassPlanner();
  updateWorkflowCompanion('home');
  showLanding();
  detectRuntimeCapabilities();
  loadStoredSources();
  restoreLatestSession();
})();
