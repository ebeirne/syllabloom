# Full-length lecture test — September 21, 2026

## Outcome

A 78 minute 29 second YouTube lecture was processed through the browser interface from beginning to end. The product streamed timestamped transcript segments and produced notes and flashcard drafts while later sections were still being transcribed.

- Lecture duration: 4,708.59 seconds
- Local processing time: 715.8 seconds
- Throughput: approximately 6.58 times faster than playback
- Live lecture notes: 12
- Draft flashcards: 12
- Browser stream: completed without interruption
- Browser console errors: 0
- Server working set after completion: approximately 296 MiB
- Engine: faster-whisper small, local CPU int8
- Source-verified notes: 0
- Lecture-derived notes requiring review: 12

## Media validation

The supplied `videoplayback (2).mp4` is a 236,703,131-byte, 1920×1080 H.264 video-only stream. The interface rejected it before transcription with a specific no-audio-track message.

The matching YouTube AAC audio stream was downloaded separately and verified:

- File: `test-audio/full-length-lecture-audio.m4a`
- Size: 76,204,056 bytes
- Duration: 4,708.588844 seconds
- Audio: AAC, 44.1 kHz, stereo
- SHA-256: `852537F37D5AEC78A70184BFACF62DA0D0B778884F828446E488A2B00224AEBF`

## Grounding result

The lecture identifies itself as Medical Physiology and begins with Fluid Homeostasis. The active class was Human Anatomy and its uploaded source was a muscle list. The system therefore kept lecture-derived notes and cards in a review-required state instead of claiming that the course source verified them.

Examples generated during the stream included:

- Homeostasis
- Levels of structural organization
- Four basic tissue types
- Microvilli
- Rough endoplasmic reticulum
- Golgi apparatus
- Plasma membrane
- Passive transport
- Simple diffusion
- Facilitated diffusion
- Active transport
- Osmosis

## Failure found

Automatic confidence did not reliably identify medical transcription errors. Visible substitutions included “organism as a hole,” “golden complex,” and “fossil lipid,” while the automatic terminology checker reported no matches. The UI now says review is required rather than presenting a zero-warning result as clean.

## Verdict

Pass: long-file handling, missing-audio preflight, progressive transcript streaming, sustained browser rendering, live note/card updates, and local processing throughput.

Not ready for automatic Anki export: source coverage is incomplete, the active class does not match the lecture, and transcript-confidence signals are not sufficient for medical correctness. A matching physiology syllabus or source pack is required before these drafts can become source-verified cards.
