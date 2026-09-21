# Syllabloom

Syllabloom turns lectures, slides, syllabi, and course files into editable, source-linked Anki cards. It also learns from assessments and class deadlines to decide which new material should enter the queue, while Anki remains responsible for scheduling card reviews.

**Live beta:** [syllabloom-beta.vercel.app](https://syllabloom-beta.vercel.app/)

## What is included

- Marketing site and per-class onboarding
- Live lecture recording and uploaded audio/video ingestion
- DOCX, PDF, PowerPoint, and text source import
- Editable card review and approval queue
- Basic and Cloze Anki card generation
- Downloadable `.apkg` decks with nested deck names and an embedded deck preset
- Anki preferences for limits, learning steps, lapses, ordering, burying, Easy Days, audio, timers, FSRS, and SM-2
- Class calendar and new-card release planning around lectures, quizzes, assignments, and exams
- Responsive student workspace and persistent Syllabloom companion
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

The core interface, source parsing, PowerPoint import, card editing, and Anki export work with the base requirements.

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

Audio remains on the local machine in this mode. The hosted beta does not claim the same local model availability as the development server.

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
- Desktop and mobile layouts

Detailed receipts are in the included test reports.

## Deployment

The repository is configured for Vercel:

```powershell
npx vercel
npx vercel --prod
```

The `.vercel` directory is intentionally excluded because it contains machine-specific project linkage.

## Status

This is a beta product. It has verified prototype flows and a live deployment, but it is not yet a multi-user production system. Calendar events and Anki preferences are currently stored in the browser. Real student testing should focus on card quality, source faithfulness, import behavior, and whether the daily plan feels achievable.
