#!/bin/sh
set -eu

: "${APP_KEY:?Set a stable APP_KEY in Render environment settings}"
: "${DB_URL:?Set DB_URL to the private Neon PostgreSQL connection string}"
export APP_URL="${APP_URL:-${RENDER_EXTERNAL_URL:-}}"
: "${APP_URL:?Set APP_URL or deploy as a Render web service}"
export FRONTEND_URL="${FRONTEND_URL:-$APP_URL}"
app_host="${APP_URL#*://}"
export SANCTUM_STATEFUL_DOMAINS="${SANCTUM_STATEFUL_DOMAINS:-${app_host%%/*}}"
export PORT="${PORT:-10000}"
case "$PORT" in ''|*[!0-9]*) echo 'PORT must be numeric' >&2; exit 1;; esac

sed -i "s/^Listen 80$/Listen $PORT/" /etc/apache2/ports.conf
sed -i "s/\*:10000/*:$PORT/" /etc/apache2/sites-available/000-default.conf

php artisan config:clear
php artisan migrate --force --no-interaction
php artisan dineflow:deploy --no-interaction
php artisan storage:link --force
php artisan config:cache
chown -R www-data:www-data storage bootstrap/cache

# Runs only while the free web instance is awake; it cannot wake an idle service.
php artisan schedule:work --no-interaction &
exec apache2-foreground
