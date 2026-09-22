# Syllabloom beta release audit

Date: September 22, 2026

## Release decision

Go for a controlled free student beta covering source import, editable cards, in-app study, Anki export, and on-device lecture storage.

Not yet a paid production launch. Hosted lecture transcription, live Clerk and Stripe billing, cloud media sync, and signed-in browser automation still require production infrastructure.

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

The Billing plan cards are equal height on desktop, single column on tablet and phone, and the public beta cannot show a live checkout when Clerk is using a test key.

## Automated checks

The release suite contains 30 passing tests plus 6 passing subtests. It covers ingestion, card quality, uploaded-source activation, Anki package generation, auth navigation contracts, billing preview safety, security headers, and responsive control contracts.

## Remaining production gates

- Replace the Clerk development publishable key with a production instance.
- Configure live Clerk Billing and Stripe products before enabling Student checkout.
- Add hosted transcription workers before promising server-side lecture processing.
- Add cloud storage if students need their recordings and classes on multiple devices.
- Add a Clerk testing token and authenticated end-to-end suite for session persistence and billing access.
- Keep lecture-derived cards review-required unless matching course sources verify their answers.
