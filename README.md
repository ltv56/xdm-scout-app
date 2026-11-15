# xdm-scout

Web app to find AI and robotics people on X, write DMs backed by real posts, send them after a human approves, and track replies. It never sends the same first message twice.

## Stack

- API and worker: NestJS, TypeORM, MySQL 8
- Web: React, Vite, Tailwind, TanStack Query
- Docker Compose for the database

## Requirements

- Node.js 22 or newer
- Docker

## Run it in sandbox mode

Sandbox mode uses a fake X with the people in `fixtures/` and canned model answers. It needs no keys and sends nothing.

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate -w apps/api
```

Then three terminals:

```bash
npm run dev:api                  # API, http://localhost:3001/api/health
npm run start:worker -w apps/api # worker: searches, scoring, drafts, sends
npm run dev:web                  # http://localhost:3000
```

`X_MODE=fake` in `.env` is what makes it a sandbox. The top bar shows SANDBOX.

## Run with Docker

One command starts the database, the API with the built web app, and the worker in sandbox mode. It needs no keys and uses its own project name, so it does not touch the development database.

```bash
docker compose -f docker-compose.sandbox.yml up -d --build
docker compose -f docker-compose.sandbox.yml ps       # db, app and worker become healthy
```

The app is at http://localhost:3040 (database on host port 3307). The migrations run when the app starts. Then follow "First walkthrough".

```bash
docker compose -f docker-compose.sandbox.yml run --rm app node dist/sandbox/reset-sandbox-main.js   # wipe the data, reload the fixtures
docker compose -f docker-compose.sandbox.yml down      # stop, keep the data
docker compose -f docker-compose.sandbox.yml down -v   # stop and delete the data
```

The reset refuses unless `X_MODE=fake` and the database name contains `sandbox` or `e2e`. Limits of the sandbox: `docs/limitations.md`.

## First walkthrough

1. Open http://localhost:3000. Avatar menu (top right) > Profile > Use sandbox account connects the fake sender.
2. Profile > Sender profile: write one line about the fund, add a program and the name that signs the messages. Drafts need these.
3. Start your first campaign. For the fake X use keywords `robotics, llm, embodied` and handles `mina_builds, tomas_agents, lena_embodied, robotco, private_dev, pasta_daily, nobody_here`.
4. Overview > Run first search, then Score them. Three people from the list are found and scored; the organization, the protected account and the off-topic one are skipped, and the page says why.
5. Overview > Write drafts. Each draft sentence shows the post or profile line that backs it.
6. Review: read each draft, fix or approve it. A claim with no backing needs your confirmation.
7. Approved drafts for people who messaged you first go out through the API from Review. Everyone else is sent with Open in X, and you mark it as sent.
8. Outbox lists every send. Inbox shows replies and sends to check. Needs attention (top of Overview) collects what waits for you. Results so far (Overview) shows counts per step and the cost of a conversation.

Avatar menu > Settings has the Setup check, the Do not contact list and the Known to the fund lists.

## Live mode

Live mode uses `gpt-6-luna` for reply classes and checks unless `LLM_MODEL` says otherwise, and needs `OPENAI_API_KEY`. The prompts are tuned and measured on it. Another LLM works through the same interface, but run the reply eval on it first (`docs/testing.md`).

Sending from a real X account needs an X app and a few keys: see `docs/x-app-setup.md`. Manual checks against the real X are in `docs/testing.md`.

## Checks

```bash
npm run lint
npm run typecheck
npm test        # needs the database running
npm run build
```

Browser tests and the reply classification script are described in `docs/testing.md`.

## Layout

```
apps/api   NestJS API and worker
apps/web   React app
fixtures   fake X people and the labelled eval set
infra      database init script
docs       setup and test steps
```
