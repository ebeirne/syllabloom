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

## Responsive UI evidence

Today, Lecture, Review, Study, Profile, and Billing were tested at:

- 390 by 844
- 768 by 900
- 1280 by 900
- 1440 by 900

All 24 page and viewport combinations completed without horizontal overflow. Browser warnings and errors: 0.

Two responsive defects were found and fixed during the audit:

- Profile and Billing were unreachable between 761 and 980 pixels because desktop account tools were hidden before the mobile account control appeared.
- Lecture result actions overflowed and overlapped on a 390 pixel phone. They now stack as full-width controls.

The Billing plan cards are equal height on desktop, single column on tablet and phone, and the public beta cannot show a live checkout when Clerk is using a test key.

## Automated checks

The release suite covers ingestion, card quality, uploaded-source activation, Anki package generation, auth navigation contracts, billing preview safety, security headers, and responsive control contracts.

## Remaining production gates

- Replace the Clerk development publishable key with a production instance.
- Configure live Clerk Billing and Stripe products before enabling Student checkout.
- Add hosted transcription workers before promising server-side lecture processing.
- Add cloud storage if students need their recordings and classes on multiple devices.
- Add a Clerk testing token and authenticated end-to-end suite for session persistence and billing access.
- Keep lecture-derived cards review-required unless matching course sources verify their answers.

