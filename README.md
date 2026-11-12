# One PayAlert

**One Platform. Multiple Banks. Instant Payment Alerts.** A multi-tenant payment notification and merchant management SaaS for Cambodia, built by Mysoftkh.

- Current progress: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Phase plan: [docs/ROADMAP.md](docs/ROADMAP.md)
- API docs: run the API, then open http://localhost:4100/docs
- Webhook spec for integrators: [docs/WEBHOOK_SPEC.md](docs/WEBHOOK_SPEC.md)
- Deploying demo / production: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Before going live, set `BILLING_PAYMENT_INSTRUCTIONS` in `apps/api/.env` to Mysoftkh's real bank details (shown to merchants with every invoice).

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
npm run dev:admin # MysoftKH Super Admin console on http://localhost:3001
```

Soundboxes (optional): start the broker, then run a simulated device ([protocol](docs/SOUNDBOX_PROTOCOL.md)):
```bash
docker compose --profile soundbox up -d emqx
node tools/soundbox-sim.mjs --serial SBX-000123 --password <device password from the admin console>
```

Mobile app (Flutter, Android emulator; it reaches the API at http://10.0.2.2:4100):
```powershell
. .\tools\dev-env.ps1
cd apps\mobile
flutter run
```

## Tests
```bash
npm test            # unit tests (shared + api)
npm run test:e2e    # API end-to-end tests against the onepay_test database
npm run test:e2e:web    # merchant browser tests (Playwright + local Chrome)
npm run test:e2e:admin  # Super Admin browser tests
```

```powershell
cd apps\mobile
flutter analyze
flutter test                                  # unit + widget tests
flutter test integration_test/app_test.dart   # on a running emulator, against the local API
```
