# Syllabloom beta release audit

Date: September 23, 2026

## Release decision

Hold beta invitations until production sign-in and authenticated data sync are verified. The production site now matches the free, single-class offer, but its sign-in is safely paused because Vercel is still configured with a Clerk test key.

Do not advertise hosted transcription or cross-device media sync. Paid checkout is out of scope for this free beta.

## September 23 pressure-test update

The local working copy was tested across Today, Materials, Review, Study, Calendar, Profile, beta access, and the one-class guard. The existing PSY241 sample contains 39 slides, 32 mapped concepts, 39 note sections, and 87 ready cards. The landing page leads with the free one-class offer and course-files-to-Anki path, discloses local-only media limits, and uses an unassessed quick-check state rather than fabricated mastery. The Clerk test-key production guard and first-visit sign-in failure path were tested. The latest automated validation passed: 86 Python tests, 12 Node tests, JavaScript syntax checks, and `git diff --check`.

The pressure test found several release blockers:

- The first production snapshot still showed a paid Student tier. The new production deploy removes the paid tier and checkout path; the live landing now advertises one free class only.
- Vercel's production Clerk publishable key is still a test key. The new endpoint suppresses it and sign-in shows a clear paused-beta notice, preventing test-mode accounts; production users cannot sign up until a Clerk production instance/key is configured.
- Cross-device Neon-backed user-data sync is not verified. An unauthenticated request correctly returned 401, which does not establish that signed-in database reads and writes work.
- Hosted transcription is disabled; lecture media remains browser/device-local.
- Card quality is not consistently at the bar for a student beta. In the 87-card PSY241 sample, some prompts and answers are too terse or underspecified (for example, “double dissociation” → “stronger separation”). Do not represent the deck as quality-verified.
- No production file upload, microphone permission, account mutation, or checkout was performed in this pass.

The current recommendation is a hold on broad invitations. A tightly scoped, no-payment document/slide pilot could be reconsidered after replacing the deployed Clerk test configuration, verifying authenticated data persistence, and enforcing a measurable card-quality acceptance gate. Keep media capture clearly labeled as local-only until storage and transcription are implemented.

## September 23 live deploy and multi-PDF smoke test

The production working-tree deploy is READY at `https://syllabloom-beta.vercel.app/`. Live checks returned HTTP 200 for the landing page, health endpoint, Privacy, and Terms. The landing is free-only with no paid Student tier or fabricated 62% claim. `/api/health` reports `ok=true`, `mode=beta-cloud`, hosted transcription off, and browser-per-user media storage. `/api/auth-config` reports the production test-key guard; the publishable key is suppressed. An unauthenticated `/api/user-data` request correctly returned 401. The sign-in modal visibly explains that beta sign-in is paused.

An isolated local browser/server test imported seven previously supplied CSCI 340 PDFs as one batch: one syllabus, five lecture files, and one answered quiz. Auto-detection assigned all three document categories correctly; the UI immediately reported 82 source-based cards and 15 note sections. The card review page showed 82 ready cards and the Anki export flow confirmed all 82 exported; existing package tests inspect a valid APKG archive and its Anki collection database. Several quiz prompts were made more self-contained, and a regression test covers the refinement. The four-page CSCI 340 syllabus has a course outline and grading policy but no dated class/assessment schedule, so zero calendar dates is accurate and no date was invented. This was a local smoke test with temporary storage, not a production upload or authenticated beta account.

## Real lecture evidence

The existing YouTube-derived physiology fixture was reused. No additional lecture was downloaded.

- Original lecture duration: 4,708.59 seconds, or 78 minutes 29 seconds
- Original full browser run: completed in 715.8 seconds with zero console errors
- Current release parser, real 1 minute 45 second anatomy lecture: completed in 15.61 seconds
- Short lecture result: 3 concepts and 5 source-linked cards
- Current release parser, final 30 minutes of the full physiology lecture: completed in 245.39 seconds
- Tail result: 3 concepts and 3 source-linked, review-required cards
- Tail concepts: Body-fluid compartments, Whole blood, Concentration

The quality gate now rejects presenter introductions, promotional outros, recall prompts, modal sentence fragments, singular and plural transcript mismatches, context-only labels, conversational future references, and long run-on answers.

The current parser intentionally makes fewer cards. Lecture-only cards stay in review-required state because transcription can mishear technical terms. Course-source cards can still be delivered as ready when their answer is grounded in an uploaded source.

## Subject and source coverage

Automated source tests cover:

- PowerPoint
- PDF
- Word
- Plain text
- Chemistry
- Economics
- Contract law
- Cold War history
- Computer science
- Literature

