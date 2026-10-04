(() => {
  const source = window.MUSCLE_SOURCE;
  const records = source.records;
  const savedAccount = storedJson('syllabloom-account', {});
  const cachedAccountUserId = savedAccount.userId || '';
  const savedClassProfile = storedJson('syllabloom-class-profile', {
    mode: 'custom',
    className: 'Untitled class',
    term: 'Term not set',
    syllabusName: 'No syllabus added',
    useDemoSyllabus: false,
    includeSampleMaterial: false
  });
  const savedSources = storedJson('syllabloom-sources', []);
  let classProfileOwnerId = savedClassProfile.ownerUserId || cachedAccountUserId;
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
  const savedCourseState = storedJson('syllabloom-course-state', {});
  const betaClassLimit = 1;

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
    deck: '',
    setName: '',
    presetName: 'Syllabloom FSRS',
    format: 'Basic',
    answerStyle: 'Concise',
    questionStyle: 'balanced',
    dailyLimit: 20,
    newPerDay: 20,
    reviewsPerDay: 9999,
    tags: '',
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
  const questionStyleDescriptions = {
    balanced: 'Focused retrieval questions with a source-supported mix of definitions, mechanisms, and cause/effect.',
    direct: 'One clear short-answer recall prompt per card; avoids multi-part or broad summary questions.',
    explain: 'Focused how/why questions about mechanisms or causes the source explicitly explains.',
    compare: 'Compare/contrast prompts only when the source clearly covers both concepts; otherwise it falls back to recall.',
    apply: 'Application prompts use examples already in your material—never an invented case or outside facts.'
  };
  const questionStyleLabels = {
    balanced: 'Balanced recall',
    direct: 'Direct recall',
    explain: 'Explain why/how',
    compare: 'Compare concepts',
    apply: 'Apply a course example'
  };
  const allowedQuestionStyles = new Set(Object.keys(questionStyleDescriptions));

  function normalizedQuestionStyle(value) {
    return allowedQuestionStyles.has(value) ? value : 'balanced';
  }

  const initialCalendarEvents = [
    { id: 'lecture-upper-limb', date: dateAfter(1), type: 'lecture', title: 'Upper limb lecture' },
    { id: 'quiz-attachments', date: dateAfter(5), type: 'quiz', title: 'Attachment quiz' },
    { id: 'exam-one', date: dateAfter(12), type: 'exam', title: 'Exam 1' }
  ];

  const state = {
    view: 'home',
    selectedId: records[0].id,
    field: 'attachment',
    statuses: savedCourseState.statuses || {},
    edits: savedCourseState.edits || {},
    studyIndex: 0,
    studyFocusConcept: '',
    reviewCount: savedReviewHistory.length,
    reviewHistory: savedReviewHistory,
    planCorrections: 0,
    setupStep: 1,
    className: savedClassProfile.className || 'Untitled class',
    classTerm: savedClassProfile.term || 'Term not set',
    classMode: savedClassProfile.mode || 'custom',
    syllabusName: savedClassProfile.syllabusName || 'No syllabus added',
    useDemoSyllabus: Boolean(savedClassProfile.useDemoSyllabus),
    includeSampleMaterial: savedClassProfile.includeSampleMaterial === true,
    assessmentIndex: 0,
    assessmentScore: 0,
    quickCheckQuestions: [],
    quickCheckIndex: 0,
    quickCheckScore: 0,
    quickCheckRound: 0,
    baselineScore: savedCourseState.baselineAssessed === true
      ? Math.min(100, Math.max(0, Number(savedCourseState.baselineScore) || 0))
      : 0,
    baselineAssessed: savedCourseState.baselineAssessed === true,
    lectureCards: [],
    sources: Array.isArray(savedSources) ? savedSources : [],
    latestSessionId: null,
    anki: { ...defaultAnkiPreferences, ...storedJson('syllabloom-anki-preferences', {}) },
    calendarEvents: storedJson('syllabloom-calendar-events', savedClassProfile.mode === 'sample' ? initialCalendarEvents : []),
    calendarCursor: new Date(),
    showFederalHolidays: localStorage.getItem('syllabloom-show-federal-holidays') !== 'false',
    dailyStudyMinutes: Number(savedCourseState.dailyStudyMinutes) || 35,
    selectedTypes: ['attachment', 'action', 'innervation'],
    creatingClass: false,
    pendingClassSetup: false,
    pendingClassResume: false,
    cloudBeta: false,
    hostedTranscription: false,
    missCounts: storedJson('syllabloom-miss-counts', {}),
    missedItem: null,
    account: {
      classesUsed: 0,
      ...savedAccount,
      plan: 'free',
      classLimit: betaClassLimit,
      signedIn: false,
      email: '',
      userId: '',
      displayName: '',
      imageUrl: ''
    }
  };
  state.anki.questionStyle = normalizedQuestionStyle(state.anki.questionStyle);

  const appViews = new Set(['home', 'capture', 'source', 'knowledge', 'profile', 'billing', 'cards', 'study', 'quick-check']);
  const marketingHashes = new Set(['landing', 'how-it-works', 'anki-first', 'made-for-class', 'pricing']);
  let restoringShellHistory = false;

  const syncedStorageKeys = new Set([
    'syllabloom-class-profile',
    'syllabloom-sources',
    'syllabloom-anki-preferences',
    'syllabloom-calendar-events',
    'syllabloom-review-history',
    'syllabloom-miss-counts',
    'syllabloom-course-state'
  ]);
  let cloudSyncUserId = '';
  let cloudSyncRevision = 0;
  let cloudSyncReady = false;
  let cloudSyncInitializing = false;
  let cloudSyncApplying = false;
  let cloudSyncDirty = false;
  let cloudSyncInFlight = false;
  let cloudSyncTimer = 0;
  let cloudSyncPollTimer = 0;
  let cloudSyncErrorShown = false;
  let calendarOcrLibraryPromise = null;
  let sourcePdfLibraryPromise = null;
  let calendarImportOcrText = '';
  let sourceQueueItems = [];
  const importStore = window.SyllabloomImportStore.createStore();
  let importOwner = '';
  let importRestore = Promise.resolve();

  async function persistImportQueue(owner = importOwner, items = sourceQueueItems) {
    try { await importStore.save(owner, items); }
    catch (_) {
      if (owner === importOwner) {
        sourceBatchFeedback = 'This browser could not save import recovery. Keep this tab open until the import finishes.';
        renderSourceQueue();
      }
    }
  }

  function restoreImportQueue(owner) {
    if (owner === importOwner) return;
    const anonymousItems = !importOwner && owner ? sourceQueueItems : [];
    importOwner = owner;
    sourceQueueItems = [];
    importRestore = (async () => {
      try {
        const items = owner ? await importStore.load(owner) : [];
        if (owner !== importOwner) return;
        sourceQueueItems = [...items, ...anonymousItems];
        if (anonymousItems.length) await persistImportQueue(owner, sourceQueueItems);
        if (sourceQueueItems.length) sourceBatchFeedback = 'Your unfinished import was restored and is ready to continue.';
        renderSourceQueue();
      } catch (_) {
        if (owner === importOwner) { sourceQueueItems=anonymousItems; renderSourceQueue(); showToast('Import recovery storage is unavailable on this browser. Keep this tab open.'); }
      }
    })();
  }

  let sourceBatchRunning = false;
  let sourceBatchProgress = null;
  let sourceBatchFeedback = '';

  function isSyncedStorageKey(key) {
    return syncedStorageKeys.has(key) || key.startsWith('rounds-review-');
  }

  function persistCourseState() {
    localStorage.setItem('syllabloom-course-state', JSON.stringify({
      statuses: state.statuses,
      edits: state.edits,
      dailyStudyMinutes: state.dailyStudyMinutes,
      baselineScore: state.baselineScore,
      baselineAssessed: state.baselineAssessed
    }));
  }

  function cloudUserData() {
    const lectureReviews = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('rounds-review-')) continue;
      try {
        lectureReviews[key] = JSON.parse(localStorage.getItem(key) || '[]');
      } catch (_) {
        lectureReviews[key] = [];
      }
    }
    return {
      schemaVersion: 1,
      classProfile: {
        mode: state.classMode,
        className: state.className,
        term: state.classTerm,
        syllabusName: state.syllabusName,
        useDemoSyllabus: state.useDemoSyllabus,
        includeSampleMaterial: state.includeSampleMaterial,
        ownerUserId: cloudSyncUserId
      },
      sources: state.sources,
      ankiPreferences: state.anki,
      calendarEvents: state.calendarEvents,
      reviewHistory: state.reviewHistory.slice(-2000),
      missCounts: state.missCounts,
      courseState: {
        statuses: state.statuses,
        edits: state.edits,
        dailyStudyMinutes: state.dailyStudyMinutes,
        baselineScore: state.baselineScore,
        baselineAssessed: state.baselineAssessed
      },
      lectureReviews,
      classesUsed: accountClassUsage()
    };
  }

  function applyCloudUserData(data, updatedAt, revision) {
    if (!data || data.schemaVersion !== 1) return false;
    cloudSyncApplying = true;
    cloudSyncDirty = false;
    state.classMode = data.classProfile?.mode || 'custom';
    state.className = data.classProfile?.className || 'Untitled class';
    state.classTerm = data.classProfile?.term || 'Term not set';
    state.syllabusName = data.classProfile?.syllabusName || 'No syllabus added';
    state.useDemoSyllabus = Boolean(data.classProfile?.useDemoSyllabus);
    state.includeSampleMaterial = data.classProfile?.includeSampleMaterial === true;
    classProfileOwnerId = cloudSyncUserId;
    state.sources = Array.isArray(data.sources) ? data.sources : [];
    state.lectureCards = [];
    state.latestSessionId = null;
    state.anki = { ...defaultAnkiPreferences, ...(data.ankiPreferences || {}) };
    state.anki.questionStyle = normalizedQuestionStyle(state.anki.questionStyle);
    state.calendarEvents = Array.isArray(data.calendarEvents) ? data.calendarEvents : [];
    state.reviewHistory = Array.isArray(data.reviewHistory) ? data.reviewHistory.slice(-2000) : [];
    state.reviewCount = state.reviewHistory.length;
    document.querySelector('#reviewCount').textContent = String(state.reviewCount);
    state.missCounts = data.missCounts && typeof data.missCounts === 'object' ? data.missCounts : {};
    state.statuses = data.courseState?.statuses && typeof data.courseState.statuses === 'object' ? data.courseState.statuses : {};
    state.edits = data.courseState?.edits && typeof data.courseState.edits === 'object' ? data.courseState.edits : {};
    state.dailyStudyMinutes = Math.min(240, Math.max(10, Number(data.courseState?.dailyStudyMinutes) || 35));
    state.baselineAssessed = data.courseState?.baselineAssessed === true;
    state.baselineScore = state.baselineAssessed
      ? Math.min(100, Math.max(0, Number(data.courseState?.baselineScore) || 0))
      : 0;
    state.account.classesUsed = Math.max(0, Number(data.classesUsed) || 0);

    localStorage.setItem('syllabloom-class-profile', JSON.stringify({ ...data.classProfile, ownerUserId: cloudSyncUserId }));
    localStorage.setItem('syllabloom-sources', JSON.stringify(state.sources));
    localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    localStorage.setItem('syllabloom-review-history', JSON.stringify(state.reviewHistory));
    localStorage.setItem('syllabloom-miss-counts', JSON.stringify(state.missCounts));
    persistCourseState();
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('rounds-review-')) localStorage.removeItem(key);
    }
    Object.entries(data.lectureReviews || {}).forEach(([key, value]) => {
      if (key.startsWith('rounds-review-')) localStorage.setItem(key, JSON.stringify(value));
    });
    localStorage.setItem('syllabloom-cloud-sync-owner', cloudSyncUserId);
    localStorage.setItem('syllabloom-cloud-sync-revision', String(revision || 0));
    localStorage.setItem('syllabloom-cloud-sync-updated-at', updatedAt || '');
    localStorage.setItem('syllabloom-cloud-local-updated-at', '0');
    localStorage.setItem('rounds-onboarded', state.classMode === 'custom' ? '1' : '0');
    saveAccount();
    cloudSyncRevision = Number(revision) || 0;
    cloudSyncApplying = false;
    setClassLabels(state.className, state.classTerm);
    syncAnkiFormFromState();
    document.querySelector('#dailyStudyMinutes').value = String(state.dailyStudyMinutes);
    document.querySelector('#examDateInput').value = nextExamEvent()?.date || dateAfter(12);
    loadStoredSources().then(() => {
      renderSource();
      updateGenerationCount();
      renderEditor();
      renderStudy();
      renderClassPlanner();
      renderProfile();
      renderHomeForActiveClass();
      updateAssessmentIntro();
    });
    return true;
  }

  async function cloudRequest(method, payload = null, userId = cloudSyncUserId) {
    const token = await window.SyllabloomAuth?.getToken?.();
    if (!token || !state.account.signedIn || state.account.userId !== userId || cloudSyncUserId !== userId) {
      throw Object.assign(new Error('Sign in again to sync this workspace.'), { status: 401 });
    }
    const response = await fetch('/api/user-data', {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json' } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Cloud sync could not complete.'), { status: response.status });
    return result;
  }

  async function flushCloudSync() {
    if (!cloudSyncReady || !cloudSyncDirty || cloudSyncInFlight || !state.account.signedIn || !cloudSyncUserId) return;
    const userId = cloudSyncUserId;
    cloudSyncInFlight = true;
    cloudSyncDirty = false;
    try {
      const result = await cloudRequest('PUT', { expectedRevision: cloudSyncRevision, data: cloudUserData() }, userId);
      if (cloudSyncUserId !== userId || state.account.userId !== userId) return;
      cloudSyncRevision = Number(result.revision) || cloudSyncRevision;
      cloudSyncApplying = true;
      localStorage.setItem('syllabloom-cloud-sync-revision', String(cloudSyncRevision));
      localStorage.setItem('syllabloom-cloud-sync-updated-at', result.updatedAt || '');
      localStorage.setItem('syllabloom-cloud-local-updated-at', '0');
      cloudSyncApplying = false;
      cloudSyncErrorShown = false;
    } catch (error) {
      cloudSyncDirty = true;
      if (error.status === 409) {
        try {
          const remote = await cloudRequest('GET', null, userId);
          if (remote.data && cloudSyncUserId === userId && state.account.userId === userId) {
            localStorage.setItem('syllabloom-cloud-local-recovery', JSON.stringify(cloudUserData()));
            applyCloudUserData(remote.data, remote.updatedAt, remote.revision);
            cloudSyncReady = true;
            showToast('A newer workspace was saved on another device. Your unsynced copy is kept on this device.');
          }
        } catch (_) {
          // Keep local data queued; a later reconnect or page visit can retry.
        }
      } else if (!cloudSyncErrorShown && error.status !== 401) {
        cloudSyncErrorShown = true;
        showToast('Saved on this device. Cloud sync will retry when the connection is back.');
      }
    } finally {
      cloudSyncInFlight = false;
      if (cloudSyncDirty && cloudSyncReady) window.setTimeout(flushCloudSync, 1200);
    }
  }

  function queueCloudSync() {
    if (cloudSyncApplying) return;
    localStorage.setItem('syllabloom-cloud-local-updated-at', String(Date.now()));
    if (!cloudSyncReady || !state.account.signedIn || !cloudSyncUserId) {
      cloudSyncDirty = true;
      return;
    }
    cloudSyncDirty = true;
    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(flushCloudSync, 900);
  }

  async function refreshCloudWorkspace() {
    if (!cloudSyncReady || !state.account.signedIn || !cloudSyncUserId || cloudSyncDirty || cloudSyncInFlight) return;
    const userId = cloudSyncUserId;
    try {
      const remote = await cloudRequest('GET', null, userId);
      if (cloudSyncUserId !== userId || state.account.userId !== userId) return;
      if (Number(remote.revision) <= cloudSyncRevision || !remote.data) return;
      if (applyCloudUserData(remote.data, remote.updatedAt, remote.revision)) showToast('Your workspace was updated from another device.');
    } catch (_) {
      // Offline reads do not interrupt the locally saved workspace.
    }
  }

  async function initializeCloudWorkspace(userId) {
    if (!userId || !state.account.signedIn) return;
    if (cloudSyncUserId === userId && cloudSyncReady) return refreshCloudWorkspace();
    if (cloudSyncInitializing) return;
    cloudSyncInitializing = true;
    cloudSyncUserId = userId;
    cloudSyncReady = false;
    cloudSyncRevision = 0;
    cloudSyncDirty = false;
    window.clearInterval(cloudSyncPollTimer);
    try {
      const remote = await cloudRequest('GET', null, userId);
      if (cloudSyncUserId !== userId || state.account.userId !== userId) return;
      const localOwner = localStorage.getItem('syllabloom-cloud-sync-owner') || classProfileOwnerId || cachedAccountUserId;
      if (localOwner && localOwner !== userId) {
        if (remote.data) {
          applyCloudUserData(remote.data, remote.updatedAt, remote.revision);
        } else {
          cloudSyncApplying = true;
          for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key && (isSyncedStorageKey(key) || key === 'syllabloom-cloud-local-updated-at')) localStorage.removeItem(key);
          }
          localStorage.setItem('syllabloom-cloud-sync-owner', userId);
          cloudSyncApplying = false;
          window.location.reload();
          return;
        }
      } else if (remote.data) {
        const localUpdatedAt = Number(localStorage.getItem('syllabloom-cloud-local-updated-at')) || 0;
        const remoteUpdatedAt = Date.parse(remote.updatedAt || '') || 0;
        if (localOwner === userId && localUpdatedAt > remoteUpdatedAt + 5000) {
          cloudSyncRevision = Number(remote.revision) || 0;
          cloudSyncReady = true;
          cloudSyncDirty = true;
          await flushCloudSync();
        } else {
          applyCloudUserData(remote.data, remote.updatedAt, remote.revision);
          showToast('Your saved class workspace is ready on this device.');
        }
      } else {
        cloudSyncRevision = 0;
        cloudSyncReady = true;
        classProfileOwnerId = userId;
        persistClassProfile();
        cloudSyncDirty = true;
        await flushCloudSync();
        showToast('Your class and study settings are now syncing with your account.');
      }
      cloudSyncRevision = Math.max(Number(remote.revision) || 0, cloudSyncRevision);
      cloudSyncReady = true;
      cloudSyncPollTimer = window.setInterval(() => {
        if (cloudSyncReady) refreshCloudWorkspace();
        else initializeCloudWorkspace(cloudSyncUserId);
      }, 60_000);
      if (cloudSyncDirty) window.setTimeout(flushCloudSync, 1000);
    } catch (error) {
      cloudSyncReady = false;
      if (!cloudSyncErrorShown && error.status !== 401) {
        cloudSyncErrorShown = true;
        showToast('This workspace is saved on this device. Cloud sync will retry when available.');
      }
      window.clearInterval(cloudSyncPollTimer);
      cloudSyncPollTimer = window.setInterval(() => initializeCloudWorkspace(cloudSyncUserId), 60_000);
    }
    finally {
      cloudSyncInitializing = false;
      if (state.account.signedIn && state.account.userId && state.account.userId !== cloudSyncUserId) {
        initializeCloudWorkspace(state.account.userId);
      }
    }
  }

  const originalStorageSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    originalStorageSetItem.call(this, key, value);
    if (this === window.localStorage && isSyncedStorageKey(String(key))) queueCloudSync();
  };
  window.addEventListener('focus', () => {
    if (cloudSyncReady) refreshCloudWorkspace();
    else if (cloudSyncUserId && state.account.signedIn) initializeCloudWorkspace(cloudSyncUserId);
  });
  window.addEventListener('online', () => {
    if (cloudSyncUserId && state.account.signedIn) {
      if (cloudSyncReady) queueCloudSync();
      else initializeCloudWorkspace(cloudSyncUserId);
    }
  });

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
      explanation: 'The source lists the masseteric nerve from the mandibular division of the trigeminal nerve.',
      sampleMuscle: 'Masseter',
      sampleField: 'innervation'
    },
    {
      question: 'Which muscle elevates and retracts the mandible?',
      options: ['Temporalis', 'Buccinator', 'Lateral pterygoid', 'Platysma'],
      correct: 0,
      explanation: 'The temporalis elevates and retracts the mandible.',
      sampleMuscle: 'Temporalis',
      sampleField: 'action'
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
      explanation: 'The source connects the lateral tibia and interosseous membrane to the medial cuneiform and first metatarsal.',
      sampleMuscle: 'Tibialis anterior',
      sampleField: 'attachment'
    }
  ];

  function sourceAssessmentQuestions() {
    return window.SyllabloomSourceStudy.quickCheckItems(state.lectureCards);
  }

  function rotatingQuickCheckQuestions() {
    return window.SyllabloomSourceStudy.quickCheckItems(state.lectureCards, 3, {
      missCounts: state.missCounts,
      offset: state.quickCheckRound * 3
    });
  }

  function activeAssessmentQuestions() {
    return state.includeSampleMaterial ? assessmentQuestions : sourceAssessmentQuestions();
  }

  function sourceConceptNames() {
    return [...new Set([
      ...state.sources.flatMap(sourceItem => (sourceItem.concepts || [])
        .map(concept => String(concept?.name || concept || '').trim())
        .filter(Boolean)),
      ...state.lectureCards.map(card => String(card.section || card.concept || '').trim()).filter(Boolean)
    ])];
  }

  function updateAssessmentIntro() {
    const title = document.querySelector('#assessmentIntroTitle');
    const copy = document.querySelector('#assessmentIntroCopy');
    const start = document.querySelector('#startAssessment');
    if (!title || !copy || !start) return;
    const questions = activeAssessmentQuestions();
    if (!state.includeSampleMaterial && questions.length) {
      title.textContent = 'Quick check across your class';
      copy.textContent = `${questions.length} source-backed recall prompt${questions.length === 1 ? '' : 's'} from your materials. Reveal each answer, then mark whether you knew it.`;
    } else if (!state.includeSampleMaterial) {
      title.textContent = 'Add material to start your check';
      copy.textContent = 'Upload slides, notes, or an authorized assessment with source-backed cards. Your first questions will appear here with their source references.';
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

  function initializeSourceKindPicker() {
    const picker = document.querySelector('#sourceKindPicker');
    const select = document.querySelector('#sourceKind');
    const trigger = document.querySelector('#sourceKindTrigger');
    const label = document.querySelector('#sourceKindLabel');
    const menu = document.querySelector('#sourceKindMenu');
    const options = [...document.querySelectorAll('[data-source-kind-value]')];
    if (!picker || !select || !trigger || !label || !menu || !options.length) return;

    const supportsPopover = typeof menu.showPopover === 'function';
    if (!supportsPopover) {
      menu.removeAttribute('popover');
      menu.hidden = true;
    }

    const isOpen = () => supportsPopover ? menu.matches(':popover-open') : !menu.hidden;

    const syncSelection = () => {
      const selected = options.find(option => option.dataset.sourceKindValue === select.value) || options[0];
      label.textContent = selected.textContent.trim();
      options.forEach(option => option.setAttribute('aria-selected', option === selected ? 'true' : 'false'));
      return selected;
    };

    const positionMenu = () => {
      if (!isOpen()) return;
      const rect = trigger.getBoundingClientRect();
      const gutter = 12;
      const width = Math.max(rect.width, 220);
      const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter));
      const menuHeight = menu.offsetHeight;
      const openAbove = rect.bottom + 8 + menuHeight > window.innerHeight - gutter && rect.top > menuHeight + gutter;
      menu.style.width = `${width}px`;
      menu.style.left = `${left}px`;
      menu.style.top = `${openAbove ? rect.top - menuHeight - 8 : rect.bottom + 8}px`;
    };

    const setOpenState = open => {
      picker.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const openMenu = focusTarget => {
      if (isOpen()) return;
      if (supportsPopover) menu.showPopover();
      else menu.hidden = false;
      setOpenState(true);
      window.requestAnimationFrame(() => {
        positionMenu();
        const selected = syncSelection();
        (focusTarget === 'last' ? options.at(-1) : selected).focus();
      });
    };

    const closeMenu = ({ restoreFocus = false } = {}) => {
      if (!isOpen()) return;
      if (supportsPopover) menu.hidePopover();
      else menu.hidden = true;
      setOpenState(false);
      if (restoreFocus) trigger.focus();
    };

    const chooseOption = option => {
      select.value = option.dataset.sourceKindValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncSelection();
      closeMenu({ restoreFocus: true });
    };

    trigger.addEventListener('click', () => {
      if (isOpen()) closeMenu();
      else openMenu('selected');
    });

    trigger.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openMenu(event.key === 'ArrowUp' ? 'last' : 'selected');
    });

    options.forEach(option => option.addEventListener('click', () => chooseOption(option)));

    menu.addEventListener('keydown', event => {
      const currentIndex = options.indexOf(document.activeElement);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + options.length) % options.length;
      else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = options.length - 1;
      else if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      } else if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
        event.preventDefault();
        chooseOption(options[currentIndex]);
        return;
      } else {
        return;
      }
      event.preventDefault();
      options[nextIndex].focus();
    });

    if (supportsPopover) {
      menu.addEventListener('toggle', event => setOpenState(event.newState === 'open'));
    } else {
      document.addEventListener('pointerdown', event => {
        if (isOpen() && !picker.contains(event.target) && !menu.contains(event.target)) closeMenu();
      });
    }

    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, { passive: true, capture: true });
    select.addEventListener('change', syncSelection);
    syncSelection();
  }

  function initializeThemedSelectPickers() {
    document.querySelectorAll('[data-themed-select-picker]').forEach(picker => {
      if (picker.dataset.themedSelectReady === 'true') return;
      const select = picker.querySelector('select');
      const trigger = picker.querySelector('.source-kind-trigger');
      const label = trigger?.querySelector('[data-select-current]');
      const menu = picker.querySelector('.source-kind-menu');
      const options = [...(menu?.querySelectorAll('[data-select-value]') || [])];
      if (!select || !trigger || !label || !menu || !options.length) return;
      picker.dataset.themedSelectReady = 'true';

      const supportsPopover = typeof menu.showPopover === 'function';
      if (!supportsPopover) {
        menu.removeAttribute('popover');
        menu.hidden = true;
      }

      const isOpen = () => supportsPopover ? menu.matches(':popover-open') : !menu.hidden;
      const syncSelection = () => {
        const selected = options.find(option => option.dataset.selectValue === select.value) || options[0];
        label.textContent = selected.textContent.trim();
        options.forEach(option => option.setAttribute('aria-selected', option === selected ? 'true' : 'false'));
        return selected;
      };
      const positionMenu = () => {
        if (!isOpen()) return;
        const rect = trigger.getBoundingClientRect();
        const gutter = 12;
        const maxWidth = Math.max(160, window.innerWidth - gutter * 2);
        const width = Math.min(Math.max(rect.width, 184), maxWidth);
        const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, window.innerWidth - width - gutter));
        const menuHeight = menu.offsetHeight;
        const openAbove = rect.bottom + 8 + menuHeight > window.innerHeight - gutter && rect.top > menuHeight + gutter;
        menu.style.width = `${width}px`;
        menu.style.left = `${left}px`;
        menu.style.top = `${openAbove ? rect.top - menuHeight - 8 : rect.bottom + 8}px`;
      };
      const setOpenState = open => {
        picker.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      const closeMenu = ({ restoreFocus = false } = {}) => {
        if (!isOpen()) return;
        if (supportsPopover) menu.hidePopover();
        else menu.hidden = true;
        setOpenState(false);
        if (restoreFocus) trigger.focus();
      };
      const openMenu = focusLast => {
        if (isOpen()) return;
        if (supportsPopover) menu.showPopover();
        else menu.hidden = false;
        setOpenState(true);
        window.requestAnimationFrame(() => {
          positionMenu();
          const selected = syncSelection();
          (focusLast ? options.at(-1) : selected).focus();
        });
      };
      const chooseOption = option => {
        select.value = option.dataset.selectValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSelection();
        closeMenu({ restoreFocus: true });
      };

      trigger.addEventListener('click', () => isOpen() ? closeMenu() : openMenu(false));
      trigger.addEventListener('keydown', event => {
        if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openMenu(event.key === 'ArrowUp');
      });
      options.forEach(option => option.addEventListener('click', () => chooseOption(option)));
      menu.addEventListener('keydown', event => {
        const currentIndex = options.indexOf(document.activeElement);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + options.length) % options.length;
        else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = options.length - 1;
        else if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu({ restoreFocus: true });
          return;
        } else if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
          event.preventDefault();
          chooseOption(options[currentIndex]);
          return;
        } else {
          return;
        }
        event.preventDefault();
        options[nextIndex].focus();
      });
      if (supportsPopover) menu.addEventListener('toggle', event => setOpenState(event.newState === 'open'));
      else document.addEventListener('pointerdown', event => {
        if (isOpen() && !picker.contains(event.target) && !menu.contains(event.target)) closeMenu();
      });
      window.addEventListener('resize', positionMenu);
      window.addEventListener('scroll', positionMenu, { passive: true, capture: true });
      select.addEventListener('change', syncSelection);
      syncSelection();
    });
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
    const deck = state.anki.deck.trim() || state.className.trim() || 'Syllabloom';
    const setName = state.anki.setName.trim();
    return setName ? `${deck}::${setName}` : deck;
  }

  const ankiDesktopSettings = storedJson('syllabloom-anki-desktop-settings', { autoSync: false, ownerId: '' });
  let ankiDesktopConnected = false;

  function syncAnkiFormFromState() {
    const values = {
      '#ankiDeckNameFull': state.anki.deck,
      '#ankiSetNameFull': state.anki.setName,
      '#ankiPresetName': state.anki.presetName,
      '#ankiTagsFull': state.anki.tags,
      '#ankiFormatFull': state.anki.format,
      '#ankiAnswerStyleFull': state.anki.answerStyle,
      '#questionStyleFull': normalizedQuestionStyle(state.anki.questionStyle),
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
    syncQuestionStyleControls(state.anki.questionStyle);
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

  function syncQuestionStyleControls(value = state.anki.questionStyle) {
    const style = normalizedQuestionStyle(value);
    state.anki.questionStyle = style;
    document.querySelectorAll('.question-style-select').forEach(select => {
      select.value = style;
    });
    renderQuestionStyleDescriptions(style);
  }

  function renderQuestionStyleDescriptions(value) {
    const style = normalizedQuestionStyle(value);
    document.querySelectorAll('[data-question-style-description]').forEach(description => {
      description.textContent = questionStyleDescriptions[style];
    });
  }

  function setQuestionStyle(value) {
    state.anki.questionStyle = normalizedQuestionStyle(value);
    syncQuestionStyleControls(state.anki.questionStyle);
    localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
  }

  function syncAnkiStateFromForm() {
    const text = selector => document.querySelector(selector).value.trim();
    const checked = selector => document.querySelector(selector).checked;
    state.anki = {
      ...state.anki,
      deck: text('#ankiDeckNameFull') || state.className.trim() || 'Syllabloom',
      setName: text('#ankiSetNameFull'),
      presetName: text('#ankiPresetName') || 'Syllabloom',
      tags: text('#ankiTagsFull'),
      format: document.querySelector('#ankiFormatFull').value,
      answerStyle: document.querySelector('#ankiAnswerStyleFull').value,
      questionStyle: normalizedQuestionStyle(document.querySelector('#questionStyleFull')?.value),
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
    syncQuestionStyleControls(state.anki.questionStyle);
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
    state.anki.questionStyle = normalizedQuestionStyle(document.querySelector('#questionStyleOnboarding')?.value || state.anki.questionStyle);
  }

  function syncStateToOnboardingAnki() {
    document.querySelector('#ankiDeckName').value = state.anki.deck;
    document.querySelector('#ankiDailyLimit').value = state.anki.newPerDay;
    document.querySelector('#ankiTags').value = state.anki.tags;
    syncQuestionStyleControls(state.anki.questionStyle);
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
      'weakest-deadline': 'missed topics paced to the next deadline',
      weakest: 'most-missed topics first',
      syllabus: 'syllabus order',
      'recent-source': 'the most recent source first'
    })[value] || 'source order until study results are available';
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
    const hasWeaknessEvidence = state.lectureCards.some(card => Number(state.missCounts[`lecture-${card.id}`]) > 0);
    const chosenStrategy = strategy === 'syllabus'
      ? 'source order'
      : strategy === 'recent-source'
        ? 'the latest source first'
        : hasWeaknessEvidence
          ? releaseStrategyLabel(strategy)
          : 'source order until study results identify weak topics';
    if (scheduler) scheduler.textContent = `${orderLabels[order] || orderLabels.after}. New-card selection: ${chosenStrategy}. Anki schedules review intervals after export.`;
    if (history) history.textContent = enabled
      ? `${state.reviewCount} answer${state.reviewCount === 1 ? '' : 's'} recorded here. Anki schedules review intervals after export.`
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
    const exportHeading = document.querySelector('#ankiExportHeading');
    if (count) count.textContent = approvedLabel;
    if (exportHeading) exportHeading.textContent = `Export ${fullDeck} cards to Anki`;
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

  function sourceEvidenceDetailsMarkup(sourceName, location, quote, className = '') {
    const excerpt = String(quote || '').trim();
    if (!location && !excerpt) return '';
    const summary = `Check source${location ? ` · ${location}` : ' passage'}`;
    const quoteContent = excerpt
      ? `<blockquote>${escapeHtml(excerpt)}</blockquote>`
      : '<p class="source-evidence-note">This item keeps a source location, but no quoted passage was saved with it.</p>';
    const locationNote = location
      ? ''
      : '<p class="source-evidence-note">No page or slide number is available for this source. Check the exact passage shown.</p>';
    return `<details class="source-evidence-details ${escapeHtml(className)}"><summary>${escapeHtml(summary)}</summary><p class="source-evidence-file">From ${escapeHtml(sourceName || 'your uploaded material')}</p>${quoteContent}${locationNote}</details>`;
  }

  function sourceCardLocation(card) {
    if (!card) return '';
    if (card.sourceLocation) return String(card.sourceLocation);
    if (card.pageNumber) return `Page ${card.pageNumber}`;
    if (card.slideNumber) return `Slide ${card.slideNumber}`;
    return String(card.source || '').match(/\s*[·–-]\s*((?:page|slide)\s+\d+)\s*$/i)?.[1] || '';
  }

  function sourceCardName(card) {
    const name = String(card?.sourceName || card?.source || '').trim();
    return name.replace(/\s*[·–-]\s*(?:page|slide)\s+\d+\s*$/i, '');
  }

  function setCalendarImportStatus(message, isError = false) {
    const status = document.querySelector('#calendarScheduleImportStatus');
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function loadCalendarOcrLibrary() {
    if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
    if (calendarOcrLibraryPromise) return calendarOcrLibraryPromise;
    calendarOcrLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => window.Tesseract?.createWorker
        ? resolve(window.Tesseract)
        : reject(new Error('The text reader loaded but did not start. Try a different photo or enter the dates by hand.'));
      script.onerror = () => reject(new Error('The on-device text reader could not load. Check your connection, then try again.'));
      document.head.appendChild(script);
    }).catch(error => {
      calendarOcrLibraryPromise = null;
      throw error;
    });
    return calendarOcrLibraryPromise;
  }

  function loadSourcePdfLibrary() {
    if (sourcePdfLibraryPromise) return sourcePdfLibraryPromise;
    sourcePdfLibraryPromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.mjs')
      .then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.mjs';
        return pdfjs;
      })
      .catch(error => {
        sourcePdfLibraryPromise = null;
        throw new Error('The on-device PDF reader could not load. Check your connection, then try again.');
      });
    return sourcePdfLibraryPromise;
  }

  async function readPdfTextOnDevice(file, selectedPages = [], existingPageTexts = [], onProgress = () => {}) {
    const pdfjs = await loadSourcePdfLibrary();
    const tesseract = await loadCalendarOcrLibrary();
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, useWorkerFetch: false });
    let pdf;
    let worker;
    try {
      pdf = await loadingTask.promise;
      if (pdf.numPages > 100) throw new Error('This scan has more than 100 pages. Split it into smaller PDFs, then try again.');
      const pageTexts = Array.from({ length: pdf.numPages }, (_, index) => String(existingPageTexts[index] || ''));
      const pageNumbers = selectedPages.length
        ? [...new Set(selectedPages.map(Number).filter(page => Number.isInteger(page) && page >= 1 && page <= pdf.numPages))]
        : Array.from({ length: pdf.numPages }, (_, index) => index + 1);
      if (!pageNumbers.length) return { pageTexts, text: pageTexts.filter(Boolean).join('\n') };
      worker = await tesseract.createWorker('eng', 1, {
        logger: progress => {
          if (progress.status === 'recognizing text') {
            onProgress(`Reading page text on this device… ${Math.round((progress.progress || 0) * 100)}%`);
          }
        }
      });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      for (let index = 0; index < pageNumbers.length; index += 1) {
        const pageNumber = pageNumbers[index];
        onProgress(`Reading scanned page ${pageNumber} of ${pdf.numPages} on this device…`);
        const page = await pdf.getPage(pageNumber);
        const viewportAtOne = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 2200 / Math.max(viewportAtOne.width, viewportAtOne.height));
        const viewport = page.getViewport({ scale: Math.max(0.5, scale) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = (await worker.recognize(canvas)).data.text || '';
        const prior = pageTexts[pageNumber - 1].trim();
        pageTexts[pageNumber - 1] = [prior, recognized.trim()].filter(Boolean).join('\n');
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
        onProgress(`Read ${index + 1} of ${pageNumbers.length} scanned pages on this device.`);
        if (pageTexts.reduce((total, text) => total + text.length, 0) > 192000) {
          throw new Error('This PDF contains more than 192,000 characters of text. Split it into smaller files, then retry.');
        }
      }
      const text = pageTexts.filter(page => page.trim()).join('\n');
      if (!text.trim()) throw new Error('No readable text was found. Try a clearer scan or a text-based copy of the PDF.');
      return { pageTexts, text };
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      // PDF.js owns document/worker teardown on the loading task. The document
      // proxy no longer exposes destroy in PDF.js 6.
      await loadingTask.destroy().catch(() => {});
    }
  }

  function renderCalendarImportCandidates(text) {
    calendarImportOcrText = text;
    const year = Number(document.querySelector('#calendarScheduleImportYear').value) || state.calendarCursor.getFullYear();
    const candidates = window.SyllabloomCalendarFeatures.parseDatedSchedule(text, year);
    const container = document.querySelector('#calendarScheduleImportCandidates');
    if (!candidates.length) {
      container.innerHTML = '<p class="calendar-import-empty">No clear individual dates found. Try a sharper photo of a dated schedule or enter the dates manually. Weekly repeating timetables are not expanded yet.</p>';
      document.querySelector('#calendarScheduleImportSave').disabled = true;
      setCalendarImportStatus('Text was read, but no reliable dated events were detected. The photo was not saved.');
      return;
    }
    container.innerHTML = candidates.map((candidate, index) => {
      const sourceExcerpt = String(candidate.sourceLine || '').slice(0, 500);
      return `<fieldset class="calendar-import-candidate" data-import-candidate="${index}" data-source-line="${escapeHtml(sourceExcerpt)}">
      <label class="calendar-import-include"><input type="checkbox" data-import-include checked><span>Add this date</span></label>
      <label>Event name<input class="text-input" data-import-title maxlength="120" value="${escapeHtml(candidate.title)}" required></label>
      <div class="calendar-import-fields"><label>Date<input class="text-input" data-import-date type="date" value="${escapeHtml(candidate.date)}" required></label><label>Type<select class="text-input" data-import-type><option value="lecture"${candidate.type === 'lecture' ? ' selected' : ''}>Lecture</option><option value="quiz"${candidate.type === 'quiz' ? ' selected' : ''}>Quiz</option><option value="exam"${candidate.type === 'exam' ? ' selected' : ''}>Exam</option><option value="assignment"${candidate.type === 'assignment' ? ' selected' : ''}>Assignment or due date</option><option value="holiday"${candidate.type === 'holiday' ? ' selected' : ''}>School break / closure</option></select></label></div>
      <small>Read from: ${escapeHtml(candidate.sourceLine)}</small>
    </fieldset>`;
    }).join('');
    document.querySelector('#calendarScheduleImportSave').disabled = false;
    setCalendarImportStatus(`${candidates.length} possible date${candidates.length === 1 ? '' : 's'} found. Check every date and name before adding them.`);
    updateCalendarImportSaveButton();
  }

  function updateCalendarImportSaveButton() {
    const container = document.querySelector('#calendarScheduleImportCandidates');
    const selected = [...container.querySelectorAll('[data-import-candidate]')]
      .filter(row => row.querySelector('[data-import-include]')?.checked);
    const valid = selected.filter(row => row.querySelector('[data-import-title]')?.value.trim() && row.querySelector('[data-import-date]')?.value);
    document.querySelector('#calendarScheduleImportSave').disabled = valid.length === 0;
  }

  async function importCalendarSchedulePhoto(file) {
    const dialog = document.querySelector('#calendarScheduleImportDialog');
    const inputYear = document.querySelector('#calendarScheduleImportYear');
    inputYear.value = state.calendarCursor.getFullYear();
    calendarImportOcrText = '';
    document.querySelector('#calendarScheduleImportCandidates').innerHTML = '';
    document.querySelector('#calendarScheduleImportSave').disabled = true;
    if (!file.type.startsWith('image/')) {
      dialog.showModal();
      setCalendarImportStatus('Choose an image file such as JPG, PNG, or WEBP.', true);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      dialog.showModal();
      setCalendarImportStatus('This image is over 15 MB. Choose a smaller photo or screenshot.', true);
      return;
    }
    dialog.showModal();
    setCalendarImportStatus('Loading the on-device text reader…');
    let worker;
    try {
      const tesseract = await loadCalendarOcrLibrary();
      worker = await tesseract.createWorker('eng', 1, {
        logger: progress => {
          if (progress.status === 'recognizing text') {
            setCalendarImportStatus(`Reading the photo on this device… ${Math.round((progress.progress || 0) * 100)}%`);
          } else if (progress.status === 'loading language traineddata') {
            setCalendarImportStatus('Preparing English text recognition…');
          }
        }
      });
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setCalendarImportStatus('Reading the photo on this device…');
      const result = await worker.recognize(canvas);
      renderCalendarImportCandidates(result.data.text || '');
    } catch (error) {
      setCalendarImportStatus(error.message || 'Could not read this photo. Try a clearer JPG or PNG.', true);
    } finally {
      if (worker) await worker.terminate().catch(() => {});
    }
  }

  function saveCalendarImportCandidates() {
    const rows = [...document.querySelectorAll('#calendarScheduleImportCandidates [data-import-candidate]')];
    const additions = [];
    for (const row of rows) {
      if (!row.querySelector('[data-import-include]')?.checked) continue;
      const title = row.querySelector('[data-import-title]').value.trim();
      const date = row.querySelector('[data-import-date]').value;
      const type = row.querySelector('[data-import-type]').value;
      const parsedDate = new Date(`${date}T12:00:00`);
      if (!title || !date || Number.isNaN(parsedDate.getTime()) || localIsoDate(parsedDate) !== date) continue;
      if (state.calendarEvents.some(item => item.date === date && item.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) continue;
      if (additions.some(item => item.date === date && item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) continue;
      additions.push({
        id: `photo-date-${Date.now()}-${additions.length}`,
        date,
        type,
        title,
        sourceName: 'Imported schedule photo',
        sourceText: row.dataset.sourceLine || ''
      });
    }
    if (!additions.length) {
      setCalendarImportStatus('No new valid dates were selected. Existing matching dates were left unchanged.', true);
      return;
    }
    state.calendarEvents.push(...additions);
    localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
    const firstDate = additions.map(event => event.date).sort()[0];
    const [year, month] = firstDate.split('-').map(Number);
    state.calendarCursor = new Date(year, month - 1, 1, 12);
    calendarImportOcrText = '';
    document.querySelector('#calendarScheduleImportDialog').close();
    renderClassPlanner();
    showToast(`${additions.length} schedule date${additions.length === 1 ? '' : 's'} added. Review them on your calendar.`);
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
    const holidayToggle = document.querySelector('#showFederalHolidays');
    if (holidayToggle) holidayToggle.checked = state.showFederalHolidays;
    const referenceHolidays = state.showFederalHolidays
      ? [monthDate.getFullYear() - 1, monthDate.getFullYear(), monthDate.getFullYear() + 1]
        .flatMap(year => window.SyllabloomCalendarFeatures.getUsFederalHolidays(year))
      : [];
    const monthHolidays = referenceHolidays.filter(event => event.date.startsWith(`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-`));
    const visibleEvents = [...state.calendarEvents, ...monthHolidays];
    const firstWeekday = (monthDate.getDay() + 6) % 7;
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const today = localIsoDate(new Date());
    const cells = [];
    for (let index = 0; index < firstWeekday; index += 1) cells.push('<span class="calendar-day calendar-day-empty"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = localIsoDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 12));
      const events = visibleEvents.filter(event => event.date === date);
      const spokenEvents = events.map(event => `${event.title}${event.federalReference ? ' (U.S. federal holiday reference; campus closure not confirmed)' : ''}`).join(', ');
      cells.push(`<button type="button" class="calendar-day${date === today ? ' is-today' : ''}${events.length ? ' has-event' : ''}" data-calendar-date="${date}" aria-label="${date}${events.length ? `, ${escapeHtml(spokenEvents)}. Select to inspect an event source.` : ''}"><span>${day}</span>${events.slice(0, 2).map(event => `<i class="event-${escapeHtml(event.type)}${event.federalReference ? ' is-reference-holiday' : ''}" data-calendar-event-id="${escapeHtml(event.id || '')}"${event.federalReference ? ' title="U.S. federal holiday reference only"' : ''}>${escapeHtml(event.title)}</i>`).join('')}</button>`);
    }
    document.querySelector('#calendarGrid').innerHTML = cells.join('');
    const selectedEventPanel = document.querySelector('#calendarSelectedEvent');
    selectedEventPanel.hidden = true;
    selectedEventPanel.replaceChildren();

    const currentYear = new Date().getFullYear();
    const upcomingHolidays = state.showFederalHolidays
      ? [currentYear - 1, currentYear, currentYear + 1]
        .flatMap(year => window.SyllabloomCalendarFeatures.getUsFederalHolidays(year))
      : [];
    const upcoming = [...state.calendarEvents, ...upcomingHolidays]
      .filter(event => event.date >= today)
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, 5);
    document.querySelector('#upcomingEvents').innerHTML = upcoming.length
      ? upcoming.map(event => {
        const date = new Date(`${event.date}T12:00:00`);
        const label = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
        const eventDescription = event.federalReference ? 'U.S. federal reference · campus closure varies' : labelCase(event.type);
        const yearCitation = event.yearSource === 'course term' && event.sourceTerm
          ? ` · year from ${escapeHtml(event.sourceTerm)}`
          : event.yearSource === 'source name'
            ? ' · year from the uploaded file name'
            : '';
        const sourceLocation = event.sourceLocation || (Number.isInteger(Number(event.sourcePage)) && Number(event.sourcePage) > 0 ? `PDF page ${event.sourcePage}` : '');
        const sourceDetails = sourceEvidenceDetailsMarkup(event.sourceName || 'your syllabus', sourceLocation, event.sourceText, 'calendar-source-evidence');
        return `<div class="upcoming-event"><span class="event-dot event-${escapeHtml(event.type)}${event.federalReference ? ' is-reference-holiday' : ''}"></span><div class="upcoming-event-copy"><strong>${escapeHtml(event.title)}</strong><small>${label} · ${escapeHtml(eventDescription)}${yearCitation}</small>${sourceDetails}</div>${event.federalReference ? '<span class="calendar-reference-badge">Reference</span>' : `<button type="button" data-remove-event="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">Remove</button>`}</div>`;
      }).join('')
      : '<p>No upcoming class dates. Add the next lecture or exam.</p>';

    const exam = nextExamEvent();
    const daysLeft = exam
      ? Math.max(1, Math.ceil((new Date(`${exam.date}T12:00:00`) - new Date()) / 86400000))
      : null;
    const cardSupply = state.includeSampleMaterial ? 42 : approvedLectureCards().length;
    const examPaceLimit = daysLeft ? Math.ceil(cardSupply / daysLeft) : cardSupply;
    const availableNew = cardSupply
      ? Math.max(1, Math.min(state.anki.newPerDay, Math.floor(state.dailyStudyMinutes / 2), examPaceLimit))
      : 0;
    const topicOrders = {
      'weakest-deadline': ['Upper-limb attachments', 'Forearm innervation', 'Muscles of mastication', 'Facial expression actions', 'Lower-limb actions', 'Mixed recall', 'Catch-up and card edits'],
      weakest: ['Upper-limb attachments', 'Forearm innervation', 'Muscles of mastication', 'Facial expression actions', 'Lower-limb actions', 'Weak-topic recheck', 'Catch-up and card edits'],
      syllabus: ['Muscles of facial expression', 'Muscles of mastication', 'Upper limb', 'Forearm and hand', 'Trunk', 'Lower limb', 'Mixed syllabus check'],
      'recent-source': ['Latest lecture highlights', 'Latest lecture weak points', 'New slide terminology', 'Source-linked recall', 'Earlier source gaps', 'Mixed recall', 'Catch-up and card edits']
    };
    const customTopics = sourceConceptNames();
    const missByTopic = new Map();
    state.lectureCards.forEach(card => {
      if (!isUsableLectureCard(card)) return;
      const misses = Number(state.missCounts[`lecture-${card.id}`]) || 0;
      if (!misses) return;
      const topic = card.section || card.muscle || '';
      if (topic) missByTopic.set(topic, (missByTopic.get(topic) || 0) + misses);
    });
    if (state.includeSampleMaterial) records.forEach(record => {
      const misses = state.selectedTypes.reduce((total, field) => total + (Number(state.missCounts[keyFor(record, field)]) || 0), 0);
      if (misses) missByTopic.set(record.section, (missByTopic.get(record.section) || 0) + misses);
    });
    const missEntries = [...missByTopic.entries()];
    const hasWeaknessEvidence = [...missByTopic.values()].some(count => count > 0);
    const latestConcepts = [...state.sources].reverse()
      .find(item => item.concepts?.length)?.concepts
      ?.map(concept => String(concept?.name || concept || '').trim()).filter(Boolean) || [];
    const recentTopics = [...latestConcepts, ...customTopics.filter(topic => !latestConcepts.includes(topic))];
    const strategyTopics = state.anki.releaseStrategy === 'recent-source'
      ? recentTopics
      : state.anki.releaseStrategy === 'weakest' || state.anki.releaseStrategy === 'weakest-deadline'
        ? window.SyllabloomCourseMap?.prioritizeTopics(customTopics, missEntries) || customTopics
        : customTopics;
    const sampleTopics = topicOrders[state.anki.releaseStrategy] || topicOrders['weakest-deadline'];
    const topics = state.includeSampleMaterial
      ? state.anki.releaseStrategy === 'weakest' || state.anki.releaseStrategy === 'weakest-deadline'
        ? window.SyllabloomCourseMap?.prioritizeTopics(sampleTopics, missEntries) || sampleTopics
        : sampleTopics
      : strategyTopics.length
        ? strategyTopics
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
      rows.push(`<div class="release-plan-row"><strong>${escapeHtml(dayLabel)}</strong><span>${escapeHtml(focus)}</span><b>${newCards}</b><em>Anki handles reviews</em></div>`);
    }
    document.querySelector('#releasePlanRows').innerHTML = rows.join('');
    const nextLabel = exam ? `${exam.title} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'No exam date yet';
    const orderSummary = state.includeSampleMaterial
      ? 'this is the sample sequence; add your class material for course-specific priorities'
      : state.anki.releaseStrategy === 'syllabus'
      ? 'new cards follow source order'
      : state.anki.releaseStrategy === 'recent-source'
        ? 'new cards start with the latest source'
        : hasWeaknessEvidence
          ? 'topics with the most missed cards come first'
          : 'new cards follow source order until study results identify weak topics';
    document.querySelector('#releasePlanSummary').textContent = `${nextLabel}. Up to ${availableNew} new card${availableNew === 1 ? '' : 's'} a day${exam ? `, paced against ${exam.title}` : ''}; ${orderSummary}. Anki schedules due reviews after export.`;
    renderKnowledgeModel();
    renderProfileSchedule();
  }

  function renderCalendarEventEvidence(eventItem) {
    const panel = document.querySelector('#calendarSelectedEvent');
    const date = new Date(`${eventItem.date}T12:00:00`);
    const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
    const location = eventItem.sourceLocation || (Number.isInteger(Number(eventItem.sourcePage)) && Number(eventItem.sourcePage) > 0 ? `PDF page ${eventItem.sourcePage}` : '');
    const evidence = sourceEvidenceDetailsMarkup(eventItem.sourceName, location, eventItem.sourceText, 'calendar-selected-source');
    const context = eventItem.federalReference
      ? '<p class="calendar-event-source-empty">U.S. federal reference date only; check your school calendar to confirm any closure.</p>'
      : evidence
        ? evidence
        : '<p class="calendar-event-source-empty">No source passage is attached to this event.</p>';
    panel.innerHTML = `<div class="calendar-selected-event-card"><span class="account-kicker">Selected calendar event</span><h3>${escapeHtml(eventItem.title)}</h3><p>${escapeHtml(dateLabel)} · ${escapeHtml(labelCase(eventItem.type))}</p>${context}</div>`;
    const details = panel.querySelector('details');
    if (details) details.open = true;
    panel.hidden = false;
  }

  function courseTopicActionMarkup(topic, compact = false) {
    const action = topic.readyCount > 0 ? 'study' : topic.cardCount > 0 ? 'cards' : 'source';
    const sessionCount = Math.min(topic.readyCount || 0, state.anki.dailyLimit);
    const label = action === 'study'
      ? `Study ${sessionCount} ready card${sessionCount === 1 ? '' : 's'}`
      : action === 'cards'
        ? 'Review this topic’s cards'
        : 'Add class material';
    return `<button class="button${compact ? ' course-objective-topic' : ' course-map-action'}" type="button" data-topic-action="${action}" data-topic-name="${escapeHtml(topic.name)}">${label}</button>`;
  }

  function isUsableLectureCard(card) {
    if (card.noteType === 'ImageOcclusion') return window.SyllabloomAdvancedCards.validOcclusion(card) && Boolean(String(card.back || '').trim());
    if (card.noteType === 'Cloze') return window.SyllabloomAdvancedCards.validCloze(card.clozeText);
    const validate = window.SyllabloomSourceStudy?.isUsableCard;
    return typeof validate === 'function' && validate(card);
  }

  function approvedLectureCards() {
    return state.lectureCards.filter(card => card.reviewStatus === 'approved' && isUsableLectureCard(card));
  }

  function lectureCardsNeedingEdit() {
    return state.lectureCards.filter(card => card.reviewStatus !== 'skipped' && !isUsableLectureCard(card));
  }

  function renderKnowledgeModel() {
    const list = document.querySelector('#knowledgeRows');
    if (!list) return;
    const allConcepts = state.includeSampleMaterial
      ? Object.keys(source.sections || {})
      : sourceConceptNames();
    const sourceById = new Map(state.sources.map(item => [String(item.id), item]));
    const mappedCards = state.includeSampleMaterial
      ? records.flatMap(record => state.selectedTypes.map(field => {
        const id = keyFor(record, field);
        const skipped = state.statuses[id] === 'Skipped';
        return {
          id,
          concept: record.section,
          sourceName: source.document,
          ready: state.statuses[id] === 'Approved',
          skipped
        };
      }))
      : state.lectureCards.map(card => {
        const sourceItem = sourceById.get(String(card.sourceId));
        const location = card.slideNumber
          ? `Slide ${card.slideNumber}`
          : card.pageNumber
            ? `Page ${card.pageNumber}`
            : '';
        const sourceName = card.source || sourceItem?.name || 'Class material';
        return {
          id: `lecture-${card.id}`,
          concept: card.section || card.concept || '',
          sourceName: sourceName.replace(/\s*[·–-]\s*(?:slide|page)\s+\d+$/i, ''),
          location,
          ready: card.reviewStatus === 'approved' && isUsableLectureCard(card),
          skipped: card.reviewStatus === 'skipped'
        };
      });
    const courseMap = window.SyllabloomCourseMap?.buildCourseMap({
      concepts: allConcepts,
      cards: mappedCards,
      reviewHistory: state.reviewHistory,
      className: state.className,
      classTerm: state.classTerm
    }) || [];
    const focus = window.SyllabloomCourseMap?.recommendNext(courseMap) || null;
    const milestone = nextExamEvent();
    const focusAction = document.querySelector('#courseFocusAction');
    const focusTitle = document.querySelector('#courseFocusTitle');
    const focusReason = document.querySelector('#courseFocusReason');
    const milestoneTitle = document.querySelector('#courseMilestoneTitle');
    const milestoneDetail = document.querySelector('#courseMilestoneDetail');
    const milestoneAction = document.querySelector('#courseMilestoneAction');
    if (focus) {
      const sessionCount = Math.min(focus.readyCount || 0, state.anki.dailyLimit);
      focusTitle.textContent = focus.cardCount ? `Study ${focus.name} next` : `Build cards for ${focus.name}`;
      focusReason.textContent = focus.reason;
      focusAction.outerHTML = `<button id="courseFocusAction" class="button primary" type="button" data-topic-action="${focus.readyCount ? 'study' : focus.cardCount ? 'cards' : 'source'}" data-topic-name="${escapeHtml(focus.name)}">${focus.readyCount ? `Study ${sessionCount} ready card${sessionCount === 1 ? '' : 's'}` : focus.cardCount ? 'Review this topic’s cards' : 'Add class material'}</button>`;
    } else {
      focusTitle.textContent = 'Add a course source to start your map';
      focusReason.textContent = 'A syllabus sets the course dates; slides, notes, and readings add source-linked topics and ready cards.';
      focusAction.outerHTML = '<button id="courseFocusAction" class="button primary" type="button" data-topic-action="source">Add course material</button>';
    }
    if (milestone) {
      const eventDate = new Date(`${milestone.date}T12:00:00`);
      const today = new Date(`${localIsoDate(new Date())}T12:00:00`);
      const daysAway = Math.max(0, Math.ceil((eventDate - today) / 86400000));
      const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(eventDate);
      milestoneTitle.textContent = milestone.title;
      milestoneDetail.textContent = `${dateLabel} · ${daysAway === 0 ? 'today' : `in ${daysAway} day${daysAway === 1 ? '' : 's'}`} · ${labelCase(milestone.type)}`;
      document.querySelector('#courseMilestoneEvidence').innerHTML = sourceEvidenceDetailsMarkup(
        milestone.sourceName || 'your syllabus',
        milestone.sourceLocation || (Number.isInteger(Number(milestone.sourcePage)) && Number(milestone.sourcePage) > 0 ? `PDF page ${milestone.sourcePage}` : ''),
        milestone.sourceText,
        'milestone-source-evidence'
      );
      milestoneAction.hidden = true;
    } else {
      milestoneTitle.textContent = 'No class date added yet';
      milestoneDetail.textContent = 'Add an exam or class milestone to pace new cards against the real course calendar.';
      document.querySelector('#courseMilestoneEvidence').replaceChildren();
      milestoneAction.hidden = false;
    }

    document.querySelector('#baselineScore').textContent = state.baselineAssessed ? `${state.baselineScore}%` : '—';
    document.querySelector('#baselineScoreLabel').textContent = state.baselineAssessed
      ? (state.classMode === 'custom' ? 'self-checked quick check' : 'first quick-check score')
      : 'not assessed yet';
    document.querySelector('#knowledgeObjectiveCount').textContent = String(courseMap.length);
    document.querySelector('#knowledgeSessionLength').textContent = `${state.dailyStudyMinutes} min`;
    list.innerHTML = courseMap.length
      ? courseMap.map(concept => {
        const references = concept.sourceReferences || [];
        const visibleReferences = references.slice(0, 3).map(reference => `${reference.name}${reference.location ? ` · ${reference.location}` : ''}`);
        const extraReferences = references.length > visibleReferences.length ? ` +${references.length - visibleReferences.length} more` : '';
        const evidenceSummary = concept.cardCount
          ? `${concept.practicedCount} of ${concept.cardCount} cards checked or studied · ${concept.readyCount} ready${visibleReferences.length ? ` · ${visibleReferences.join('; ')}${extraReferences}` : ''}`
          : (visibleReferences.length ? `No cards linked yet · ${visibleReferences.join('; ')}${extraReferences}` : 'No source-linked cards yet');
        return `<article class="knowledge-row" data-course-status="${escapeHtml(concept.statusKind)}"><strong>${escapeHtml(concept.name)}</strong><div class="knowledge-evidence">${concept.cardCount ? `<div class="mastery-track" role="progressbar" aria-label="Distinct cards practiced for ${escapeHtml(concept.name)}" aria-valuemin="0" aria-valuemax="${concept.cardCount}" aria-valuenow="${concept.practicedCount}"><span style="width:${concept.coveragePercent}%"></span></div>` : ''}<small>${escapeHtml(evidenceSummary)}</small></div><span class="knowledge-score">${concept.cardCount ? `${concept.practicedCount}/${concept.cardCount}` : '—'}</span><span class="knowledge-status knowledge-status--${escapeHtml(concept.statusKind)}">${escapeHtml(concept.status)}</span>${courseTopicActionMarkup(concept)}</article>`;
      }).join('')
      : '<div class="knowledge-empty"><strong>No learning map yet</strong><span>Add slides, notes, or a syllabus and the concepts will appear here.</span></div>';

    const objectivePanel = document.querySelector('#courseObjectivePanel');
    const objectiveList = document.querySelector('#courseObjectiveCues');
    const objectiveSources = state.sources.filter(item => item.kind === 'syllabus' && Array.isArray(item.objectiveCues) && item.objectiveCues.length);
    const objectiveCues = objectiveSources.flatMap(item => (window.SyllabloomCourseMap?.mapObjectiveCues(item.objectiveCues, courseMap) || [])
      .map(cue => ({ ...cue, sourceName: item.name })));
    objectivePanel.hidden = objectiveCues.length === 0;
    objectiveList.innerHTML = objectiveCues.map(cue => {
      const topicButtons = cue.topics.map(name => {
        const topic = courseMap.find(item => window.SyllabloomCourseMap.normalize(item.name) === window.SyllabloomCourseMap.normalize(name));
        return topic ? courseTopicActionMarkup(topic, true) : '';
      }).join('');
      const mapping = topicButtons || '<span class="course-objective-unmatched">No exact topic phrase found in this class’s current cards.</span>';
      return `<article class="course-objective-cue"><span>From ${escapeHtml(cue.sourceName)}</span><p>${escapeHtml(cue.text)}</p><div>${mapping}</div></article>`;
    }).join('');
  }

  function activateCourseTopic(topicName, action) {
    if (action === 'study') {
      shortStudy = null;
      state.studyFocusConcept = topicName;
      state.studyIndex = 0;
      navigate('study');
      return;
    }
    if (action === 'cards') {
      navigate('cards');
      window.requestAnimationFrame(() => {
        const topicKey = window.SyllabloomCourseMap.normalize(topicName);
        const row = [...document.querySelectorAll('[data-lecture-card]')]
          .find(item => window.SyllabloomCourseMap.normalize(item.dataset.concept) === topicKey);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row?.focus({ preventScroll: true });
      });
      return;
    }
    navigate('source');
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
        const location = event.sourceLocation || (Number.isInteger(Number(event.sourcePage)) && Number(event.sourcePage) > 0 ? `PDF page ${event.sourcePage}` : '');
        const evidence = sourceEvidenceDetailsMarkup(event.sourceName || 'your syllabus', location, event.sourceText, 'profile-source-evidence');
        return `<article class="profile-event"><time datetime="${escapeHtml(event.date)}"><strong>${escapeHtml(day)}</strong><span>${escapeHtml(weekday)}</span></time><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(labelCase(event.type))}</span>${evidence}</div><button type="button" data-profile-remove-event="${escapeHtml(event.id)}" aria-label="Remove ${escapeHtml(event.title)}">Remove</button></article>`;
      }).join('')
      : '<div class="profile-schedule-empty"><strong>No dates yet</strong><span>Add the first exam, quiz, or lecture below.</span></div>';
  }

  function renderProfile() {
    const used = accountClassUsage();
    const signedInName = state.account.displayName || state.account.email?.split('@')[0] || 'Your Syllabloom account';
    const emailText = state.account.signedIn
      ? state.account.email || 'Signed-in account'
      : 'Sign in to manage your account. Class files and study settings stay in this browser during beta.';
    const avatar = document.querySelector('#profileAvatar');
    avatar.src = state.account.imageUrl || 'assets/syllabloom-mark.svg';
    avatar.alt = state.account.imageUrl ? `${signedInName} profile photo` : 'Syllabloom account mark';
    document.querySelector('#profileIdentityHeading').textContent = signedInName;
    document.querySelector('#profileEmail').textContent = emailText;
    window.SyllabloomBilling?.render();
    // Plan labels are supplied by the server-owned billing state.
    document.querySelector('#profileTierDescription').textContent = '1 active class, course-source imports, lecture storage, and Anki export.';
    document.querySelector('#profileClassUsage').textContent = `${used} of ${betaClassLimit}`;
    document.querySelector('#manageClerkProfile').textContent = state.account.signedIn ? 'Account & security' : 'Sign in';
    document.querySelector('#signOutAccount').hidden = !state.account.signedIn;
    document.querySelector('#signOutAccountNote').hidden = !state.account.signedIn;

    const exam = nextExamEvent();
    const examLabel = exam
      ? `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${exam.date}T12:00:00`))} · ${exam.title}`
      : 'No exam date yet';
    const sourceTotal = state.includeSampleMaterial ? 3 : state.sources.length;
    document.querySelector('#profileClassList').innerHTML = `<article class="profile-class-item"><span class="profile-class-mark" aria-hidden="true"><img src="assets/syllabloom-mark.svg" width="50" height="50" alt="" /></span><div><strong>${escapeHtml(state.className)}</strong><span>${escapeHtml(state.classTerm)} · ${state.classMode === 'sample' ? 'Sample class' : 'Active class'}</span></div><dl><div><dt>Sources</dt><dd>${sourceTotal}</dd></div><div><dt>Next date</dt><dd>${escapeHtml(examLabel)}</dd></div></dl><button class="button" type="button" data-open-current-class>Open class</button></article>`;
    renderProfileSchedule();
  }

  function syncBillingSummary() {
    window.SyllabloomBilling?.render();
  }

  function renderBillingPage() {
    window.SyllabloomBilling?.refresh();
  }

  async function detectRuntimeCapabilities() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) return;
      const capabilities = await response.json();
      if (capabilities.mode !== 'beta-cloud') return;

      state.cloudBeta = true;
      state.hostedTranscription = capabilities.transcription === true && capabilities.lectureJobs === true;
      document.documentElement.dataset.runtime = 'cloud-beta';
      document.querySelector('#cloudBetaNotice').hidden = false;
      document.querySelector('#useTestAudio').disabled = true;
      document.querySelector('#useTestAudio').textContent = state.hostedTranscription
        ? 'Sample available after sign-in'
        : 'Sample needs desktop transcription';
      document.querySelector('#captureState').textContent = 'Ready to record or upload';
      const betaNotice = document.querySelector('#cloudBetaNotice span');
      if (state.hostedTranscription && betaNotice) {
        betaNotice.textContent = 'Upload audio or video to get a timestamped transcript, lecture summary, and study notes. Audio is processed with OpenAI. Original media stays on this device; the temporary server copy is deleted after processing. Study results are available for seven days. Check AI notes against your course material.';
      }
      updateMediaStorageCopy();
      const captureStatus = document.querySelector('.capture-status');
      captureStatus.querySelector('strong').textContent = state.hostedTranscription ? 'Lecture processing ready' : 'Device library';
      captureStatus.querySelector('span:last-child').textContent = state.account.signedIn
        ? 'Per-user device library · no cloud media sync'
        : 'Local device library · sign in to separate by account';
      resumeLatestLectureJob();
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
      document.querySelector('#summaryBaseline').textContent = state.baselineAssessed
        ? `${state.baselineScore}% first quick check`
        : 'Not assessed';
      document.querySelector('#summaryBaselineMeta').textContent = !state.baselineAssessed
        ? 'No starting score is shown until you complete the quick check'
        : state.baselineScore === 100
          ? 'No questions missed in this first check; later answers can still refine priorities'
          : state.baselineScore === 0
            ? 'The first check suggests revisiting these foundations'
            : 'The first check suggests reviewing the missed topics';
      document.querySelector('#summaryAnki').textContent = `${state.anki.format} · ${questionStyleLabels[normalizedQuestionStyle(state.anki.questionStyle)]} · ${state.anki.newPerDay} new per day`;
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
    if (!state.account.signedIn || !state.account.userId) return;
    const usageByUser = storedJson('syllabloom-class-usage-by-user', {});
    usageByUser[state.account.userId] = Math.max(0, Number(state.account.classesUsed) || 0);
    localStorage.setItem('syllabloom-class-usage-by-user', JSON.stringify(usageByUser));
  }

  function accountClassUsage() {
    const savedUsage = Math.max(0, Number(state.account.classesUsed) || 0);
    const hasActiveCustomClass = state.classMode === 'custom'
      && !state.includeSampleMaterial
      && (state.sources.length > 0 || state.className !== 'Untitled class')
      && (!state.account.signedIn || !classProfileOwnerId || classProfileOwnerId === state.account.userId);
    return Math.max(savedUsage, hasActiveCustomClass ? 1 : 0);
  }

  function syncAccountClassUsage() {
    if (!state.account.signedIn || !state.account.userId) return;
    const usage = accountClassUsage();
    if (usage === Number(state.account.classesUsed || 0)) return;
    state.account.classesUsed = usage;
    saveAccount();
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
    const cardCount = approvedLectureCards().length;
    const quickCheckCount = custom ? rotatingQuickCheckQuestions().length : assessmentQuestions.length;
    const approved = approvedLectureCards().length;
    document.querySelectorAll('[data-start-quick-check]').forEach(button => {
      button.textContent = custom && !cardCount ? 'Add your first lecture' : 'Start quick check';
    });
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
    const returnSource = [...state.sources].reverse().find(item => item.draftCards?.length);
    document.querySelector('#returnStudyPanel').hidden = !custom || !returnSource;
    const moreStudy = document.querySelector('#moreStudyOptions');
    const hasReturn = Boolean(custom && returnSource);
    if (moreStudy.dataset.hasReturn !== String(hasReturn)) moreStudy.open = !hasReturn;
    moreStudy.dataset.hasReturn = String(hasReturn);
    moreStudy.querySelector('summary').hidden = !hasReturn;
    if(returnSource) { document.querySelector('#returnStudyTitle').textContent = 'Continue studying'; document.querySelector('#returnStudyDescription').textContent = `${returnSource.name} · a five-card session, ready when you are.`; }
    document.querySelector('#todayHeroCopy').textContent = custom
      ? latestSource
        ? `${cardCount} ready card${cardCount === 1 ? '' : 's'} across your class. Latest source: ${latestSource.name} (${latestSource.draftCards?.length || 0} cards). Continue a short study session, or add your next lecture.`
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
      ['Quick check', 'Answer a few source-linked questions before reviewing.', `${quickCheckCount} question${quickCheckCount === 1 ? '' : 's'}`],
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
    if (!classProfileOwnerId && state.account.signedIn) classProfileOwnerId = state.account.userId;
    localStorage.setItem('syllabloom-class-profile', JSON.stringify({
      mode: state.classMode,
      className: state.className,
      term: state.classTerm,
      syllabusName: state.syllabusName,
      useDemoSyllabus: state.useDemoSyllabus,
      includeSampleMaterial: state.includeSampleMaterial,
      ownerUserId: classProfileOwnerId || ''
    }));
    persistCourseState();
  }

  function prepareNewClassSetup() {
    classProfileOwnerId = state.account.userId || classProfileOwnerId;
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
    state.baselineAssessed = false;
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
    state.baselineScore = 0;
    state.baselineAssessed = false;
    state.sources = [];
    state.latestSessionId = null;
    syncLectureCards([]);
    state.studyIndex = 0;
    state.anki.deck = '';
    state.anki.setName = '';
    state.anki.tags = '';
    setClassLabels('Human Anatomy', 'Fall 2023');
    syncStateToOnboardingAnki();
    renderSource();
    updateGenerationCount();
    closeOnboarding(shellRoute()?.surface === 'onboarding' ? 'replace' : 'push');
  }

  function showClassLimit() {
    const dialog = document.querySelector('#classLimitDialog');
    const used = Math.max(1, accountClassUsage());
    document.querySelector('#classLimitReadout').textContent = `${used} of ${betaClassLimit} beta class used`;
    dialog.showModal();
  }

  function startClassSetup() {
    if (accountClassUsage() >= betaClassLimit) {
      showClassLimit();
      return;
    }
    if (!state.account.signedIn) {
      state.pendingClassSetup = true;
      window.dispatchEvent(new CustomEvent('syllabloom:auth-request', { detail: { intent: 'create-class' } }));
      return;
    }
    prepareNewClassSetup();
    setClassLabels('Untitled class', 'Term not set');
    persistClassProfile();
    state.creatingClass = true;
    window.SyllabloomEvents?.track('onboarding_started');
    closeOnboarding('push');
  }

  function classIsReadyForCurrentUser() {
    const savedOwnerId = classProfileOwnerId || cachedAccountUserId;
    const profileBelongsToUser = !state.account.signedIn || !savedOwnerId || savedOwnerId === state.account.userId;
    return profileBelongsToUser && (localStorage.getItem('rounds-onboarded') === '1' || (state.classMode === 'custom' && state.sources.length > 0));
  }

  function updateMarketingStartLabels() {
    const hasClassReady = classIsReadyForCurrentUser();
    document.querySelectorAll('[data-start-onboarding]').forEach(button => {
      button.dataset.startLabel ||= button.textContent.trim();
      button.textContent = hasClassReady ? 'Open your class' : button.dataset.startLabel;
    });
  }

  function startOrResumeClass() {
    const hasClassReady = classIsReadyForCurrentUser();
    if (!hasClassReady) {
      startClassSetup();
      return;
    }
    if (state.account.signedIn) {
      closeOnboarding('push');
      return;
    }
    state.pendingClassResume = true;
    window.dispatchEvent(new CustomEvent('syllabloom:auth-request', { detail: { intent: 'resume-class' } }));
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
    const destination = state.sources.some(item => item.draftCards?.length) ? 'home' : 'source';
    navigate(destination, null);
    syncShellHistory('app', destination, historyMode);
  }

  function showLanding(historyMode = 'push') {
    state.creatingClass = false;
    updateMarketingStartLabels();
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
    const section = document.getElementById(hashView);
    if (section?.closest('#landing')) {
      window.requestAnimationFrame(() => section.scrollIntoView({ behavior: 'auto', block: 'start' }));
    }
  }

  function navigate(view, historyMode = 'push') {
    if (view === 'study' && !shortStudy && !state.studyFocusConcept && state.sources.some(item=>item.draftCards?.length)) { startShortStudy(); return; }
    if (view !== 'study') shortStudy = null;
    const previousView = state.view;
    if (view !== 'study') state.studyFocusConcept = '';
    state.view = view;
    const selectedNavView = view === 'quick-check' ? 'home' : view;
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === view));
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === selectedNavView));
    document.querySelectorAll('.sidebar-action[data-view]').forEach(button => {
      const active = button.dataset.view === selectedNavView;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const inClassContext = view === 'source' || view === 'knowledge';
    const inAccountContext = view === 'profile' || view === 'billing';
    document.querySelector('#classSwitcher').classList.toggle('active-context', inClassContext);
    document.querySelector('.mobile-class-button').classList.toggle('active-context', inClassContext);
    document.querySelector('.account-nav-action').classList.toggle('active-context', inAccountContext);
    document.querySelector('.mobile-account-button').classList.toggle('active-context', inAccountContext);
    document.querySelector('#classSwitcher').toggleAttribute('aria-current', inClassContext);
    document.querySelector('.mobile-class-button').toggleAttribute('aria-current', inClassContext);
    document.querySelector('#mobileNav').value = selectedNavView;
    if (view === 'cards') {
      renderEditor();
      window.requestAnimationFrame(() => document.querySelectorAll('#lectureDraftQueue textarea').forEach(autoSizeTextArea));
    }
    if (view === 'study') renderStudy();
    if (view === 'quick-check') renderQuickCheck();
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
    persistCourseState();
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
    document.querySelector('#approvedCount').textContent = readyFromSample + approvedLectureCards().length;
    document.querySelector('#skippedCount').textContent = skippedFromSample + state.lectureCards.filter(card => card.reviewStatus === 'skipped').length;
  }

  let shortStudy = null;
  function startShortStudy(sourceId, excluded = []) {
    const sourceItem = state.sources.find(item => item.id === sourceId) || [...state.sources].reverse().find(item => item.draftCards?.length);
    if (!sourceItem) { navigate('source'); return; }
    const all = window.SyllabloomCardSet.sourceCards([sourceItem]).filter(card => window.SyllabloomSourceStudy.isUsableCard(card));
    const cards = all.map(card => state.lectureCards.find(saved => saved.sourceKey === lectureCardKey(card) || window.SyllabloomCardSet.contentKey(saved) === window.SyllabloomCardSet.contentKey(card))).filter(card => card && card.reviewStatus === 'approved');
    shortStudy = { sourceId: sourceItem.id, cards: window.SyllabloomSourceExperience.chooseSession(cards, state.reviewHistory, excluded), rated: new Set(), complete: false };
    state.studyIndex = 0; state.studyFocusConcept = '';
    if (shortStudy.cards.length) window.SyllabloomEvents?.track('study_started', {cards:shortStudy.cards.length});
    navigate('study');
  }
  function finishShortStudy() {
    if (!shortStudy || shortStudy.rated.size < shortStudy.cards.length || shortStudy.complete) return false;
    shortStudy.complete = true;
    window.SyllabloomEvents?.track('study_completed', {cards:shortStudy.cards.length});
    renderStudy(); document.querySelector('#shortStudyComplete').focus(); return true;
  }
  function studyCards() {
    if (shortStudy) return shortStudy.cards.map(card => ({directCard:state.lectureCards.find(saved=>saved.id===card.id) || card}));
    const approved = [];
    if (state.includeSampleMaterial) {
      Object.entries(state.statuses).forEach(([key, status]) => {
        if (status !== 'Approved') return;
        const [id, field] = key.split('-');
        const record = records.find(item => item.id === Number(id));
        if (record) approved.push({ record, field });
      });
    }
    approvedLectureCards()
      .forEach(card => approved.push({ directCard: card }));
    if (state.studyFocusConcept && approved.length) {
      const normalize = window.SyllabloomCourseMap?.normalize || (value => String(value || '').toLocaleLowerCase().trim());
      const focused = approved.filter(item => {
        const concept = item.directCard?.section || item.directCard?.concept || item.record?.section || '';
        return normalize(concept) === normalize(state.studyFocusConcept);
      });
      return focused.slice(0, state.anki.dailyLimit);
    }
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
      activity: 'study',
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

  function assessmentCardReference(item, index = state.assessmentIndex) {
    if (item.cardId) return { cardId: item.cardId, concept: item.concept || '', sourceName: item.sourceName || '' };
    const record = records.find(candidate => candidate.muscle === item.sampleMuscle);
    if (!record) return { cardId: `quick-check-${index}`, concept: '', sourceName: source.document };
    return {
      cardId: keyFor(record, item.sampleField || 'attachment'),
      concept: record.section,
      sourceName: source.document
    };
  }

  function recordMissCount(cardId) {
    if (!cardId) return;
    state.missCounts[cardId] = (state.missCounts[cardId] || 0) + 1;
    localStorage.setItem('syllabloom-miss-counts', JSON.stringify(state.missCounts));
  }

  function recordQuickCheckResponse(item, correct, index = state.assessmentIndex) {
    const reference = assessmentCardReference(item, index);
    state.reviewHistory.push({
      id: `quick-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cardId: reference.cardId,
      concept: reference.concept,
      sourceName: reference.sourceName,
      rating: correct ? 'Good' : 'Again',
      activity: 'quick-check',
      className: state.className,
      classTerm: state.classTerm,
      reviewedAt: new Date().toISOString()
    });
    state.reviewHistory = state.reviewHistory.slice(-2000);
    state.reviewCount = state.reviewHistory.length;
    localStorage.setItem('syllabloom-review-history', JSON.stringify(state.reviewHistory));
    if (!correct) recordMissCount(reference.cardId);
    document.querySelector('#reviewCount').textContent = String(state.reviewCount);
    if (!correct) renderClassPlanner();
    else renderKnowledgeModel();
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
    recordMissCount(key);
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
    renderClassPlanner();
    window.dispatchEvent(new CustomEvent('syllabloom:miss-explained', { detail: { count: state.missCounts[key] } }));
    window.requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      document.querySelector('#retryMissedCard').focus({ preventScroll: true });
    });
  }

  function finishAssessment(questions) {
    const isSelfChecked = questions.every(item => item.mode === 'recall');
    state.baselineScore = Math.round((state.assessmentScore / questions.length) * 100);
    state.baselineAssessed = true;
    persistCourseState();
    document.querySelector('#baselineScore').textContent = `${state.baselineScore}%`;
    document.querySelector('#baselineScoreLabel').textContent = isSelfChecked ? 'self-checked quick check' : 'first quick-check score';
    const baselinePlan = state.assessmentScore === questions.length
      ? 'Your next session will begin with new material and use later misses to adjust the plan.'
      : state.assessmentScore === 0
        ? 'Your next session will revisit each marked topic before adding more cards.'
        : 'Your next session will prioritize the topics you marked for review.';
    document.querySelector('#assessmentBox').innerHTML = isSelfChecked
      ? `<h2>Quick check complete</h2><p>You marked ${state.assessmentScore} of ${questions.length} as already known. ${baselinePlan}</p>`
      : `<h2>Baseline complete</h2><p>You answered ${state.assessmentScore} of ${questions.length} question${questions.length === 1 ? '' : 's'} correctly. ${baselinePlan}</p>`;
    document.querySelector('#baselineContinue').disabled = false;
  }

  function advanceAssessment(questions) {
    if (state.assessmentIndex < questions.length - 1) {
      state.assessmentIndex += 1;
      renderAssessmentQuestion();
    } else {
      finishAssessment(questions);
    }
  }

  function renderAssessmentQuestion() {
    const questions = activeAssessmentQuestions();
    const item = questions[state.assessmentIndex];
    if (!item) return;
    document.querySelector('#assessmentProgress').textContent = `Question ${state.assessmentIndex + 1} of ${questions.length}`;
    document.querySelector('#assessmentQuestion').textContent = item.question;
    const result = document.querySelector('#assessmentResult');
    result.innerHTML = '';
    const options = document.querySelector('#assessmentOptions');

    if (item.mode === 'recall') {
      options.before(result);
      options.innerHTML = '<button class="button primary answer-option" id="revealSourceAnswer" type="button">Reveal answer</button>';
      options.querySelector('#revealSourceAnswer').addEventListener('click', () => {
        const sourceLabel = item.sourceName ? `Source: ${item.sourceName}.` : '';
        result.innerHTML = `<article class="quick-check-source-answer"><span>Source-backed answer</span><p>${escapeHtml(item.answer)}</p><small>${escapeHtml(sourceLabel)}</small></article>`;
        options.innerHTML = `
          <span class="quick-check-rating-label">How well did you know it?</span>
          <div class="quick-check-rating-actions">
            <button class="button answer-option" type="button" data-known="true">I knew it</button>
            <button class="button answer-option" type="button" data-known="false">Need to review</button>
          </div>`;
        options.querySelectorAll('[data-known]').forEach(button => button.addEventListener('click', () => {
          const known = button.dataset.known === 'true';
          recordQuickCheckResponse(item, known);
          if (known) state.assessmentScore += 1;
          options.querySelectorAll('button').forEach(rating => { rating.disabled = true; });
          result.insertAdjacentHTML('beforeend', `<p class="quick-check-rating-feedback">${known ? 'Marked as known.' : 'Added to your review priorities.'}</p>`);
          const finalQuestion = state.assessmentIndex === questions.length - 1;
          result.insertAdjacentHTML('beforeend', `<button id="assessmentNext" class="button primary" type="button">${finalQuestion ? 'Finish check' : 'Next question'}</button>`);
          document.querySelector('#assessmentNext').addEventListener('click', () => advanceAssessment(questions));
        }));
      });
      return;
    }

    options.after(result);
    options.innerHTML = item.options.map((option, index) => (
      `<button class="button answer-option" data-answer="${index}" type="button">${escapeHtml(option)}</button>`
    )).join('');
    options.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => {
      const answer = Number(button.dataset.answer);
      const correct = answer === item.correct;
      recordQuickCheckResponse(item, correct);
      if (correct) state.assessmentScore += 1;
      options.querySelector(`[data-answer="${item.correct}"]`)?.classList.add('correct-answer');
      if (!correct) button.classList.add('selected-wrong');
      options.querySelectorAll('button').forEach(option => { option.disabled = true; });
      const finalQuestion = state.assessmentIndex === questions.length - 1;
      result.innerHTML = `
        <p><strong>${correct ? 'Correct.' : 'Not quite.'}</strong> ${escapeHtml(item.explanation)}</p>
        <button id="assessmentNext" class="button primary" type="button">${finalQuestion ? 'Finish assessment' : 'Next question'}</button>`;
      document.querySelector('#assessmentNext').addEventListener('click', () => advanceAssessment(questions));
    }));
  }

  function renderQuickCheck() {
    const custom = !state.includeSampleMaterial;
    const intro = document.querySelector('#quickCheckIntro');
    const session = document.querySelector('#quickCheckSession');
    const complete = document.querySelector('#quickCheckComplete');
    const start = document.querySelector('#quickCheckStart');
    const addMaterial = document.querySelector('#quickCheckAddMaterial');
    const reviewSet = document.querySelector('#quickCheckReviewSet');
    const available = custom
      ? rotatingQuickCheckQuestions()
      : assessmentQuestions;

    reviewSet.textContent = custom ? 'Review the ready set' : 'Study the anatomy example';
    reviewSet.dataset.go = custom ? 'cards' : 'study';

    document.querySelector('#quickCheckIntroTitle').textContent = custom
      ? available.length ? 'Check what stuck from your materials' : 'Add a source to start a check'
      : 'A quick check across the example class';
    document.querySelector('#quickCheckIntroCopy').textContent = custom
      ? available.length
        ? `${approvedLectureCards().length} ready cards in your class. This check uses up to ${available.length} distinct, source-linked prompts${Object.keys(state.missCounts).length ? ', prioritizing topics marked for review' : ''}. Answers stay tied to the uploaded material.`
        : 'Add lecture slides, notes, or a past assessment to create a short recall check from your own class content.'
      : 'Try three anatomy recall questions. Add your own class material whenever you are ready.';
    start.hidden = available.length === 0;
    start.disabled = available.length === 0;
    addMaterial.hidden = available.length !== 0;

    if (state.quickCheckQuestions.length) {
      intro.hidden = true;
      if (state.quickCheckIndex >= state.quickCheckQuestions.length) {
        session.hidden = true;
        complete.hidden = false;
        const recalled = state.quickCheckQuestions.every(item => item.mode === 'recall');
        document.querySelector('#quickCheckCompleteTitle').textContent = 'Quick check complete';
        document.querySelector('#quickCheckCompleteCopy').textContent = recalled
          ? `You marked ${state.quickCheckScore} of ${state.quickCheckQuestions.length} as already known. Missed topics were added to your review priorities.`
          : `You answered ${state.quickCheckScore} of ${state.quickCheckQuestions.length} correctly. Missed topics were added to your review priorities.`;
      } else {
        session.hidden = false;
        complete.hidden = true;
        renderQuickCheckQuestion();
      }
    } else {
      intro.hidden = false;
      session.hidden = true;
      complete.hidden = true;
    }
  }

  function startQuickCheck() {
    state.quickCheckRound += 1;
    state.quickCheckQuestions = state.includeSampleMaterial
      ? assessmentQuestions
      : rotatingQuickCheckQuestions();
    state.quickCheckIndex = 0;
    state.quickCheckScore = 0;
    renderQuickCheck();
  }

  function finishQuickCheckQuestion() {
    state.quickCheckIndex += 1;
    renderQuickCheck();
  }

  function renderQuickCheckQuestion() {
    const questions = state.quickCheckQuestions;
    const item = questions[state.quickCheckIndex];
    if (!item) return;
    const options = document.querySelector('#quickCheckOptions');
    const result = document.querySelector('#quickCheckResult');
    document.querySelector('#quickCheckProgress').textContent = `Question ${state.quickCheckIndex + 1} of ${questions.length}`;
    const questionHeading = document.querySelector('#quickCheckQuestion');
    questionHeading.textContent = item.question;
    questionHeading.focus({ preventScroll: true });
    result.replaceChildren();

    if (item.mode === 'recall') {
      options.before(result);
      options.innerHTML = '<button class="button primary answer-option" id="quickCheckReveal" type="button">Reveal answer</button>';
      options.querySelector('#quickCheckReveal').addEventListener('click', () => {
        const answer = document.createElement('article');
        answer.className = 'quick-check-source-answer';
        const label = document.createElement('span');
        label.textContent = 'Answer from your source';
        const text = document.createElement('p');
        text.textContent = item.answer;
        const sourceLabel = document.createElement('small');
        sourceLabel.textContent = item.sourceName ? `Source: ${item.sourceName}` : '';
        answer.append(label, text, sourceLabel);
        const sourceEvidence = sourceEvidenceDetailsMarkup(item.sourceName, item.sourceLocation, item.sourceQuote, 'quick-check-source-evidence');
        if (sourceEvidence) answer.insertAdjacentHTML('beforeend', sourceEvidence);
        result.append(answer);
        options.innerHTML = `
          <span class="quick-check-rating-label">How well did you know it?</span>
          <div class="quick-check-rating-actions">
            <button class="button answer-option" type="button" data-known="true">I knew it</button>
            <button class="button answer-option" type="button" data-known="false">Need to review</button>
          </div>`;
        options.querySelectorAll('[data-known]').forEach(button => button.addEventListener('click', () => {
          const known = button.dataset.known === 'true';
          recordQuickCheckResponse(item, known, state.quickCheckIndex);
          if (known) state.quickCheckScore += 1;
          options.querySelectorAll('button').forEach(rating => { rating.disabled = true; });
          const feedback = document.createElement('p');
          feedback.className = 'quick-check-rating-feedback';
          feedback.textContent = known ? 'Marked as known.' : 'Added to your review priorities.';
          result.append(feedback);
          appendQuickCheckNext(result);
        }));
      });
      return;
    }

    options.after(result);
    options.innerHTML = item.options.map((option, index) => (
      `<button class="button answer-option" data-answer="${index}" type="button">${escapeHtml(option)}</button>`
    )).join('');
    options.querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => {
      const correct = Number(button.dataset.answer) === item.correct;
      recordQuickCheckResponse(item, correct, state.quickCheckIndex);
      if (correct) state.quickCheckScore += 1;
      options.querySelector(`[data-answer="${item.correct}"]`)?.classList.add('correct-answer');
      if (!correct) button.classList.add('selected-wrong');
      options.querySelectorAll('button').forEach(option => { option.disabled = true; });
      const explanation = document.createElement('p');
      const label = document.createElement('strong');
      label.textContent = correct ? 'Correct. ' : 'Not quite. ';
      explanation.append(label, document.createTextNode(item.explanation));
      result.append(explanation);
      appendQuickCheckNext(result);
    }));
  }

  function appendQuickCheckNext(result) {
    const next = document.createElement('button');
    next.id = 'quickCheckNext';
    next.className = 'button primary';
    next.type = 'button';
    next.textContent = state.quickCheckIndex === state.quickCheckQuestions.length - 1 ? 'Finish check' : 'Next question';
    next.addEventListener('click', finishQuickCheckQuestion);
    result.append(next);
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
      if (card.reviewStatus !== 'approved' || !isUsableLectureCard(card)) return;
      approved.push({
        noteType: card.noteType || 'Basic',
        clozeText: card.clozeText,
        occlusion: card.occlusion,
        front: card.noteType === 'Cloze' ? card.clozeText : card.front,
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
      const exportToken = await window.SyllabloomAuth?.getToken?.();
      const response = await fetch('/api/export-anki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(exportToken ? { Authorization: `Bearer ${exportToken}` } : {}) },
        body: JSON.stringify(prepareAdvancedExport(approved))
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
      window.SyllabloomEvents?.track('anki_exported', {cards:approved.length});
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
    const complete = Boolean(shortStudy?.complete);
    document.querySelector('#shortStudyComplete').hidden = !complete;
    if(complete) document.querySelector('#shortStudySummary').textContent = `You reviewed ${shortStudy.cards.length} cards. Your ratings are saved. Come back for the next short session or add your next lecture.`;
    const hasCards = cards.length > 0 && !complete;
    const focusBanner = document.querySelector('#studyFocusBanner');
    focusBanner.hidden = !state.studyFocusConcept;
    if (state.studyFocusConcept) document.querySelector('#studyFocusName').textContent = state.studyFocusConcept;
    document.querySelector('#studyEmpty').hidden = hasCards || complete;
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
    document.querySelector('#studySection').textContent = labelCase(directCard?.section || directCard?.concept || item.record?.section || 'Diagram recall');
    document.querySelector('#studyProgress').style.width = `${((state.studyIndex + 1) / cards.length) * 100}%`;
    if (directCard) document.querySelector('#studyQuestion').innerHTML = window.SyllabloomAdvancedCards.render(directCard);
    else document.querySelector('#studyQuestion').textContent = edit.front || questionFor(item.record, item.field);
    document.querySelector('#studyMuscle').textContent = directCard
      ? (fieldLabels[directCard.field] || 'Source card')
      : fieldLabels[item.field];
    if (directCard) document.querySelector('#studyAnswer').innerHTML = window.SyllabloomAdvancedCards.render(directCard, true);
    else document.querySelector('#studyAnswer').textContent = edit.back || answerFor(item.record, item.field);
    document.querySelector('#studyAnswer').classList.remove('open');
    const sourceEvidence = document.querySelector('#studySourceEvidence');
    const sourceLocation = sourceCardLocation(directCard);
    const sourceName = sourceCardName(directCard);
    const sourceQuote = String(directCard?.sourceQuote || '').trim();
    sourceEvidence.hidden = true;
    sourceEvidence.dataset.available = String(Boolean(directCard && (sourceName || sourceLocation || sourceQuote)));
    document.querySelector('#studySourceSummary').textContent = sourceLocation ? `Check source · ${sourceLocation}` : 'Check source passage';
    document.querySelector('#studySourceName').textContent = sourceName ? `From ${sourceName}` : 'From your uploaded course material';
    document.querySelector('#studySourceQuote').textContent = sourceQuote;
    document.querySelector('#studySourceQuote').hidden = !sourceQuote;
    document.querySelector('#studySourceNote').hidden = Boolean(sourceQuote && sourceLocation);
    document.querySelector('#studySourceNote').textContent = sourceLocation
      ? 'The source passage was not saved with this card.'
      : 'No page or slide number is available for this source. Check the exact passage shown.';
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
  let pendingRemoveCardId = null;
  let activeRecordingTitle = '';
  let lastTranscript = '';
  let restoringLectureJob = false;
  const MEDIA_DATABASE = 'syllabloom-media';
  const MEDIA_STORE = 'lectures';
  const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
  const LECTURE_JOB_STORAGE = 'syllabloom-latest-lecture-job';
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

  function mediaStorageMessage() {
    return state.account.signedIn
      ? 'Saved for this account on this device only. Recordings do not sync across devices.'
      : 'Saved on this device only. Sign in to separate your library by account.';
  }

  function updateMediaStorageCopy() {
    const ownerCopy = document.querySelector('#captureOwnerCopy');
    if (ownerCopy) ownerCopy.textContent = state.account.signedIn
      ? 'Per-user device library · no cloud media sync'
      : 'Local device library · sign in to separate by account';
    const safety = document.querySelector('#recordingSafety');
    if (safety && (!mediaRecorder || mediaRecorder.state === 'inactive')) safety.textContent = mediaStorageMessage();
  }

  async function renderMediaLibrary() {
    const list = document.querySelector('#mediaLibraryList');
    const label = document.querySelector('#mediaOwnerLabel');
    const summary = document.querySelector('#mediaStorageSummary');
    if (!list || !label || !summary) return;
    updateMediaStorageCopy();
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
          <div class="media-library-actions"${isEditing ? ' hidden' : ''}><button type="button" data-open-media="${escapeHtml(item.id)}">Play</button>${item.studyPackage ? `<button type="button" data-open-lecture-notes="${escapeHtml(item.id)}">Study notes</button>` : ''}<button type="button" data-rename-media="${escapeHtml(item.id)}">Rename</button><button type="button" data-delete-media="${escapeHtml(item.id)}">Remove</button></div>
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

  function openRemoveCardDialog(card) {
    pendingRemoveCardId = card.id;
    document.querySelector('#removeCardPreview').textContent = card.front;
    const dialog = document.querySelector('#removeCardDialog');
    if (!dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => document.querySelector('#cancelRemoveCard')?.focus());
  }

  function closeRemoveCardDialog() {
    pendingRemoveCardId = null;
    const dialog = document.querySelector('#removeCardDialog');
    if (dialog.open) dialog.close();
  }

  function removeLectureCard(id) {
    const card = state.lectureCards.find(item => item.id === id);
    if (!card) return false;
    const key = card.sourceKey || lectureCardKey(card);
    const updatedSet = window.SyllabloomCardSet.removeCardFromSet(state.lectureCards, state.sources, card);
    state.lectureCards = updatedSet.cards;
    state.sources = updatedSet.sources;
    if (card.sourceId) persistClassSources();
    saveLectureReview(card.sourceId ? [] : [key]);
    renderSource();
    updateGenerationCount();
    updateReviewSurface();
    renderLectureDraftQueue();
    renderStudy();
    updateAssessmentIntro();
    renderSourceStudyOutput();
    window.requestAnimationFrame(() => {
      (document.querySelector('#lectureDraftQueue [data-lecture-action="delete"]')
        || document.querySelector('#ankiExportHeading'))?.focus();
    });
    return true;
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
      <div class="transcript-warning">${typeof warning === 'string' ? '' : `<time>${clock(warning.time)}</time>`}<span>${escapeHtml(typeof warning === 'string' ? warning : warning.message)}</span></div>
    `).join('');
  }

  function lectureCardKey(card) {
    const key = window.SyllabloomCardSet.cardKey(card);
    return card.sourceId ? `${card.sourceId}::${key}` : key;
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

  function saveLectureReview(deletedKeys = []) {
    if (!state.latestSessionId) return;
    const reviewByKey = new Map(state.lectureCards.map(card => [card.sourceKey || lectureCardKey(card), {
      key: card.sourceKey || lectureCardKey(card),
      front: card.front,
      back: card.back,
      noteType: card.noteType,
      clozeText: card.clozeText,
      reviewStatus: card.reviewStatus
    }]));
    const tombstones = new Map(savedLectureReview()
      .filter(card => card.reviewStatus === 'deleted')
      .map(card => [card.key, { key: card.key, reviewStatus: 'deleted' }]));
    deletedKeys.forEach(key => tombstones.set(key, { key, reviewStatus: 'deleted' }));
    tombstones.forEach((entry, key) => {
      if (!reviewByKey.has(key)) reviewByKey.set(key, entry);
    });
    localStorage.setItem(`rounds-review-${state.latestSessionId}`, JSON.stringify([...reviewByKey.values()]));
  }

  function syncLectureCards(cards = []) {
    const cardSet = window.SyllabloomCardSet;
    const prior = new Map();
    state.lectureCards.forEach(card => {
      const key = card.sourceKey || lectureCardKey(card);
      prior.set(key, card);
      const legacyKey = cardSet.legacyCardKey(card);
      if (!prior.has(legacyKey)) prior.set(legacyKey, card);
    });
    const savedReview = savedLectureReview();
    const deletedSessionKeys = new Set(savedReview.filter(card => card.reviewStatus === 'deleted').map(card => card.key));
    savedReview.filter(card => card.reviewStatus !== 'deleted').forEach(card => prior.set(card.key, card));
    state.lectureCards = cards.filter(card => {
      if (card.sourceId) {
        const sourceItem = state.sources.find(item => item.id === card.sourceId);
        const deletedSourceKeys = new Set(sourceItem?.deletedCardKeys || []);
        return !deletedSourceKeys.has(card.sourceDeletionKey || cardSet.cardKey(card))
          && !deletedSourceKeys.has(cardSet.legacyCardKey(card))
          && !deletedSessionKeys.has(lectureCardKey(card));
      }
      return !deletedSessionKeys.has(lectureCardKey(card))
        && !deletedSessionKeys.has(cardSet.legacyCardKey(card));
    }).map((card, index) => {
      const existing = prior.get(lectureCardKey(card)) || prior.get(cardSet.legacyCardKey(card));
      return {
        ...card,
        id: existing?.id || `lecture-${index}-${Math.abs(Array.from(card.front || '').reduce((total, character) => total + character.charCodeAt(0), 0))}`,
        sourceKey: lectureCardKey(card),
        front: existing?.front || card.front,
        back: existing?.back || card.back,
        noteType: existing?.noteType || card.noteType || 'Basic',
        clozeText: existing?.clozeText ?? card.clozeText,
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
    const waiting = state.lectureCards.filter(card => card.reviewStatus === 'waiting' && isUsableLectureCard(card)).length;
    const needsEdit = lectureCardsNeedingEdit().length;
    const approved = collectApprovedCards().length;
    document.querySelector('#reviewPageTitle').textContent = needsEdit && !approved
      ? 'Some cards need an edit.'
      : total || approved
        ? 'Your cards are ready.'
        : 'Your cards will appear here.';
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
      ? `${approved} ready${waiting ? ` · ${waiting} need a source check` : ''}${needsEdit ? ` · ${needsEdit} need an edit` : ''}`
      : approved
        ? `${approved} ready from your course source`
        : 'No lecture cards yet';
    document.querySelector('#reviewPageDescription').textContent = total
      ? `${approved} card${approved === 1 ? '' : 's'} are ready to study or export${waiting ? `. ${waiting} lecture-only card${waiting === 1 ? '' : 's'} need a quick check` : ''}${needsEdit ? `${waiting ? '; ' : '. '}${needsEdit} card${needsEdit === 1 ? '' : 's'} ${needsEdit === 1 ? 'needs' : 'need'} an edit before they can be studied or exported` : '. Look through the set only if you want to'}.`
      : approved
        ? `${approved} source-matched card${approved === 1 ? ' is' : 's are'} ready to study here or export to Anki.`
        : 'Record or import a lecture. Anki-ready cards will appear here.';
    updateStatusCounts();
    updateAnkiExportSurface();
    updateAnkiDesktopBridge();
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
    const waiting = state.lectureCards.filter(card => card.reviewStatus === 'waiting' && isUsableLectureCard(card)).length;
    const approved = approvedLectureCards().length;
    const needsEdit = lectureCardsNeedingEdit().length;
    const skipped = state.lectureCards.filter(card => card.reviewStatus === 'skipped').length;
    document.querySelector('#lectureDraftCount').textContent = `${state.lectureCards.length} in set · ${approved} ready${waiting ? ` · ${waiting} to check` : ''}${needsEdit ? ` · ${needsEdit} need an edit` : ''}${skipped ? ` · ${skipped} left out` : ''}`;
    const grouped = new Map();
    const addCard = (sourceId, card) => {
      const key = sourceId || 'recorded-lecture';
      if (!grouped.has(key)) grouped.set(key, { sourceId, cards: [], duplicates: [] });
      grouped.get(key).cards.push(card);
    };
    state.lectureCards.forEach(card => addCard(card.sourceId, card));
    state.lectureCards.forEach(card => (card.duplicateSourceRefs || []).forEach(reference => {
      const key = reference.sourceId || 'recorded-lecture';
      if (!grouped.has(key)) grouped.set(key, { sourceId: reference.sourceId, cards: [], duplicates: [] });
      grouped.get(key).duplicates.push(card);
    }));
    const sourceById = new Map(state.sources.map(sourceItem => [sourceItem.id, sourceItem]));
    let index = 0;
    const renderCard = card => {
      const needsEdit = card.reviewStatus !== 'skipped' && !isUsableLectureCard(card);
      const location = card.sourceLocation || (card.pageNumber ? `Page ${card.pageNumber}` : card.slideNumber ? `Slide ${card.slideNumber}` : '');
      const evidenceLabel = card.generatedBy === 'openai'
        ? `AI draft · quote matched${location ? ` · ${location}` : ''}`
        : `${card.status === 'provisional' ? 'Review only' : 'Course source'}${location ? ` · ${location}` : ''}`;
      const sourceEvidence = card.sourceQuote
        ? `<details class="lecture-draft-source-evidence"><summary>Source passage${location ? ` · ${escapeHtml(location)}` : ''}</summary><blockquote>${escapeHtml(card.sourceQuote)}</blockquote></details>`
        : '';
      return `
      <article class="lecture-draft-card ${escapeHtml(card.reviewStatus)}${needsEdit ? ' needs-edit' : ''}" data-lecture-card="${escapeHtml(card.id)}" data-concept="${escapeHtml(card.section || card.concept || '')}">
        <div class="lecture-draft-index"><b>${String(++index).padStart(2, '0')}</b><span class="lecture-draft-evidence">${escapeHtml(evidenceLabel)}</span></div>
        <div class="lecture-draft-body">
          ${card.noteType === 'ImageOcclusion' ? window.SyllabloomAdvancedCards.imageHtml(card) : `<label>Card type<select data-lecture-format><option value="Basic" ${card.noteType !== 'Cloze' ? 'selected' : ''}>Question and answer</option><option value="Cloze" ${card.noteType === 'Cloze' ? 'selected' : ''}>Cloze deletion</option></select></label><label>${card.noteType === 'Cloze' ? 'Cloze sentence · use {{c1::term}}' : 'Front'}<textarea data-lecture-field="${card.noteType === 'Cloze' ? 'clozeText' : 'front'}">${escapeHtml(card.noteType === 'Cloze' ? card.clozeText || '' : card.front)}</textarea></label>`}
          <label>Back<textarea data-lecture-field="back">${escapeHtml(card.back)}</textarea></label>
          ${needsEdit ? '<p class="lecture-card-quality-note">This card is not a focused study prompt; it may contain directions or another question. It stays in your library. Edit both sides into one focused question and a source-backed answer before studying or exporting it.</p>' : ''}
          ${sourceEvidence}
        </div>
        <div class="lecture-draft-actions">
          <button class="button primary" data-lecture-action="approve">${needsEdit ? 'Needs edit' : card.reviewStatus === 'approved' ? 'Ready' : 'Add to ready set'}</button>
          <button class="button" data-lecture-action="skip">${card.reviewStatus === 'skipped' ? 'Left out' : 'Leave out'}</button>
          <button class="button lecture-card-delete" type="button" data-lecture-action="delete" aria-label="Remove card: ${escapeHtml(card.front)}">Delete card</button>
        </div>
      </article>
      `;
    };
    queue.innerHTML = [...grouped.entries()].map(([key, group]) => {
      const sourceItem = group.sourceId ? sourceById.get(group.sourceId) : null;
      const title = sourceItem?.name || group.cards.find(card => card.sourceName)?.sourceName || 'Recorded lecture';
      const uniqueCards = group.cards.map(renderCard).join('');
      const duplicateNote = group.duplicates.length
        ? `<p class="lecture-source-duplicate-note">${group.duplicates.length} identical card${group.duplicates.length === 1 ? '' : 's'} also came from this material; kept once in your study set.</p>`
        : '';
      return `<section class="lecture-source-group" data-source-group="${escapeHtml(key)}"><header class="lecture-source-group-heading"><h3>${escapeHtml(title)}</h3><span>${group.cards.length} unique card${group.cards.length === 1 ? '' : 's'}${group.duplicates.length ? ` · ${group.duplicates.length} repeated` : ''}</span></header>${uniqueCards || '<p class="lecture-source-duplicate-note">No new cards from this material; its repeated concepts are kept once in the study set.</p>'}${duplicateNote}</section>`;
    }).join('');
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
    const classCards = sourceCardsFromLibrary();
    const classKeys = new Set(classCards.map(card => window.SyllabloomCardSet.contentKey(card)));
    syncLectureCards([...classCards, ...cards.filter(card => !classKeys.has(window.SyllabloomCardSet.contentKey(card)))]);
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

  function seekLecture(seconds) {
    const video = document.querySelector('#captureVideo');
    const audio = document.querySelector('#captureAudio');
    const player = !video.hidden && video.src ? video : audio;
    if (!player?.src) return;
    player.currentTime = Math.max(0, Number(seconds) || 0);
    player.play().catch(() => {});
  }

  function renderLectureStudyPackage(result = {}) {
    const section = document.querySelector('#lectureStudyPackage');
    const chapters = Array.isArray(result.chapters) ? result.chapters : [];
    const notes = Array.isArray(result.keyNotes)
      ? result.keyNotes
      : Array.isArray(result.notes) ? result.notes : [];
    const visuals = Array.isArray(result.visualKeyframes) ? result.visualKeyframes : [];
    section.hidden = !chapters.length && !notes.length && !visuals.length;
    const summaryBox = document.querySelector('#lectureSummary');
    summaryBox.hidden = !result.summary;
    summaryBox.innerHTML = result.summary ? `<h3>Lecture summary</h3>${String(result.summary).split('\n\n').map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}<button type="button" data-download-lecture-notes>Download study notes</button>` : '';
    if (result.studySheet) summaryBox.insertAdjacentHTML('beforeend',sheetHtml(result.studySheet,result.studySheetSourceId || ''));
    summaryBox.querySelector('[data-download-lecture-notes]')?.addEventListener('click', () => {
      const text = `# ${result.title || 'Lecture study notes'}\n\n${result.summary}\n\n` + notes.map(note => `## ${note.title} (${clock(note.heardAt)})\n\n${(note.lines || []).map(line => `- ${line}`).join('\n')}\n\nTranscript excerpt: ${note.source || ''}`).join('\n\n');
      const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lecture-study-notes.md';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    });

    const chapterBox = document.querySelector('#lectureChapters');
    chapterBox.hidden = chapters.length === 0;
    chapterBox.innerHTML = chapters.map(chapter => `
      <button type="button" data-lecture-seek="${Number(chapter.time) || 0}"><b>${clock(chapter.time)}</b> ${escapeHtml(chapter.title)}</button>
    `).join('');

    document.querySelector('#lectureKeyNotes').innerHTML = notes.length
      ? notes.map(note => {
        const heardAt = note.heardAt == null ? Number.NaN : Number(note.heardAt);
        const lines = Array.isArray(note.lines) ? note.lines : [];
        return `<article class="lecture-key-note">
          ${Number.isFinite(heardAt) ? `<button type="button" data-lecture-seek="${heardAt}">Jump to ${clock(heardAt)}</button>` : '<span>Lecture note</span>'}
          <strong>${escapeHtml(note.title || 'Key point')}</strong>
          ${lines.slice(0, 4).map(line => `<p>${escapeHtml(line)}</p>`).join('')}
          ${note.source ? `<details><summary>Transcript evidence</summary><p>${escapeHtml(note.source)}</p></details>` : ''}
        </article>`;
      }).join('')
      : '';

    const visualSection = document.querySelector('#lectureVisualSection');
    visualSection.hidden = visuals.length === 0;
    document.querySelector('#lectureVisuals').innerHTML = visuals.map(frame => `
      <button class="lecture-seek" type="button" data-lecture-seek="${Number(frame.time) || 0}">
        <img src="${escapeHtml(frame.image || '')}" alt="Lecture video frame at ${clock(frame.time)}" loading="lazy" />
        <span>${clock(frame.time)} · ${escapeHtml(frame.reason || 'visual checkpoint')}</span>
      </button>
    `).join('');
  }

  function renderAudioResult(result) {
    lastTranscript = result.transcript;
    const warnings = result.qualityWarnings || [];
    document.querySelector('#captureState').textContent = 'Transcript ready';
    document.querySelector('#captureTimer').textContent = clock(result.durationSeconds);
    const processingLabel = result.processingMode === 'hosted-temporary' ? 'automatic processing' : 'local processing';
    document.querySelector('#transcriptMeta').textContent = `${clock(result.durationSeconds)} audio · ${result.processingSeconds}s ${processingLabel} · ${warnings.length} term${warnings.length === 1 ? '' : 's'} to review`;
    document.querySelector('#copyTranscript').disabled = false;
    document.querySelector('#transcriptSearch').disabled = false;
    drawWaveform(result.waveform || []);

    renderWarnings(warnings);

    const transcript = document.querySelector('#transcriptContent');
    transcript.classList.remove('empty');
    transcript.innerHTML = result.segments.map(segment => `
      <div class="transcript-segment${segment.needsReview ? ' needs-review' : ''}" data-lecture-seek="${Number(segment.start) || 0}">
        <span class="transcript-time">${clock(segment.start)}</span>
        <p>${escapeHtml(segment.text)}</p>
      </div>`).join('');

    renderLectureStudyPackage(result);
    renderLectureInsights({
      concepts: result.detectedConcepts || [],
      notes: result.notes || [],
      cards: result.cards || []
    });
    if (result.summary && result.notes?.length && !result.studySheet) {
      const gate = document.querySelector('#sourceGate');
      gate.className = 'source-gate review';
      gate.innerHTML = `<strong>Study notes ready</strong><span>${result.notes.length} notes linked to spoken explanations. Check the transcript excerpts and jump back to the recording before relying on them.</span>`;
      document.querySelector('#lectureSubtitle').textContent = 'Lecture summary and study notes · review against your course material';
      document.querySelector('#audioCardDrafts').innerHTML = '<button type="button" class="button primary" data-lecture-sheet>Create illustrated summary and cloze cards</button><p>Uses the saved transcript without transcribing again.</p>';
    }
  }

  async function checkedLectureResponse(response, fallback) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  }

  async function lectureFetch(url, options = {}) {
    const token = await window.SyllabloomAuth?.getToken?.();
    if (!token || !state.account.signedIn) throw new Error('Sign in before processing a lecture.');
    return fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}), Authorization: `Bearer ${token}` }
    });
  }

  function waitForLecturePoll(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function rememberLectureJob(job) {
    localStorage.setItem(LECTURE_JOB_STORAGE, JSON.stringify({
      id: job.id,
      owner: state.account.userId,
      title: job.title,
      mediaId: job.mediaId || '',
    }));
  }

  async function pollLectureJob(jobId, title) {
    const owner = state.account.userId;
    while (true) {
      if (!state.account.signedIn || state.account.userId !== owner) throw new Error('Sign in to the same account to recover this lecture.');
      const response = await lectureFetch(`/api/lecture-jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const payload = await checkedLectureResponse(response, 'Lecture progress could not be checked.');
      if (!state.account.signedIn || state.account.userId !== owner) throw new Error('The signed-in account changed.');
      const job = payload.job || {};
      document.querySelector('#captureState').textContent = job.stage || 'Processing lecture';
      document.querySelector('#transcriptMeta').textContent = `${title} · ${Number(job.progress) || 0}% complete`;
      drawLectureProgress(Number(job.progress) || 0, 100);
      if (job.status === 'ready' && job.result) return job.result;
      if (job.status === 'failed') throw new Error(job.error || 'The lecture could not be processed.');
      await waitForLecturePoll(1800);
    }
  }

  async function generateIllustratedSheet(text, filename, units, progress = () => {}, assertOwner) {
    const owner = state.account.userId;
    const check = () => { if (!state.account.signedIn || state.account.userId !== owner) throw Error('Your account changed. Reopen the import in the original account.'); assertOwner?.(); };
    check();
    let payload = await checkedLectureResponse(await lectureFetch('/api/study-sheets', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,filename,units})}), 'The illustrated summary could not start.');
    check();
    const id = payload.job?.id;
    if (!id) throw Error('The summary job did not return an identifier.');
    const deadline = Date.now() + 15 * 60 * 1000;
    while (payload.job.status !== 'ready') {
      check();
      progress(payload.job.stage || 'Preparing illustrated summary…');
      if (payload.job.status === 'failed') throw Error(payload.job.error || 'Study sheet generation failed.');
      if (Date.now() > deadline) throw Error('The study sheet is still processing. Resume this import to recover its saved result.');
      await waitForLecturePoll(4000);
      check();
      payload = await checkedLectureResponse(await lectureFetch('/api/study-sheets/' + id), 'The summary status could not be recovered. Resume the import.');
    }
    check();
    return payload.job.result;
  }

  function prepareAdvancedExport(cards) {
    const images = {}, references = new Map();
    const prepared = cards.map(card => {
      if (card.noteType !== 'ImageOcclusion') return card;
      const image = card.occlusion.image;
      let reference = references.get(image);
      if (!reference) { reference = 'diagram-' + references.size; references.set(image,reference); images[reference] = image; }
      const {image: omitted, ...occlusion} = card.occlusion;
      return {...card, occlusion:{...occlusion,imageRef:reference}};
    });
    return {cards:prepared,preferences:state.anki,images};
  }

  function sheetHtml(sheet, sourceId) {
    return `<article class="study-sheet"><small>ILLUSTRATED SUMMARY → CLOZE CARDS → ANKI</small><h3>${escapeHtml(sheet.title)}</h3><p>${escapeHtml(sheet.overview)}</p><figure><img src="${escapeHtml(sheet.image)}" alt="AI-generated study illustration"><figcaption>${escapeHtml(sheet.imageCaption)}</figcaption></figure><button type="button" class="button" data-sheet-occlusion="${escapeHtml(sourceId)}">Make image occlusion cards from this illustration</button>${sheet.facts.map(fact=>`<details><summary>${escapeHtml(fact.title)}</summary><p>${escapeHtml(fact.sentence)}</p><small>${escapeHtml(fact.locator)}</small><blockquote>${escapeHtml(fact.quote)}</blockquote></details>`).join('')}<p>${escapeHtml(sheet.coverage)}</p></article>`;
  }

  async function processHostedLecture(blob, filename, markers, title, mediaId = '') {
    document.querySelector('#captureState').textContent = 'Preparing secure upload';
    const ticketResponse = await lectureFetch('/api/lecture-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, size: blob.size, type: blob.type })
    });
    const ticket = await checkedLectureResponse(ticketResponse, 'The lecture upload could not be prepared.');
    const token = await window.SyllabloomAuth?.getToken?.();
    const uploaded = await uploadLargeSourceFile(
      ticket.uploadUrl,
      blob,
      ticket.contentType,
      `Bearer ${token}`,
      percent => {
        document.querySelector('#captureState').textContent = `Uploading lecture · ${percent}%`;
        document.querySelector('#transcriptMeta').textContent = `${filename} · secure temporary upload ${percent}%`;
        drawLectureProgress(percent, 100);
      }
    );
    await checkedLectureResponse(uploaded, 'The lecture upload did not finish.');
    const createdResponse = await lectureFetch('/api/lecture-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathname: ticket.pathname, filename, title, markers })
    });
    const created = await checkedLectureResponse(createdResponse, 'The lecture job could not be started.');
    const jobId = created.job?.id;
    if (!jobId) throw new Error('The lecture job did not return an identifier.');
    state.latestSessionId = jobId;
    rememberLectureJob({ id: jobId, title, mediaId });
    const result = await pollLectureJob(jobId, title);
    await saveLectureStudyPackage(mediaId, result);
    try {
      const illustrated = await generateIllustratedSheet(result.transcript, filename + '.txt', {}, message => document.querySelector('#captureState').textContent = message);
      Object.assign(result, illustrated);
      const sourceId = 'lecture-sheet-' + illustrated.cards[0].id;
      if (!state.sources.some(source=>source.id===sourceId)) {
        const source = {id:sourceId,name:illustrated.studySheet.title,kind:'material',studySheet:illustrated.studySheet,draftCards:illustrated.cards,concepts:illustrated.concepts};
        if(new Blob([JSON.stringify([...state.sources,source])]).size > 3500000) throw Error('Class storage is full. Remove an unused source to save this summary.');
        state.sources.push(source);persistClassSources();await loadStoredSources();
      }
      result.studySheetSourceId = sourceId;
      await saveLectureStudyPackage(mediaId, result);
    } catch(error) {result.studySheetError=error.message;showToast('Your transcript is saved. '+error.message);}
    return result;
  }

  async function saveLectureStudyPackage(mediaId, result) {
    if (!mediaId) return;
    const media = await getMediaAsset(mediaId);
    if (!media) return;
    media.studyPackage = result;
    await mediaStoreWrite(store => store.put(media));
    await renderMediaLibrary();
  }

  async function resumeLatestLectureJob() {
    if (restoringLectureJob || !state.cloudBeta || !state.hostedTranscription || !state.account.signedIn) return;
    const saved = storedJson(LECTURE_JOB_STORAGE, null);
    if (!saved?.id || saved.owner !== state.account.userId) return;
    restoringLectureJob = true;
    setAudioBusy(true, 'Recovering lecture job');
    document.querySelector('#lastLectureSummary').hidden = false;
    document.querySelector('#lectureTitle').textContent = saved.title || 'Latest lecture';
    document.querySelector('#lectureSubtitle').textContent = `${state.className} · recovering automatic study package`;
    try {
      if (saved.mediaId) {
        const media = await getMediaAsset(saved.mediaId);
        if (media?.blob) {
          if (captureAudioUrl) URL.revokeObjectURL(captureAudioUrl);
          captureAudioUrl = URL.createObjectURL(media.blob);
          const videoPlayer = document.querySelector('#captureVideo');
          const audioPlayer = document.querySelector('#captureAudio');
          const isVideo = mediaLooksLikeVideo(media);
          videoPlayer.hidden = !isVideo;
          audioPlayer.hidden = isVideo;
          (isVideo ? videoPlayer : audioPlayer).src = captureAudioUrl;
        }
      }
      const result = await pollLectureJob(saved.id, saved.title || 'Latest lecture');
      await saveLectureStudyPackage(saved.mediaId, result);
      state.latestSessionId = saved.id;
      renderAudioResult(result);
      document.querySelector('#lectureSubtitle').textContent = `${state.className} · ${clock(result.durationSeconds)} lecture · recovered`;
    } catch (error) {
      if (/not found/i.test(error.message)) localStorage.removeItem(LECTURE_JOB_STORAGE);
    } finally {
      restoringLectureJob = false;
      setAudioBusy(false);
    }
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
    document.querySelector('#transcriptContent').innerHTML = `<p>Preparing ${state.cloudBeta ? 'automatic lecture processing' : 'a local, progressive transcript'}…</p>`;
    document.querySelector('#transcriptWarnings').hidden = true;
    document.querySelector('#lectureStudyPackage').hidden = true;
    document.querySelector('#transcriptSearch').value = '';
    document.querySelector('#transcriptSearch').disabled = true;
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
    let savedMediaAsset = null;
    if (options.persist !== false) {
      try {
        savedMediaAsset = await saveMediaAsset(blob, filename, options.origin || 'upload', markers, displayTitle);
      } catch (error) {
        storageError = error;
        showToast(error.message || 'The lecture could not be saved');
      }
    }

    if (state.cloudBeta && !state.hostedTranscription) {
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
        : mediaStorageMessage();
      if (!storageError) showToast('Lecture saved to your library');
      setAudioBusy(false);
      return;
    }

    if (state.cloudBeta) {
      try {
        const result = await processHostedLecture(blob, filename, markers, displayTitle, savedMediaAsset?.id || '');
        renderAudioResult(result);
        document.querySelector('#lectureSubtitle').textContent = `${state.className} · ${clock(result.durationSeconds)} lecture · study package ready`;
        document.querySelector('#recordingSafety').textContent = 'The temporary processing copy was deleted. Your original remains in this device library.';
        showToast(`${(result.notes || []).length} notes · ${(result.cards || []).length} card drafts · ${(result.visualKeyframes || []).length} visual checkpoints`);
      } catch (error) {
        document.querySelector('#captureState').textContent = 'Could not process lecture';
        document.querySelector('#transcriptMeta').textContent = 'Your device copy is still available';
        document.querySelector('#transcriptContent').innerHTML = `<div class="transcript-error"><strong>The study package could not be created.</strong><span>${escapeHtml(error.message)}</span></div>`;
        showToast(error.message || 'Lecture processing failed');
      } finally {
        setAudioBusy(false);
      }
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
    const units = sourceItem.kind === 'syllabus'
      ? `${Number(sourceItem.calendarEvents?.length || 0).toLocaleString()} calendar dates`
      : `${Number(sourceItem.unitCount || 0).toLocaleString()} ${sourceItem.unitLabel || 'items'}`;
    const words = `${Number(sourceItem.wordCount || 0).toLocaleString()} words`;
    const objectives = sourceItem.objectiveCount ? ` · ${sourceItem.objectiveCount} objective cues` : '';
    const concepts = sourceItem.concepts?.length ? ` · ${sourceItem.concepts.length} concepts` : '';
    const notes = sourceItem.notes?.length ? ` · ${sourceItem.notes.length} note${sourceItem.notes.length === 1 ? '' : 's'}` : '';
    if (sourceItem.studySheet) return `illustrated summary · ${sourceItem.studySheet.facts.length} cited facts · ${sourceItem.draftCards?.length || 0} cloze cards · saved with your class`;
    if (sourceItem.occlusionImage) return `diagram · ${sourceItem.draftCards?.length || 0} image occlusion cards · saved with your class`;
    const drafts = sourceItem.draftCards?.length ? ` · ${sourceItem.draftCards.length} cards ready` : '';
    const processing = sourceItem.sample
      ? 'example'
      : sourceItem.storage === 'session'
        ? 'study content saved; original file not stored'
        : 'saved in this browser';
    const classification = sourceItem.classificationReason && sourceItem.classificationReason !== 'Manually selected'
      ? ` · ${sourceItem.classificationReason}`
      : '';
    const calendarWarnings = sourceItem.calendarWarnings?.length
      ? ` · ${sourceItem.calendarWarnings.length} schedule date group${sourceItem.calendarWarnings.length === 1 ? '' : 's'} held back; year unclear`
      : '';
    return `${sourceItem.kind} · ${units} · ${words}${objectives}${concepts}${notes}${drafts}${classification}${calendarWarnings} · ${processing}`;
  }

  function persistClassSources() {
    localStorage.setItem('syllabloom-sources', JSON.stringify(state.sources));
  }

  function activeSyllabus() {
    return [...state.sources].reverse().find(item => item.kind === 'syllabus') || (state.useDemoSyllabus ? demoSyllabusSource : null);
  }

  function classMaterials() {
    const uploaded = state.sources.filter(item => item.kind !== 'syllabus');
    return state.includeSampleMaterial ? [sampleMaterialSource, ...uploaded] : uploaded;
  }

  function sourceRow(sourceItem) {
    const status = sourceItem.sample
      ? 'Example'
      : sourceItem.kind === 'syllabus'
        ? `${sourceItem.calendarEvents?.length || 0} dates`
        : (sourceItem.draftCards?.length ? `${sourceItem.draftCards.length} cards` : 'Parsed');
    return `
      <div class="surface file-row" data-source-id="${escapeHtml(sourceItem.id)}">
        <div><strong>${escapeHtml(sourceItem.name)}</strong><span>${escapeHtml(sourceMeta(sourceItem))}</span></div>
        <div class="actions">
          <span class="status">${escapeHtml(status)}</span>
          ${sourceItem.draftCards?.length ? `<button class="button" type="button" data-open-source-tools="${escapeHtml(sourceItem.id)}">View study tools</button>` : ''}
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
    const syllabi = state.sources.filter(item => item.kind === 'syllabus');
    const materials = classMaterials();
    const rows = [];
    if (syllabi.length) syllabi.forEach(item => rows.push(sourceRow(item)));
    else if (state.useDemoSyllabus) rows.push(sourceRow(demoSyllabusSource));
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
    const sourceItem = preferredSource || [...state.sources].reverse().find(item => item.studySheet) || [...state.sources].reverse().find(item => item.notes?.length || item.draftCards?.length);
    if (!sourceItem) {
      panel.hidden = true;
      return;
    }
    const study = window.SyllabloomSourceStudy;
    const concepts = study ? study.cleanConcepts(sourceItem.concepts) : (Array.isArray(sourceItem.concepts) ? sourceItem.concepts : []);
    const notes = study ? study.cleanNotes(sourceItem.notes) : (Array.isArray(sourceItem.notes) ? sourceItem.notes : []);
    const cards = window.SyllabloomCardSet.sourceCards([sourceItem]).filter(card => !study || study.isUsableCard(card)).map(card => state.lectureCards.find(saved => saved.sourceKey === lectureCardKey(card)) || card);
    panel.hidden = false;
    panel.dataset.sourceId = sourceItem.id;
    const startButton = document.querySelector('#startSourceStudy');
    startButton.disabled = !cards.length;
    startButton.textContent = `Study ${Math.min(5, cards.length)} cards`;
    document.querySelector('#sourceCardPreviews').innerHTML = cards.slice(0,3).map((card,index) => `<article class="source-card-preview"><small>${escapeHtml(card.noteType || 'Basic')} · CARD ${index+1}</small><h3>${window.SyllabloomAdvancedCards.render(card)}</h3><details><summary>Show answer</summary><div>${window.SyllabloomAdvancedCards.render(card,true)}</div><small>${escapeHtml(card.sourceLocation || 'Source passage')}</small>${card.sourceQuote ? `<blockquote>${escapeHtml(card.sourceQuote)}</blockquote>` : '<p>Check this answer in your original source.</p>'}</details></article>`).join('');
    const rows = window.SyllabloomSourceExperience.coverage(sourceItem,cards);
    const readable = rows.filter(row=>row.readable);
    document.querySelector('#sourceCoverageSummary').textContent = rows.length ? `${readable.filter(row=>row.count).length} of ${readable.length} readable sections have cited cards. ${rows.length-readable.length} section${rows.length-readable.length === 1 ? ' has' : 's have'} no readable text.` : 'Re-upload this source once to enable section coverage. Existing cards will be kept.';
    document.querySelector('#sourceCoverageRows').innerHTML = rows.map((row,index) => `<label class="coverage-row"><input type="checkbox" data-coverage-index="${index}" ${row.readable ? '' : 'disabled'}><span><strong>${escapeHtml(row.label)}: ${escapeHtml(row.status)}</strong><small>${escapeHtml(row.title)}</small>${row.lowText || row.imageWarning ? '<small>Limited text or visual content: check the original.</small>' : ''}</span></label>`).join('');
    document.querySelector('#generateSelectedSections').hidden = !readable.length;
    document.querySelector('#sourceStudyOutputEyebrow').textContent = sourceItem.name;
    document.querySelector('#sourceStudyOutputTitle').textContent = sourceItem.studySheet ? 'Your illustrated study summary' : `${cards.length} ready card${cards.length === 1 ? '' : 's'} from this source`;
    document.querySelector('#sourceStudyOutputSummary').textContent = sourceItem.studySheet ? `${cards.length} cloze drafts made from this summary. Check the cited facts, mask diagram labels, then review and export to Anki.` : 'Preview the questions, check their source passages, then try a short session. Edit anything that needs work.';
    const sheetContainer = document.querySelector('#sourceIllustratedSheet');
    if (sheetContainer) sheetContainer.innerHTML = sourceItem.studySheet ? sheetHtml(sourceItem.studySheet,sourceItem.id) : '';
    document.querySelector('#sourceStudyConcepts').innerHTML = concepts.length
      ? concepts.slice(0, 12).map(concept => `<span>${escapeHtml(concept.name || concept)}</span>`).join('')
      : '<p>No named concepts were found.</p>';
    document.querySelector('#sourceStudyNotes').innerHTML = notes.length
      ? notes.slice(0, 8).map(note => `<article><span>${note.slideNumber ? `Slide ${note.slideNumber}` : note.pageNumber ? `Page ${note.pageNumber}` : 'Source note'}</span><strong>${escapeHtml(note.title)}</strong>${(note.lines || []).slice(0, 4).map(line => `<p>${escapeHtml(line)}</p>`).join('')}</article>`).join('')
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
      state.baselineScore = 0;
      state.baselineAssessed = false;
    } else {
      const removed = state.sources.find(item => item.id === sourceId);
      state.sources = state.sources.filter(item => item.id !== sourceId);
      state.lectureCards = state.lectureCards.filter(card => card.sourceId !== sourceId);
      if (removed?.kind === 'syllabus') {
        state.syllabusName = activeSyllabus()?.name || 'No syllabus added';
        state.calendarEvents = state.calendarEvents.filter(event => event.sourceId !== sourceId);
        localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
      }
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
    const cards = window.SyllabloomCardSet.sourceCards(state.sources);
    return cards.filter(card => !window.SyllabloomSourceStudy || window.SyllabloomSourceStudy.isUsableCard(card));
  }

  function updateAnkiDesktopBridge() {
    const connectButton = document.querySelector('#connectAnkiDesktop');
    const sendButton = document.querySelector('#sendReadyCardsToAnki');
    const autoSync = document.querySelector('#autoSyncAnkiDesktop');
    const status = document.querySelector('#ankiDesktopStatus');
    if (!connectButton || !sendButton || !autoSync || !status) return;
    if (ankiDesktopSettings.autoSync && state.account.userId && ankiDesktopSettings.ownerId !== state.account.userId) {
      ankiDesktopSettings.autoSync = false;
      localStorage.setItem('syllabloom-anki-desktop-settings', JSON.stringify(ankiDesktopSettings));
    }
    autoSync.checked = Boolean(ankiDesktopSettings.autoSync);
    sendButton.disabled = collectApprovedCards().length === 0;
    connectButton.textContent = ankiDesktopConnected ? 'Anki Desktop connected' : 'Check Anki connection';
    if (!ankiDesktopConnected && !status.dataset.message) {
      status.textContent = 'Anki Desktop is not connected on this device. The downloadable deck remains available above.';
    }
  }

  async function checkAnkiDesktopConnection() {
    const status = document.querySelector('#ankiDesktopStatus');
    status.dataset.message = 'checking';
    status.textContent = 'Checking for Anki Desktop on this device…';
    try {
      const result = await window.SyllabloomAnkiConnect.createClient().connect();
      ankiDesktopConnected = true;
      status.textContent = `AnkiConnect ${result.version} found. Ready cards will go to Anki Desktop on this device.`;
      status.dataset.message = 'connected';
    } catch (error) {
      ankiDesktopConnected = false;
      status.textContent = error.message;
      status.dataset.message = 'disconnected';
    }
    updateAnkiDesktopBridge();
  }

  async function sendReadyCardsToDesktop({ automatic = false } = {}) {
    const cards = collectApprovedCards();
    const sendButton = document.querySelector('#sendReadyCardsToAnki');
    const status = document.querySelector('#ankiDesktopStatus');
    if (!cards.length) {
      status.textContent = 'Approve at least one card before sending it to Anki.';
      status.dataset.message = 'empty';
      return;
    }
    if (automatic && (!ankiDesktopSettings.autoSync || !state.account.userId || ankiDesktopSettings.ownerId !== state.account.userId)) return;
    const previousText = sendButton.textContent;
    sendButton.disabled = true;
    sendButton.textContent = 'Sending cards…';
    status.dataset.message = 'sending';
    status.textContent = `Sending ${cards.length} ready card${cards.length === 1 ? '' : 's'} to Anki Desktop…`;
    try {
      const result = await window.SyllabloomAnkiConnect.createClient().pushCards(cards, {
        deckName: state.anki.deck || state.className,
        format: state.anki.format,
        tags: state.anki.tags
      });
      ankiDesktopConnected = true;
      if (result.synced) {
        status.textContent = `${result.added} card${result.added === 1 ? '' : 's'} added; ${result.duplicates} already in Anki. Anki Desktop synced with AnkiWeb.`;
        if (!automatic) showToast(`${result.added} new card${result.added === 1 ? '' : 's'} sent to Anki`);
      } else {
        status.textContent = `${result.added} card${result.added === 1 ? '' : 's'} added to Anki Desktop, but AnkiWeb sync needs attention: ${result.syncError}`;
      }
      status.dataset.message = 'connected';
    } catch (error) {
      ankiDesktopConnected = false;
      status.textContent = error.message;
      status.dataset.message = 'disconnected';
      if (!automatic) showToast(error.message);
    } finally {
      sendButton.textContent = previousText;
      updateAnkiDesktopBridge();
    }
  }

  async function loadStoredSources() {
    const cardSources = state.sources.filter(sourceItem => sourceItem.draftCards?.length);
    const cards = sourceCardsFromLibrary();
    if (cards.length) {
      const latestSource = cardSources[cardSources.length - 1];
      const hadSampleIdentity = state.className === 'Untitled class' || state.classMode === 'sample' || (state.className === 'Human Anatomy' && state.classTerm === 'Fall 2023');
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
        state.baselineAssessed = false;
        localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
        localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
        syncAnkiFormFromState();
      }
      state.latestSessionId = `source-${latestSource.id}`;
      syncLectureCards(cards);
      persistClassProfile();
      syncAccountClassUsage();
    }
    renderSource();
    updateGenerationCount();
    renderStudy();
    updateAssessmentIntro();
  }

  function renderSourceQueue() {
    const queue = document.querySelector('#sourceQueue');
    const list = document.querySelector('#sourceQueueList');
    const addButton = document.querySelector('#sourceQueueAdd');
    const progress = document.querySelector('#sourceQueueProgress');
    const clearButton = document.querySelector('#sourceQueueClear');
    const uploadInput = document.querySelector('#sourceUpload');
    const uploadLabel = document.querySelector('#sourceUploadLabel');
    const defaultTypeTrigger = document.querySelector('#sourceKindTrigger');
    const questionStyleSelect = document.querySelector('#questionStyleMaterials');
    const feedback = document.querySelector('#sourceBatchFeedback');
    if (!queue || !list || !addButton || !progress) return;

    queue.hidden = sourceQueueItems.length === 0;
    feedback.hidden = !sourceBatchFeedback;
    feedback.textContent = sourceBatchFeedback;
    uploadInput.disabled = sourceBatchRunning;
    uploadLabel.classList.toggle('disabled', sourceBatchRunning);
    uploadLabel.setAttribute('aria-disabled', sourceBatchRunning ? 'true' : 'false');
    uploadLabel.textContent = sourceBatchRunning
      ? 'Adding documents…'
      : sourceQueueItems.length ? 'Choose more documents' : 'Choose documents';
    defaultTypeTrigger.disabled = sourceBatchRunning;
    questionStyleSelect.disabled = sourceBatchRunning;
    clearButton.disabled = sourceBatchRunning;

    if (!sourceQueueItems.length) {
      list.innerHTML = '';
      addButton.disabled = true;
      addButton.textContent = 'Add documents';
      progress.textContent = 'Review the file types, then add them together.';
      return;
    }

    list.innerHTML = sourceQueueItems.map(item => {
      const statusLabel = item.status === 'processing'
        ? (item.progressStatus || 'Reading')
        : item.status === 'done'
          ? item.duplicateSkipped ? 'Duplicate skipped' : 'Added'
          : item.status === 'failed'
            ? item.retryable ? 'Needs retry' : 'Check file'
            : 'Ready';
      const statusClass = item.status === 'failed'
        ? 'is-error'
        : item.status === 'done'
          ? 'is-done'
          : item.status === 'processing' ? 'is-processing' : '';
      const options = [
        ['auto', 'Auto-detect'],
        ['material', 'Class material'],
        ['syllabus', 'Syllabus'],
        ['assessment', 'Past assessment']
      ];
      const optionMarkup = options.map(([value, title]) =>
        '<option value="' + value + '"' + (item.kind === value ? ' selected' : '') + '>' + title + '</option>'
      ).join('');
      const menuMarkup = options.map(([value, title]) =>
        '<button class="source-kind-option" type="button" role="option" data-select-value="' + value + '" aria-selected="' + (item.kind === value ? 'true' : 'false') + '">' + title + '</button>'
      ).join('');
      const menuId = 'source-type-menu-' + item.id;
      return `
        <article class="source-queue-row ${statusClass}" data-source-queue-id="${escapeHtml(item.id)}">
          <div class="source-queue-file">
            <span class="source-queue-file-icon" aria-hidden="true">▤</span>
            <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(formatFileSize(item.size))}</span></div>
          </div>
          <div class="source-queue-kind">
            <span class="source-queue-kind-label">Document type</span>
            <div class="source-kind-picker source-queue-kind-picker" data-themed-select-picker>
              <select class="source-kind-native" data-source-queue-kind="${escapeHtml(item.id)}" aria-hidden="true" tabindex="-1" ${item.targetSourceId ? 'disabled' : ''}>${optionMarkup}</select>
              <button class="source-kind-trigger" type="button" aria-label="Document type for ${escapeHtml(item.name)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuId}" ${sourceBatchRunning || item.targetSourceId ? 'disabled' : ''}>
                <span data-select-current>${escapeHtml(options.find(option => option[0] === item.kind)?.[1] || 'Auto-detect')}</span>
                <span class="source-kind-trigger-arrow" aria-hidden="true"></span>
              </button>
              <div id="${menuId}" class="source-kind-menu" role="listbox" aria-label="Document type for ${escapeHtml(item.name)}" popover="auto">${menuMarkup}</div>
            </div>
          </div>
          <div class="source-queue-state">
            <span class="source-queue-status ${statusClass}">${statusLabel}</span>
            ${item.restartRequired ? `<button type="button" data-restart-source="${escapeHtml(item.id)}" ${sourceBatchRunning ? 'disabled' : ''}>Restart unfinished batch</button>` : ''}
            ${item.error ? '<small>' + escapeHtml(item.error) + '</small>' : item.preflightLabel ? '<small class="is-meta">' + escapeHtml(item.preflightLabel) + '</small>' : ''}
          </div>
          <button class="source-queue-remove" type="button" data-remove-queued-source="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)} from this batch" ${sourceBatchRunning ? 'disabled' : ''}>×</button>
        </article>`;
    }).join('');

    const processable = sourceQueueItems.filter(item =>
      item.status === 'queued' || (item.status === 'failed' && item.retryable)
    );
    addButton.disabled = sourceBatchRunning || processable.length === 0;
    addButton.textContent = sourceBatchRunning
      ? 'Adding documents…'
      : sourceQueueItems.some(item => item.status === 'queued')
        ? 'Add ' + processable.length + (processable.length === 1 ? ' document' : ' documents')
        : 'Resume import';

    const current = sourceQueueItems.find(item => item.status === 'processing');
    if (sourceBatchRunning && current && sourceBatchProgress) {
      progress.textContent = (current.progressLabel || 'Reading') + ' · ' + sourceBatchProgress.current + ' of ' + sourceBatchProgress.total + ' · ' + current.name;
    } else if (processable.length) {
      progress.textContent = processable.length + ' ready. One unreadable file will not stop the others.';
    } else {
      progress.textContent = 'Remove or replace the marked files before adding this batch.';
    }
    initializeThemedSelectPickers();
  }

  async function queueSourceFiles(files) {
    await importRestore;
    const selected = window.SyllabloomSourceBatch.createQueueItems(
      files,
      document.querySelector('#sourceKind').value
    );
    sourceQueueItems = [...sourceQueueItems, ...selected];
    sourceBatchFeedback = '';
    await persistImportQueue();
    renderSourceQueue();
    if (selected.length) {
      showToast(selected.length === 1
        ? '1 document added to the import list'
        : selected.length + ' documents added to the import list');
    }
  }

  async function addQueuedSources() {
    if (sourceBatchRunning) return;
    const processable = sourceQueueItems.some(item =>
      item.status === 'queued' || (item.status === 'failed' && item.retryable)
    );
    if (!processable) return;
    if (!state.account.signedIn) { window.dispatchEvent(new CustomEvent('syllabloom:auth-request', {detail:{intent:'upload'}})); return; }
    await importRestore;
    const owner = importOwner;
    const workingQueue = sourceQueueItems;
    const assertOwner = () => { if (owner !== importOwner) throw new Error('Account changed. Sign back in to resume this import.'); };

    sourceBatchRunning = true;
    const questionStyle = normalizedQuestionStyle(state.anki.questionStyle);
    sourceBatchProgress = null;
    sourceBatchFeedback = '';
    renderSourceQueue();
    let result;
    try {
      const access = await window.SyllabloomBilling?.ensureAccess();
      assertOwner();
      if (access && !access.access) { showToast('Choose a plan before generating cards. Your upload list is saved.'); navigate('billing'); return; }
      window.SyllabloomEvents?.track('upload_started', {files:workingQueue.filter(item=>item.status==='queued' || item.retryable).length});
      await persistImportQueue(owner, workingQueue);
      result = await window.SyllabloomSourceBatch.processQueue(
        workingQueue,
        item => uploadSource(item.file, item.kind, {
          silent: true,
          manageButton: false,
          queueItem: item,
          assertOwner,
          checkpoint: () => persistImportQueue(owner, workingQueue),
          questionStyle,
          onProgress: message => {
            item.progressLabel = message;
            renderSourceQueue();
          }
        }),
        async (item, details) => {
          await persistImportQueue(owner, workingQueue);
          assertOwner();
          if (item.status === 'processing') {
            sourceBatchProgress = { current: details.index + 1, total: details.total };
          }
          renderSourceQueue();
        }
      );
    } catch (error) {
      if (owner === importOwner) showToast(error.message || 'Import paused. Resume to continue.');
      return;
    } finally {
      sourceBatchRunning = false;
      await persistImportQueue(owner, workingQueue);
      renderSourceQueue();
    }
    if (owner !== importOwner) return;
    const completed = sourceQueueItems.filter(item => item.status === 'done');
    const added = completed.filter(item => !item.duplicateSkipped && !item.targetSourceId);
    const expanded = completed.filter(item => item.targetSourceId && !item.duplicateSkipped);
    const duplicateSkipped = completed.filter(item => item.duplicateSkipped).length;
    const remainingItems = sourceQueueItems.filter(item => item.status !== 'done');
    const cardCount = added.reduce((total, item) => total + (item.result?.draftCards?.length || 0), 0);
    const noteCount = added.reduce((total, item) => total + (item.result?.notes?.length || 0), 0);
    const calendarCount = added.reduce((total, item) => total + (item.result?.calendarEvents?.length || 0), 0);
    const calendarWarningCount = added.reduce((total, item) => total + (item.result?.calendarWarnings?.length || 0), 0);
    const contentDocumentCount = added.filter(item => item.result?.kind !== 'syllabus').length;
    sourceQueueItems = remainingItems;
    await persistImportQueue();
    sourceBatchRunning = false;
    sourceBatchProgress = null;
    const remaining = sourceQueueItems.length;
    const feedbackParts = [];
    if (added.length) feedbackParts.push(added.length + ' document' + (added.length === 1 ? '' : 's') + ' added');
    if (expanded.length) feedbackParts.push(`${expanded.reduce((total,item)=>total+(item.addedCardCount || 0),0)} additional unique cards added; existing cards kept`);
    if (duplicateSkipped) feedbackParts.push(duplicateSkipped + ' exact duplicate' + (duplicateSkipped === 1 ? '' : 's') + ' skipped without reprocessing');
    if (cardCount) feedbackParts.push(cardCount + ' source-based card' + (cardCount === 1 ? '' : 's') + ' ready');
    if (noteCount) feedbackParts.push(noteCount + ' note section' + (noteCount === 1 ? '' : 's') + ' added');
    if (calendarCount) feedbackParts.push(calendarCount + ' syllabus date' + (calendarCount === 1 ? '' : 's') + ' added to Calendar');
    if (calendarWarningCount) feedbackParts.push(calendarWarningCount + ' calendar note' + (calendarWarningCount === 1 ? '' : 's') + ' need review');
    if (contentDocumentCount && !cardCount) feedbackParts.push('No study cards were generated; check the document type or selectable text');
    else if (added.length) feedbackParts.push('Review the imported content in Materials and Review');
    if (remaining) feedbackParts.push(remaining + ' document' + (remaining === 1 ? '' : 's') + ' still need attention');
    sourceBatchFeedback = feedbackParts.length ? feedbackParts.join(' · ') + '.' : '';
    renderSourceQueue();
    showToast(remaining
      ? remaining + ' document' + (remaining === 1 ? '' : 's') + ' need attention'
      : result.succeeded + ' document' + (result.succeeded === 1 ? '' : 's') + ' processed');
  }

  function uploadLargeSourceFile(url, file, contentType, authorization, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', url);
      request.timeout = 10 * 60 * 1000;
      request.addEventListener('timeout', () => reject(new Error('The upload timed out. Check your connection and retry.')));
      request.setRequestHeader('Content-Type', contentType);
      if (authorization) request.setRequestHeader('Authorization', authorization);
      request.upload.addEventListener('progress', event => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      request.addEventListener('load', () => {
        resolve(new Response(request.responseText, { status: request.status }));
      });
      request.addEventListener('error', () => reject(new Error('The document upload was interrupted. Check your connection and retry.')));
      request.addEventListener('abort', () => reject(new Error('The document upload was cancelled.')));
      request.send(file);
    });
  }

  async function checkedSourceResponse(response, fallback) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || fallback);
      error.code = payload.code || payload.errorCode || '';
      if (response.status === 402 && error.code === 'subscription_required') {
        location.hash = '#billing';
        window.SyllabloomBilling?.refresh();
      }
      error.retryable = payload.retryable === undefined
        ? response.status < 500
        : payload.retryable !== false;
      error.fileFingerprint = payload.fileFingerprint || '';
      error.restartRequired = error.code === 'BATCH_RESTART_REQUIRED';
      throw error;
    }
    return payload;
  }

  function sourceRequest(url, options, assertOwner = () => {}, transport) {
    const auth = { getToken: async settings => {
      const token = await window.SyllabloomAuth?.getToken?.(settings);
      assertOwner();
      return token;
    } };
    return window.SyllabloomSourceBatch.authenticatedRequest(url, options, auth, transport);
  }

  async function uploadLargeSource(file, kind, onProgress = () => {}, request = sourceRequest) {
    const ticketResponse = await request('/api/source-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, size: file.size })
    });
    const ticket = await checkedSourceResponse(ticketResponse, 'The secure upload could not be prepared.');
    const uploaded = await request(ticket.uploadUrl, {
      method: 'PUT', headers: { 'Content-Type': ticket.contentType }, body: file
    }, (url, init) => uploadLargeSourceFile(url, init.body, init.headers['Content-Type'], init.headers.Authorization, onProgress));
    await checkedSourceResponse(uploaded, 'The document upload did not finish.');
    const response = await request('/api/source', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, kind, operation: 'inspect', pathname: ticket.pathname })
    });
    return await checkedSourceResponse(response, 'The document could not be read.');
  }

  async function uploadSource(file, kind = 'auto', options = {}) {
    const label = document.querySelector('#sourceUploadLabel');
    const priorText = label.textContent;
    const manageButton = options.manageButton !== false;
    const queueItem = options.queueItem || null;
    if (queueItem?.targetSourceId) {
      if (!queueItem.inspectionCache) throw new Error('Select the source sections again to prepare this request.');
      kind = queueItem.inspectionCache.kind;
    }
    const questionStyle = normalizedQuestionStyle(options.questionStyle || state.anki.questionStyle);
    const request = async (url, init, transport) => {
      options.assertOwner?.();
      const response = await sourceRequest(url, init, options.assertOwner, transport);
      options.assertOwner?.();
      return response;
    };
    let lastProgressLabel = '';
    let lastProgressAt = 0;
    const reportProgress = message => {
      const now = Date.now();
      if (message === lastProgressLabel || (now - lastProgressAt < 250 && !/\b(?:of|%)\b/.test(message))) return;
      lastProgressLabel = message;
      lastProgressAt = now;
      if (manageButton) label.textContent = message;
      if (queueItem) {
        queueItem.progressLabel = message;
        queueItem.progressStatus = message.toLowerCase().includes('batch') ? 'Drafting' :
          message.toLowerCase().includes('page') || message.toLowerCase().includes('ocr') ? 'Reading scans' :
            message.toLowerCase().includes('upload') ? 'Uploading' : 'Reading';
      }
      options.onProgress?.(message);
    };
    let token = '';
    let payload;
    if (manageButton) {
      label.textContent = 'Reading source…';
      label.classList.add('disabled');
    }
    try {
      reportProgress('Inspecting the source before card generation…');
      token = await window.SyllabloomAuth?.getToken?.();
      const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (!token && !isLocalDevelopment) throw new Error('Sign in before adding course materials.');
      const inspectOcrText = async (pageTexts, fileFingerprint) => {
        const text = pageTexts.filter(page => page.trim()).join('\n');
        reportProgress('Updating the source preview with on-device OCR…');
        const response = await request('/api/source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'inspect-text',
            filename: file.name,
            kind,
            extractedText: text,
            pageTexts,
            fileFingerprint
          })
        });
        return checkedSourceResponse(response, 'The scanned PDF could not be prepared.');
      };

      const inspected = queueItem?.inspectionCache;
      if (inspected?.kind === kind) {
        payload = structuredClone(inspected.payload);
      } else {
        try {
          if (!isLocalDevelopment && file.size > 3 * 1024 * 1024) {
            payload = await uploadLargeSource(file, kind, percent => {
              reportProgress(`Uploading securely… ${percent}%`);
            }, request);
          } else {
            reportProgress('Inspecting the source before card generation…');
            const body = new FormData();
            body.append('source', file, file.name);
            body.append('kind', kind);
            body.append('questionStyle', questionStyle);
            body.append('inspect', '1');
            const response = await request('/api/source', {
              method: 'POST',
              body
            });
            payload = await checkedSourceResponse(response, 'The document could not be read.');
          }
        } catch (inspectError) {
          if (inspectError?.code !== 'NO_SELECTABLE_TEXT' || !String(file.name || '').toLowerCase().endsWith('.pdf')) throw inspectError;
          reportProgress('No text layer · reading scanned pages on this device…');
          const reading = await readPdfTextOnDevice(file, [], [], reportProgress);
          payload = await inspectOcrText(reading.pageTexts, inspectError.fileFingerprint);
        }

        if (String(file.name || '').toLowerCase().endsWith('.pdf')) {
          const lowTextPages = payload.source?.preflight?.lowTextPages || [];
          if (lowTextPages.length) {
            const reading = await readPdfTextOnDevice(file, lowTextPages, payload.extractedUnits?.pageTexts || [], reportProgress);
            payload = await inspectOcrText(reading.pageTexts, payload.source.fileFingerprint);
          }
        }
        if (queueItem && payload?.source) queueItem.inspectionCache = { kind, payload: structuredClone(payload) };
      }
      if (!payload?.source) throw new Error('The source preview did not contain readable course material.');
      options.assertOwner?.();
      await options.checkpoint?.();
      const detectedKind = payload.source.kind || kind;
      if (queueItem && payload.source.preflight && !payload.source.preflight.requiresCards) {
        const preflight = payload.source.preflight;
        const detail = detectedKind === 'syllabus'
          ? `${payload.source.calendarEvents?.length || 0} calendar dates detected · no AI generation`
          : 'No card generation needed for this source';
        queueItem.preflightLabel = `${preflight.unitCount} ${preflight.unitLabel} · ${preflight.inputCharacters.toLocaleString()} readable characters · ${detail}`;
        options.onProgress?.(queueItem.preflightLabel);
      }

      window.SyllabloomEvents?.track('extraction_succeeded', {fileType:file.name.split('.').pop().toLowerCase()});
      const duplicate = !queueItem?.targetSourceId && state.sources.find(item =>
        item.fileFingerprint && item.fileFingerprint === payload.source.fileFingerprint
      );
      if (duplicate) {
        if (!duplicate.studySections?.length && payload.source.studySections?.length) { duplicate.studySections=payload.source.studySections; persistClassSources(); renderSourceStudyOutput(duplicate); }
        if (queueItem) {
          queueItem.duplicateSkipped = true;
          queueItem.progressLabel = 'Exact duplicate · skipped';
        }
        if (!options.silent) showToast(`${file.name} is already in Materials. It was not processed again.`);
        return duplicate;
      }

      if (payload.source.preflight?.requiresCards) {
        const text = payload.extractedText || '';
        const units = payload.extractedUnits || {};
        const preflight = payload.source.preflight;
        const batchCount = Number(preflight.batchCount) || 0;
        if (!text.trim() || !batchCount) throw new Error('No selectable text was found for card generation. Add slide notes or text, then retry.');
        if (queueItem) {
          const imageGap = preflight.slidesWithUnlabeledImages?.length
            ? ` · ${preflight.slidesWithUnlabeledImages.length} image-only slide${preflight.slidesWithUnlabeledImages.length === 1 ? '' : 's'} may need descriptions`
            : '';
          queueItem.preflightLabel = `${preflight.unitCount} ${preflight.unitLabel} · ${preflight.inputCharacters.toLocaleString()} readable characters · ${batchCount} card batch${batchCount === 1 ? '' : 'es'}${imageGap}`;
          options.onProgress?.(queueItem.preflightLabel);
        }
        if (state.cloudBeta) {
        const result = await generateIllustratedSheet(text, file.name, units, reportProgress, options.assertOwner);
        payload.source.studySheet = result.studySheet;
        payload.source.draftCards = result.cards;
        payload.source.concepts = result.concepts;
        payload.source.notes = result.studySheet.facts.map(fact => ({title:fact.title,lines:[fact.sentence]}));
        payload.source.generation = {...result.generation, generatedAt:new Date().toISOString(), qualityGate:'summary facts linked to exact course excerpts'};
        } else {
        const identity = window.SyllabloomSourceBatch.generationKey(payload.source, file.name, questionStyle);
        const cache = queueItem?.generationCache;
        const batchCache = cache?.identity === identity
          ? cache
          : { identity, results: [] };
        if (queueItem) queueItem.generationCache = batchCache;
        const generatedCards = [];
        const generatedConcepts = [];
        for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
          let result = batchCache.results[batchIndex];
          if (!result) {
            reportProgress(`Preparing card batch ${batchIndex + 1} of ${batchCount}…`);
            if (queueItem) queueItem.activeBatchIndex = batchIndex;
            await options.checkpoint?.();
            let response;
            try {
              response = await request('/api/source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  operation: 'generate-batch',
                  durable: true,
                  restartUncertain: queueItem?.restartUncertain === true && queueItem?.restartBatchIndex === batchIndex,
                  filename: file.name,
                  kind: detectedKind,
                  extractedText: text,
                  extractedUnits: units,
                  textFingerprint: payload.source.fingerprint,
                  batchIndex,
                  questionStyle
                })
              });
            } catch (error) {
              // The request may have reached the model before the connection failed.
              error.retryable = true;
              error.message = 'Connection interrupted. Choose Resume import to recover the saved batch result.';
              throw error;
            }
            let batchPayload;
            try { batchPayload = await checkedSourceResponse(response, 'This card batch could not finish. Choose Resume import to recover its result.'); }
            catch (error) {
              if (response.status >= 500 && !error.restartRequired) error.retryable = true;
              throw error;
            }
            result = batchPayload.result;
            if (!result || !Array.isArray(result.cards)) throw new Error('The card batch returned an incomplete result.');
            batchCache.results[batchIndex] = result;
            if (queueItem?.restartBatchIndex === batchIndex) queueItem.restartUncertain = false;
            await options.checkpoint?.();
          }
          generatedCards.push(...(result.cards || []));
          generatedConcepts.push(...(result.concepts || []));
          reportProgress(`Prepared card batch ${batchIndex + 1} of ${batchCount} · ${generatedCards.length} cards verified so far.`);
        }
        const seenCards = new Set();
        payload.source.draftCards = generatedCards.filter(card => {
          const key = window.SyllabloomCardSet.contentKey(card);
          if (!key || seenCards.has(key)) return false;
          seenCards.add(key);
          return true;
        });
        const seenConcepts = new Set();
        payload.source.concepts = generatedConcepts.filter(concept => {
          const key = String(concept?.name || '').trim().toLocaleLowerCase();
          if (!key || seenConcepts.has(key)) return false;
          seenConcepts.add(key);
          return true;
        });
        if (!payload.source.draftCards.length) {
          throw new Error('We could read this source, but could not verify useful study cards. Try a clearer or more concept-focused file.');
        }
        const batchGeneration = batchCache.results.find(Boolean)?.generation || {};
        payload.source.generation = {
          provider: 'OpenAI',
          model: batchGeneration.model || 'gpt-5.4-nano',
          inputCharacters: preflight.inputCharacters,
          chunkCount: preflight.chunkCount,
          batchCount,
          generatedAt: new Date().toISOString(),
          questionStyle,
          cardsAccepted: payload.source.draftCards.length,
          qualityGate: 'exact source quote, source-location, and answer-term overlap checked'
        };
        }
      }

      options.assertOwner?.();
      delete payload.extractedText;
      delete payload.extractedUnits;
      const previousSource = state.sources.find(item => item.id === payload.source.id);
      payload.source = queueItem?.targetSourceId
        ? window.SyllabloomSourceExperience.mergeAdditional(state.sources.find(item=>item.id===queueItem.targetSourceId), payload.source, window.SyllabloomCardSet)
        : window.SyllabloomCardSet.mergeSource(previousSource, payload.source);
      if(queueItem) queueItem.addedCardCount = Math.max(0,(payload.source.draftCards?.length || 0)-(previousSource?.draftCards?.length || 0));
      if (detectedKind === 'syllabus') {
        state.useDemoSyllabus = false;
        state.syllabusName = payload.source.name;
      }
      const wasUsingSample = state.includeSampleMaterial;
      const wasSampleClass = state.classMode === 'sample' || state.className === 'Untitled class';
      state.includeSampleMaterial = false;
      state.classMode = 'custom';
      state.useDemoSyllabus = false;
      if (detectedKind !== 'syllabus' && !state.sources.some(item => item.kind === 'syllabus')) state.syllabusName = 'No syllabus added';
      if (wasUsingSample) {
        state.statuses = {};
        state.edits = {};
        state.baselineScore = 0;
        state.baselineAssessed = false;
        state.calendarEvents = [];
        localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
      }
      if (wasSampleClass) {
        const inferredClassName = payload.source.courseName || lectureName(file.name) || 'Untitled class';
        const inferredTerm = payload.source.term || 'Term not set';
        setClassLabels(inferredClassName, inferredTerm);
        state.anki.deck = inferredClassName;
        state.anki.setName = '';
        state.anki.tags = classTag(inferredClassName);
        localStorage.setItem('syllabloom-anki-preferences', JSON.stringify(state.anki));
        syncAnkiFormFromState();
        syncStateToOnboardingAnki();
      }
      if (detectedKind === 'syllabus') {
        if (payload.source.courseName) setClassLabels(payload.source.courseName, payload.source.term || state.classTerm);
        state.calendarEvents = state.calendarEvents.filter(event => event.sourceId !== payload.source.id);
        const combinedEvents = [...state.calendarEvents, ...(payload.source.calendarEvents || [])];
        state.calendarEvents = [...new Map(combinedEvents.map(event => [event.id, event])).values()];
        localStorage.setItem('syllabloom-calendar-events', JSON.stringify(state.calendarEvents));
        if (payload.source.calendarEvents?.length) {
          const cursorYear = state.calendarCursor.getFullYear();
          const cursorMonth = state.calendarCursor.getMonth();
          const hasDatesInVisibleMonth = payload.source.calendarEvents.some(event => {
            const eventDate = new Date(`${event.date}T12:00:00`);
            return eventDate.getFullYear() === cursorYear && eventDate.getMonth() === cursorMonth;
          });
          const nearestFuture = payload.source.calendarEvents.find(event => event.date >= localIsoDate(new Date()));
          if (!hasDatesInVisibleMonth && nearestFuture) {
            const eventDate = new Date(`${nearestFuture.date}T12:00:00`);
            state.calendarCursor = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1, 12);
          }
        }
      }
      state.sources = state.sources.filter(item => item.id !== payload.source.id);
      state.sources.push(payload.source);
      persistClassSources();
      persistClassProfile();
      syncAccountClassUsage();
      const sourceCards = sourceCardsFromLibrary();
      if (sourceCards.length) {
        state.latestSessionId = `source-${payload.source.id}`;
        const retainedLectureCards = state.lectureCards.filter(card => !card.sourceId);
        syncLectureCards([...retainedLectureCards, ...sourceCards]);
      }
      renderSource();
      updateGenerationCount();
      updateReviewSurface();
      renderStudy();
      updateAssessmentIntro();
      renderSourceStudyOutput(detectedKind === 'syllabus' ? null : payload.source);
      if(payload.source.draftCards?.length) window.SyllabloomEvents?.track('generation_succeeded', {cards:queueItem?.addedCardCount ?? payload.source.draftCards.length});
      if(detectedKind !== 'syllabus') document.querySelector('#sourceStudyOutput').scrollIntoView({behavior:'smooth',block:'start'});
      if (detectedKind !== 'syllabus' && (payload.source.draftCards || []).length
        && ankiDesktopSettings.autoSync && ankiDesktopSettings.ownerId === state.account.userId) {
        sendReadyCardsToDesktop({ automatic: true });
      }
      if (detectedKind === 'syllabus') {
        const dateCount = payload.source.calendarEvents?.length || 0;
        const hasYearWarning = (payload.source.calendarWarnings || []).length > 0;
        if (!options.silent) {
          showToast(dateCount
            ? `${dateCount} syllabus dates added to Calendar${hasYearWarning ? '; dates with unclear years were left out' : ''}`
            : hasYearWarning
              ? `${file.name} read; dates need a clear calendar year before import`
              : `${file.name} read · no clear dated schedule rows found`);
        }
      } else {
        if (!options.silent) {
          showToast(sourceCards.length
            ? `${file.name} · ${sourceCards.length} cards and ${(payload.source.notes || []).length} note sections ready`
            : `${file.name} was read, but it did not contain enough study text`);
        }
      }
      return payload.source;
    } catch (error) {
      window.SyllabloomEvents?.track('import_failed', {reason:'unknown',fileType:file.name.split('.').pop().toLowerCase()});
      if (!options.silent) showToast(error.message);
      throw error;
    } finally {
      if (manageButton) {
        label.textContent = priorText;
        label.classList.remove('disabled');
      }
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
      updateMediaStorageCopy();
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
        ? 'Recording on this device · screen kept awake'
        : 'Recording on this device · keep this screen open';
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
    const route = event.state?.syllabloom || { surface: 'landing' };
    restoreShellRoute(event.state?.syllabloom || route);
    if (route.surface === 'landing') {
      const section = document.getElementById(window.location.hash.slice(1));
      if (section?.closest('#landing')) {
        window.requestAnimationFrame(() => section.scrollIntoView({ behavior: 'auto', block: 'start' }));
      }
    }
  });

  document.querySelectorAll('.marketing-nav nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const section = document.getElementById(link.hash.slice(1));
      if (!section) return;
      event.preventDefault();
      const url = `${window.location.pathname}${window.location.search}${link.hash}`;
      const currentRoute = shellRoute();
      const snapshot = {
        ...(window.history.state || {}),
        syllabloom: { ...(currentRoute || {}), surface: 'landing' }
      };
      window.history[window.location.hash === link.hash ? 'replaceState' : 'pushState'](snapshot, '', url);
      section.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  });

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !mediaRecorder || mediaRecorder.state === 'inactive' || recordingWakeLock || !('wakeLock' in navigator)) return;
    await requestRecordingWakeLock();
  });

  document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
  document.querySelector('#knowledge').addEventListener('click', event => {
    const topicButton = event.target.closest('[data-topic-action]');
    if (topicButton) {
      activateCourseTopic(topicButton.dataset.topicName || '', topicButton.dataset.topicAction);
      return;
    }
    if (event.target.closest('[data-focus-calendar]')) {
      const form = document.querySelector('#calendarEventForm');
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => document.querySelector('#calendarEventTitle').focus(), 250);
    }
  });
  document.querySelector('[data-clear-study-focus]').addEventListener('click', () => {
    shortStudy = null;
    state.studyFocusConcept = '';
    state.studyIndex = 0;
    renderStudy();
  });
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
  document.querySelectorAll('[data-start-quick-check]').forEach(button => button.addEventListener('click', () => {
    if (!state.includeSampleMaterial && !approvedLectureCards().length) {
      navigate('source');
      document.querySelector('#sourceUploadLabel')?.focus();
      return;
    }
    navigate('quick-check');
    startQuickCheck();
  }));
  document.querySelectorAll('[data-open-profile]').forEach(button => button.addEventListener('click', () => openAccountPage('profile')));
  document.querySelectorAll('[data-open-billing]').forEach(button => button.addEventListener('click', () => openAccountPage('billing')));
  document.querySelectorAll('[data-account-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.accountView)));
  window.addEventListener('syllabloom:open-profile', () => openAccountPage('profile'));
  document.querySelectorAll('[data-start-onboarding]').forEach(button => button.addEventListener('click', startOrResumeClass));
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
  document.querySelectorAll('.question-style-select').forEach(select => select.addEventListener('change', event => {
    const value = normalizedQuestionStyle(event.currentTarget.value);
    if (event.currentTarget.id === 'questionStyleFull') {
      renderQuestionStyleDescriptions(value);
      return;
    }
    setQuestionStyle(value);
  }));

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
    showToast('Class date added to the calendar');
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
    const clickedEventId = event.target.closest('[data-calendar-event-id]')?.dataset.calendarEventId;
    const calendarEvent = clickedEventId
      ? state.calendarEvents.find(item => item.id === clickedEventId)
      : state.calendarEvents.find(item => item.date === day.dataset.calendarDate);
    const referenceEvent = state.showFederalHolidays
      ? [state.calendarCursor.getFullYear() - 1, state.calendarCursor.getFullYear(), state.calendarCursor.getFullYear() + 1]
        .flatMap(year => window.SyllabloomCalendarFeatures.getUsFederalHolidays(year))
        .find(item => clickedEventId ? item.id === clickedEventId : item.date === day.dataset.calendarDate)
      : null;
    const eventItem = calendarEvent || referenceEvent;
    if (eventItem) {
      renderCalendarEventEvidence(eventItem);
      return;
    }
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
  document.querySelector('#showFederalHolidays').addEventListener('change', event => {
    state.showFederalHolidays = event.currentTarget.checked;
    localStorage.setItem('syllabloom-show-federal-holidays', String(state.showFederalHolidays));
    renderClassPlanner();
  });
  document.querySelector('#importSchedulePhoto').addEventListener('click', () => document.querySelector('#calendarSchedulePhotoInput').click());
  document.querySelector('#calendarSchedulePhotoInput').addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    await importCalendarSchedulePhoto(file);
  });
  document.querySelector('#closeCalendarScheduleImport').addEventListener('click', () => document.querySelector('#calendarScheduleImportDialog').close());
  document.querySelector('#cancelCalendarScheduleImport').addEventListener('click', () => document.querySelector('#calendarScheduleImportDialog').close());
  document.querySelector('#calendarScheduleImportDialog').addEventListener('close', () => {
    calendarImportOcrText = '';
    document.querySelector('#calendarScheduleImportCandidates').replaceChildren();
  });
  document.querySelector('#calendarScheduleImportYear').addEventListener('change', () => {
    if (calendarImportOcrText) renderCalendarImportCandidates(calendarImportOcrText);
  });
  document.querySelector('#calendarScheduleImportCandidates').addEventListener('change', updateCalendarImportSaveButton);
  document.querySelector('#calendarScheduleImportCandidates').addEventListener('input', updateCalendarImportSaveButton);
  document.querySelector('#calendarScheduleImportForm').addEventListener('submit', event => {
    event.preventDefault();
    saveCalendarImportCandidates();
  });
  document.querySelector('#dailyStudyMinutes').addEventListener('input', event => {
    state.dailyStudyMinutes = Math.min(240, Math.max(10, Number(event.target.value) || 35));
    persistCourseState();
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
    if (state.account.userId !== (detail.userId || '')) shortStudy = null;
    state.account.signedIn = Boolean(detail.signedIn);
    state.account.email = detail.email || '';
    state.account.userId = detail.userId || '';
    state.account.displayName = detail.displayName || '';
    state.account.imageUrl = detail.imageUrl || '';
    restoreImportQueue(state.account.userId);
    if (state.account.signedIn && state.account.userId) {
      const usageByUser = storedJson('syllabloom-class-usage-by-user', {});
      const hasScopedUsage = Object.prototype.hasOwnProperty.call(usageByUser, state.account.userId);
      const canUseActiveProfile = !classProfileOwnerId || classProfileOwnerId === state.account.userId;
      const activeProfileUsage = canUseActiveProfile ? accountClassUsage() : 0;
      if (hasScopedUsage) {
        state.account.classesUsed = Math.max(Number(usageByUser[state.account.userId]) || 0, activeProfileUsage);
      } else if (state.account.userId === cachedAccountUserId) {
        state.account.classesUsed = Math.max(Number(savedAccount.classesUsed) || 0, activeProfileUsage);
      } else if (!cachedAccountUserId) {
        state.account.classesUsed = activeProfileUsage;
      } else {
        state.account.classesUsed = 0;
      }
    }
    state.account.plan = 'free';
    updateMarketingStartLabels();
    saveAccount();
    closeMediaPreview();
    renderMediaLibrary();
    renderProfile();
    if (state.view === 'billing') renderBillingPage();
    if (state.account.signedIn && state.pendingClassResume) {
      state.pendingClassResume = false;
      const savedOwnerId = classProfileOwnerId || cachedAccountUserId;
      const profileBelongsToUser = !savedOwnerId || savedOwnerId === state.account.userId;
      if (profileBelongsToUser) closeOnboarding('push');
      else startClassSetup();
    } else if (state.account.signedIn && state.pendingClassSetup) {
      state.pendingClassSetup = false;
      window.setTimeout(startClassSetup, 0);
    }
    if (state.account.signedIn && state.account.userId) {
      initializeCloudWorkspace(state.account.userId);
      resumeLatestLectureJob();
    } else {
      cloudSyncUserId = '';
      cloudSyncReady = false;
      cloudSyncDirty = false;
      window.clearTimeout(cloudSyncTimer);
      window.clearInterval(cloudSyncPollTimer);
    }
  });
  document.querySelector('#manageClerkProfile').addEventListener('click', () => window.SyllabloomAuth?.openClerkProfile?.());
  document.querySelector('#signOutAccount').addEventListener('click', async event => {
    const button = event.currentTarget;
    if (!state.account.signedIn || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Signing out…';
    try {
      await window.SyllabloomAuth?.signOutCurrentSession?.();
    } catch (_) {
      button.disabled = false;
      button.textContent = 'Sign out';
      showToast('Could not sign out. Check your connection and try again.');
    }
  });
  document.querySelector('#billingManageAccount').addEventListener('click', () => window.SyllabloomAuth?.openClerkProfile?.());
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
    const enteredTitle = cleanLectureTitle(document.querySelector('#recordingTitle').value);
    processAudio(file, file.name, [], { origin: 'upload', title: enteredTitle && enteredTitle !== defaultRecordingTitle() ? enteredTitle : lectureName(file.name) });
    event.target.value = '';
  });
  document.querySelector('#mediaLibraryList').addEventListener('click', async event => {
    const notesButton = event.target.closest('[data-open-lecture-notes]');
    const openButton = event.target.closest('[data-open-media]');
    const renameButton = event.target.closest('[data-rename-media]');
    const cancelRenameButton = event.target.closest('[data-cancel-rename]');
    const deleteButton = event.target.closest('[data-delete-media]');
    try {
      if (notesButton) {
        const media = await getMediaAsset(notesButton.dataset.openLectureNotes);
        if (!media?.studyPackage) throw new Error('Study notes are unavailable on this device.');
        if (captureAudioUrl) URL.revokeObjectURL(captureAudioUrl);
        captureAudioUrl = URL.createObjectURL(media.blob);
        const isVideo = mediaLooksLikeVideo(media);
        document.querySelector('#captureVideo').hidden = !isVideo;
        document.querySelector('#captureAudio').hidden = isVideo;
        document.querySelector(isVideo ? '#captureVideo' : '#captureAudio').src = captureAudioUrl;
        document.querySelector('#lastLectureSummary').hidden = false;
        document.querySelector('#lectureTitle').textContent = mediaDisplayTitle(media);
        renderAudioResult(media.studyPackage);
        document.querySelector('#lectureStudyPackage').scrollIntoView({behavior: 'smooth'});
        return;
      }
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
  document.querySelector('#transcriptContent').addEventListener('click', event => {
    const segment = event.target.closest('[data-lecture-seek]');
    if (segment) seekLecture(segment.dataset.lectureSeek);
  });
  document.querySelector('#lectureStudyPackage').addEventListener('click', event => {
    const target = event.target.closest('[data-lecture-seek]');
    if (target) seekLecture(target.dataset.lectureSeek);
  });
  document.querySelector('#transcriptSearch').addEventListener('input', event => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase();
    document.querySelectorAll('#transcriptContent .transcript-segment').forEach(segment => {
      segment.classList.toggle('is-search-hidden', Boolean(query) && !segment.textContent.toLocaleLowerCase().includes(query));
    });
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
    const questionStyle = normalizedQuestionStyle(state.anki.questionStyle);
    for (const file of files) {
      await uploadSource(file, 'auto', { questionStyle }).catch(() => {});
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
  document.querySelector('#quickCheckStart').addEventListener('click', startQuickCheck);
  document.querySelector('#quickCheckAgain').addEventListener('click', startQuickCheck);
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
      state.account.classesUsed = Math.max(1, accountClassUsage());
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

  initializeSourceKindPicker();
  initializeThemedSelectPickers();

  document.querySelector('#sourceUpload').addEventListener('change', async event => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (files.length) queueSourceFiles(files);
  });
  document.querySelector('#sourceQueueList').addEventListener('change', event => {
    const select = event.target.closest('[data-source-queue-kind]');
    if (!select || sourceBatchRunning) return;
    const item = sourceQueueItems.find(entry => entry.id === select.dataset.sourceQueueKind);
    if (item) item.kind = select.value;
    persistImportQueue();
  });
  document.querySelector('#sourceQueueList').addEventListener('click', event => {
    const restart = event.target.closest('[data-restart-source]');
    if (restart && !sourceBatchRunning) {
      const item = sourceQueueItems.find(entry => entry.id === restart.dataset.restartSource);
      if (item) { item.restartUncertain = true; item.restartBatchIndex = item.activeBatchIndex; item.restartRequired = false; item.retryable = true; }
      persistImportQueue();
      addQueuedSources();
      return;
    }
    const removeButton = event.target.closest('[data-remove-queued-source]');
    if (!removeButton || sourceBatchRunning) return;
    const item = sourceQueueItems.find(entry => entry.id === removeButton.dataset.removeQueuedSource);
    sourceQueueItems = sourceQueueItems.filter(entry => entry.id !== removeButton.dataset.removeQueuedSource);
    sourceBatchFeedback = item ? item.name + ' removed from the import list.' : '';
    persistImportQueue();
    renderSourceQueue();
  });
  document.querySelector('#sourceQueueAdd').addEventListener('click', addQueuedSources);
  document.querySelector('#sourceQueueClear').addEventListener('click', () => {
    if (sourceBatchRunning) return;
    sourceQueueItems = [];
    persistImportQueue();
    sourceBatchFeedback = '';
    renderSourceQueue();
  });

  document.querySelector('#lectureDraftQueue').addEventListener('input', event => {
    const field = event.target.dataset.lectureField;
    if (!field) return;
    const cardElement = event.target.closest('[data-lecture-card]');
    const card = state.lectureCards.find(item => item.id === cardElement?.dataset.lectureCard);
    if (card) {
      card[field] = event.target.value;
      autoSizeTextArea(event.target);
      const needsEdit = !isUsableLectureCard(card);
      cardElement.classList.toggle('needs-edit', needsEdit);
      const note = cardElement.querySelector('.lecture-card-quality-note');
      if (note) note.hidden = !needsEdit;
      const approveButton = cardElement.querySelector('[data-lecture-action="approve"]');
      if (approveButton) approveButton.textContent = needsEdit ? 'Needs edit' : card.reviewStatus === 'approved' ? 'Ready' : 'Add to ready set';
      saveLectureReview();
    }
  });
  document.querySelector('#lectureDraftQueue').addEventListener('click', event => {
    const actionButton = event.target.closest('[data-lecture-action]');
    const action = actionButton?.dataset.lectureAction;
    if (!action) return;
    const cardElement = event.target.closest('[data-lecture-card]');
    const card = state.lectureCards.find(item => item.id === cardElement?.dataset.lectureCard);
    if (!card) return;
    if (action === 'delete') {
      openRemoveCardDialog(card);
      return;
    }
    if (action === 'approve' && !isUsableLectureCard(card)) {
      showToast('Edit this into one focused question and a source-backed answer before adding it to your study set');
      return;
    }
    card.reviewStatus = action === 'approve' ? 'approved' : 'skipped';
    saveLectureReview();
    renderLectureDraftQueue();
    renderHomeForActiveClass();
    showToast(action === 'approve' ? 'Card added to the ready set' : 'Card left out');
    if (action === 'approve' && ankiDesktopSettings.autoSync && ankiDesktopSettings.ownerId === state.account.userId) {
      sendReadyCardsToDesktop({ automatic: true });
    }
  });
  document.querySelectorAll('[data-cancel-remove-card]').forEach(button => button.addEventListener('click', closeRemoveCardDialog));
  document.querySelector('#removeCardDialog').addEventListener('close', () => {
    pendingRemoveCardId = null;
  });
  document.querySelector('#removeCardDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeRemoveCardDialog();
  });
  document.querySelector('#confirmRemoveCard').addEventListener('click', event => {
    const id = pendingRemoveCardId;
    if (!id) return closeRemoveCardDialog();
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Removing…';
    const removed = removeLectureCard(id);
    closeRemoveCardDialog();
    showToast(removed ? 'Card removed from your set and Anki queue' : 'This card is no longer in the set');
    button.disabled = false;
    button.textContent = 'Remove card';
  });
  document.querySelector('#reviewAudioCards').addEventListener('click', () => {
    window.setTimeout(() => document.querySelector('#lectureDraftSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  });

  document.querySelectorAll('.card-type').forEach(input => input.addEventListener('change', updateGenerationCount));
  document.querySelector('#generateCards').addEventListener('click', () => {
    if (!state.selectedTypes.length) return showToast('Choose at least one card type');
    if (!state.includeSampleMaterial) {
      const drafts = state.lectureCards.filter(card => card.reviewStatus === 'waiting').length;
      const ready = approvedLectureCards().length;
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
    persistCourseState();
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
  document.querySelector('#connectAnkiDesktop').addEventListener('click', checkAnkiDesktopConnection);
  document.querySelector('#sendReadyCardsToAnki').addEventListener('click', () => sendReadyCardsToDesktop());
  document.querySelector('#autoSyncAnkiDesktop').addEventListener('change', event => {
    const status = document.querySelector('#ankiDesktopStatus');
    if (event.target.checked && !state.account.userId) {
      event.target.checked = false;
      status.dataset.message = 'preference';
      status.textContent = 'Sign in before enabling automatic card sending.';
      return;
    }
    ankiDesktopSettings.autoSync = event.target.checked;
    ankiDesktopSettings.ownerId = event.target.checked ? state.account.userId : '';
    localStorage.setItem('syllabloom-anki-desktop-settings', JSON.stringify(ankiDesktopSettings));
    status.dataset.message = 'preference';
    status.textContent = event.target.checked
      ? 'Automatic send is enabled for this signed-in account on this device. New ready cards will be sent after approval.'
      : 'Automatic send is off. You can still send ready cards manually or download an Anki deck.';
  });
  document.querySelector('#skipCard').addEventListener('click', () => {
    saveCurrent(true);
    state.statuses[keyFor(currentRecord())] = 'Skipped';
    persistCourseState();
    updateReviewSurface();
    showToast('Card skipped');
    advanceRecord();
  });
  document.querySelector('#approveCard').addEventListener('click', () => {
    saveCurrent(true);
    state.statuses[keyFor(currentRecord())] = 'Approved';
    persistCourseState();
    updateReviewSurface();
    showToast('Card kept in the ready set');
    advanceRecord();
    if (ankiDesktopSettings.autoSync && ankiDesktopSettings.ownerId === state.account.userId) {
      sendReadyCardsToDesktop({ automatic: true });
    }
  });

  document.querySelectorAll('[data-export-ready]').forEach(button=>button.addEventListener('click',exportApprovedCards));
  document.querySelector('#startSourceStudy').addEventListener('click',()=>startShortStudy(document.querySelector('#sourceStudyOutput').dataset.sourceId));
  document.querySelector('#continueSourceStudy').addEventListener('click',()=>startShortStudy());
  document.querySelector('#studyFiveMore').addEventListener('click',()=>startShortStudy(shortStudy?.sourceId, shortStudy?.cards.map(card=>card.id) || []));
  document.querySelector('#optionalClassSettings').addEventListener('click',()=>{
    document.querySelector('#quickClassName').value=state.className;
    document.querySelector('#quickClassTerm').value=state.classTerm;
    document.querySelector('#quickClassSettings').showModal();
  });
  document.querySelector('#closeQuickClassSettings').addEventListener('click',()=>document.querySelector('#quickClassSettings').close());
  document.querySelector('#quickClassSettingsForm').addEventListener('submit',event=>{
    event.preventDefault();setClassLabels(document.querySelector('#quickClassName').value.trim() || 'Untitled class',document.querySelector('#quickClassTerm').value.trim() || 'Term not set');persistClassProfile();document.querySelector('#quickClassSettings').close();showToast('Class settings saved');
  });
  document.querySelector('#sourceAnkiSettings').addEventListener('click',()=>openAnkiSettings(false));
  window.addEventListener('syllabloom:billing-change', event => {
    const access=event.detail;
    document.querySelector('#sourceAccessNote').textContent=access?.lifetime ? 'Your free lifetime access is confirmed. No payment details needed.' : access?.access ? 'Your plan is active. Generation is subject to the beta usage limits.' : 'Your plan is checked before generation. Monthly $12, or $108 billed yearly ($9/month equivalent); confirmed free accounts keep their access.';
  });
  document.querySelector('#generateSelectedSections').addEventListener('click',async event=>{
    const button=event.currentTarget, feedback=document.querySelector('#coverageFeedback');
    if(sourceBatchRunning) { feedback.textContent='Let the current import finish first.'; return; }
    const sourceId=document.querySelector('#sourceStudyOutput').dataset.sourceId;
    const original=state.sources.find(item=>item.id===sourceId);
    const sections=[...document.querySelectorAll('[data-coverage-index]:checked')].map(input=>original?.studySections?.[Number(input.dataset.coverageIndex)]).filter(section=>section?.text?.trim()).map(({label,text})=>({label,text}));
    if(!sections.length) {feedback.textContent='Select a readable section first.';return;}
    const owner=importOwner; button.disabled=true; feedback.textContent='Preparing selected sections...';
    try {
      const response=await sourceRequest('/api/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'prepare-sections',filename:original.name,sections})},()=>{ if(owner!==importOwner) throw new Error('Account changed. Try again.'); });
      const prepared=await checkedSourceResponse(response,'Could not prepare these sections.');
      if(owner!==importOwner) throw new Error('Account changed. Try again.');
      const file=new File([prepared.extractedText],original.name,{type:'text/plain'});
      const item=window.SyllabloomSourceBatch.createQueueItems([file],original.kind)[0];
      item.targetSourceId=sourceId;
      item.inspectionCache={kind:original.kind,payload:{source:{...original,draftCards:[],fingerprint:prepared.fingerprint,fileFingerprint:'sections-'+prepared.fingerprint,preflight:prepared.preflight},extractedText:prepared.extractedText,extractedUnits:prepared.extractedUnits}};
      sourceQueueItems.push(item); await persistImportQueue();renderSourceQueue();
      window.SyllabloomEvents?.track('coverage_requested',{sections:sections.length});
      feedback.textContent='Selected sections are in the import queue.';
      await addQueuedSources();
    } catch(error) {feedback.textContent=error.message || 'Try again.';} finally {button.disabled=false;}
  });

  document.querySelector('#showAnswer').addEventListener('click', () => {
    hideRatingReceipt();
    resetRatingControls();
    document.querySelector('#studyAnswer').classList.add('open');
    document.querySelector('#studySourceEvidence').hidden = document.querySelector('#studySourceEvidence').dataset.available !== 'true';
    document.querySelector('#showAnswer').hidden = true;
    document.querySelector('#ratingControls').classList.add('open');
  });

  document.querySelectorAll('.rating').forEach(button => button.addEventListener('click', () => {
    const cards = studyCards();
    const item = cards[state.studyIndex];
    if (!item || button.disabled) return;
    const rating = button.dataset.rating;
    const persisted = recordStudyRating(item, rating);
    shortStudy?.rated.add(studyCardKey(item));
    document.querySelectorAll('.rating').forEach(control => {
      control.disabled = true;
      control.classList.toggle('is-recorded', control === button);
      control.setAttribute('aria-pressed', control === button ? 'true' : 'false');
    });
    state.reviewCount += 1;
    document.querySelector('#reviewCount').textContent = state.reviewCount;
    renderKnowledgeModel();
    showRatingReceipt(rating, persisted);
    if (rating === 'Again') {
      showMissExplanation(item);
      return;
    }
    if (finishShortStudy()) return;
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
    if (finishShortStudy()) return;
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

  const diagramEditor = window.SyllabloomAdvancedCards.createEditor(async ({title,image,masks,owner}) => {
    if (!state.account.signedIn || state.account.userId !== owner) throw Error('Sign in to the account that opened this diagram.');
    const sourceId = 'diagram-' + crypto.randomUUID();
    const source = {id:sourceId,name:title,kind:'material',format:'IMAGE',storage:'session',occlusionImage:image,
      draftCards:masks.map((mask,index)=>({id:sourceId+'-'+index,front:'Identify the region covered in pink.',back:mask.label.trim(),noteType:'ImageOcclusion',source:title,sourceLocation:'Region '+(index+1),generatedBy:'student-mask',status:'provisional',occlusion:{target:mask.id,masks:masks.map(({label,...region})=>region)}}))};
    if (new Blob([JSON.stringify([...state.sources,source])]).size > 3500000) throw Error('Your class storage is nearly full. Remove an unused source before saving another diagram.');
    state.sources.push(source); persistClassSources(); await loadStoredSources(); navigate('cards'); showToast('Diagram cards created. Check each region and add it to your ready set.');
  });
  document.addEventListener('click', async event => {
    const sourceButton = event.target.closest('[data-open-source-tools]');
    if (sourceButton) {
      const source = state.sources.find(item=>item.id===sourceButton.dataset.openSourceTools);
      if (source) {navigate('source');renderSourceStudyOutput(source);document.querySelector('#sourceStudyOutput').scrollIntoView({behavior:'smooth',block:'start'});}
      return;
    }
    const button = event.target.closest('[data-open-occlusion],[data-sheet-occlusion],[data-lecture-sheet]');
    if (!button) return;
    if (!state.account.signedIn) { showToast('Sign in before creating study tools.'); return; }
    if (button.hasAttribute('data-open-occlusion')) {diagramEditor.open(state.account.userId);return;}
    if (button.hasAttribute('data-sheet-occlusion')) {
      const source = state.sources.find(item=>item.id===button.dataset.sheetOcclusion);
      if(source?.studySheet) diagramEditor.open(state.account.userId,source.studySheet.image,source.studySheet.title);
      return;
    }
    const owner = state.account.userId, className = state.className;
    button.disabled = true;
    try {
      const result = await generateIllustratedSheet(lastTranscript, document.querySelector('#lectureTitle').textContent + '.txt', {}, message=>button.textContent=message);
      if (state.account.userId !== owner || state.className !== className) throw Error('The class or account changed. Reopen the lecture in its original class.');
      const id = 'lecture-sheet-' + result.cards[0].id;
      const source = {id,name:result.studySheet.title,kind:'material',studySheet:result.studySheet,draftCards:result.cards,concepts:result.concepts,notes:result.studySheet.facts.map(f=>({title:f.title,lines:[f.sentence]}))};
      if(new Blob([JSON.stringify([...state.sources,source])]).size > 3500000) throw Error('Class storage is full. Remove an unused source, then reopen this summary.');
      state.sources=state.sources.filter(item=>item.id!==id);state.sources.push(source);persistClassSources();await loadStoredSources();renderSourceStudyOutput(source);navigate('source');
      showToast('Illustrated summary and cloze cards ready. Check the source passages before studying.');
    } catch(error) {showToast(error.message);}
    finally {button.disabled=false;button.textContent='Create illustrated summary and cloze cards';}
  });
  document.querySelector('#lectureDraftQueue').addEventListener('change',event=>{
    if(!event.target.matches('[data-lecture-format]'))return;
    const card=state.lectureCards.find(item=>item.id===event.target.closest('[data-lecture-card]')?.dataset.lectureCard);
    if(!card)return;
    card.noteType=event.target.value;
    if(card.noteType==='Cloze'&&!card.clozeText)card.clozeText=card.sourceQuote||card.front;
    card.reviewStatus='draft';saveLectureReview();renderLectureDraftQueue();
  });

  setClassLabels(state.className, state.classTerm);
  document.querySelector('#reviewCount').textContent = String(state.reviewCount);
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
