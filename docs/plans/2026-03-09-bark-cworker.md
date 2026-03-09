# Bark CWorker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a D1-backed Cloudflare Worker Bark service for personal use with secure registration codes, Basic Auth protection, batch push support, and a one-click Cloudflare deployment README.

**Architecture:** Start from the `bark-worker` deployment shape, but split the implementation into small modules for configuration, auth, D1 access, APNs delivery, request parsing, and handlers. Use D1 as the only persistence layer, Cloudflare Secrets for APNs credentials, and handler-level tests to lock down the API and security behavior.

**Tech Stack:** Cloudflare Workers, D1, Wrangler, Node.js test runner, JavaScript ES modules

---

### Task 1: Bootstrap the Worker project structure

**Files:**
- Create: `package.json`
- Create: `wrangler.json`
- Create: `src/index.js`
- Create: `src/config.js`
- Create: `src/utils.js`
- Create: `test/config.test.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";

test("loadConfig applies secure defaults", () => {
  const config = loadConfig({
    ROOT_PATH: "/",
    APNS_TEAM_ID: "team",
    APNS_KEY_ID: "key",
    APNS_PRIVATE_KEY: "pem",
  });

  assert.equal(config.registerRequireBasicAuth, true);
  assert.equal(config.maxBatchPush, 20);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/config.test.js`
Expected: FAIL because `src/config.js` does not exist yet.

**Step 3: Write minimal implementation**

Create the project manifests and minimal `loadConfig` implementation so the Worker can boot with validated defaults.

**Step 4: Run test to verify it passes**

Run: `npm test -- test/config.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json wrangler.json src/index.js src/config.js src/utils.js test/config.test.js
git commit -m "chore: bootstrap worker project"
```

### Task 2: Add D1 schema and storage helpers

**Files:**
- Create: `migrations/001_create_devices.sql`
- Create: `migrations/002_create_registration_codes.sql`
- Create: `migrations/003_create_auth_cache.sql`
- Create: `src/db.js`
- Create: `test/db.test.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRegistrationCodeRecord } from "../src/db.js";

test("normalizeRegistrationCodeRecord rejects disabled codes", () => {
  assert.equal(
    normalizeRegistrationCodeRecord({ status: "disabled" }).usable,
    false,
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/db.test.js`
Expected: FAIL because `src/db.js` does not export the helper yet.

**Step 3: Write minimal implementation**

Add migrations and D1 helpers for:

- device lookup and upsert
- device existence checks
- auth cache get/set
- registration code lookup and usage increment

**Step 4: Run test to verify it passes**

Run: `npm test -- test/db.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add migrations src/db.js test/db.test.js
git commit -m "feat: add d1 storage layer"
```

### Task 3: Implement Basic Auth and registration code validation

**Files:**
- Create: `src/auth.js`
- Create: `test/auth.test.js`
- Modify: `src/config.js`
- Modify: `src/utils.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { verifyRegisterAccess } from "../src/auth.js";

test("verifyRegisterAccess rejects missing registration code", async () => {
  const result = await verifyRegisterAccess({
    request: new Request("https://example.com/register", { method: "POST" }),
    config: { registerRequireBasicAuth: false, registerCodeSalt: "salt" },
    db: {},
    params: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/auth.test.js`
Expected: FAIL because `verifyRegisterAccess` does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- constant-time Basic Auth comparison
- registration code hashing
- disabled / expired / max-use validation
- optional Basic Auth requirement for `/register`

**Step 4: Run test to verify it passes**

Run: `npm test -- test/auth.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/auth.js src/config.js src/utils.js test/auth.test.js
git commit -m "feat: add auth and registration code checks"
```

### Task 4: Implement registration endpoints

**Files:**
- Create: `src/handlers/register.js`
- Create: `test/register.test.js`
- Modify: `src/db.js`
- Modify: `src/auth.js`
- Modify: `src/utils.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { handleRegister } from "../src/handlers/register.js";

test("handleRegister creates a device key when one is not supplied", async () => {
  const response = await handleRegister({
    request: new Request("https://example.com/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_token: "abc123", register_code: "code" }),
    }),
    env: {},
    config: { allowNewDevice: true },
    db: fakeDb,
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.data.device_key);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/register.test.js`
Expected: FAIL because the handler does not exist yet.

