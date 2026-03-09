# Bark CWorker Design

**Date:** 2026-03-09

## Goal

Build a Cloudflare Workers deployment of Bark for personal use by using `cwxiaos/bark-worker` as the starting point, preserving the Bark core API surface needed by the user while adding explicit security controls that the upstream worker lacks.

## Scope

The first release will support:

- `POST /register`
- `GET /register/:device_key`
- `POST /push`
- legacy push routes `/:device_key`, `/:device_key/:body`, `/:device_key/:title/:body`, `/:device_key/:title/:subtitle/:body`
- `GET /ping`
- `GET /healthz`
- `GET /info`
- `device_keys` batch push
- configurable `ROOT_PATH`
- D1 as the only storage backend

Out of scope for the first release:

- KV backend
- MCP endpoints
- MySQL or BoltDB compatibility
- Admin UI
- Complete `Finb/bark-server` parity outside the listed endpoints

## Recommended Approach

Use `cwxiaos/bark-worker` as the deployment and protocol skeleton, but restructure the implementation into focused modules instead of extending the current single-file design. This keeps Workers deployment simple while making the code auditable and easier to maintain.

Alternative approaches considered:

1. Patch the existing single-file worker directly
   - Fastest, but preserves brittle structure and hidden security regressions.
2. Rebuild from `Finb/bark-server` semantics on Workers
   - Cleanest from an API perspective, but too much work for the required personal-use feature set.

The chosen approach is the middle path because it balances delivery speed, maintainability, and security.

## Architecture

The Worker will be split into modules:

- `src/index.js` for the Worker entry point
- `src/config.js` for environment variable parsing and validation
- `src/routes.js` for request dispatch and route matching
- `src/auth.js` for Basic Auth and registration code validation
- `src/db.js` for D1 access helpers
- `src/apns.js` for APNs JWT generation and push delivery
- `src/handlers/*.js` for endpoint logic
- `src/utils.js` for parsing, validation, and response helpers

This structure keeps request parsing, auth, persistence, and APNs concerns separate.

## Storage Design

The Worker will use D1 with three tables:

### `devices`

- `device_key` unique
- `device_token`
- `status`
- `created_at`
- `updated_at`
- `last_registered_at`

### `registration_codes`

- `id`
- `name`
- `code_hash`
- `status`
- `expires_at`
- `max_uses`
- `used_count`
- `created_at`
- `updated_at`

### `auth_cache`

- `id = 1`
- `token`
- `issued_at`

The schema is intentionally small, but leaves room for future controls such as code rotation or device revocation.

## Security Model

The service will be hardened by default:

- `push` and `info` require `BASIC_AUTH`
- `register` requires a dedicated registration code
- `register` also requires `BASIC_AUTH` by default
- `GET /register/:device_key` requires `BASIC_AUTH`
- registration codes are stored hashed, never in plaintext
- APNs credentials are provided through Cloudflare Secrets, not committed in source
- batch push count is capped by configuration
- input fields are length-limited and normalized
- error responses avoid leaking internal details
- device token values are never logged

Registration overwrite protection:

- If `device_key` is omitted, the Worker creates a new one.
- If `device_key` is provided and already exists, the Worker rejects overwrite unless an explicit rebind confirmation field is present and allowed.

This prevents silent takeover of an existing device key.

## API Behavior

### `POST /register`

- Accepts JSON and legacy query-style input
- Requires registration code
- Requires `BASIC_AUTH` by default
- Returns `key` and `device_key`
- Does not return `device_token` by default

### `GET /register/:device_key`

- Returns whether the device key exists
- Does not reveal `device_token`
- Requires `BASIC_AUTH`

### `POST /push`

- Accepts JSON, form-style, query-style, and path-style inputs compatible with Bark use
- Requires `BASIC_AUTH`
- Supports single push and `device_keys` batch push
- Enforces a configurable batch push limit

### Misc

- `GET /ping` stays public
- `GET /healthz` stays public
- `GET /info` requires `BASIC_AUTH`

## Configuration

The Worker will support these environment bindings:

- `BASIC_AUTH`
- `ROOT_PATH`
- `ALLOW_NEW_DEVICE`
- `ALLOW_QUERY_NUMS`
- `REGISTER_CODE_SALT`
- `REGISTER_REQUIRE_BASIC_AUTH`
- `REGISTER_ALLOW_REBIND`
- `MAX_BATCH_PUSH`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_PRIVATE_KEY`
- `APNS_TOPIC`

## Testing Strategy

The implementation will focus on behavior tests around:

- registration code validation
- protected route auth checks
- register success and rejection cases
- legacy and JSON push parsing
- batch push limits
- registration check endpoint behavior
- APNs token caching behavior

The goal is not full integration testing against Apple or Cloudflare, but strong handler-level coverage for the security and protocol boundaries.

## Delivery

The target repository is `https://github.com/jionchen/bark-cworker.git`.

The repository will include:

- the Worker project source
- D1 migrations
- test coverage for core behavior
- a README with a Cloudflare Deploy button
- setup instructions for secrets, D1, and registration code bootstrap
