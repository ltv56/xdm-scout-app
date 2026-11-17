# Live mode

Run against the real X with a real model.

## Requirements

- An X developer app on the pay-per-use plan, with credit: [X app setup](x-app-setup.md)
- The sender account with a Chat passcode (X > Settings > Chat)
- An OpenAI API key
- Node.js 22+ and Docker

## Settings

In `.env` (from `.env.example`):

| Variable | Value |
| --- | --- |
| `X_MODE` | `live` |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | from the X app (or Settings > Keys) |
| `X_REDIRECT_URI` | `http://localhost:3000/api/auth/x/callback` |
| `TOKEN_KEY` | `openssl rand -base64 32` |
| `OPENAI_API_KEY` | your key (or Settings > Keys) |
| `LLM_MODEL`, `DECISION_MODEL` | empty for `gpt-6-luna` |
| `XCHAT_KEYS_FILE` | optional, see below |
| `CALL_POST` | `off` hides the call post lane |
| `ALLOWED_HOSTS` | host names when served on a domain |

Without an OpenAI key every model call fails; there is no fallback to canned answers. Other models (`claude-*`, `gemini-*`, `vendor/model` via OpenRouter) work, but run the [evaluation](eval.md) first.

## Start

```bash
npm install
npm run db:up
npm run db:migrate -w apps/api   # again after every pull
npm run dev:api                  # http://localhost:3001/api/health
npm run start:worker -w apps/api
npm run dev:web                  # http://localhost:3000
```

## Connect and check

1. Profile > **Connect X account** and authorize as the sender.
2. Fill in the sender profile.
3. Settings > **Setup check**: every failing line says how to fix it.

## First live run

Use accounts you control.

- **By hand:** campaign > search > Score > Draft > Approve > **Open chat** and send in X.
- **API:** set the call post link and keyword on the campaign, DM the keyword from a test account, Check now, **Confirm invitation**, then Draft, Approve and Send.

## Read replies in X Chat

Messages typed in the X app are end-to-end encrypted and not in the DM API. To read them, export the sender's Chat keys once:

```bash
X_USER_ID=<sender id> X_TOKEN_FILE=<json with access_token> XCHAT_KEYS_FILE=.local/chat-keys.enc \
  node --env-file=.env apps/api/scripts/xchat-export-keys.mjs
```

- Asks for the Chat passcode once, hidden.
- The file is sealed with `TOKEN_KEY`; whoever holds both can read the chats.
- Set `XCHAT_KEYS_FILE` relative to `apps/api` (e.g. `../../.local/chat-keys.enc`) and restart.
- Not possible on a hosted deploy.
