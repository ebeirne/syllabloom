# Audio input test — September 21, 2026

## Result

The lecture-file path passes end to end. A real 1 minute 45 second human anatomy lecture was loaded through the product UI, transcribed locally, matched to the uploaded course source, and converted into reviewable card drafts.

- Local processing time: 14.52 seconds on the final browser run
- Course concepts matched: 1 — Tibialis anterior
- Source-grounded card drafts: 3 — attachment, action, and innervation
- Terminology warnings surfaced: 3
- Browser console errors: 0

## Test audio

- Title: Tibialis Anterior Muscle - Origin, Insertion & Function - Human Anatomy
- Creator: Kenhub
- Source: https://commons.wikimedia.org/wiki/File:Tibialis_Anterior_Muscle_-_Origin,_Insertion_%26_Function_-_Human_Anatomy_Kenhub.webm
- License: CC BY 3.0
- Local file: test-audio/kenhub-tibialis-anterior-cc-by-3.webm
- SHA-256: 8471E11CEFCC2BE6839B8FFBB450ED5A74D195289DAF3BCC97E3D912D0B777D3

## What the test caught

The speech model produced plausible but incorrect or suspicious anatomy wording:

- “mediocotally” near 00:22
- “planter” instead of likely “plantar” near 00:39
- “interior tibial artery” instead of likely “anterior tibial artery” across 00:56–01:01

The model’s segment confidence did not flag these errors. The product therefore keeps a human review gate and uses the course document—not the raw transcript—as the answer source for generated cards.

## Verification boundary

Verified: real audio-file input, local transcription, timestamps, waveform, course matching, warning display, source-grounded drafts, desktop layout, responsive layout, and navigation back to the study plan.

Not yet device-verified: microphone permission, the computer’s physical microphone, long-running live lecture capture, and Anki package export.
