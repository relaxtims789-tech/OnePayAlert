# One PayAlert — Delivery Roadmap

Each phase ends with its tests passing, migrations committed, Swagger updated and
`PROJECT_STATUS.md` updated. No phase ships UI that is not wired to the real API and database.

## Phase 1: Foundation ✅
Monorepo, shared package, full Prisma schema and migration, NestJS core, auth (argon2id, JWT and rotating refresh tokens), tenant isolation, RBAC, companies, outlets, employees, super-admin company status, audit log, Swagger, unit and e2e tests.

## Phase 2: Bank connections & real-time payment alerts ✅
Done. Every item below is built except real bank adapters, which are blocked on institution API agreements. See PROJECT_STATUS.md.

- `payment-providers` catalogue API (platform-managed) and `bank-connections` CRUD. Credentials are envelope-encrypted with AES-256-GCM using a KMS or env master key, and are write-only from clients.
- **Provider adapter interface** (`verifyWebhook`, `parseEvent`, `fetchTransactions`). Adapters are added per bank or gateway (Bakong KHQR first) once each institution grants API access. **No fake success paths:** a `SimulatorAdapter` exists only when `APP_ENV !== production` and is clearly labelled as demo.
- Webhook ingestion endpoint: verify signature → persist raw event → publish to RabbitMQ → worker normalises into `transactions` (idempotent on `bank_connection_id + provider_txn_id`, integer minor units).
- Fan-out: WebSocket gateway (Socket.IO with Redis adapter, rooms per company and outlet), FCM push to `push_tokens`, and an MQTT publish hook for Phase 7.
- Transactions API: list with filters (date, outlet, connection, status, currency), detail, and summary totals.
- Redis caching of principal revalidation. Tests cover idempotency, signature rejection, tenant scoping of events, and the production guard on the simulator.

## Phase 3: Merchant web dashboard (Next.js, `apps/merchant-web`) ✅
Done. See PROJECT_STATUS.md. Export and reports moved to Phase 6.

- `packages/ui` design system: Inter and Noto Sans Khmer, primary #0759B8, secondary #1670D5, surface #F5F7FA, plus status colours (success green, pending orange, failed red).
- Login, registration, forgot/reset password, company switcher.
- Dashboard cards and charts, live transaction feed (WebSocket), outlets, employees, bank connections, settings.
- i18n for km, en and zh. Currency display for USD and KHR. Loading, error, empty and success states on every view.
- Playwright e2e against the real API.

## Phase 4: CAM Super Admin dashboard (Next.js, `apps/admin-web`)
- Merchant directory, approval, suspend and close, provider catalogue, plans, platform audit log, and system health.

## Phase 5: Flutter mobile app (`apps/mobile`)
- Same API. Secure token storage, FCM push with spoken payment alerts, live feed, outlet filter, and km/en/zh.

## Phase 6: Reports, subscriptions & limits
- Daily, weekly and monthly reports with CSV/PDF export. Plan limits are enforced server-side. Subscription lifecycle and billing records.

## Phase 7: Soundbox devices
- Device provisioning and assignment, EMQX auth (per-device credentials and ACL), payment announcements over MQTT, and online/offline telemetry.

## Phase 8: Hardening & pilot
- Production Dockerfiles, CI (lint, typecheck, unit, e2e), Postgres RLS, backups, structured logging and metrics, a dependency audit, a security review, and separate demo and production deployments.
