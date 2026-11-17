# Limitations

## Sending

- The API sends only to people who messaged first, with an invitation confirmed in the last 30 days. Everyone else is sent by hand.
- A first message to a non-follower lands in Message Requests.

## Discovery

- Recent search covers 7 days and finds few people; seed accounts find more.
- Keywords match whole words in the bio; named handles skip the check.
- Profile location is free text typed by the person; X does not check it.

## Deploy

- One owner per deploy.
- One X app and account work in one deploy at a time.
- The hosted deploy has no call post lane and cannot read encrypted X Chat.
- Root on the server can decrypt the saved keys: [Security](security.md#limits).

## Replies

- Read per chat, newest message only, for 3 days or until the first reply; ~$0.01 per read.
- Encrypted X Chat is read only with exported Chat keys: [Live mode](live-mode.md#read-replies-in-x-chat). Without them, a hand-send is confirmed by your click.
- The global DM feed lags by up to tens of minutes; the call lane reads 10 events per check.

## Not run against the real X

The post-exists recheck, Preflight live probes, the inbound check and a two-account run were tested only against the fake X.

## Models

- Measured on AI-written sets, one model, one prompt version: [Models](models.md#how-far-to-trust-the-numbers).
- Changing the model means running the eval again.
- Translate calls and non-OpenAI decision clients are not metered into campaign cost.
