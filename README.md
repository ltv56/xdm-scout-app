# xdm-scout

Find AI and robotics builders on X, draft DMs backed by their own posts, send each one only after a person approves it, and track replies. A person never gets the same first message twice.

- **Find:** keywords, seed accounts (who they follow or who follows them), handles and recent posts, within a budget per campaign.
- **Explain:** a Fit label (Strong, Possible, Weak, Not a fit) with the posts behind each reason.
- **Draft:** every sentence links to its source; unbacked claims are flagged. English, Vietnamese, Thai or Indonesian.
- **Send:** only the approved text. The API sends only to people who messaged first; everyone else is sent by hand in X. [Why](docs/how-it-works.md#two-ways-to-send)
- **Track:** Outbox, Inbox with reply classes, and Needs attention.

## Quick start

Hosted: https://xdm-scout.duckdns.org (one owner, invite code sent separately).

Local sandbox, no keys, nothing is sent:

```bash
docker compose -f docker-compose.sandbox.yml up -d --build   # http://localhost:3040
```

Without Docker: [Development](docs/development.md#run-locally). With a real X account: [Live mode](docs/live-mode.md). On a server: [Deploy](docs/deploy.md).

## Walkthrough

1. Onboarding: use the sandbox account, fill in the fund profile, create a campaign.
2. Overview > **Run first search**. Scoring follows by itself.
3. Overview > **Write drafts**, or pick people in Candidates. Open a name to see why each label is there.
4. Review: Edit, Approve or Skip. Point at a sentence to see its source.
5. Send through the API, or **Open chat** in X with the text filled in.
6. Messages shows every send and reply; Needs attention lists what waits for you. In the sandbox the three people answer about 20 seconds after a send (for a hand-send, after you say it was sent): one interested, one declining, one asking to stop.

## Guarantees

- One first message per person across campaigns, enforced by one conditional database update before X is called.
- Only text that matches what a person approved is sent.
- A send with an unknown result is never retried; it is checked against X, then shown to a person.
- A stop request puts the person on Do not contact.

## Costs

X bills about $0.01 a profile and $0.005 a post; model calls are a small fraction. Each search shows an upper bound first and stops at the campaign budget. [Costs](docs/how-it-works.md#costs)

## Docs

| Page | Contents |
| --- | --- |
| [How it works](docs/how-it-works.md) | Search, sending, duplicate guard, replies, data kept, costs |
| [Models](docs/models.md) | Model calls, checks, measured accuracy |
| [Labels](docs/labels.md) | Every label the app shows |
| [Live mode](docs/live-mode.md) | Real X account and model |
| [X app setup](docs/x-app-setup.md) | Developer app, scopes, rate limits |
| [Development](docs/development.md) | Local run, checks, tests |
| [Deploy](docs/deploy.md) | Server deploy for one owner |
| [Security](docs/security.md) | Sign-in, keys at rest, headers |
| [Manual testing](docs/testing.md) | API calls per feature |
| [Evaluation](docs/eval.md) | Model eval scripts |
| [Limitations](docs/limitations.md) | Known gaps |

## Stack

NestJS, TypeORM and MySQL 8 (API and worker, jobs table as the queue); React, Vite, Tailwind, TanStack Query; Docker Compose; GitHub Actions.