**Step 3: Write minimal implementation**

Add:

- `POST /register`
- `GET /register/:device_key`
- legacy query compatibility for register
- explicit rebind confirmation handling
- no device token echo in the default response

**Step 4: Run test to verify it passes**

Run: `npm test -- test/register.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/handlers/register.js src/db.js src/auth.js src/utils.js test/register.test.js
git commit -m "feat: add secure registration endpoints"
```

### Task 5: Implement push parsing and APNs delivery

**Files:**
- Create: `src/apns.js`
- Create: `src/handlers/push.js`
- Create: `test/push.test.js`
- Modify: `src/db.js`
- Modify: `src/config.js`
- Modify: `src/utils.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { parsePushRequest } from "../src/handlers/push.js";

test("parsePushRequest supports device_keys batch input", async () => {
  const result = await parsePushRequest(
    new Request("https://example.com/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hello", device_keys: ["a", "b"] }),
    }),
    "/push",
  );

  assert.deepEqual(result.deviceKeys, ["a", "b"]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/push.test.js`
Expected: FAIL because the parser does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- JSON, form, query, and path-style push parsing
- single and batch push handling
- batch size limit enforcement
- APNs JWT generation from Secrets
- APNs token caching in D1

**Step 4: Run test to verify it passes**

Run: `npm test -- test/push.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/apns.js src/handlers/push.js src/db.js src/config.js src/utils.js test/push.test.js
git commit -m "feat: add push delivery pipeline"
```

### Task 6: Implement info, ping, healthz, and route dispatch

**Files:**
- Create: `src/handlers/info.js`
- Create: `src/handlers/misc.js`
- Create: `src/routes.js`
- Create: `test/routes.test.js`
- Modify: `src/index.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("worker rejects unauthenticated push requests", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/push", { method: "POST" }),
    fakeEnv,
  );

  assert.equal(response.status, 401);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/routes.test.js`
Expected: FAIL because the router and handlers are incomplete.

**Step 3: Write minimal implementation**

Wire the Worker entry point to:

- route requests under `ROOT_PATH`
- enforce auth for push, info, and register-check
- expose ping and healthz publicly
- surface version and device count from info

**Step 4: Run test to verify it passes**

Run: `npm test -- test/routes.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/handlers/info.js src/handlers/misc.js src/routes.js src/index.js test/routes.test.js
git commit -m "feat: add worker routing and info endpoints"
```

### Task 7: Add deployment docs and bootstrap tooling

**Files:**
- Create: `scripts/bootstrap-register-code.mjs`
- Create: `README.md`
- Modify: `package.json`
- Modify: `wrangler.json`
- Create: `test/readme-smoke.test.js`

**Step 1: Write the failing test**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("README includes deploy button", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  assert.match(readme, /deploy\.workers\.cloudflare\.com\/button/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/readme-smoke.test.js`
Expected: FAIL because `README.md` does not exist yet.

**Step 3: Write minimal implementation**

Document:

- one-click deploy button for `jionchen/bark-cworker`
- required D1 binding and secrets
- registration code bootstrap steps
- secure first-run recommendations

Also add a small local script to hash and insert the first registration code.

**Step 4: Run test to verify it passes**

Run: `npm test -- test/readme-smoke.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/bootstrap-register-code.mjs README.md package.json wrangler.json test/readme-smoke.test.js
git commit -m "docs: add deployment and setup guide"
```

### Task 8: Verify the full project and prepare for push

**Files:**
- Modify: `docs/plans/2026-03-09-bark-cworker.md`

**Step 1: Run focused tests**

Run: `npm test -- test/config.test.js test/db.test.js test/auth.test.js test/register.test.js test/push.test.js test/routes.test.js test/readme-smoke.test.js`
Expected: PASS

**Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Run Wrangler validation**

Run: `npm run cf-typegen`
Expected: PASS or type generation output without config errors

**Step 4: Review git status**

Run: `git status --short`
Expected: empty output

**Step 5: Commit final polish**

```bash
git add .
git commit -m "feat: ship secure bark worker"
```
