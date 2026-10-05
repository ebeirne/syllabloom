"""Notify IndexNow about the four public pages after deployment, without retries.

Run from the repository: python deploy/notify-search.py --receipt <local-json-path>
The ownership proof file is excluded from Git; never print its contents.
"""
import argparse
import datetime
import json
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HOST = "syllabloom.study"
BASE = "https://" + HOST
PATHS = ["/", "/make-anki-cards-from-lecture-slides.html",
         "/turn-syllabus-into-study-calendar.html", "/syllabloom-vs-ai-flashcard-tools.html"]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()
    key = (ROOT / "indexnow-key.txt").read_text(encoding="utf-8").strip()
    if len(key) != 32 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid local ownership proof")
    key_url = BASE + "/indexnow-key.txt"
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(key_url, timeout=20) as response:
        if response.status != 200 or response.read().decode().strip() != key:
            raise ValueError("Live ownership proof does not match")
    urls = [BASE + p for p in PATHS]
    for url in urls:
        with opener.open(url, timeout=20) as response:
            if response.status != 200:
                raise ValueError("Public page unavailable")
    receipt = Path(args.receipt)
    receipt.parent.mkdir(parents=True, exist_ok=True)
    row = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "endpoint": "https://api.indexnow.org/indexnow", "urls": urls,
           "status": "intent_recorded", "notice": "Submission is not indexing or ranking."}
    def save():
        receipt.write_text(json.dumps(row, indent=2), encoding="utf-8")
    if receipt.exists():
        raise ValueError("Receipt already exists; reconcile before submitting again")
    save()
    request = urllib.request.Request(row["endpoint"], method="POST",
        data=json.dumps({"host": HOST, "key": key, "keyLocation": key_url,
                         "urlList": urls}).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with opener.open(request, timeout=30) as response:
            row["http_status"] = response.status
            row["status"] = "submitted" if response.status == 200 else "received_validation_pending" if response.status == 202 else "unexpected_response"
    except urllib.error.HTTPError as error:
        row.update(status="http_error", http_status=error.code)
    except Exception:
        row.update(status="ambiguous_transport_error", retry="Do not automatically retry")
    save()
    print(json.dumps(row))

if __name__ == "__main__":
    main()
