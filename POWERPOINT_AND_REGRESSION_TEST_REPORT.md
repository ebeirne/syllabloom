# Syllabloom PowerPoint and regression test

Date: 2026-09-21

## Result

The local build now passes the complete structured PowerPoint path:

1. Import a `.pptx` file through Class materials.
2. Parse its slide text locally without requiring `python-pptx`.
3. Detect explicit `Attachment`, `Action`, and `Innervation` fields.
4. Draft nine editable cards from three anatomy slides.
5. Cite the originating slide on every draft.
6. Accept a card, study it, reveal the source-backed answer, rate it, and export it as a real Anki package.

## PowerPoint fixture

- File: `test-output/rounds-medical-slide-import-test.pptx`
- Slides: 5
- Parsed words: 230
- Objective cues: 2
- Draft cards: 9
- Subjects: Tibialis anterior, Extensor digitorum longus, and Extensor hallucis longus
- Package SHA-256: `b1970b998d62e825558012fc26d6082d696f0494d70e8e58227f74f9a4a3ea9b`
- Package integrity: pass
- Layout geometry: pass, with zero findings and zero warnings
- Native PowerPoint render: all five slides opened and rendered at 1600 × 900

The facts in the fixture mirror the supplied Fall 2023 muscle source. It is a regression fixture, not an independent medical reference.

## Product verification

- UI import displayed `5 slides · 230 words · 2 objective cues · 9 card drafts · local`.
- Review displayed nine waiting cards with `COURSE SOURCE · SLIDE 2`, `SLIDE 3`, or `SLIDE 4` citations.
- The first draft asked `Where does Tibialis anterior attach?` and used the slide's full attachment text as the answer.
- Accepting the draft enabled both Anki export and study.
- Study mode showed the accepted PowerPoint question and exact source-backed answer.
- The exported `.apkg` contained one note and one card.
- The Anki Source field preserved `rounds-medical-slide-import-test.pptx · Slide 2`.

## Regression checks

- Real audio: the 105-second Kenhub anatomy sample processed locally in 13.41 seconds.
- Audio output: 21 transcript segments, one matched concept, one note, three cards, and three terminology warnings.
- Review controls: edit, save, accept, leave out, answer reveal, and `Good` rating passed in the browser.
- Anki endpoint: valid package, two ZIP members, one note, and one card.
- Browser console: zero warnings or errors after the tested flows.
- Static checks: `app.js` syntax pass, `server.py` compile pass, and CSS braces balanced at 597 / 597 before the final report update.
- Service health: local Whisper model reported present.

## UI fixes in this pass

- Removed the floating hero cards that covered the mascot and made the illustration feel assembled from overlays.
- Removed the inset box around the learning-loop mascot and enlarged the character so it belongs to the feedback panel.
- Centered desktop navigation independently of the unequal logo and action widths.
- Increased separation between the primary and sample-class actions.
- Added stronger section stages and a class-memory cue to reduce empty background areas.

## Honest boundary

The structured anatomy deck works because its slides expose consistent labeled fields. Arbitrary PowerPoints with diagrams, unlabeled prose, charts, images, or inconsistent layouts are imported and indexed, but do not yet receive trustworthy automatic card extraction. That requires a source compiler plus evaluation against human-written reference cards. The physical microphone still needs a real browser-permission and classroom-device acceptance test tonight.
