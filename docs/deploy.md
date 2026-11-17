# Deploy

One owner per server: Docker Compose, Caddy for HTTPS, a sign-in gate, and the owner's own X app and OpenAI key entered in the app.

## Requirements

- A Linux server with Docker
- A domain pointing to it
- Ports 80 and 443 open (MySQL publishes no port)

## Settings

`.env` next to `docker-compose.hosted.yml` (from `hosted.env.example`):

| Variable | Value |
| --- | --- |
| `DOMAIN` | the domain |
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | `openssl rand -hex 16` |
| `TOKEN_KEY` | `openssl rand -base64 32`; encrypts saved keys and tokens |
| `INVITE_CODE` | `openssl rand -hex 12`; claims the deploy once |
| `APP_TAG` | image tag, default `dev` |

The compose file sets `X_MODE=live`, `ACCESS_GATE=on`, `CALL_POST=off` and `DECISION_MODEL=gpt-6-luna`. No X or OpenAI keys go in `.env`.

## First deploy

```bash
git clone https://github.com/ltv56/xdm-scout-app && cd xdm-scout-app
cp hosted.env.example .env
docker compose -f docker-compose.hosted.yml up -d
```

Images: `ghcr.io/ltv56/xdm-scout-app`, built on every push to `dev`. Migrations run when `app` starts.

## Owner's first steps

1. Open the site > **Set up** with the invite code and a password (12+ characters).
2. Settings > **Keys**: X client ID and secret, OpenAI key. The page shows the callback URL for the X portal.
3. Profile > **Connect X account**.
4. Create a campaign.

The hosted deploy cannot read encrypted X Chat and has no call post lane.

## Hand over to a new owner

```bash
docker compose -f docker-compose.hosted.yml exec app node dist/access/hand-over-main.js
```

Removes the owner, keys and X tokens; campaigns and the send ledger stay. Then set a new `INVITE_CODE` and run `up -d`.

## Operations

```bash
docker compose -f docker-compose.hosted.yml pull && docker compose -f docker-compose.hosted.yml up -d   # update
docker compose -f docker-compose.hosted.yml logs -f app                                                # logs
docker compose -f docker-compose.hosted.yml exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --no-tablespaces xdm' > backup.sql
docker compose -f docker-compose.hosted.yml exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" xdm' < backup.sql
```

A backup opens only with the same `TOKEN_KEY`. The stack idles at about 360 MB of memory.
