# Syllabloom local MVP build report

Date: 2026-09-21

## Product flow now implemented

1. A student creates or opens one class workspace.
2. Syllabi, DOCX notes, PPTX slide decks, PDFs, TXT files, and authorized assessments can be added to the local source library.
3. A lecture can be recorded from the browser microphone or imported as an audio/video file.
4. Faster Whisper transcribes the lecture locally and streams timestamped segments into the interface.
5. Detected concepts are labeled as either course-source matched or lecture-only/review-required.
6. Notes and cards are drafted during transcription.
7. Draft cards enter an editable review queue. Students accept or leave out each card.
8. Review decisions and edits survive a browser reload for the saved lecture session.
9. Accepted cards export as a real Anki `.apkg` package in the student's selected deck/card format.
10. The transcript, evidence state, notes, cards, and quality warnings are saved locally for restoration.

## UI direction

The product now has a complete public-to-product structure instead of opening on a dashboard:

- A public home page explains the product before asking for setup information.
- The primary path is Home → Get started → class details → syllabus → materials → baseline check → Anki preferences → class workspace.
- The home page uses MindMarket's large editorial canvas and illustration-led composition with Duolingo's single obvious action and tactile controls.
- The visual system stays intentionally small: warm cream, dark ink, fresh green, white interaction surfaces, blue for class context, and coral only for recording.
- The Anki promise is visible in the hero, five-step learning loop, dedicated Anki section, setup flow, class queue, and review/export action.
- The copy positions Syllabloom as the layer between class and Anki, not a replacement flashcard app or a generic AI tutor.
- The public story now covers any difficult college course instead of presenting Syllabloom as a medical-school-only product; the supplied anatomy data remains the honest working sample.
- The workflow is now a closed loop: scope the class, capture it, approve cards, study in Anki, check recall, then use misses and review history to change the next plan.
- The homepage hero now uses an original transparent cross-subject student illustration rather than medical clothing and anatomy-only props.
- The Syllabloom sprout now recurs as a functional character system: it carries the feedback loop, packs approved Anki cards, listens during lecture capture, and celebrates the final handoff.
- Below-the-fold character assets keep the same paper-cut linework and restrained palette as the hero, with no new decorative color system or mascot-only section.
- There are no invented testimonials, usage numbers, or outcome claims; the page demonstrates the working anatomy flow instead.
- Four in-class destinations remain: Today, Record, Review, and Study.

## Readability and student-demo pass

- Increased the base type scale, headings, controls, navigation, and spacing across every screen.
- Made Today the default landing screen and reduced the primary navigation from six destinations to four.
- Moved Materials and Progress into a quieter class section instead of presenting them as daily tasks.
- Removed the lecture-side dashboard; students now see the recorder, one source-status message, the number of cards ready, and an optional transcript.
- Collapsed the transcript by default while keeping it one click away and automatically opening it during live processing.
- Hid the 576-card class library until the student explicitly opens it.
- Moved export and study actions after the lecture-card review queue, and sorted waiting cards before completed cards.
- Let long card answers grow to their full height instead of hiding text in small inner scroll areas.
- Made evidence status readable in the card queue with plain `COURSE SOURCE` and `REVIEW ONLY` labels.
- Reworked the plan, capture, card editor, source library, progress, study, and onboarding layouts to stack earlier on narrow screens.
- Simplified restored lecture labels so students see the class, duration, and local-save state instead of an internal session identifier.
- Fixed the recommendation card found during the narrow-screen walkthrough; its title, explanation, tasks, and timing now stack without clipping.

## Recording-first redesign

- Replaced the desktop sidebar with a quiet top navigation and added four large phone destinations fixed to the bottom: Today, Record, Review, and Study.
- Rebuilt Record as a dedicated classroom screen with a visible `00:00` starting state and one large start button above the waveform.
- Separated the new recorder from the prior lecture so a saved session never looks like an active recording.
- Added pause, resume, finish, and one-tap important-moment markers to the browser recorder.
- Added an always-visible recording indicator and timer when the student leaves the recorder screen.
- Added a leave-page warning during an active recording and requests a screen wake lock when the browser supports it.
- Kept import and sample actions secondary to the live classroom recording action.
- Restyled the complete product around large system typography, white surfaces, soft gray canvas, one blue study accent, and one red recording action.

