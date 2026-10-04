#!/usr/bin/env bash
# Update the running site. Run on the server as root (or with sudo) from a checkout of the repo:
#   git pull && sudo ./deploy/deploy.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Python app: only what the API needs, never tests, data, or secrets.
rsync -a --delete \
  --include='server.py' --include='muscle-data.js' --include='api/' --include='api/*.py' \
  --include='requirements.txt' --include='requirements-local.txt' --include='assets/' --include='assets/**' \
  --exclude='*' \
  "$REPO/" /opt/syllabloom/app/
chown -R syllabloom:syllabloom /opt/syllabloom/app
sudo -u syllabloom /opt/syllabloom/venv/bin/pip install --quiet -r /opt/syllabloom/app/requirements-local.txt

# Preserve certbot's domain/TLS settings while migrating older upload locations.
python3 - <<'PY'
from pathlib import Path
path = Path('/etc/nginx/sites-available/syllabloom')
config = path.read_text()
if 'location /api/lecture-upload/' not in config:
    needle = '    location /api/ {'
    if needle not in config:
        raise SystemExit('Cannot configure lecture uploads: nginx API location is missing.')
    block = '''    location /api/lecture-upload/ {
        client_max_body_size 501m;
        client_body_timeout 900s;
        proxy_request_buffering off;
        proxy_read_timeout 900s;
        include /etc/nginx/snippets/syllabloom-proxy.conf;
    }

'''
    path.write_text(config.replace(needle, block + needle))
PY

# Static site: an allowlist, so source files and the .git folder are never web-reachable.
rsync -a --delete \
  --include='*.html' --include='*.js' --include='*.css' \
  --include='robots.txt' --include='sitemap.xml' \
  --include='assets/' --include='assets/**' \
  --exclude='*' \
  "$REPO/" /var/www/syllabloom/

nginx -t
systemctl reload nginx
systemctl restart syllabloom
sleep 2
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:4174/api/health
echo
systemctl enable --now syllabloom-cleanup.timer
echo "Deployed."
