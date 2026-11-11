# One PayAlert

**One Platform. Multiple Banks. Instant Payment Alerts.** A multi-tenant payment notification and merchant management SaaS for Cambodia, built by CAM Professional Technology.

- Current progress: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Phase plan: [docs/ROADMAP.md](docs/ROADMAP.md)
- API docs: run the API, then open http://localhost:4100/docs
- Webhook spec for integrators: [docs/WEBHOOK_SPEC.md](docs/WEBHOOK_SPEC.md)

## Quick start
```bash
docker compose up -d postgres redis rabbitmq
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.test.example apps/api/.env.test
npm install
npm run build:shared
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web   # merchant dashboard on http://localhost:3000
```

## Tests
```bash
npm test            # unit tests (shared + api)
npm run test:e2e    # API end-to-end tests against the onepay_test database
npm run test:e2e:web  # browser tests (Playwright + local Chrome) against the real stack
```
