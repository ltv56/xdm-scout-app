# Development

Requires Node.js 22+ and Docker (MySQL 8).

## Run locally

Sandbox mode: a fake X with the people in `fixtures/` and canned model answers. No keys; nothing is sent.

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate -w apps/api
npm run dev:api                  # http://localhost:3001/api/health
npm run start:worker -w apps/api
npm run dev:web                  # http://localhost:3000
```

## Docker sandbox

Database (`xdm_sandbox`, port 3307), app (port 3040) and worker, separate from the development database.

```bash
docker compose -f docker-compose.sandbox.yml up -d --build
docker compose -f docker-compose.sandbox.yml run --rm app node dist/sandbox/reset-sandbox-main.js   # wipe and reload fixtures
docker compose -f docker-compose.sandbox.yml down [-v]
```

The reset refuses unless `X_MODE=fake` and the database name contains `sandbox` or `e2e`.

## Environment

All variables: `.env.example`.

| Variable | Effect |
| --- | --- |
| `X_MODE` | `fake` (default) or `live` |
| `LLM_MODEL` | text model; empty = canned (fake) or `gpt-6-luna` (live) |
| `DECISION_MODEL` | yes/no model; empty = the text model |
| `TOKEN_KEY` | seals X tokens and Chat keys; required in live mode |
| `ALLOWED_HOSTS` | host names besides localhost |
| `CALL_POST` | `off` hides the call post lane |

Tests run with `LLM_MODEL=` and `DECISION_MODEL=` empty.

## Checks

Same as CI (`.github/workflows/ci.yml`):

```bash
npm run lint
npm run typecheck
npm test          # needs the database
npm run build
```

## API tests

Vitest on real MySQL (`xdm_test`), about 2 minutes. Duplicate-send, reconciliation and daily-cap tests never use a mock database.

## Browser tests

Playwright in `apps/web/e2e`, on the installed Edge, against an API and worker in fake mode on `xdm_e2e`:

```bash
cd apps/api && npx tsc -p tsconfig.build.json
export DATABASE_URL='mysql://xdm:xdm@127.0.0.1:3306/xdm_e2e?allowPublicKeyRetrieval=true'
npx typeorm -d dist/data-source.js migration:run
X_MODE=fake LLM_MODEL= DECISION_MODEL= PORT=3021 node dist/main.js
X_MODE=fake LLM_MODEL= DECISION_MODEL= PORT=3021 node dist/worker-main.js
cd ../web/e2e && npm install && E2E_API_URL=http://localhost:3021 npm run e2e
```

`global-setup.ts` empties the database before the run and refuses a name that does not end in `_e2e`.

## Database

Migrations live in `apps/api/src/migrations`. Run `npm run db:migrate -w apps/api` after every pull; `npm run db:generate -w apps/api -- <path>` creates one from entity changes.

## Layout

```
apps/api   NestJS API and worker
apps/web   React app; e2e/ holds the Playwright tests
fixtures   fake X data and labelled eval sets
docs       these pages
```
