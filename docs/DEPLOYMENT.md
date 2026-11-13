# One PayAlert — deployment and operations

One environment = one host running `deploy/compose.yaml` with its own env file. **Demo and
production are separate hosts**, with separate databases, brokers, secrets, domains and backups.
Nothing is shared between them.

| | Demo | Production |
|---|---|---|
| `APP_ENV` | `demo` | `production` |
| Demo payment simulator | on | **off** (refused by the API; demo providers disabled by the seed) |
| Env file | `deploy/env/demo.env` | `deploy/env/production.env` |
| Compose project | `onepay-demo` | `onepay-prod` |
| Admin console | open | limited to `ADMIN_ALLOWED_IPS` |

## What runs

| Service | Image | Exposed |
|---|---|---|
| caddy | `caddy:2.10` | 80, 443 — automatic HTTPS for the three domains |
| merchant-web, admin-web | `onepay-merchant-web`, `onepay-admin-web` | via Caddy |
| api | `onepay-api` | via Caddy (`/api/v1/mqtt/*` and `/api/v1/metrics` blocked from the internet) |
| migrate | `onepay-migrate` | one-shot job on every release |
| postgres, redis, rabbitmq | official images | private network only |
| emqx (optional, `--profile soundbox`) | `emqx/emqx:5.8.6` | 8883 (MQTT over TLS) |

The API runs as the database role `onepay_app`, which **row-level security** applies to; the
`migrate` job runs migrations as the owner and (re)creates that role on every release.

## First deployment

1. A Linux host with Docker, DNS records for the three domains, and ports 80/443 open.
2. Build the images (or pull them from your registry):
   ```bash
   docker build -f infra/docker/api.Dockerfile --target runtime -t onepay-api:1.0.0 .
   docker build -f infra/docker/api.Dockerfile --target migrate -t onepay-migrate:1.0.0 .
   docker build -f infra/docker/web.Dockerfile --build-arg APP=merchant-web -t onepay-merchant-web:1.0.0 .
   docker build -f infra/docker/web.Dockerfile --build-arg APP=admin-web -t onepay-admin-web:1.0.0 .
   ```
3. `cp deploy/env/production.env.example deploy/env/production.env`, fill in every value
   (`openssl rand -base64 48` for secrets, `openssl rand -base64 32` for `DATA_ENCRYPTION_KEY`),
   set `IMAGE_TAG=1.0.0`. **Store the env file in a password manager**: losing
   `DATA_ENCRYPTION_KEY` makes stored bank credentials unreadable.
4. Start: `docker compose -p onepay-prod -f deploy/compose.yaml --env-file deploy/env/production.env up -d`
5. Create the first MysoftKH staff account (the password is read from the environment, not the
   command line):
   ```bash
   read -rs STAFF_PASSWORD && export STAFF_PASSWORD
   docker compose -p onepay-prod -f deploy/compose.yaml --env-file deploy/env/production.env \
     run --rm -e STAFF_PASSWORD migrate sh -c 'DATABASE_URL=$MIGRATION_DATABASE_URL npx ts-node prisma/create-staff.ts ops@mysoftkh.com "Ops Admin" SUPER_ADMIN'
   ```
6. Check `https://<API_DOMAIN>/api/v1/health` reports `"status":"ok"`.

## Releases

Build and tag new images, set `IMAGE_TAG`, then `up -d`. Compose runs `migrate` first and starts
the API only if it succeeds. Migrations are forward-only; take a backup before each release.

## Backups

- `deploy/backup.sh onepay-prod deploy/env/production.env` — compressed `pg_dump`, verified with
  `pg_restore --list`, SHA-256 recorded, dumps older than 14 days (`KEEP_DAYS`) deleted.
- Run it nightly from cron, and copy `deploy/backups/` **off the host** (object storage with
  versioning). Redis holds only caches and sessions-in-flight; RabbitMQ only in-flight events
  (ingestion is idempotent and recovers from the database), so neither needs backups.
- **Restore drill, monthly:** `deploy/restore.sh onepay-prod deploy/env/production.env <dump>`
  restores into a scratch database and prints row counts; the live database is untouched.
- **Disaster recovery:** the same command with `--replace-live` (asks for confirmation).

## Monitoring

- Logs are JSON (one object per line): every request has a `requestId` (also returned in the
  `X-Request-Id` header and in 500 error bodies), method, route pattern, status, duration, user
  and company. Bodies, query strings and tokens are never logged.
- Set `METRICS_TOKEN` and scrape `http://api:4100/api/v1/metrics` from inside the network:
  request durations by route, payment events, alerts sent per channel (push, soundbox),
  dependency status, and Node process metrics.
- `/api/v1/health` (public): database, Redis, queue and soundbox broker status.

## Soundboxes

Put the broker certificate in `deploy/certs/mqtt/fullchain.pem` and `privkey.pem` (for example from
the same ACME account), set `MQTT_URL=mqtt://emqx:1883`, `MQTT_PASSWORD`, `MQTT_HOOK_SECRET` and
`EMQX_DASHBOARD_PASSWORD`, and start with `--profile soundbox`. Devices connect to
`mqtts://<host>:8883` (see `docs/SOUNDBOX_PROTOCOL.md`).

## Bakong KHQR

Set `BAKONG_API_TOKEN` (register at https://api-bakong.nbc.gov.kh) and restart the API. The token
expires: renew it before then, or new KHQR payments stay pending. Admin console → System health shows
the expiry date and whether Bakong accepts the token (it warns 14 days ahead); for alerting, scrape
`onepay_bakong_token_expiry_seconds` and `onepay_dependency_up{dependency="bakong"}`.
Without a token, production has KHQR switched off and the demo environment simulates Bakong.
`KHQR_POLL_INTERVAL_MS` (default 3000) sets how often open codes are checked; any number of API
instances is fine, since one Redis lock lets only one of them poll at a time.
