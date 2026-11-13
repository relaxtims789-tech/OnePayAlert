# One PayAlert — Project Status

> **One Platform. Multiple Banks. Instant Payment Alerts.**
> Mysoftkh · Fintech / payment notification SaaS · Cambodia

_Last updated: 2026-11-13 — CI green on GitHub, per-account sign-in lockout_

## Phase overview

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation: monorepo, shared types, DB schema, auth, tenancy, RBAC, outlets, employees, super-admin company control | ✅ **Done** |
| 2 | Bank/gateway connections + transaction ingestion (webhooks, idempotency, RabbitMQ, Redis, WebSocket, FCM) | ✅ **Done** |
| 3 | Merchant web dashboard (Next.js) | ✅ **Done** |
| 4 | MysoftKH Super Admin dashboard (Next.js) | ✅ **Done** |
| 5 | Flutter mobile app (Android/iOS) | ✅ **Done** (Android verified; iOS not yet built) |
| 6 | Reports, subscriptions & plan limits, i18n content (km/en/zh) | ✅ **Done** |
| 7 | Soundbox devices over EMQX MQTT | ✅ **Done** (verified with the simulator; no physical device yet) |
| 8 | Hardening & pilot readiness (Docker images, CI, observability, backups, pen-test fixes) | ✅ **Done** (CI green on GitHub) |
| 9 | Bakong KHQR collection: show a KHQR code, payment confirmed with the Bakong Open API | ✅ **Built** (tested against recorded responses and a fake Bakong server; **not yet run against the real Bakong API**, which needs a token) |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the scope of each phase.

**Test totals:** 73 shared + 8 web-core + 44 API + 5 merchant-web + 6 admin-web unit tests, **104 API e2e** (real PostgreSQL as a non-superuser role with row-level security, Redis, RabbitMQ, plus an in-process MQTT broker) and **27 browser e2e** (16 merchant + 11 admin, Playwright in Chrome against the real stack), and for the mobile app **29 Flutter unit/widget tests** and **1 on-device integration test** (Android emulator against the real API). All passing.

---

## Sign-in lockout per account

Closes the Phase 8 gap "rate limits are per IP only". Guessing one account's password from many addresses no longer works.

- **Rule:** 5 wrong passwords within 15 minutes lock the account for 15 minutes (`LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`). The lock is checked **before** the password, so while locked even the right password is refused. The per-IP limits stay as they were.
- **No account discovery:** unknown emails are counted and locked exactly like real ones, with the same answer. Redis stores a hash of the email, never the address.
- **Way back in:** the lock expires by itself, and a **password reset unlocks at once**. A successful sign-in clears the count.
- **The owner is told:** the locking attempt sends an email in the user's language ("Your account was locked", with a reset link) and writes an `auth.locked` audit entry. The message on screen (`ACCOUNT_LOCKED`, HTTP 429) is translated (km/en/zh) and shown as-is by both dashboards and the mobile app; no client changes were needed.
- **Covers every sign-in:** merchants, staff and MysoftKH staff all sign in through `POST /auth/login`.
- **If Redis is down,** sign-in keeps working (the per-IP limits still apply) and a warning is logged.

Tests: 2 unit (counting, case-insensitivity, Redis down), 5 API e2e (lock after 5, right password refused, Khmer message and email, audit, unknown emails, reset count on success, expiry, password reset), 1 browser test.

Also: **CI is green on GitHub** for the first time (all five jobs). The browser suites had failed on every run because Playwright starts the API before its global setup, so on the runner's empty database the API's role did not exist yet; the database is now prepared before the API starts (`apps/api/test/prepare-db.mjs`).

Known gaps: no way for MysoftKH staff to unlock an account by hand (the owner resets their password or waits); counts live in Redis, so flushing Redis clears them.

---

## Bakong KHQR collection: what was built

