# Security

Controls for a hosted deploy with one owner. Tests sit next to the code in `apps/api/src`.

## Sign-in gate

- On with `ACCESS_GATE=on`; local runs need no sign-in.
- The owner sets up once with `INVITE_CODE`.
- Password of 12+ characters, scrypt hash; 5 wrong tries lock sign-in for 15 minutes.
- Session cookie: HttpOnly, Secure, SameSite=Lax, 30 days. Sign out ends every session.
- Every API call without a session answers 401, except health and sign-in.

Code: `access/`. Tests: `access.service.spec.ts`, `access-guard.spec.ts`, `access.controller.spec.ts`, `e2e/access.spec.ts`.

## Keys at rest

- X client credentials, the OpenAI key, X tokens and Chat keys are stored with AES-256-GCM under `TOKEN_KEY`, which lives only in the server `.env`.
- Keys are never returned; the page shows the last 4 characters.
- Settings > Keys can forget all keys and the X account.

Code: `keys/`, `auth/token-crypto.ts`. Tests: `key-store.spec.ts`, `keys.controller.spec.ts`.

## Other controls

- Live mode without a model key fails; no canned fallback.
- The API answers only to localhost and `ALLOWED_HOSTS`, and refuses cross-site writes.
- Caddy sends HSTS, a same-origin CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy.
- Settings > Activity logs set-up, sign-ins, failures with IP, sign-outs and key changes (names only).

## Limits

- Root on the server can read `TOKEN_KEY`. Use a dedicated X app and a spend-limited OpenAI project key, and rotate both after evaluation.
- The invite code travels by email.

## Check it yourself

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/api/campaigns     # 401
curl -sI https://<DOMAIN> | grep -iE "strict-transport|content-security|x-frame|nosniff|referrer|permissions-policy"
```
