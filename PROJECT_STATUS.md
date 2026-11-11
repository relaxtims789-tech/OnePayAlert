# One PayAlert — Project Status

> **One Platform. Multiple Banks. Instant Payment Alerts.**
> CAM Professional Technology · Fintech / payment notification SaaS · Cambodia

_Last updated: 2026-11-11 — end of Phase 1_

## Phase overview

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation: monorepo, shared types, DB schema, auth, tenancy, RBAC, outlets, employees, super-admin company control | ✅ **Done** |
| 2 | Bank/gateway connections + transaction ingestion (webhooks, idempotency, RabbitMQ, Redis, WebSocket, FCM) | ⏳ Next |
| 3 | Merchant web dashboard (Next.js) | Not started |
| 4 | CAM Super Admin dashboard (Next.js) | Not started |
| 5 | Flutter mobile app (Android/iOS) | Not started |
| 6 | Reports, subscriptions & plan limits, i18n content (km/en/zh) | Not started |
| 7 | Soundbox devices over EMQX MQTT | Not started |
| 8 | Hardening & pilot readiness (Docker images, CI, observability, backups, pen-test fixes) | Not started |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the scope of each phase.

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
docker compose up -d postgres redis rabbitmq   # Postgres on localhost:5433
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
- **Per-request DB revalidation** costs 1–2 queries per request. Phase 2 adds a Redis cache with explicit invalidation.
- **Postgres Row-Level Security** as a second line of tenant defence is planned for Phase 8.
- **KHR minor unit:** uses the ISO 4217 exponent of 2 for interop. KHR is displayed with 0 decimals.
- **Flutter SDK is not installed** on the dev machine. It is required before Phase 5.
- **Not a git commit yet:** the repository is initialised, but nothing has been committed.
