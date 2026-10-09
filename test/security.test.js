import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { handleRegister } from "../src/handlers/register.js";
import { loadConfig } from "../src/config.js";

const auth = { authorization: `Basic ${Buffer.from("test:password").toString("base64")}` };

for (const path of ["/push", "/abcdefghij/body", "/info", "/register/abcdefghij"]) {
  test(`missing BASIC_AUTH denies ${path} before database access`, async () => {
    const response = await worker.fetch(new Request(`https://example.com${path}`, {
      method: path === "/push" ? "POST" : "GET", headers: auth
    }), { ALERT_RECEIVER_MODE: "false", database: { prepare() { throw new Error("unexpected query"); } } });
    assert.equal(response.status, 401);
  });
}

test("device count is private by default", () => {
  assert.equal(loadConfig({}).allowQueryNums, false);
});

for (const asyncFailure of [false, true]) {
  test(`worker hides ${asyncFailure ? "asynchronous" : "synchronous"} internal errors`, async () => {
    const response = await worker.fetch(new Request("https://example.com/info", { headers: auth }), {
      ALERT_RECEIVER_MODE: "false", BASIC_AUTH: "test:password", ALLOW_QUERY_NUMS: "true",
      database: { prepare() {
        if (!asyncFailure) throw new Error("sensitive database details");
        return { first: async () => { throw new Error("sensitive database details"); } };
      } }
    });
    assert.equal(response.status, 500);
    assert.equal((await response.json()).message, "Internal Server Error");
  });
}

async function register({ existing = null, config = {}, fields = {}, saved = [] } = {}) {
  return handleRegister({
    request: new Request("https://example.com/register", {
      method: "POST", headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ device_key: "abcdefghij", device_token: "newtoken", register_code: "testcode", ...fields })
    }),
    config: { ...loadConfig({ BASIC_AUTH: "test:password" }), ...config },
    db: {
      getRegistrationCodeByHash: async () => ({ id: 1, status: "active", max_uses: 10, used_count: 0 }),
      getDeviceByKey: async () => existing,
      registerDevice: async (device) => { saved.push(device); return true; }
    }
  });
}

for (const flag of ["rebind", "confirm_rebind"]) {
  test(`client ${flag}=1 cannot override server rebind restriction`, async () => {
    const saved = [];
    const response = await register({ existing: { device_token: "oldtoken" }, fields: { [flag]: "1" }, saved });
    assert.equal(response.status, 409);
    assert.equal(saved.length, 0);
  });
}

test("new device restriction also applies to client-supplied keys", async () => {
  const saved = [];
  assert.equal((await register({ config: { allowNewDevice: false }, saved })).status, 403);
  assert.equal(saved.length, 0);
});

test("existing device can refresh when new registration is disabled", async () => {
  assert.equal((await register({ existing: { device_token: "newtoken" }, config: { allowNewDevice: false } })).status, 200);
});

test("server may explicitly enable rebinding", async () => {
  assert.equal((await register({ existing: { device_token: "oldtoken" }, config: { registerAllowRebind: true } })).status, 200);
});

for (const basicAuth of [undefined, "", "   "]) {
  test(`registration requires configured BASIC_AUTH: ${JSON.stringify(basicAuth)}`, async () => {
    assert.equal((await register({ config: { basicAuth } })).status, 401);
  });
}

test("authenticated info omits device count by default", async () => {
  const response = await worker.fetch(new Request("https://example.com/info", { headers: auth }), {
    ALERT_RECEIVER_MODE: "false", BASIC_AUTH: "test:password", database: { prepare() { throw new Error("count must not be queried"); } }
  });
  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(await response.json(), "devices"), false);
});

test("configuration error returns generic internal error", async () => {
  const response = await worker.fetch(new Request("https://example.com/ping"), { MAX_BATCH_PUSH: "0" });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).message, "Internal Server Error");
});

test("register returns a conflict if transaction denies stale access", async () => {
  const response = await handleRegister({
    request: new Request("https://example.com/register", {
      method: "POST", headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ device_token: "token", register_code: "testcode" })
    }),
    config: loadConfig({ BASIC_AUTH: "test:password" }),
    db: {
      getRegistrationCodeByHash: async () => ({ id: 1, status: "active", max_uses: 1, used_count: 0 }),
      getDeviceByKey: async () => null,
      registerDevice: async () => false
    }
  });
  assert.equal(response.status, 409);
});
