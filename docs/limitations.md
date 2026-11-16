# Limitations

Facts about what the app does not do, and what was and was not measured.

## Sending

- The API sends only to people who messaged first, with an invitation you confirmed in the last 30 days. Everyone else is sent by hand: Open in X opens the compose window with the text filled in, and you mark it as sent.
- The API accepts a DM to a follower or an open stranger (201), but X's Automation Rules say being able to receive a DM is not the same as asking for automated DMs. The strictest reading was taken.
- A first message to someone who does not follow the sender lands in Message Requests > Other. Their inbox row shows about 33 characters of the first line.
- The daily cap counts API sends from midnight UTC. Default 25, settable from 0 to 500 in Settings. At the cap, sending stops until the next UTC day.
- An approved draft is sent only if its text still matches the approved hash. The app never resends on a timeout: an unknown result goes to reconciliation, then to a person.
- Before an API send, the app checks Do not contact, the invitation age, the latest message in the chat, and that every post the draft quotes still exists on X.

## Replies

- Replies are read per chat, newest message only: every 30 minutes for 6 hours after the send, then every 3 hours, for 3 days or until the first reply. Each read is metered as about $0.01.
- Messages in an end-to-end encrypted chat (X Chat) are not in `/2/dm_events`. They are read from the X Chat API and decrypted here only when `XCHAT_KEYS_FILE` points to the sender's saved chat keys (`apps/api/scripts/xchat-export-keys.mjs`, needs the Chat passcode once). Without it, a reply in an encrypted chat may never show in the Inbox and "Confirmed by you" is your word.
- With the keys: only direct chats, text messages with a valid signature, read every inbound check and every reply check. Handles of people who wrote only in Chat show as unknown. Message Requests from strangers and realtime are not read: a stranger's plain DM was seen in the per-chat read at once and in the global feed later (two tests), and `/2/chat/message_requests` stayed empty; an encrypted message from a stranger was not tested. Chat reads (conversation events, public keys) are not metered into the campaign cost. The keys of the sender account are stored on the server sealed with `TOKEN_KEY`; whoever holds both can read that account's chats.
- Only a keyword rule (stop messaging, unsubscribe, remove me, don't message, a bare stop) puts a person on Do not contact by itself. When a model reads a reply as Not interested or Opt-out, the reply stays open and Needs attention asks you to confirm. Not now closes by itself.
- The global DM feed lags by up to tens of minutes and is rate limited to 15 reads per 15 minutes. The inbound lane reads the newest 10 DM events per check, every 30 minutes, so a burst of more than 10 DMs between checks is not all seen.

## Sandbox

- `X_MODE=fake` uses the people in `fixtures/` and canned model answers: every Fit is possible and drafts are fixed templates. Nothing is sent and no key is read.
- The fake X lives in the memory of each process. A sandbox reset empties the database and the running processes reload the fixtures within 5 seconds.
- The Docker sandbox has its own database `xdm_sandbox` (host port 3307) and the app on port 3040.

## Not run against the real X

- The post-exists recheck (`GET /2/tweets?ids=`), the Preflight live probes, the inbound check against the real feed and a two-account run were tested only against the fake X or stubbed responses. A protected or suspended author's posts would count as deleted.
- Closed-DM handling for a stranger who never wrote to the sender was measured on the API (403) but not by hand.

## Models

- The live reply model is gpt-6-luna. On a blind set of 187 AI-written replies run once it read 184 correctly; on the held-out half of the main set, 87 of 91. The sets are AI-written with labels from their writers, so the numbers are not a measure on real replies.
- The reply prompt is tuned for gpt-6-luna. The same prompt lowered DeepSeek's score on another set, so changing the model means running the eval again.
- Model cost is priced from `apps/api/src/llm/llm-pricing.ts`. A model with no line shows "no price yet" instead of a figure. Translate calls and the Gemini and Jev decision clients are not metered into a campaign.
- Profiles stored before migration 14 may keep a wrong "closed DMs" value until they are fetched again; see `docs/testing.md`.
