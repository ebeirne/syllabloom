# Syllabloom

Syllabloom turns lectures, slides, syllabi, and course files into editable, source-linked Anki cards. It also learns from assessments and class deadlines to decide which new material should enter the queue, while Anki remains responsible for scheduling card reviews.

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
- Dedicated billing page with server-verified lifetime access and Stripe subscription checkout (disabled until configured and verified)
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

Use the same `CLERK_PUBLISHABLE_KEY` environment variable on the server (`/etc/syllabloom.env`). Clerk controls beta access and the one-free-class gate. Neon provides the Postgres database; the API verifies Clerk session tokens and stores each workspace under the verified Clerk user ID. Class profiles, parsed sources and cards, calendar dates, Anki preferences, card edits, and study history sync across devices. Original lecture audio and video stay in IndexedDB on the current device and are not uploaded to Neon.

`DATABASE_URL` is your Neon connection string. Do not add database credentials to browser code or commit local environment files. Set the server-only `OPENAI_API_KEY` in `/etc/syllabloom.env` (mode 600; and in a local ignored environment file for local testing); never use a browser-exposed `VITE_` or `NEXT_PUBLIC_` variable. AI usage is guarded by atomic Neon counters: at most 192,000 source characters per account per UTC day and 1,000,000 across the beta per day, plus a shared $18 estimated monthly provider-cost reservation cap, leaving $2 below the user's $20 test balance. Each request reserves an upper bound before calling the provider, including its maximum output tokens; failed attempts keep their reservation. Counter rows for daily source volume are deleted after 90 days. Each material is limited to 192,000 extracted characters for one import, split into at most 16 page/slide-aware chunks and generated in sequential batches of 4 chunks (12 accepted cards per chunk) so each request stays bounded and the import can report progress. The source is inspected before any card request; exact duplicate extracted content already in the class skips AI generation, and successfully completed batches are kept in the active import queue for a retry. PPTX speaker notes and image descriptions join the extracted text. Sparse/scanned PDF pages can be OCR'd locally in the browser (up to 100 PDF pages); page images are not sent to OpenAI. GPT-5.4 nano is pinned for the beta to keep reasoning costs low; source-quote and location checks still reject unsupported output. If the provider or usage guard is unavailable, the upload is rejected rather than returning heuristic cards as if they were AI-generated. Syllabi are excluded from AI generation and continue through the calendar parser. The API request sets `store: false`; see the Privacy Policy for OpenAI's default abuse-monitoring retention. Tests use mocked Responses API replies and do not make billed provider calls.

On the first signed-in visit, an unclaimed local workspace is saved to the account if it has no existing cloud workspace; if another account owns the browser's workspace, it is not copied into the new account.

### Billing

Keep Syllabloom on `syllabloom-beta.vercel.app` with its existing Clerk development instance. A custom domain or Clerk production migration is not part of this change. Direct Stripe Checkout handles subscriptions independently of Clerk Billing. Checkout remains disabled unless `SYLLABLOOM_BILLING_ENABLED=true`; the example configuration defaults to disabled billing and Stripe test mode.

Server-owned access grants keep the frozen `SYLLABLOOM_FOUNDER_IDS` snapshot free forever, separately from the next ten new users in Clerk signup order. Existing grants are retained. Paid access requires a current subscription to an allowed price: $12 USD monthly or $108 USD annually ($9/month equivalent). The browser cannot grant itself a plan, and a successful checkout return URL does not grant access.

Before enabling billing, configure the server-only variables in `.env.example`, validate checkout in Stripe test mode, and verify signed notifications at `/api/stripe-webhook` and a dedicated cancellation portal configuration. Do not commit secrets or the private founder snapshot. Preview deployments cannot use live Stripe credentials and must retain their separate database. Creating Stripe product prices alone does not enable checkout or charge anyone.

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

Audio remains on the local machine in this mode. The local server turns transcript windows into timestamped concepts, notes, and provisional questions while preserving higher-confidence domain matches.

The AWS deployment can expose the same engine through authenticated background lecture jobs. Install `requirements-local.txt`, place the downloaded model at `SYLLABLOOM_WHISPER_MODEL`, and restart the service. `/api/health` keeps the hosted feature disabled until that directory exists. When enabled, the browser uploads a private temporary processing copy, polls the persisted job, and receives a searchable timestamped transcript, chapters, notes, card drafts, and deduplicated MP4 scene-change frames. The worker deletes the media copy at completion; abandoned media expires after 24 hours and private job results after seven days. The original media library remains in IndexedDB and does not become a cross-device cloud media library.

