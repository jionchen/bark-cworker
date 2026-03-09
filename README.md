# Bark CWorker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jionchen/bark-cworker)

Cloudflare Workers + D1 implementation of Bark for personal use. This project is based on the Bark protocol shape used by [`Finb/bark-server`](https://github.com/Finb/bark-server) and the Cloudflare deployment pattern from [`cwxiaos/bark-worker`](https://github.com/cwxiaos/bark-worker), with extra hardening for long-lived personal deployments.

## Features

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
4. Configure environment variables and secrets if you want to override the defaults.

## Required Variables

These values are already declared in `wrangler.json` for Cloudflare deployment:

- `ALLOW_NEW_DEVICE`
- `ALLOW_QUERY_NUMS`
- `ROOT_PATH`
- `REGISTER_REQUIRE_BASIC_AUTH`
- `REGISTER_ALLOW_REBIND`
- `MAX_BATCH_PUSH`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_TOPIC`

Optional variables:

- `BASIC_AUTH`
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
- Set `REGISTER_CODE_SALT` so leaked registration codes are not reusable elsewhere.
- Leave `REGISTER_ALLOW_REBIND=false` unless you explicitly need key takeover behavior.
- Keep `MAX_BATCH_PUSH` small.

## API Notes

- `POST /register`
  - accepts JSON and legacy query-style fields
  - requires a registration code
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

## Local Development

```bash
npm install
npm test
npm run cf-typegen
```
