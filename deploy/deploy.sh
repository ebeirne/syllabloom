#!/usr/bin/env bash
# Update the running site. Run on the server as root (or with sudo) from a checkout of the repo:
#   git pull && sudo ./deploy/deploy.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Python app: only what the API needs, never tests, data, or secrets.
rsync -a --delete \
  --include='server.py' --include='api/' --include='api/*.py' \
  --include='requirements.txt' --include='assets/' --include='assets/**' \
  --exclude='*' \
  "$REPO/" /opt/syllabloom/app/
chown -R syllabloom:syllabloom /opt/syllabloom/app
sudo -u syllabloom /opt/syllabloom/venv/bin/pip install --quiet -r /opt/syllabloom/app/requirements.txt

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
curl -fsS http://127.0.0.1:4174/api/health && echo
echo "Deployed."