The suite also verifies source activation, session reload, quick checks using uploaded material, Basic Anki packages, Cloze Anki packages, and deck preferences.

The production API was also exercised directly with real multipart uploads on September 22:

- PowerPoint: 5 slide units, 5 concepts, 5 note sections, and 9 ready cards
- Word: 1 concept, 1 note section, and 2 ready cards
- Plain text: 1 concept, 1 note section, and 2 ready cards
- Invalid executable upload: rejected with a supported-format message
- Anki: a 2-card, 61,658-byte APKG returned with a valid `collection.anki2` database and media manifest
- Empty Anki export: rejected with an actionable message
- Hosted transcription: returned the documented unavailable response instead of simulating success

The browser workflow then imported the PowerPoint fixture through the visible file picker and immediately exposed 9 ready, source-linked cards. The old anatomy card library remained hidden after the custom source became active.

## Responsive UI evidence

Landing, Today, Lecture, Review, Study, Materials, Plan, Profile, and Billing were tested across phone and desktop layouts, with focused tablet checks at:

- 390 by 844
- 768 by 900
- 1280 by 900
- 1440 by 900

All current page and viewport checks completed without horizontal overflow. Browser errors: 0. Clerk emits its expected development-key warning on the public deployment; replacing that key remains a production gate.

Two responsive defects were found and fixed during the audit:

- Profile and Billing were unreachable between 761 and 980 pixels because desktop account tools were hidden before the mobile account control appeared.
- Lecture result actions overflowed and overlapped on a 390 pixel phone. They now stack as full-width controls.
- The hidden sample anatomy library was forced visible below uploaded cards on mobile. Hidden state now wins over the mobile card layout.
- Study rating controls appeared before the answer on mobile, while the Show answer control remained visible after reveal. Both states now transition correctly.

Back, Forward, reload, and direct workspace links were retested. Every product view now owns a stable URL, and returning from the landing page restores the class and ready-card state instead of falling back to a stale screen.

Lecture-library checks covered playback controls, rename entry and cancel, and the in-site removal confirmation. No saved lecture was deleted during QA.

The Billing plan cards were checked for responsive layout on September 22. The September 23 production landing inspection still showed a paid Student plan and checkout CTA; no checkout was opened.

## Automated checks

The earlier release suite contained 30 passing tests plus 6 passing subtests. On September 23, the expanded local suite passed 86 Python tests and 12 Node tests, plus JavaScript syntax and whitespace checks. Coverage includes ingestion, card quality, uploaded-source activation, Anki package generation, auth navigation contracts, production test-key blocking, hosted source-upload authorization, free-beta limits, security headers, responsive controls, and honest unassessed mastery/scheduling states.

## Remaining production gates

- Create/configure a Clerk production instance, then set its publishable key in the deployed production environment before inviting beta users.
- Verify signed-in Neon-backed class/card/calendar/settings reads and writes across two devices or isolated browsers.
- Improve and acceptance-test generated card quality across multiple subjects before describing generated cards as ready without qualification.
- Add hosted transcription workers before promising server-side lecture processing.
- Add cloud media storage only if multi-device recording access is part of the beta promise.
- Run authenticated end-to-end checks for session persistence, class limits, data isolation, and browser back/forward navigation.
- Keep lecture-derived cards review-required unless matching course sources verify their answers.

## September 23 final production redeploy and beta gate

After the multi-PDF QA, the hosted material-upload endpoint was found to accept requests without a signed-in account. The client now sends its Clerk session token, and the Vercel endpoint requires an authenticated user before processing a document. Local import QA remains available. With the currently configured test-mode Clerk key, production upload fails closed with HTTP 503 before parsing a file; a live-mode key with no session returns HTTP 401. This avoids exposing an unauthenticated document-processing endpoint while beta sign-in is paused.

The final deployment is READY and aliased to `https://syllabloom-beta.vercel.app/` (deployment `dpl_3uQvr6iSxRbW93NSQKTnha4oM2Yo`). Live checks: landing, health, Privacy, and Terms return HTTP 200; unauthenticated workspace access returns 401; unauthenticated source upload returns the explicit 503 pause; security headers include HSTS and `X-Frame-Options: DENY`. The visible signup modal explains the Clerk test-mode blocker and leaves the sample preview available. Production environment inspection confirms only an encrypted `CLERK_PUBLISHABLE_KEY` entry and no production Clerk configuration usable for signup. Clerk `doctor` confirms that the linked app has no production instance configured and that its stored CLI auth token is expired/invalid; `clerk deploy --mode agent` reports deployment `not_started` and requires the human-run `clerk deploy` setup wizard. No student documents, signups, payment details, or account mutations were sent to production.

