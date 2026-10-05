from http import HTTPStatus
from urllib.parse import urlsplit
from api._common import JsonHandler
from api.user_data import authenticated_user
from api.lecture_storage import read_job, public_job, JOB_PATTERN
from api.study_sheets import create_sheet, resume_sheet


class handler(JsonHandler):
    def do_POST(self):
        owner = authenticated_user(self.headers)
        if not owner:
            self.send_json({'error': 'Sign in to create a study sheet.'}, HTTPStatus.UNAUTHORIZED)
            return
        from api.billing import require_access
        if not require_access(self):
            return
        try:
            body = self.read_json(2 * 1024 * 1024)
            job = create_sheet(owner, str(body.get('filename') or 'lecture.txt'), body.get('text'), body.get('units'),
                               body.get('preferences'), body.get('excluded'), body.get('existingImage'))
            self.send_json({'job': job}, HTTPStatus.ACCEPTED)
        except (ValueError, TypeError) as exc:
            self.send_json({'error': str(exc)}, HTTPStatus.BAD_REQUEST)

    def do_GET(self):
        owner = authenticated_user(self.headers)
        if not owner:
            self.send_json({'error': 'Sign in to open a study sheet.'}, HTTPStatus.UNAUTHORIZED)
            return
        identity = urlsplit(self.path).path.rsplit('/', 1)[-1]
        job = read_job(owner, identity) if JOB_PATTERN.fullmatch(identity) else None
        if not job or job.get('jobType') != 'study-sheet':
            self.send_json({'error': 'Study sheet not found.'}, HTTPStatus.NOT_FOUND)
            return
        resume_sheet(owner, identity)
        self.send_json({'job': public_job(job)})
