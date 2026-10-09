# Bark CWorker

English | [中文文档](README.zh.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jionchen/bark-cworker)

Cloudflare Workers + D1 implementation of Bark for personal use. This project is based on the Bark protocol shape used by [`Finb/bark-server`](https://github.com/Finb/bark-server) and the Cloudflare deployment pattern from [`cwxiaos/bark-worker`](https://github.com/cwxiaos/bark-worker), with extra hardening for long-lived personal deployments.

## Features

Alert receiver mode is enabled by default. Only authenticated `POST /push` and `POST /register` are public. Other compatibility routes listed below require `ALERT_RECEIVER_MODE=false`.

- D1-only deployment
- `register`, `register/:device_key`, `push`, `ping`, `healthz`, `info`
- V1-style path push compatibility
- `device_keys` batch push
- `BASIC_AUTH` protection for push, info, and register-check
- dedicated registration codes for `/register`
- configurable `ROOT_PATH`
- APNS token caching in D1

## One-click Deploy

1. Click the deploy button above.
2. Let Cloudflare create the Worker and D1 database.
3. After deployment, open the Worker settings and confirm the D1 binding name is `database`.
4. Set the required `BASIC_AUTH` secret (`username:password`), then configure other variables and secrets as needed. Without credentials, push, register-check, and info return 401.

## Required Variables

These values are already declared in `wrangler.json` for Cloudflare deployment:

- `ALERT_RECEIVER_MODE` (default `true`)
- `ALLOW_NEW_DEVICE`
- `ALLOW_QUERY_NUMS`
- `ROOT_PATH`
- `REGISTER_REQUIRE_BASIC_AUTH`
- `REGISTER_ALLOW_REBIND`
- `MAX_BATCH_PUSH`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_TOPIC`

Required secret:

- `BASIC_AUTH`: `username:password`, protecting push, info, register-check, and registration when its default auth requirement is enabled.

Optional variables:

- `REGISTER_CODE_SALT`
- `APNS_PRIVATE_KEY`

## APNS Defaults

This project defaults to the public Bark APNS identifiers used by the upstream Bark server:

- `APNS_TOPIC=me.fin.bark`
- `APNS_KEY_ID=LH4T9V5U4R`
- `APNS_TEAM_ID=5U8LBRXG3A`

If `APNS_PRIVATE_KEY` is not configured, the code falls back to the public Bark private key that already exists in the upstream `bark-server` repository. That matches your stated requirement for Bark-compatible shared credentials, but it is a shared credential model, not an isolated one. If you later obtain your own APNS key, set `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, and `APNS_TOPIC` in Cloudflare to override the defaults.

## Bootstrap a Registration Code

Generate SQL for your first registration code:

```bash
npm run bootstrap-register-code -- my-register-code default 10
```

Then execute the printed SQL against your D1 database:

```bash
wrangler d1 execute bark-cworker --remote --command "$(npm run --silent bootstrap-register-code -- my-register-code default 10)"
```

If you use a salt in Cloudflare, pass the same salt as the last script argument:

```bash
npm run bootstrap-register-code -- my-register-code default 10 "" my-salt
```

## Recommended First-run Settings

- Set `BASIC_AUTH` before exposing the Worker publicly.
- Keep `REGISTER_REQUIRE_BASIC_AUTH=true`.
- Set `REGISTER_CODE_SALT` to make stored code hashes harder to guess; a salt does not prevent use of a leaked plaintext registration code.
- Leave `REGISTER_ALLOW_REBIND=false` unless you explicitly need key takeover behavior.
- Keep `MAX_BATCH_PUSH` small.

## API Notes

Alert receiver mode allows only the two POST endpoints. Other paths return 404; other methods return 405.

- `POST /register`
  - accepts JSON and legacy query-style fields
  - requires a registration code
The following routes require `ALERT_RECEIVER_MODE=false`:

- `GET /register/:device_key`
  - checks whether a key exists
  - requires `BASIC_AUTH`
- `POST /push`
  - accepts JSON and supports `device_keys`
- Legacy push paths are supported:
  - `/:device_key`
  - `/:device_key/:body`
  - `/:device_key/:title/:body`
  - `/:device_key/:title/:subtitle/:body`

## Security Behavior

- Missing or whitespace-only `BASIC_AUTH` denies protected requests.
- By default only `POST /push` and `POST /register` are exposed. Root, ping, healthz, info, register-check, and legacy GET/path pushes are closed. `ALERT_RECEIVER_MODE=false` restores the compatibility routes.
- `ALLOW_QUERY_NUMS` defaults to `false`; info omits the device count.
- Only server-side `REGISTER_ALLOW_REBIND=true` permits changing an existing key's token. Client `rebind=1` and `confirm_rebind=1` do not override this restriction.
- `ALLOW_NEW_DEVICE=false` rejects both generated keys and client-supplied keys that do not exist. Existing devices may still register subject to the rebind policy.
- The registration transaction rechecks code status, expiry, quota, and device restrictions at write time. Only a successful device write consumes quota; transaction failures roll back. Concurrent state changes return 409.
- Internal exceptions return a generic `500 Internal Server Error` without exposing exception details.

No new database migration is required. Existing Workers with an explicit `ALLOW_QUERY_NUMS=true` setting need that value changed to `false`. Tests cover concurrency, write-time guards, and rollback using local D1. Production D1, stock Bark iOS registration compatibility, and actual APNs delivery still require deployment verification. Distributed rate limiting is outside this patch.

## Local Development

```bash
npm install
npm test
npm run cf-typegen
```

## Current Production Domain

The production configuration uses `https://bark.alertfusion.top` with `workers.dev` and preview URLs disabled. Register through `/register` and send alerts through `/push`. Existing credentials, registration codes, and device keys remain valid. Registration still requires Basic Auth and a registration code, and client flags cannot override the rebind policy.

For another account, replace the D1 ID and custom domain in `wrangler.json`. Keep `workers_dev=false` and `preview_urls=false` to avoid reopening alternate entry points.
