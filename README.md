# Syllabloom

Syllabloom turns lectures, slides, syllabi, and course files into editable, source-linked Anki cards. It also learns from assessments and class deadlines to decide which new material should enter the queue, while Anki remains responsible for scheduling card reviews.

**Live beta:** [syllabloom-beta.vercel.app](https://syllabloom-beta.vercel.app/)

## What is included

- Marketing site and per-class onboarding
- Live lecture recording and uploaded audio/video ingestion
- Per-user on-device lecture library with audio/video playback and removal
- Clerk-authenticated Neon Postgres sync for class profile, parsed course sources and cards, calendar, Anki preferences, and study history
- DOCX, PDF, PowerPoint, and text import with AI-generated, source-quoted cards ready to review
- Editable card review and approval queue
- Source-grounded explanations after every missed card, with same-card retry and repeated-miss editing
- Basic and Cloze Anki card generation
- Downloadable `.apkg` decks with nested deck names and an embedded deck preset
- Anki preferences for limits, learning steps, lapses, ordering, burying, Easy Days, audio, timers, FSRS, and SM-2
- Class calendar and new-card release planning around lectures, quizzes, assignments, and exams
- Full profile hub with Clerk identity controls, current tier, active classes, and editable important dates
- Dedicated billing page with a stable Syllabloom plan comparison and an isolated Clerk checkout dialog for live production billing
- Responsive student workspace and task-specific Syllabloom companion scenes
- Real medical-class fixtures and regression reports

## Scheduling boundary

Syllabloom controls what new material is ready before a deadline. Anki controls when an imported card returns for review.

Deck-level preferences are packaged with the exported deck preset. Collection-wide settings, including enabling FSRS for the collection, are presented as setup preferences but are not silently forced during import.

## Run locally

Python 3.12 is recommended.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python server.py
```

Open [http://127.0.0.1:4174](http://127.0.0.1:4174).

The interface, generic source parsing, PowerPoint import, source-linked notes, card editing, and Anki export work with the base requirements. Production card generation uses OpenAI's Responses API with strict JSON-schema output on the low-cost GPT-5.4 nano model and low reasoning effort; it does not silently fall back to the older heuristic card compiler when AI is unavailable. PowerPoint decks do not need a special template or anatomy-specific labels.

### Email sign-in

The beta uses Clerk for email/password and Google sign-in. Set the publishable key before starting the server:

```powershell
$env:CLERK_PUBLISHABLE_KEY = "pk_test_your_key"
python server.py
```

Use the same `CLERK_PUBLISHABLE_KEY` environment variable in Vercel. Clerk controls beta access and the one-free-class gate. Neon is connected to the Vercel project on its Free plan; the API verifies Clerk session tokens and stores each workspace under the verified Clerk user ID. Class profiles, parsed sources and cards, calendar dates, Anki preferences, card edits, and study history sync across devices. Original lecture audio and video stay in IndexedDB on the current device and are not uploaded to Neon.

For local development, install the requirements and pull the Vercel Development environment to a separate ignored file so an existing `.env.local` is not overwritten:

```powershell
vercel env pull .env.development.local --environment=development
```

The Neon integration supplies `DATABASE_URL`. Do not add database credentials to browser code or commit local environment files. Set the server-only `OPENAI_API_KEY` in Vercel's encrypted environment settings (and in a local ignored environment file for local testing); never use a browser-exposed `VITE_` or `NEXT_PUBLIC_` variable. AI usage is guarded by atomic Neon counters: at most 192,000 source characters per account per UTC day and 1,000,000 across the beta per day, plus a shared $18 estimated monthly provider-cost reservation cap, leaving $2 below the user's $20 test balance. Each request reserves an upper bound before calling the provider, including its maximum output tokens; failed attempts keep their reservation. Counter rows for daily source volume are deleted after 90 days. Each material is limited to 192,000 extracted characters for one import, split into at most 16 page/slide-aware chunks and generated in sequential batches of 4 chunks (12 accepted cards per chunk) so each serverless request stays bounded and the import can report progress. The source is inspected before any card request; exact duplicate extracted content already in the class skips AI generation, and successfully completed batches are kept in the active import queue for a retry. PPTX speaker notes and image descriptions join the extracted text. Sparse/scanned PDF pages can be OCR'd locally in the browser (up to 100 PDF pages); page images are not sent to OpenAI. GPT-5.4 nano is pinned for the beta to keep reasoning costs low; source-quote and location checks still reject unsupported output. If the provider or usage guard is unavailable, the upload is rejected rather than returning heuristic cards as if they were AI-generated. Syllabi are excluded from AI generation and continue through the calendar parser. The API request sets `store: false`; see the Privacy Policy for OpenAI's default abuse-monitoring retention. Tests use mocked Responses API replies and do not make billed provider calls.

On the first signed-in visit, an unclaimed local workspace is saved to the account if it has no existing cloud workspace; if another account owns the browser's workspace, it is not copied into the new account.

### Billing

The billing page is wired to Clerk Billing for individual users. It checks the signed-in user's `student` Plan and keeps the product-owned comparison visible at every viewport. Clerk's pricing and Stripe checkout UI is isolated in a dialog and only mounts when the site uses a `pk_live_` production key. Test-mode deployments are explicitly labeled as a free beta and cannot present a live checkout. Account, payment-method, and statement management stays in Clerk's secure user profile.

For development, enable Billing in the Clerk Dashboard and use Clerk's shared development gateway. Create a public `student` Plan with monthly and annual prices. Production needs a production Clerk instance connected to an independent Stripe account; a Stripe account attached to a development instance cannot be reused for production.

Clerk Billing currently processes payments through Stripe but manages Plans and Subscriptions separately from Stripe Billing. Before charging students, review the current tax, VAT, refund, country, and 3D Secure limitations in Clerk's Billing documentation.

### Optional local transcription

Install the local audio dependency:

```powershell
python -m pip install -r requirements-local.txt
```

Download a compatible faster-whisper model, then point Syllabloom to its directory before starting the server:

```powershell
$env:SYLLABLOOM_WHISPER_MODEL = "C:\path\to\whisper-small"
python server.py
```

Audio remains on the local machine in this mode. The local server turns transcript windows into timestamped concepts, notes, and provisional questions while preserving higher-confidence domain matches. The hosted beta records, imports, stores, and plays lecture media, but it does not claim the desktop server's local transcription or automatic card drafting.

## Project structure

```text
api/                 Vercel serverless endpoints
assets/              Brand marks, illustrations, and mascot artwork
data/                Sample source library and saved prototype sessions
test-audio/          Licensed short audio fixture and attribution
app.js               Product state and interactions
index.html           Landing page, onboarding, and application screens
muscle-data.js       Medical-class source fixture
redesign.css         Responsive visual system
memphis.css          Green, yellow, pink, and aqua character-led art direction
server.py            Local server, source ingestion, transcription, and Anki export
vercel.json          Production deployment configuration
```

## Verification

The current beta has been exercised against:

- A real medical-student muscle list in DOCX format
- A generated medical PowerPoint deck
- A licensed anatomy audio fixture
- A full-length lecture audio file kept outside version control
- Basic and Cloze Anki package generation
- Deck preset import fields including daily limits, retention, burying, and nested deck names
- Responsive Anki templates with mobile and night-mode styling
- Desktop and mobile layouts

Detailed receipts are in the included test reports.

Install the development test tools and run the full Python suite with:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

Run the browser-side checks with `node --test tests\*.test.js`.

## Deployment

The repository is configured for Vercel:

```powershell
npx vercel
npx vercel --prod
```

The `.vercel` directory is intentionally excluded because it contains machine-specific project linkage.

## Status

This is a beta product. Account-owned course and study workspaces sync through Neon; original lecture media remains device-local. Real student testing should focus on cross-device account isolation, source faithfulness, media capture, import behavior, and whether the daily plan feels achievable.
