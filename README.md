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

## Hosted sandbox

A running copy: https://xdm-scout.duckdns.org (fake X, canned model answers, no login; anyone can change its data).

The same sandbox (fake X, canned model answers) on a server with a domain and HTTPS. Only Caddy listens on 80 and 443; MySQL has no published port. It has no login: do not point it at a real X account.

On a Linux server with Docker, and a domain that already points to its IP:

```bash
git clone https://github.com/ltv56/xdm-scout-app && cd xdm-scout-app
cp hosted.env.example .env        # set DOMAIN, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD (openssl rand -hex 16)
docker compose -f docker-compose.hosted.yml up -d
docker compose -f docker-compose.hosted.yml ps
```

The images come from `ghcr.io/ltv56/xdm-scout-app`, built by the workflow `image.yml` on every push to `dev`. If the package is private, run `docker login ghcr.io` first. `APP_TAG` in `.env` picks the tag. Open ports 80 and 443 only (and SSH).

```bash
docker compose -f docker-compose.hosted.yml pull && docker compose -f docker-compose.hosted.yml up -d    # update
docker compose -f docker-compose.hosted.yml exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --no-tablespaces xdm_sandbox' > backup.sql
docker compose -f docker-compose.hosted.yml exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" xdm_sandbox' < backup.sql   # restore into an empty database
docker compose -f docker-compose.hosted.yml run --rm app node dist/sandbox/reset-sandbox-main.js   # wipe the data, reload the fixtures
docker compose -f docker-compose.hosted.yml logs -f
```

At idle the stack used about 360 MB of memory (db 216, app 76, worker 55, caddy 14).

## First walkthrough

Open the app (http://localhost:3000, or http://localhost:3040 with Docker). The first screen has three steps.

1. Connect the account that sends: Use sandbox account.
2. Tell us about the fund: who you are, what you offer (a program name, link and one sentence), and the name that signs the messages. Drafts need these.
3. Start your first campaign: give it a name and Create campaign. The keywords are pre-filled, and with the fake X the handles, seeds and queries stay empty (the example people from `fixtures/` are used).
4. Overview > Run first search. It finds 3 people and skips 4; the page says why.
5. Candidates > Score all, then Write drafts. Each card shows the opening post and why the person fits.
6. Review: read each draft, point at a sentence to see the post or profile line behind it, edit or Approve. A claim with no backing needs your confirmation.
7. Sending: a draft for a person who messaged you first goes out through the API when you approve it. Everyone else shows Send it in X: Open chat opens X with the text filled in, you send it there and mark it as sent. In the sandbox nothing leaves the machine.
8. Messages > Outbox lists every send and its state; Messages > Inbox shows replies and sends to check. Needs attention (Overview) collects what waits for you.

Avatar menu (top right) > Profile edits the sender profile; Settings has the Setup check, the daily cap, the Do not contact list and the Known to the fund lists.

## Live mode

Live mode uses `gpt-6-luna` for reply classes and checks unless `LLM_MODEL` says otherwise, and needs `OPENAI_API_KEY`. The prompts are tuned and measured on it. Another LLM works through the same interface, but run the reply eval on it first (`docs/testing.md`).

Replies written in X Chat (encrypted) are read only if the sender's chat keys are saved once and `XCHAT_KEYS_FILE` is set in `.env`. With `X_MODE=live` and `TOKEN_KEY` in `.env`, from the repo root:

```bash
X_USER_ID=<sender id> X_TOKEN_FILE=<json with access_token> XCHAT_KEYS_FILE=.local/chat-keys.enc node --env-file=.env apps/api/scripts/xchat-export-keys.mjs
```

It asks for the sender's Chat passcode at a hidden prompt, one try only (X allows about 20 wrong guesses). Without the keys the Inbox misses replies in encrypted chats: `docs/limitations.md`.

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
