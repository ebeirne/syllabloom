# Syllabloom

Syllabloom turns lectures, slides, syllabi, and course files into editable, source-linked Anki cards. It also learns from assessments and class deadlines to decide which new material should enter the queue, while Anki remains responsible for scheduling card reviews.

**Live beta:** [syllabloom-beta.vercel.app](https://syllabloom-beta.vercel.app/)

## What is included

- Marketing site and per-class onboarding
- Live lecture recording and uploaded audio/video ingestion
- Per-user on-device lecture library with audio/video playback and removal
- DOCX, PDF, PowerPoint, and text import with source-linked concepts, notes, and ready-to-review cards
- Editable card review and approval queue
- Source-grounded explanations after every missed card, with same-card retry and repeated-miss editing
- Basic and Cloze Anki card generation
- Downloadable `.apkg` decks with nested deck names and an embedded deck preset
- Anki preferences for limits, learning steps, lapses, ordering, burying, Easy Days, audio, timers, FSRS, and SM-2
- Class calendar and new-card release planning around lectures, quizzes, assignments, and exams
- Full profile hub with Clerk identity controls, current tier, active classes, and editable important dates
- Dedicated billing page that mounts Clerk Billing's Stripe-powered pricing and checkout UI when Plans are enabled
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

The core interface, generic source parsing, PowerPoint import, source-linked notes, card editing, and Anki export work with the base requirements. PowerPoint decks do not need a special template or anatomy-specific labels.

### Email sign-in

The beta uses Clerk for passwordless email sign-in. Set the publishable key before starting the server:

```powershell
$env:CLERK_PUBLISHABLE_KEY = "pk_test_your_key"
python server.py
```

Use the same `CLERK_PUBLISHABLE_KEY` environment variable in Vercel. Until cloud sync is added, Clerk controls beta access and the one-free-class gate. Lecture media is stored in IndexedDB under the current Clerk user ID, so accounts stay separated on the same device, but files do not yet follow a student to another browser or device.

### Billing

The billing page is wired to Clerk Billing for individual users. It checks the signed-in user's `student` Plan, mounts Clerk's live pricing table when Billing and public Plans exist, and sends account, payment-method, and statement management to Clerk's secure user profile.

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

Run the repeatable Anki package checks with:

```powershell
python -m unittest discover -s tests -v
```

## Deployment

The repository is configured for Vercel:

```powershell
npx vercel
npx vercel --prod
```

The `.vercel` directory is intentionally excluded because it contains machine-specific project linkage.

## Status

This is a beta product. It has verified prototype flows and a live deployment, but it is not yet a cloud-synced multi-user system. Calendar events, Anki preferences, and per-user lecture libraries are currently stored in the browser. Real student testing should focus on card quality, source faithfulness, media capture, import behavior, and whether the daily plan feels achievable.