The first real payment-provider integration. A cashier types an amount, the customer scans the KHQR code with **any Cambodian bank app**, and the payment is confirmed with Bakong (the National Bank of Cambodia's system), then announced like every other payment: live feed, push, voice and soundbox.

### How it works
1. **Connect a Bakong account** (dashboard → Bank connections → Bakong KHQR): the merchant's Bakong account id (`shop@aclb`, as shown in their bank app) and the name customers see (Latin letters, up to 25, as KHQR requires). With a Bakong token the API checks the account exists (`/v1/check_bakong_account`). Money goes straight from customer to merchant; One PayAlert never holds it.
2. **Show a code** (`POST /khqr/charges`, dashboard **Collect payment**, mobile **Collect** tab): a dynamic KHQR for the exact amount, valid 5 minutes, with a unique bill number (`OPA…`) and the outlet as store label. USD with up to 2 decimals; KHR in whole riel.
3. **Confirmation**: a poller asks Bakong every 3 seconds about all open codes at once (`/v1/check_transaction_by_md5_list`, 50 per call, one API instance at a time via a Redis lock), then fetches the paid one's details (`/v1/check_transaction_by_md5`). A payment arriving up to 60 seconds after expiry still counts.
4. **Checks before it counts**: amount, currency and receiving account must match the code. If not, the code goes to **REVIEW**: no alert, not counted, and the merchant is told to check their bank app.
5. **Recorded through the normal pipeline** (`IngestionService`, idempotent on the Bakong hash), so reports, plan limits, realtime, push and soundboxes need no special case. The payer shows as `ch•••@aclb` (Bakong ids are masked by name, not by their last 4 characters, which are just the bank code).

### Encoder
`apps/api/src/khqr/khqr-encoder.ts` writes the EMVCo/KHQR payload and CRC-16 itself (no runtime dependency). Tests prove it produces **byte-for-byte the same string** as NBC's official `bakong-khqr` SDK for USD, KHR, small and static amounts; the SDK is a test-only dependency (it ships an old axios). A code shown on the Android emulator was decoded from a screenshot and accepted by the official SDK.

### Three modes, never faked in production
| Mode | When | Behaviour |
|---|---|---|
| `live` | `BAKONG_API_TOKEN` set | Real Bakong Open API. |
| `simulated` | no token, outside production | Demo: a **"Customer paid (demo)"** button; payments are marked demo (`isSimulated`) everywhere. |
| `off` | no token in production | Collect explains KHQR is not available yet. Nothing is simulated. |

### Permissions
New permission **`payment.collect`**: owner, admin, manager and **cashier** (not accountant). `GET /khqr/accounts` lists the Bakong accounts a member may collect into, so cashiers can collect without seeing bank connections. Outlet-restricted staff collect only for their own outlets.

### Bugs found by running it
- **Cashiers' Collect page would never load**: it listed accounts from `bank-connections`, which cashiers may not read. Fixed with `GET /khqr/accounts` (covered by API and browser tests).
- **Mobile: signing out showed "Your session has ended"**: the Collect tab's setup query re-ran without a token and its 401 looked like an expired session. Found on the emulator, fixed, and covered by a test.
- **Payer shown as `•••• bkrt`**: masking took the last 4 characters of the Bakong id, i.e. the bank code. Fixed.

### Tests (all passing)
- Encoder against the official SDK; Bakong client against recorded responses (paid, not found, 401 vs 5xx, batch, account check, string amounts).
- **8 API e2e** with the simulated Bakong and with a **fake Bakong HTTP server** (bearer token, account check, poller, real non-demo payment): QR validity, idempotent payment, poller, mismatch → REVIEW, expiry and grace, cancel, cashier/accountant/other-company access, account listing.
- Browser: an owner connects a Bakong account, shows a KHQR for $7.50, the demo customer pays, and the payment appears in Transactions; a cashier can reach Collect. Mobile: 6 widget/unit tests.
- Checked by hand in the dashboard (Khmer) and on the Android emulator (Khmer): code, countdown, demo payment, alert notification, result screen, sign-out.

### Configuration
`BAKONG_API_TOKEN` (from api-bakong.nbc.gov.kh; it expires and must be renewed), `BAKONG_API_URL` (default `https://api-bakong.nbc.gov.kh`), `KHQR_POLL_INTERVAL_MS` (default 3000; 0 turns the poller off, as in tests). Added to `deploy/compose.yaml` and the env examples.

### Known gaps
- **Not yet run against the real Bakong API.** Everything is built to its documented responses and tested against a fake server; the first real token will show whether anything differs (for example error codes or amount formats).
- Bakong's token **expires**; there is no reminder yet. When it is rejected, polling logs errors and codes stay pending.
- The **KHQR card design is approximate** (red header, no official KHQR logo asset); check it against NBC's brand guidelines before launch.
- Codes are confirmed by **polling** (about 3 s). Bakong offers no merchant webhook for this.
- No refunds through Bakong; a REVIEW payment is resolved in the merchant's bank app.
- iOS still not built (Phase 5 gap).

---

## Phase 8: what was built

Runbook for operators: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Production images and deployment
- **Images** (`infra/docker/`): `onepay-api` (Node 24 slim, production dependencies only, non-root, health check, 767 MB), `onepay-migrate` (one-shot: migrations, reference data, database role), and one Next.js standalone image per dashboard (≈390 MB, non-root). No packages are downloaded at build time beyond npm: the slim runtime gets just the two OpenSSL 3 libraries Prisma needs, the Chinese PDF font is trimmed to the two weights used, and Prisma's CLI, engines and TypeScript are left out.
- **`deploy/compose.yaml`**: one complete environment per host — Postgres, Redis (password, AOF), RabbitMQ, the migrate job (the API starts only if it succeeds), API, both dashboards, Caddy (automatic HTTPS) and, optionally, EMQX with MQTT over TLS on 8883. Only Caddy (and EMQX's TLS port) is published.
- **Demo and production are separate** hosts, compose projects, env files, databases, brokers, secrets and domains (`deploy/env/demo.env.example`, `production.env.example`). The API refuses demo payments in production; the demo env file is the only one with the simulator.
- **Caddy** adds HSTS and a Content Security Policy on the dashboards, hides the EMQX hooks and `/metrics` from the internet, and can limit the MysoftKH console to office/VPN addresses (`ADMIN_ALLOWED_IPS`).
- **First staff account** in any environment: `prisma/create-staff.ts` (password from the environment, never the command line). The seed still never creates accounts in production.
- **Rehearsed locally** with the real images and compose file (`*.localhost` domains through Caddy): migrations + seed + role, register a merchant, demo payment through RabbitMQ, transactions, PDF (km/zh) and CSV, translated plan-limit error, dashboard sign-in with `Secure` httpOnly cookies, staff account creation and admin sign-in, metrics from inside the network, hidden internal paths, backup, and a restore drill. The rehearsal found and fixed a real bug: Compose passes unset optional settings as empty strings, which the API rejected (`MQTT_URL: Invalid URL`); empty settings now count as unset.

### Row-level security (Postgres)
- Policies on every tenant table (`companies`, `outlets`, `memberships`, `membership_outlets`, `bank_connections`, `transactions`, `webhook_events`, `devices`, `subscriptions`, `invoices`, `audit_logs`), forced also for the table owner.
- Merchant read paths (transactions, summary, reports and exports, outlets, employees, bank connections, devices, invoices) run through `prisma.forTenant(companyId)`: each query runs in a transaction that sets `onepay.company_id`, so **the database itself** returns only that company's rows, even if a query forgot its filter, and refuses writes into another company. Work without a company context (ingestion, billing job, MysoftKH console, sign-in) is unaffected.
- The API runs as `onepay_app`: a plain role that cannot bypass RLS or change the schema (`prisma/app-role.mjs`, run by the migrate job). **The whole test suite now runs as such a role**, so every test exercises the policies; a dedicated test proves cross-tenant reads, updates and inserts are refused at the database.

### Logging and metrics
- JSON logs in demo/production (Nest's built-in JSON logger), one line per request: request id, method, route pattern, status, duration, user and company. Never bodies, query strings or tokens.
- Every response carries `X-Request-Id` (a well-formed incoming id is kept, anything else replaced), and 500 errors include it so support can find the log line.
- Prometheus metrics at `/api/v1/metrics` (only with `METRICS_TOKEN`, blocked at the edge): request durations by route pattern, payment events, alerts sent per channel, dependency status, Node process metrics.
- `TRUST_PROXY`: behind Caddy, audit logs and rate limits now see the real client address instead of the proxy's (without it, every user would have shared one rate limit).

### Backups
- `deploy/backup.sh`: compressed `pg_dump`, verified with `pg_restore --list`, SHA-256, 14-day retention. `deploy/restore.sh`: a restore drill into a scratch database by default; `--replace-live` for disaster recovery, with confirmation.

### CI (`.github/workflows/ci.yml`)
- Typecheck + unit tests + dependency audit; API e2e against Postgres/Redis/RabbitMQ service containers; both browser suites in Chrome; all four Docker images built and the compose file validated; Flutter analyze + tests. **Not run on GitHub yet** — it will run on the first push of this branch.

### Dependency audit and upgrades
- Upgraded **nodemailer 7 → 10.2.1** (SMTP command injection and ~20 other advisories; SMTP sending re-checked against a test SMTP server), **zod 3 → 4.6.7**, **firebase-admin 13 → 14.5.0**. Versions chosen at least two weeks old.
- `tools/audit.mjs` fails CI on any high/critical production advisory except an explicit, expiring allow-list. The only entry: the Prisma CLI's `deepmerge-ts` (build/migrate time, trusted input, not in the runtime image; fixed only in Prisma 7), review by 2027-02-28.

### Security review (summary)
Checked: token handling (short-lived access tokens, rotating refresh tokens with reuse detection), rate limits on sign-in/registration/password reset/device claims (now per real client IP), password rules, webhook signatures and replay window, same-origin checks and httpOnly/Secure/SameSite cookies, CORS closed, Swagger off in production, helmet headers, HSTS + CSP at the edge, generic 500s, secrets never logged, non-root containers, internal endpoints unreachable from the internet, CSV formula injection, tenant isolation in code **and** in the database, dependency advisories.

### Tests (all passing)
- 64 shared, 8 web-core, 28 API, 5 merchant-web and 6 admin-web unit tests; full monorepo typecheck.
- **91 API e2e**, now running as a non-superuser role (RLS in force), including new suites for row-level security and request ids/metrics.
- **25 browser e2e (14 merchant + 11 admin, Playwright in Chrome)**, with the same role.

### Phase 8 known gaps
- _Update 2026-11-13:_ CI has run on GitHub and is green (the browser suites needed the test database prepared before the API starts).
- **No linter** (ESLint) yet: strict TypeScript checking runs everywhere, but style/lint rules are not enforced.
- **Content Security Policy** is served by Caddy but was not exercised in a browser locally (the browser here does not trust Caddy's local test certificate). Check the dashboards once on the real demo domain.
- **Images are built locally**; pushing them to a registry (and signing them) is not set up.
- **Single host**: no high availability or managed database; the in-memory rate-limit store is per API instance.
- **Off-site backup copy** is described, not automated.
- ~~Rate limits are per IP only~~: per-account lockout added (see "Sign-in lockout per account").
- **Kicking a disabled soundbox immediately** (EMQX management API) is still open from Phase 7.
- The `migrate` image is large (≈3 GB, full build toolchain); it only runs at release time.

---

## Phase 7: what was built

### Soundboxes: speakers that announce payments
A soundbox sits at the counter and says "Received $12.50" (in Khmer, English or Chinese) the moment a payment succeeds. Devices talk MQTT to an EMQX broker; the protocol for firmware developers is in [docs/SOUNDBOX_PROTOCOL.md](docs/SOUNDBOX_PROTOCOL.md).

### Device lifecycle
1. **MysoftKH registers the device** (admin console → Soundboxes, or `POST /platform/devices`) before it ships. The API returns, **once**, the device's MQTT password (flashed at the factory) and a claim code `XXXX-XXXX` (printed on the box). Only Argon2 hashes are stored.
2. **The merchant claims it** (dashboard → Soundboxes → Add) by typing the serial number and claim code; any case, with or without the dash. Unknown serial, wrong code and "already claimed" get the same answer, so serials cannot be probed, and claiming is rate-limited (10/min). Claimed devices count toward the plan's device limit; two merchants racing for one box cannot both win.
3. **Settings**: name, which outlet it announces (one outlet, or every outlet), language and volume. Changes are pushed to the device immediately. "Play test sound" checks it end to end.
4. **Removing** a device frees the plan slot; it can be claimed again with its box code. MysoftKH can **disable** a device (its next login is refused and nothing is sent to it) or **issue a new password** (the old one stops working at once).

### How the broker is secured
- EMQX asks the API about every login (`POST /api/v1/mqtt/auth`) and every publish/subscribe (`POST /api/v1/mqtt/acl`). Both hooks require a shared secret header and deny everything when it is missing or wrong. They are not in the public API docs and should only be reachable from the broker.
- A device logs in with username = client ID = its serial number and its own password. It may only subscribe to `onepay/d/<serial>/cmd` and publish to its own `status` and `telemetry` topics. Other devices' topics, wildcards (`onepay/#`) and publishing to `cmd` are refused (verified against the real EMQX with the simulator's `--probe`).
- The API connects as a superuser (`MQTT_USERNAME` / `MQTT_PASSWORD`, checked by the same hook).

### Announcements and status
- When a payment becomes **successful**, the API publishes a `payment` command to every active device of that company that covers the payment's outlet (devices at that outlet, plus devices set to "all outlets"). The text is in each device's language. Pending, failed and reversed payments are never announced.
- Commands are MQTT 5, QoS 1, not retained, and **expire after 60 seconds**, so a soundbox that was offline never announces an old payment on reconnect.
- Devices report `online`/`offline` (retained, with `offline` as the last will) and telemetry (battery, signal, firmware). The dashboard shows them live through the existing realtime socket, to the same people who can see that outlet's payments.
- Soundboxes are optional: without `MQTT_URL` the API runs normally, devices can still be registered and claimed, and `/health` reports `soundbox: disabled`. A broker outage never affects payment ingestion, web alerts or push.

### Tools
- `docker compose --profile soundbox up -d emqx` starts EMQX 5.8.6 already wired to the local API's hooks.
- `node tools/soundbox-sim.mjs --serial <SERIAL> --password <device password> [--speak] [--probe]` behaves like a real device: reports online/telemetry, prints (and on Windows speaks) every announcement, and `--probe` checks the broker refuses forbidden topics.

### Checked against the real stack
With EMQX and the simulator on the dev machine: a device registered in the console and claimed by a merchant logged in through the hook; the merchant's Soundboxes page turned it online about half a second after it connected, without reloading; "Play test sound" and a demo payment were announced in Khmer within a second; forbidden subscriptions and a forged command were refused; disconnecting showed it offline.

### Tests (all passing)
- 64 shared (incl. the device topic rules), 8 web-core, 27 API, 5 merchant-web and 6 admin-web unit tests.
- **85 API e2e**, including a new soundbox suite with an in-process MQTT broker: registration and one-time credentials, hook authentication (wrong password, wrong client ID, missing secret, rotated and disabled devices, API superuser), topic rules, claiming (any case, identical refusals, other merchants, plan limit, release and re-claim), announcements only to devices covering the outlet and never for pending payments, settings and test commands, telemetry and online status, and outlet-restricted staff.
- **25 browser e2e**: the merchant adds a soundbox with its box code (a wrong code is refused) and changes its settings; MysoftKH registers one, sees its credentials once and disables it.
- Mobile: 23 Flutter tests.

### Configuration
- `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_HOOK_SECRET` (API). `MQTT_URL` requires the other two. The hook secret must equal `ONEPAY_MQTT_HOOK_SECRET` given to EMQX.
- Dev defaults in `docker-compose.yml` and `apps/api/.env` are marked dev-only.

### Phase 7 known gaps
- **No real hardware yet.** Everything was verified with the simulator; the first physical soundbox needs a firmware partner working from `docs/SOUNDBOX_PROTOCOL.md`.
- **TLS for MQTT** is not set up locally (plain port 1883). Production must use `mqtts` on 8883 with a real certificate (Phase 8).
- **Disabling does not kick a connected device** right away: it is refused at its next login and receives no more commands. Kicking needs the EMQX management API (Phase 8).
- **Spoken amounts** use the same text as push alerts, e.g. "បានទទួលប្រាក់ 7.25$". Devices that play recorded number clips should use the `amount`, `currency` and `locale` fields instead.
- **No firmware updates over the air** and no per-device announcement history yet.
- The mobile app does not manage soundboxes (the web dashboard does).

---

## Phase 6: what was built

### Plan limits (enforced by the API)
- Every plan sets a maximum of active outlets, employees, bank connections and devices. The API refuses to add one more (or to re-activate one) beyond the limit, with code `PLAN_LIMIT_OUTLETS` / `_EMPLOYEES` / `_BANK_CONNECTIONS` / `_DEVICES` and a translated message.
- What counts: active outlets; active staff (owners do not count); connections that are not disconnected; devices that are not disabled. Deactivating or disconnecting frees the slot. Merchants already above a lower plan's limit keep what they have but cannot add more.
- Checks run inside the same database transaction as the create, behind a per-company advisory lock, so parallel requests can never take the same last slot (tested with 5 simultaneous requests).

### Subscriptions and invoices
- New merchants start a **14-day Starter trial**. To subscribe or change plan, the owner picks a plan on the **Plan & billing** page; this issues an **invoice** (`INV-2026-000123`, sequential) with Mysoftkh's payment instructions.
- **Nothing is marked paid automatically.** MysoftKH staff confirm the payment in the admin console (**Invoices** page) once the money has actually arrived, with the method and transfer reference. That starts the paid period (renewals continue from the previous period end, so paying late does not gain free days). Every confirmation is audited.
- A lifecycle job (every 15 minutes; also runnable from the Invoices page) moves subscriptions along: trial over → `EXPIRED`; period ending within 7 days → renewal invoice; period over → `PAST_DUE` (still usable); more than 7 days past due → `EXPIRED`. It is safe to run on several API instances: changes are conditional, and the database allows only one unpaid invoice per subscription.
- **Payment alerts never stop for billing reasons.** A lapsed subscription only blocks adding outlets, employees and connections (`SUBSCRIPTION_INACTIVE`).
- Only the owner can choose a plan (`subscription.manage`); admins and accountants can view billing.
- The merchant dashboard shows a banner when the trial ends within 3 days, a payment is overdue, or the plan has ended.

### Reports
- `GET /reports/sales`: received money per **day, week (from Monday) or month**, in Phnom Penh time, with totals per currency (successful, pending, failed, reversed), and breakdowns **by outlet** and **by bank/provider**. Optional outlet filter; demo payments can be left out. Up to 366 days per report.
- `GET /reports/transactions.csv`: every payment in the range (any status), Phnom Penh times, UTF-8 with BOM so Excel shows Khmer and Chinese names. Streamed in batches, capped at 100,000 rows. Text from banks (payer names, references) is neutralised so it cannot run as a spreadsheet formula.
- `GET /reports/sales.pdf`: the sales report as an A4 PDF labelled in Khmer, English or Chinese. Fonts: Kantumruy Pro (Khmer and Latin) and Noto Sans SC (Chinese). Noto Sans Khmer was tried first but crashes the PDF library's Khmer mark positioning on words like "ទំព័រ"; Kantumruy Pro shaped all 104 Khmer strings used across the apps. If a merchant-typed name still cannot be shaped, it is drawn without its marks (and logged) rather than failing the download.
- Same access rules as transactions: outlet-restricted staff only see their outlets; cashiers have no report access.
- Merchant dashboard **Reports** page: presets (this month, last month, last 30 days, custom), grouping, outlet filter, totals, chart, breakdown tables, CSV and PDF download.

### Translated API errors (km / en / zh)
- Every error now has the same shape: `{ statusCode, error, code, message, details? }`, with `message` in the caller's language (`Accept-Language`).
- A shared catalog (`packages/shared/src/errors.ts`) holds user-facing messages in all three languages. Existing English messages are recognised automatically (including ones with values, such as "Date range cannot exceed 366 days"), so they gained a stable `code` without touching the code that throws them. Unknown messages stay in English rather than risk a wrong translation. Validation errors return one translated sentence, with the field details (English) in `details`.
- The dashboards ask for the language shown on screen (the language cookie, or the app's default: Khmer for merchants, English for MysoftKH staff). The mobile app sends its current language.
- 403 errors that carry their own code (plan limits, ended subscription) now show that message instead of a generic "not allowed".

### Admin console
- New **Invoices** page: filter by status, confirm a payment (method, date received, transfer reference) or void an unpaid invoice, and run the renewal checks on demand. Support staff can view but not change anything.

### Tests (all passing)
- 58 shared (incl. every error translation keeping its placeholders), 8 web-core, 27 API, 5 merchant-web and 6 admin-web unit tests.
- **75 API e2e**, including new suites for billing (trial, limits per resource, parallel requests, expiry, checkout, payment confirmation, renewal → past due → expired, void, permissions) and reports (Phnom Penh day boundaries, week/month grouping, outlet restrictions, CSV contents and formula neutralising, PDFs in three languages, translated errors).
- **23 browser e2e**: the merchant journey now hits the trial outlet limit, chooses Business, has the invoice confirmed by staff through the real API, then continues; plus reports with CSV and PDF downloads. The admin console confirms an invoice payment and checks support staff are read-only.
- Mobile: 23 Flutter tests, `flutter analyze` clean.

### Configuration
- `BILLING_PAYMENT_INSTRUCTIONS`: how merchants pay Mysoftkh (bank account, KHQR…), shown with every unpaid invoice. **The default is a placeholder; set the real bank details before going live.**
- `BILLING_JOB_INTERVAL_SECONDS`: lifecycle job interval (default 900; 0 disables it, as in tests).

### Phase 6 known gaps
- **No online payment of invoices** (KHQR/card). Payments are confirmed by staff; an online checkout is a later step.
- **No proration:** changing plan mid-period starts a new full period on the payment date.
- **No invoice PDF or email:** merchants see invoices in the dashboard only; there is no tax invoice document or reminder email yet.
- **Trials use Starter limits** (1 outlet, 3 employees, 2 connections). Giving trials Business limits is a one-line change if Mysoftkh prefers.
- **Font size:** the Chinese PDF font package adds about 96 MB to the API's installed packages (only two of its files are used); the production Docker image (Phase 8) should copy just those files.
- Text copied out of a Khmer PDF comes out in visual order (normal for complex scripts in PDF); the printed and on-screen page is correct.
- Chinese labels in the PDF sit about 2px lower than Latin values on the same row (different font metrics; cosmetic).

---

## Phase 5: what was built

### One PayAlert mobile app (`apps/mobile`, Flutter 3.47 / Dart 3.13, Android + iOS)
- **Sign in** with the same accounts as the merchant dashboard. The access token is kept in memory, and the refresh token in the platform keystore (Android Keystore / iOS Keychain via `flutter_secure_storage`). Tokens are never written to plain preferences.
- **Session handling** mirrors the web BFF: on a 401 the app refreshes once and retries. Concurrent requests share a single refresh, because refresh tokens are single-use. A session the server has ended returns to sign-in with a "session expired" notice. Being offline is not treated as signing out.
- **Home:** today's received total in USD and KHR (successful payments only), with counts of successful, pending and failed payments. Below it, a **live feed** over the `/realtime` Socket.IO connection, with a Live / Connecting / Offline indicator. The socket reconnects on its own and renews the token when needed.
- **Payment alerts while the app is open:** a heads-up notification with sound and, when the phone has a voice for the language, the amount **spoken aloud** in Khmer, English or Chinese. There is a sound on/off switch. Only `SUCCESS` payments alert. Pending payments are shown as pending, never as money received, and demo payments are tagged "Demo" and "[DEMO]".
- **Outlet filter:** "All outlets / Outlet A / Outlet B". The choice applies to the Today total, the live feed, alerts and the Transactions list. It is remembered per company on the device, because a counter phone usually belongs to one shop. It is hidden when the member sees only one outlet. Outlet-restricted staff only ever get their own outlets (enforced by the API).
- **Transactions:** today / 7 days / 30 days, status filter, infinite scroll, pull to refresh, and a details sheet.
- **Settings:** profile, company and role, language (saved to the profile, so server push uses it too), sound alerts, push status, and sign out.
- **Languages:** Khmer (default before sign-in), English and Chinese via ARB files and `flutter gen-l10n`. Khmer months and Phnom Penh time (UTC+7) are used for dates, and money uses integer minor units (`$12.50`, `៛18,000`).
- **Push when the app is closed (FCM):** wired up but **off unless the build is given Firebase settings** (`--dart-define=FIREBASE_*`). Without them the Settings screen says push is not configured. Nothing is simulated. The app registers its token with `PUT /me/push-tokens` and removes it on sign-out, so the next user of the phone does not get the previous user's alerts.

### Android build setup
- App name "One PayAlert", application id `com.mysoftkh.onepay_mobile`.
- `INTERNET` and `POST_NOTIFICATIONS` permissions.
- Core library desugaring and `compileSdk 37` (required by `flutter_local_notifications` 23); AGP 9.1.1.
- **Plain HTTP is allowed in debug builds only**, and only to `10.0.2.2`, `localhost` and `127.0.0.1` (`src/debug/res/xml/network_security_config.xml`). Release builds keep Android's HTTPS-only default.

### Bugs found by running on a real emulator
- **Every API call went to `/api/v1auth/login`:** Dio joins the base URL and path as plain text, so the missing trailing slash broke every request. Unit tests had not caught it because they inject their own HTTP client. Fixed (`apiBaseOptions()`), and a test now pins the real URLs.
- **Pending payments were drawn as `+$12.00`**, which reads as money received. The `+` is now shown for successful payments only.

### How to run the app
```powershell
. .\tools\dev-env.ps1                      # Flutter, Java 17 and Android SDK from D:\dev, this session only
cd apps\mobile
flutter emulators --launch onepay          # or plug in a phone with USB debugging
flutter run                                # talks to the API at http://10.0.2.2:4100 (the host machine)
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:4100   # a real phone on the same Wi-Fi
```
The API, Postgres, Redis and RabbitMQ must be running (see "How to run" in Phase 1).

### Tests (all passing)
- `flutter analyze`: no issues.
- `flutter test`: 23 unit and widget tests covering money and date formatting, the token/refresh client (single-flight refresh, retry, session expiry, offline), the API URLs, translation completeness for km/zh, the login screen, payment tiles and the outlet filter.
- `flutter test integration_test/app_test.dart` on the Android 16 emulator against the real local API: it registers a throwaway merchant, signs in through the UI, creates a demo connection and simulates a payment. It then checks that the payment arrives **live** on the home feed and in Transactions, and signs out.
- Checked by hand on the emulator in Khmer: the Today total, live feed, and outlet filter (a payment at another outlet was neither listed nor announced), plus the Transactions and Settings screens.

### Phase 5 known gaps
- **FCM push is not configured:** it needs a Firebase project (`google-services` values passed as dart-defines, plus the server's service account). Closed-app push has therefore **not been tested on a device**.
- **FCM token API:** `firebase_messaging` 17 deprecates `getToken()` in favour of `register()`, which returns a Firebase Installation ID for FCM's newer direct-send API. The server sends to registration tokens, so the app keeps `getToken()` for now. The app and API should be migrated together.
- **iOS has not been built or run:** that needs a Mac with Xcode, an Apple developer account, and APNs set up in Firebase.
- **Launcher icon and splash screen** are still Flutter's defaults. Branded assets are needed.
- **Release signing** is not configured: release builds are signed with the debug key.
- **Server error messages are English-only** (for example a validation message shown on the Khmer login screen). Localising API errors belongs with the Phase 6 i18n work.
- **Spoken alerts** depend on the phone having a Khmer, English or Chinese text-to-speech voice. Without one, only the notification sound plays. The voice was not audible-tested on the emulator.

---

## Phase 4: what was built

### MysoftKH Super Admin console (`apps/admin-web`, port 3001)
A separate Next.js app for Mysoftkh staff. It has a dark sidebar so it can't be mistaken for a merchant's dashboard, is not indexed by search engines, and supports Khmer, English and Chinese (English by default for staff).

| Page | What staff can do |
|------|-------------------|
| Overview | Merchant count by status, new merchants in 30 days, **real** payment volume today per currency (simulated demo money is excluded and shown separately), active and pending bank connections, payment-pipeline health, subscriptions by status, 30-day sign-up chart, newest merchants |
| Merchants | Search by business, email, phone or **owner email**, filter by status, paginate |
| Merchant detail | Profile; team with roles and last sign-in; outlets; bank connections (no secrets); subscription; 30-day real volume. **Approve / suspend / reactivate / close with a recorded reason**, and change plan, status, period end or trial end |
| Plans | Create, edit, activate/deactivate. Prices are entered as decimals and stored as integer minor units, with subscriber counts |
| Banks & gateways | Catalogue with honest integration status and connection counts; enable/disable |
| Audit log | Platform-wide, filterable by merchant or action prefix, with a detail view showing metadata such as the reason |
| System health | Database, Redis and queue status; queued, stuck, failed and processed events; recent failed events with **re-queue** |
| My account | Role, change password |

**Roles:** `SUPER_ADMIN` can do everything. `SUPPORT` is read-only: action buttons are hidden, a read-only banner shows, and the API refuses changes regardless.

### Platform API (all under `/api/v1/platform`)
| Endpoint | Permission |
|----------|------------|
| `GET overview`, `GET companies`, `GET companies/:id`, `GET plans`, `GET health`, `GET payment-providers` | read (Support and Super Admin) |
| `PATCH companies/:id/status` (with `reason`), `PATCH companies/:id/subscription`, `POST webhook-events/:id/retry` | `platform.companies.manage` |
| `POST plans`, `PATCH plans/:id` | `platform.plans.manage` |
| `PATCH payment-providers/:id` | `platform.providers.manage` |
| `GET audit-logs` | `platform.audit.read` |

Merchant detail uses explicit field selection, so credential and webhook-secret ciphertexts, password hashes and similar fields can never be serialised. A test asserts this.

### Shared web layer (`packages/web-core`)
The cookie session (backend-for-frontend), API proxy, single-refresh logic, session routes, API client, i18n engine and Khmer-aware formatting were moved out of the merchant app so both dashboards share one audited implementation:
- **Per-app cookie names** (`SESSION_COOKIE_PREFIX`: merchant `op`, admin `opa`). Browsers share cookies across ports, so the two apps would otherwise overwrite each other's sessions.
- **Admin proxy is an allow-list** (`platform/*`, `auth/me`, `auth/change-password`). Tenant endpoints aren't reachable from the admin app at all.
- **Admin sign-in requires a platform role.** For a merchant account, the just-created session is revoked and no cookie is set.

### Bug found and fixed: test servers used the dev database
Prisma loads `apps/api/.env` when it is first required, before the app's config loader, and the loader never overrides values already set. A server started with `APP_ENV=test` from the built output (as the browser tests do) therefore connected to the **development** database. The Jest API tests were not affected, because they load `.env.test` first. Fixes:
- `src/load-env.ts` is the first import of `main.ts` and loads the env file matching `APP_ENV`.
- Config validation **refuses `APP_ENV=test` unless the database name ends in `_test`**.

Consequence: e2e merchants created by browser test runs before this fix are sitting in the dev database (`onepay_dev`), named `*@e2e.onepay.local`, `*@admin-e2e.onepay.local` and `shots.owner@test.onepay.local`. They're harmless, and you can delete them whenever you like.

### How to run the console
```bash
npm run dev:api
npm run dev:admin     # http://localhost:3001 (copy apps/admin-web/.env.example to .env.local)
npm run db:seed       # creates the dev super admin from SEED_SUPER_ADMIN_* in apps/api/.env
npm run test -w @onepay/admin-web
npm run test:e2e:admin
```

### Phase 4 known gaps
- **No staff management UI:** MysoftKH staff accounts are created by seed or database. Inviting and disabling staff, and enforcing 2FA, are planned for Phase 8 hardening.
- **Merchant approval:** self-registered merchants start `ACTIVE`. Switching to "approval required" (start as `PENDING`) is a one-line policy change once MysoftKH decides. The Approve flow already works.
- **Billing:** plan limits are not yet enforced, and there are no invoices or payments (Phase 6).

---

## Phase 3: what was built

### Merchant web dashboard (`apps/merchant-web`, Next.js 16 + React 19 + Tailwind 4)
| Page | What merchants can do |
|------|-----------------------|
| Sign in / Register / Forgot / Reset password | Self-service sign-up (14-day trial), sign in, emailed reset link |
| Dashboard | Today's totals per currency, success and pending/failed counts, 7-day chart (USD/KHR), **live payment feed**, toast and optional sound plus spoken alert, onboarding prompt until a bank is connected |
| Transactions | Date presets (today/7/30 days/all), status, currency and outlet filters, search, pagination, detail view |
| Bank connections | Provider picker with honest "Live / Coming soon / Demo only" labels, connect, **webhook secret shown once** with copy buttons, rotate, disconnect, demo payment simulator |
| Outlets | Create, edit, activate/deactivate |
| Employees | Add with role and outlet restrictions, change role, remove access. You can only assign roles below your own, and never edit yourself. |
| Settings | Company profile, my profile and language, change password, activity (audit) log |

Every data view has loading, error (with retry), empty and success states. Navigation and buttons follow the same permission matrix the API enforces (`@onepay/shared`). The layout is responsive, with a sidebar on desktop and a slide-in menu on phones.

### Design system (`packages/ui`)
Tokens: primary `#0759B8`, secondary `#1670D5`, surface `#F5F7FA`, plus status green, orange and red. Fonts are Inter and Noto Sans Khmer (Khmer gets extra line height). Components: Button, Input, Select, Field (accessible label/error wiring), Card, Badge, StatCard, Table, Pagination, Segmented, Modal (focus handling, Escape, scroll lock), Toasts, Empty/Error states, Skeletons and the logo. It will be reused by the Super Admin dashboard in Phase 4.

### Languages and money
- **Khmer (default), English and Chinese.** A type-checked dictionary means a missing translation fails the build. Tests check that every key exists, nothing is blank, and placeholders match.
- **Khmer dates** are formatted explicitly ("11 វិច្ឆិកា 14:12"). Many browsers lack Khmer date data and silently fall back to English.
- **Profile language:** the signed-in user's profile language drives the UI, and switching it also changes their push-notification language.
- **Money** is formatted from integer minor units. Riel shows as `៛`. Days and charts use Phnom Penh time.

### Session security (backend-for-frontend)
- The browser never holds tokens in JavaScript. Access and refresh tokens are **httpOnly, SameSite=Lax cookies**, and all API calls go through the same-origin proxy `/api/proxy/*`.
- The proxy blocks token endpoints (`auth/login|register|refresh|logout|switch-company`) and webhooks. It rejects cross-site writes (Origin check). It refreshes an expired access token once, and parallel requests **share a single refresh**, because refresh tokens are single-use and reuse revokes every session.
- The realtime socket gets a short-lived access token from `/api/session/token`. The refresh token never leaves the server.
- Security headers are set: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- **Refresh grace window (API):** a just-rotated refresh token re-sent within 30 s, typically after a response lost on a flaky mobile network, gets a fresh session instead of signing the user out of every device. Later reuse, or reuse of a logged-out token, is still treated as theft and revokes all sessions. Migration: `sessions.replaced_by_id`.

### API additions
| Endpoint | Notes |
|----------|-------|
| `PATCH auth/me` | Name, phone, language |
| `POST auth/change-password` | Signs out all other sessions. A wrong current password returns 400, so a 401 always means "session invalid". |
| `POST auth/forgot-password` | Always 202, so accounts can't be discovered. Single-use link, valid 30 min, only the newest link works, and only a SHA-256 hash is stored. |
| `POST auth/reset-password` | Signs out every session |

Mail uses `MAIL_DRIVER=smtp` (**required in demo and production**, enforced at startup) or `log` (dev/test, which keeps an in-memory outbox). Reset emails are localized km/en/zh. Migration: `password_reset_tokens`.

### How to run the dashboard
```bash
docker compose up -d postgres redis rabbitmq
npm run build:shared
npm run dev:api        # http://localhost:4100
npm run dev:web        # http://localhost:3000  (copy apps/merchant-web/.env.example to .env.local)
npm run test -w @onepay/merchant-web       # unit tests
npm run test:e2e:web                        # Playwright: builds API + web, uses local Google Chrome
```

### Fixes found by testing in a real browser
- Server components were calling helpers from client-only modules (i18n, `cn`). They were split into plain modules.
- The API build sometimes produced no output: incremental build info survived the deletion of `dist`. It now lives inside the output folder, and e2e uses a separate `dist-e2e`.
- Riel displayed as "KHR 0" in English. It now uses the narrow symbol `៛`.
- The language picker showed twice on phones (conflicting display classes). Fixed.
- A web session was signed out everywhere after a refresh response never reached the browser. This led to the refresh grace window above.

### Phase 3 known gaps
- **Super Admin UI** is Phase 4. Platform endpoints exist but have no screens yet.
- **Single-instance refresh dedupe:** the cache that makes parallel requests share one refresh is per server process. Running several web instances needs a shared (Redis) dedupe or a short reuse grace on the API (Phase 8).
- **Employee onboarding:** still via a temporary password set by an admin. Invite links are planned.
- **CSV/PDF export and reports** are Phase 6.
- **Spoken alerts** work only where the device has a voice for the language. Otherwise only the chime plays. Many desktops have no Khmer voice.

---

## Phase 2: what was built

### How a payment flows
```
Gateway/bank ──HMAC-signed POST──▶ /webhooks/:connectionId
                                    │ verify signature (±300 s), validate, mask payer account
                                    ▼
                         webhook_events (inbox, unique per eventId) ──▶ 202 Accepted
                                    │ publish id
                                    ▼
                   RabbitMQ  onepay.<env>.payments.ingest  (durable, publisher confirms)
                                    │
                                    ▼
         IngestionWorker: lock row (FOR UPDATE SKIP LOCKED) → normalise → create/advance
         transaction (idempotent, allowed transitions only) → mark event → activate connection
                                    │ after commit
                                    ▼
         NotificationsService ──▶ Socket.IO /realtime (Redis adapter, company/outlet rooms)
                              └─▶ FCM push, localized km/en/zh, dead tokens pruned
```
A sweeper re-publishes events that are stuck in `RECEIVED` (lost message or transient error), up to 5 attempts. Invalid events are marked `FAILED` with a reason.

### New API endpoints (27 paths in total)
| Area | Endpoints |
|------|-----------|
| Providers | `GET payment-providers`; platform: `GET/PATCH platform/payment-providers[/:id]` |
| Bank connections | `GET/POST bank-connections`, `GET/PATCH/DELETE bank-connections/:id`, `POST :id/rotate-webhook-secret`, `POST :id/simulate-payment` (demo only) |
| Webhooks | `POST webhooks/:connectionId` (public, signed). Spec: [docs/WEBHOOK_SPEC.md](docs/WEBHOOK_SPEC.md) |
| Transactions | `GET transactions` (filters: date range, outlet, connection, status, currency, search), `GET transactions/:id`, `GET transactions/summary` (per currency and status, plus daily totals in Asia/Phnom_Penh) |
| Devices | `PUT/DELETE me/push-tokens` (FCM registration) |
| Realtime | Socket.IO namespace `/realtime`, `auth: { token }`. Events: `transaction.created`, `transaction.updated`, `session.expired` |

### Honest integration status
- _Update: Bakong KHQR is now integrated (see "Bakong KHQR collection" above)._
- **No bank adapter is live yet.** ABA, ACLEDA, Wing, Canadia, Prince and Bakong KHQR are listed with `integrationAvailable: false`. Their connections stay `PENDING` with an explanatory message. Each one needs that institution's API access agreement and sandbox credentials. After that, a new `ProviderAdapter` plugs in without other pipeline changes.
- **Live today:** `ONEPAY_WEBHOOK_V1`, a standard signed webhook that any gateway or middleware can implement.
- **Demo simulator** (`DEMO_SIMULATOR`) runs through the same pipeline. Its transactions carry `isSimulated: true`, and push titles start with `[DEMO]`. Four layers stop it in production: the seed doesn't create it, the catalogue hides it, the API refuses to create or simulate, and the worker rejects simulator events.
- **FCM push** needs `FIREBASE_SERVICE_ACCOUNT_BASE64`. Without it, push is explicitly disabled and logs a warning. It is never faked.

### Security additions
- Bank credentials and webhook secrets are encrypted with AES-256-GCM, with a key id for rotation. AAD binds each ciphertext to its connection. Credentials are write-only through the API, and the webhook secret is shown once.
- Full payer and merchant account numbers are never stored, only `•••• 1234`.
- Money has database `CHECK` constraints (non-negative minor units). An event with a different amount for a known transaction is rejected.
- The production config refuses the dev encryption key and `QUEUE_DRIVER=inline`. The demo environment also refuses the dev key.
- **Auth cache:** the principal check is cached in Redis for 60 s and invalidated through user and company version counters. Deactivation, suspension, role changes, logout and token theft still take effect immediately, as the Phase 1 e2e tests prove. If Redis is down, auth falls back to the database.
- Health reports database, Redis and queue status, as `ok`, `degraded` or `error`.

### Phase 2 known gaps
- Real bank adapters are blocked on institution agreements (see above).
- **WebSocket sessions:** sockets are dropped when the access token expires. A socket that is already connected is not dropped immediately on deactivation. It ends within the token TTL (15 min).
- The worker runs in-process (`WORKER_ENABLED`). Running it as a separate deployment is a Phase 8 deployment concern. The code already supports it.
- **Plan limits** (max connections per plan) are enforced in Phase 6.
- **Install scripts:** npm 11 blocks the `protobufjs` and `@firebase/util` install scripts. Neither is needed for server-side FCM.

---

## Phase 1: what was built

### Repository layout (npm workspaces monorepo)

```
package.json            root scripts (build, test, test:e2e, typecheck, db:*)
tsconfig.base.json      strict TypeScript for every package
docker-compose.yml      Postgres 17 (:5433), Redis 7, RabbitMQ 4, EMQX (profile "soundbox")
infra/postgres/init/    creates the separate onepay_test database
packages/shared/        @onepay/shared: enums, permissions matrix, money utils, API DTO types
apps/api/               @onepay/api: NestJS 11 + Prisma 6 + PostgreSQL
  prisma/schema.prisma  full domain model (all phases), migrations/, seed.ts
  src/                  config, prisma, auth, companies, outlets, employees, platform, health
  test/                 e2e suites against the real test database
```

### Database (migration `init`)
All tables use UUID keys, snake_case columns, and `company_id` on every tenant-owned row:
`companies, outlets, users, memberships, membership_outlets, sessions, push_tokens,
payment_providers, bank_connections, transactions, devices, plans, subscriptions, audit_logs`.

- Money is stored as `BIGINT *_minor` plus a `Currency` enum (USD, KHR). Shared helpers `toMinorUnits`, `fromMinorUnits` and `formatMoney` do the conversion without floating point.
- `transactions` is unique on `(bank_connection_id, provider_txn_id)` so provider events are stored only once, and indexed for per-company and per-outlet time queries.
- `bank_connections.credential_ciphertext` is reserved for server-side encrypted secrets. It is never serialised to clients.
- The schema for later phases (transactions, devices, plans, subscriptions) already exists. Its API modules arrive in those phases.

### API (`/api/v1`, Swagger UI at `/docs`, OpenAPI JSON at `/docs/openapi.json`)
| Area | Endpoints |
|------|-----------|
| Auth | `POST auth/register`, `auth/login`, `auth/refresh`, `auth/logout`, `auth/switch-company`, `GET auth/me` |
| Company | `GET/PATCH companies/current`, `GET companies/current/audit-logs` |
| Outlets | `GET/POST outlets`, `GET/PATCH outlets/:id` (deactivate via `isActive:false`) |
| Employees | `GET/POST employees`, `GET/PATCH employees/:membershipId` |
| Platform | `GET platform/companies`, `PATCH platform/companies/:id/status` |
| Health | `GET health` (DB ping) |

### Security model
- **Passwords:** argon2id. Login timing is equalised for unknown emails. Rate limits: register 5/min, login 10/min, refresh 30/min.
- **Tokens:** short-lived HS256 JWT (15 min, with issuer and audience checks) plus an opaque refresh token. Only the SHA-256 hash of the refresh token is stored. Tokens rotate on every refresh. Replaying a used token revokes all of that user's sessions.
- **Per-request revalidation:** every request re-checks the session, user status, membership and company status. Deactivated employees and suspended merchants lose access immediately, not when their token expires.
- **Tenant isolation:** the company id comes only from the token. Every query is scoped by `companyId`. Unknown fields are rejected (`forbidNonWhitelisted`), so clients cannot inject `companyId`. Other tenants' records return 404, so their ids cannot be probed.
- **RBAC:** roles OWNER, ADMIN, MANAGER, ACCOUNTANT and CASHIER, plus platform roles SUPER_ADMIN and SUPPORT. The permission matrix lives in `@onepay/shared`, so web and mobile hide the same actions the API forbids. Members cannot assign their own role or a higher one, and cannot edit themselves. Access can be restricted per outlet.
- **Audit log:** every mutation is written to the audit log in the same DB transaction.
- **Environments:** `APP_ENV` is one of development, test, demo or production. `AppConfig.allowsSimulatedPayments` is false in production. The process refuses to start in production with a placeholder secret. E2E tests refuse to run unless `DATABASE_URL` points at a `*_test` database.

### Tests (all passing)
- `packages/shared`: 9 unit tests (money parsing and formatting, permission matrix, escalation rules).
- `apps/api` unit: 7 tests (PermissionsGuard, env validation).
- `apps/api` e2e: **21 tests** against real PostgreSQL. They cover registration, login, validation, refresh rotation and reuse detection, logout, company switching, cross-tenant isolation (read, update, injection, uniqueness), cashier, admin and owner permissions, privilege-escalation blocks, immediate cut-off of deactivated employees, the audit trail, and super-admin suspend and reactivate.

### How to run
```bash
docker compose up -d postgres redis rabbitmq   # Postgres :5433, Redis :6379, RabbitMQ :5672
cp apps/api/.env.example apps/api/.env          # and .env.test.example -> .env.test
npm install
npm run build:shared
npm run db:migrate && npm run db:seed           # seeds providers, plans, dev super admin
npm run dev:api                                 # http://localhost:4100/api/v1, docs at /docs
npm test && npm run test:e2e
```

### Local environment notes
- Ports 5432 and 4000 are used by other projects on the dev machine, so One PayAlert uses **Postgres on 5433** and the **API on 4100**.
- npm 11 blocks dependency install scripts by default. `allowScripts` in the root `package.json` approves Prisma's scripts only. The `@scarf/scarf` telemetry script stays blocked.
- `prisma migrate reset` is blocked for AI agents by Prisma. The e2e setup uses the non-destructive `migrate deploy`, and tests do not need an empty database.

### Known gaps / decisions to revisit
- **Employee onboarding:** an admin sets the initial password. Phase 2 or 3 should add invitation links or SMS OTP and a forced password change.
- ~~No password-reset or change-password endpoint~~: resolved in Phase 3.
- ~~Per-request DB revalidation cost~~: resolved in Phase 2 with a version-invalidated Redis cache.
- **Postgres Row-Level Security** as a second line of tenant defence is planned for Phase 8.
- **KHR minor unit:** uses the ISO 4217 exponent of 2 for interop. KHR is displayed with 0 decimals.
- ~~Flutter SDK is not installed~~: resolved in Phase 5. Flutter, JDK 17 and the Android SDK live in `D:\dev` and are put on PATH per session by `tools/dev-env.ps1`.
- **Not a git commit yet:** the repository is initialised, but nothing has been committed.