## Current verification

- Real source import: `List of muscles_Fall 2023.docx` parsed locally as 4,242 words and 810 non-empty paragraph/table lines.
- Real audio sample: 105 seconds processed in 15.75 seconds on the local CPU model.
- Sample result: Tibialis anterior matched to the course document, one verified note and three source-backed card drafts.
- Session restoration: transcript and cards restored after browser reload.
- Review persistence: one accepted card remained accepted after browser reload.
- UI Anki export: browser reported one accepted card exported.
- Simplified UI regression: the moved export action again produced an Anki package, the transcript disclosure opened and closed, and the full class library opened and closed on demand.
- Package inspection: generated `.apkg` contained one Anki note and one Anki card; ZIP integrity check returned no errors.
- Narrow-screen walkthrough: Materials, Plan, Progress, Study, and Cards were visually inspected in the in-app browser; key actions and long answers remained legible.
- Recording-first walkthrough: Today, Record, Review, Study, and Class materials were visually inspected at the narrow in-app browser width. The start action remained visible without scrolling past the prior lecture.
- Playful redesign walkthrough: first-time onboarding, Today, Record, Review, and Study were visually inspected at phone width, and Today plus Record were inspected at a 1440 × 900 desktop breakpoint.
- Public-site walkthrough: the marketing home, Anki section, Get started handoff, onboarding back action, sample-class entry, and workspace return-home action were visually inspected at phone and 1440 × 900 desktop widths.
- Cross-subject loop walkthrough: the general-student hero, five-step learning loop, feedback-return panel, Organic Chemistry Anki example, and subject-range section were inspected at phone and 1440 × 900 desktop widths.
- Character-system walkthrough: the feedback mascot, Anki packing pose, lecture-listening pose, and final celebration were visually inspected at 390 × 844 phone, 1024 × 768 tablet, and 1440 × 900 desktop widths. No character overlaps copy or blocks an action.
- Final illustration cleanup: floating proof cards were removed from the hero so the student and mascot remain unobstructed; the learning-loop mascot was enlarged and integrated directly into its return panel instead of sitting in a nested thumbnail box.
- Production illustration pass: five active transparent WebP assets load with their expected intrinsic dimensions and alpha corners; their combined transfer size is 699,360 bytes, down from the multi-megabyte PNG working files.
- Structured PowerPoint regression: a five-slide anatomy deck imported through the visible UI as 230 words and two objective cues, produced nine editable card drafts, and cited Slides 2–4 in review.
- PowerPoint study/export: one slide-derived card was accepted, revealed and rated in Study; a generated Anki package preserved `rounds-medical-slide-import-test.pptx · Slide 2` in its Source field.
- PowerPoint package QA: five slides, SHA-256 `b1970b998d62e825558012fc26d6082d696f0494d70e8e58227f74f9a4a3ea9b`, structural and layout validation passed with zero findings or warnings, and all slides rendered in native PowerPoint.
- Study interaction: answer reveal and a `Good` rating completed in the browser.
- Browser console: zero warnings or errors after the tested capture, review, restore, and export flow.
- Static checks: `server.py` compiles and `app.js` passes Node syntax validation.

## Verification boundaries

- Browser microphone recording, pause/resume, markers, wake lock, and active-recording navigation status are implemented but have not been accepted against this computer's physical microphone in this build pass.
- The 78:29 lecture was previously processed end-to-end; the UI and persistence changes in this pass were regression-tested with the 1:45 anatomy sample to avoid another full 12-minute compute run.
- Course-source matching for the anatomy demo uses the structured muscle dataset derived from the supplied DOCX. PowerPoints with explicit Attachment, Action, and Innervation labels now produce traceable drafts; arbitrary unlabeled decks are still only parsed and indexed and need a model-backed source compiler plus evaluation.
- No claim of medical accuracy or card-quality superiority has been made. That requires blinded review by real students or faculty against a reference set.
- No cloud account, external upload, or production deployment was used. This remains a local prototype.
