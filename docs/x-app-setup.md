# X app setup

## Accounts

- **Sender:** the X account that sends. Set a Chat passcode (Settings > Chat); without it the compose window has no message box.
- **Test recipient:** a second account you control.

## Create the app

1. At https://console.x.com, sign in as the sender and choose the pay-per-use plan.
2. User authentication settings:
   - Permissions: Read and write and Direct message
   - Type: Web App, Automated App or Bot
   - Callback URI: `https://<DOMAIN>/api/auth/x/callback` (hosted) or `http://localhost:3000/api/auth/x/callback` (local)
   - Website URL: any public URL
3. Copy the Client ID and Secret into Settings > Keys (hosted) or `.env` (local).

Scopes: `dm.read dm.write tweet.read users.read follows.read offline.access`. A missing scope returns `403` without naming it.

## Tokens

Access tokens last 2 hours; `offline.access` refreshes them. Missing token: `401`; invalid: `403 unsupported-authentication`; failed refresh: `400 invalid_client`.

## Rate limits observed

| Endpoint | Limit per 15 minutes |
| --- | --- |
| DM event read | 15 |
| DM send | 99 |
| Recent search | 300 |
| User lookup | 900 |
| Followers / following | 10,000 |

## Sending behaviour

| Recipient | API result | Shown in |
| --- | --- | --- |
| Follower or existing conversation | `201` | Main chat list |
| Stranger who accepts DMs | `201` | Message Requests |
| Does not accept DMs | `403 dm-recipient-not-accepting` | Not delivered |

`receives_your_dm` predicts the `403` and can lag. `https://x.com/messages/compose?recipient_id=<id>&text=<text>` opens the chat with the text filled in.
