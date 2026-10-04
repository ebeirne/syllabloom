#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 EC2 instance. Run as root from the repo's deploy/ folder:
#   sudo ./setup-server.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo)." >&2; exit 1; fi
HERE="$(cd "$(dirname "$0")" && pwd)"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  nginx certbot python3-certbot-nginx \
  python3 python3-venv python3-pip libpq5 curl rsync ffmpeg \
  ufw fail2ban unattended-upgrades

# Ubuntu 24.04 ships Python 3.12, which the app requires (~=3.12).
python3 --version

id -u syllabloom >/dev/null 2>&1 || useradd --system --home /opt/syllabloom --shell /usr/sbin/nologin syllabloom
install -d -o syllabloom -g syllabloom /opt/syllabloom /opt/syllabloom/app /var/lib/syllabloom /var/lib/syllabloom/uploads /var/lib/syllabloom/models
install -d /var/www/syllabloom
python3 -m venv /opt/syllabloom/venv
chown -R syllabloom:syllabloom /opt/syllabloom

install -m 644 "$HERE/nginx-proxy.conf" /etc/nginx/snippets/syllabloom-proxy.conf
install -m 644 "$HERE/nginx.conf" /etc/nginx/sites-available/syllabloom
ln -sf /etc/nginx/sites-available/syllabloom /etc/nginx/sites-enabled/syllabloom
rm -f /etc/nginx/sites-enabled/default

install -m 644 "$HERE/syllabloom.service" /etc/systemd/system/syllabloom.service
install -m 644 "$HERE/syllabloom-cleanup.service" /etc/systemd/system/syllabloom-cleanup.service
install -m 644 "$HERE/syllabloom-cleanup.timer" /etc/systemd/system/syllabloom-cleanup.timer
if [ ! -f /etc/syllabloom.env ]; then
  install -m 600 "$HERE/syllabloom.env.example" /etc/syllabloom.env
  echo "Created /etc/syllabloom.env - edit it with your real keys before starting the app."
fi
systemctl daemon-reload
systemctl enable syllabloom syllabloom-cleanup.timer

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

cat <<'MSG'

Server prepared. Next:
  1. Edit /etc/syllabloom.env and the server_name lines in /etc/nginx/sites-available/syllabloom.
  2. Run deploy/deploy.sh to upload the code and start the app.
  3. Point your domain's A record at this server, then: sudo certbot --nginx -d your-domain.com
MSG