Competitor positioning review: Quizlet, Knowt, and StudyFetch publicly offer material-to-flashcard/study-guide/quiz workflows, and StudyFetch also markets lecture notes, recording, and study scheduling. Anki already provides free cross-device sync. Syllabloom's most defensible beta distinction is narrower: one class workspace that maps syllabus dates and uploaded source material to editable, source-linked cards, with an Anki-ready export and study loop. This is a positioning hypothesis, not a proven quality or learning-outcome advantage. Do not market hosted lecture transcription or cross-device media sync; both are out of scope and must remain plainly disclosed.

Decision remains HOLD for external free-beta invitations. Configure Clerk production authentication in Vercel, then verify a live signup plus authenticated upload, Neon persistence across isolated browsers/devices, user isolation, and one-class limits before inviting students. After that, run the agreed card-quality acceptance set; the existing PSY241 sample still contains terse/underspecified examples and does not pass a blanket "ready-to-use" quality claim.

## September 23 Preview isolation and course-memory update

The beta Preview path now uses Clerk development keys scoped to Preview only. A separate Neon branch, `vercel-preview-beta`, was created from the production schema only; production user rows were not copied. Vercel Preview has an encrypted `SYLLABLOOM_PREVIEW_DATABASE_URL` secret for that branch. The API now uses that variable only when `VERCEL_ENV=preview` and fails closed if it is missing, rather than falling back to the integration's shared `DATABASE_URL`. Production settings and data were left unchanged. The Vercel project is not connected to GitHub, so branch-specific Vercel settings are unavailable; the isolated database and Clerk values are scoped to the general Preview environment.

The course-memory update maps exact concepts to source-backed cards, records actual quick-check/study responses by class and term, and prioritizes accumulated misses without inventing a mastery score. A false fixed answer count was removed. The narrow-phone landing overflow found in browser QA was corrected. Latest automated checks pass: 88 Python tests, 18 Node tests, JavaScript syntax checks, and `git diff --check`.

This remains a Preview-only beta candidate, not a production release. The deployment still needs live verification of Clerk development sign-in, authenticated workspace write/read, one-class enforcement, and persistence from a second browser/device against the isolated Neon branch. Do not invite students until these checks pass. Development-mode Clerk identities are temporary and do not migrate to a production instance; before a production beta, configure a production Clerk instance and test the identity/data migration plan.

## September 23 Preview deployment smoke test

Commit `ee46929` is READY at `https://syllabloom-beta-9stvzd1eb-one-pile-s-projects.vercel.app/` (deployment `dpl_CD5xzadmgvb2kSpGnGd4DMsz7PZ3`, Preview target). The landing, Privacy, and Terms pages returned HTTP 200. The visible Clerk sign-in dialog loaded successfully in development mode. The sample-class path opened the Anatomy workspace. Automated validation passed 88 Python tests, 18 Node tests, JavaScript syntax checks, and `git diff --check` before deployment. Production was not deployed or modified.

The initial unauthenticated API checks showed Vercel Authentication blocking outside testers. After the operator approved Preview-only exposure, a Deployment Protection Exception was added for the exact Preview deployment domain `syllabloom-beta-9stvzd1eb-one-pile-s-projects.vercel.app`. Vercel's project-wide Require Log In setting remains enabled; only this Preview domain is publicly accessible, until that exception is manually removed. Production settings and deployment were not changed.

Post-exception, unauthenticated GETs to `/`, `/api/health`, and `/api/auth-config` returned HTTP 200; auth config reports Clerk development/test mode. Unauthenticated GET `/api/user-data` and POST `/api/source` with an empty JSON body both returned HTTP 401, confirming app-level authentication remains required for user data and imports. No Clerk account was created and no legal terms were accepted during testing; consequently, authenticated Neon writes, user isolation, cross-browser sync, and class limits remain unverified. Keep broad beta invitations on hold until those checks pass. Remove the Vercel protection exception when this beta deployment is retired; each new Preview deployment needs its own exception if it should be publicly testable.

## September 23 interactive Clerk setup attempt

At the user's request, `clerk deploy` was started interactively. The wizard requires a production domain the operator owns and can configure in DNS, plus production OAuth credentials for any enabled social sign-in providers. The operator has not yet provided the domain or Google OAuth choice, so the wizard was canceled at its domain prompt. A read-only status check before cancellation showed no production instance ID; no Clerk production instance or DNS/OAuth changes were created. `clerk doctor` also reports the stored CLI token is expired/invalid. The next step is to obtain the operator's domain and sign-in choice, then re-authenticate with Clerk and resume the wizard.