## Project structure

```text
api/                 API endpoints, routed by api/routes.py
assets/              Brand marks, illustrations, and mascot artwork
data/                Sample source library and saved prototype sessions
test-audio/          Licensed short audio fixture and attribution
app.js               Product state and interactions
index.html           Landing page, onboarding, and application screens
muscle-data.js       Medical-class source fixture
redesign.css         Responsive visual system
memphis.css          Green, yellow, pink, and aqua character-led art direction
server.py            Local server, source ingestion, transcription, and Anki export
deploy/              nginx, systemd, and server setup/deploy scripts for AWS
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

Syllabloom runs on a single Ubuntu 24.04 EC2 instance: nginx serves the static site and terminates HTTPS, and `server.py` serves `/api/*` on 127.0.0.1:4174 under systemd. Neon (database) and Clerk (sign-in) stay hosted services. Large source documents are uploaded to `SYLLABLOOM_UPLOAD_DIR` on local disk, deleted as soon as they are read, and swept nightly if abandoned.

1. Launch an EC2 instance (Ubuntu 24.04, t3.small or larger) with an Elastic IP. The security group should allow only ports 22, 80, and 443.
2. Clone the repository on the server and run `sudo deploy/setup-server.sh`.
3. Edit `/etc/syllabloom.env` (copy of `deploy/syllabloom.env.example`) and the `server_name` lines in `/etc/nginx/sites-available/syllabloom`.
4. Run `sudo deploy/deploy.sh`. Run it again after each `git pull` to update.
5. Point your domain's A record at the Elastic IP, then run `sudo certbot --nginx -d your-domain.com`.
6. In Clerk, add the new domain and update the canonical/Open Graph URLs in the HTML pages, `sitemap.xml`, and `robots.txt`.

Setting `SYLLABLOOM_ENV` (e.g. `production`) turns on hosted behavior: sign-in is required, `/api/*` is routed through `api/routes.py`, and the Python server refuses to serve static files.

## Status

Hosted lecture summaries: install Ubuntu's `ffmpeg` package and set
`SYLLABLOOM_LECTURE_PROVIDER=openai` alongside `OPENAI_API_KEY` and the existing
Neon connection. Audio is compressed into ten-minute mono sections for Whisper
transcription; transcript-derived study notes use `SYLLABLOOM_LECTURE_NOTES_MODEL`
(default `gpt-5.4-nano`). Files are limited to 500 MB and three hours. Provider
work reserves the shared beta budget before starting. Successful sections are
checkpointed; ambiguous exchanges are not automatically retried. Notes include
exact transcript excerpts and seek timestamps, but require student review.
This path does not interpret slide images or diagrams. Results expire after
seven days. Completed notes and the original lecture remain in the submitting
browser's account-owned device library; notes can also be downloaded as Markdown.

This is a beta product. Account-owned course and study workspaces sync through Neon; original lecture media remains device-local. Real student testing should focus on cross-device account isolation, source faithfulness, media capture, import behavior, and whether the daily plan feels achievable.

### AWS beta handoff

This branch includes the latest beta import/OCR fixes, legacy PPT/PPTW support,
durable batch recovery, source coverage, first-use study flow, billing and product events.
Use the existing Clerk development instance with `SYLLABLOOM_PUBLIC_BETA_AUTH=1`.
Do not reset the founder snapshot, subscription prices, or database during migration.
Copy the existing secrets securely into `/etc/syllabloom.env`; the example contains
placeholders and disables billing until the AWS configuration is verified.

Before redirecting students, test sign-in, a large PDF and legacy PowerPoint import,
interrupted generation recovery, study and Anki export. Set `SYLLABLOOM_APP_URL`
to the actual HTTPS origin at cutover and register `/api/stripe-webhook` there with
its own signing secret. Verify checkout return URLs and the customer portal.
The existing Vercel beta is not changed by pushing this AWS branch; retain it for rollback.
The deploy script starts the nightly cleanup timer after the API health check succeeds.
Health is a liveness check, not proof of working billing or external services.
