# One PayAlert — Project Status

> **One Platform. Multiple Banks. Instant Payment Alerts.**
> Mysoftkh · Fintech / payment notification SaaS · Cambodia

_Last updated: 2026-11-12 — end of Phase 5_

## Phase overview

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation: monorepo, shared types, DB schema, auth, tenancy, RBAC, outlets, employees, super-admin company control | ✅ **Done** |
| 2 | Bank/gateway connections + transaction ingestion (webhooks, idempotency, RabbitMQ, Redis, WebSocket, FCM) | ✅ **Done** |
| 3 | Merchant web dashboard (Next.js) | ✅ **Done** |
| 4 | MysoftKH Super Admin dashboard (Next.js) | ✅ **Done** |
| 5 | Flutter mobile app (Android/iOS) | ✅ **Done** (Android verified; iOS not yet built) |
| 6 | Reports, subscriptions & plan limits, i18n content (km/en/zh) | ⏳ Next |
| 7 | Soundbox devices over EMQX MQTT | Not started |
| 8 | Hardening & pilot readiness (Docker images, CI, observability, backups, pen-test fixes) | Not started |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the scope of each phase.

**Test totals:** 12 shared + 8 web-core + 17 API + 5 merchant-web + 6 admin-web unit tests, **54 API e2e** (real PostgreSQL, Redis and RabbitMQ) and **20 browser e2e** (11 merchant + 9 admin, Playwright in Chrome against the real stack), and for the mobile app **23 Flutter unit/widget tests** and **1 on-device integration test** (Android emulator against the real API). All passing.

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
