# One PayAlert — Project Status

> **One Platform. Multiple Banks. Instant Payment Alerts.**
> CAM Professional Technology · Fintech / payment notification SaaS · Cambodia

_Last updated: 2026-11-11 — end of Phase 2_

## Phase overview

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation: monorepo, shared types, DB schema, auth, tenancy, RBAC, outlets, employees, super-admin company control | ✅ **Done** |
| 2 | Bank/gateway connections + transaction ingestion (webhooks, idempotency, RabbitMQ, Redis, WebSocket, FCM) | ✅ **Done** |
| 3 | Merchant web dashboard (Next.js) | ⏳ Next |
| 4 | CAM Super Admin dashboard (Next.js) | Not started |
| 5 | Flutter mobile app (Android/iOS) | Not started |
| 6 | Reports, subscriptions & plan limits, i18n content (km/en/zh) | Not started |
| 7 | Soundbox devices over EMQX MQTT | Not started |
| 8 | Hardening & pilot readiness (Docker images, CI, observability, backups, pen-test fixes) | Not started |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the scope of each phase.

**Test totals:** 12 shared unit + 16 API unit + **39 API e2e** (real PostgreSQL, Redis and RabbitMQ). All passing, and stable across repeated runs.

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
- **No password-reset or change-password endpoint yet.** Planned for Phase 3, alongside the web login UI.
- ~~Per-request DB revalidation cost~~: resolved in Phase 2 with a version-invalidated Redis cache.
- **Postgres Row-Level Security** as a second line of tenant defence is planned for Phase 8.
- **KHR minor unit:** uses the ISO 4217 exponent of 2 for interop. KHR is displayed with 0 decimals.
- **Flutter SDK is not installed** on the dev machine. It is required before Phase 5.
- **Not a git commit yet:** the repository is initialised, but nothing has been committed.
