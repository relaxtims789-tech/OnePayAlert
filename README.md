# One PayAlert

**One Platform. Multiple Banks. Instant Payment Alerts.** A multi-tenant payment notification and merchant management SaaS for Cambodia, built by CAM Professional Technology.

- Current progress: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Phase plan: [docs/ROADMAP.md](docs/ROADMAP.md)
- API docs: run the API, then open http://localhost:4100/docs

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
```

## Tests
```bash
npm test            # unit tests (shared + api)
npm run test:e2e    # API end-to-end tests against the onepay_test database
```
