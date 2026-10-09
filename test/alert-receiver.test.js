import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { loadConfig } from "../src/config.js";

const authorization = `Basic ${Buffer.from("test:password").toString("base64")}`;
const noDatabaseAccess = { prepare() { throw new Error("blocked route accessed database"); } };

test("alert receiver mode is the default", () => {
  assert.equal(loadConfig({}).alertReceiverMode, true);
  assert.equal(loadConfig({ ALERT_RECEIVER_MODE: "false" }).alertReceiverMode, false);
});

for (const path of ["/", "/ping", "/healthz", "/info", "/register/abcdefghij", "/abcdefghij", "/abcdefghij/title/body", "/push/", "/%70ush", "/unknown"]) {
  for (const authenticated of [false, true]) {
    test(`alert receiver mode hides ${path} with auth=${authenticated}`, async () => {
      const response = await worker.fetch(new Request(`https://example.com${path}`, {
        method: "POST", headers: authenticated ? { authorization } : {}
      }), { BASIC_AUTH: "test:password", database: noDatabaseAccess });
      assert.equal(response.status, 404);
    });
  }
}

for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
  test(`alert receiver mode rejects ${method} /push before database access`, async () => {
    const response = await worker.fetch(new Request("https://example.com/push", {
      method, headers: { authorization }
    }), { BASIC_AUTH: "test:password", database: noDatabaseAccess });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
  });
}

test("POST /push still requires auth before database access", async () => {
  for (const credentials of [undefined, "test:password"]) {
    const response = await worker.fetch(new Request("https://example.com/push", { method: "POST" }), {
      BASIC_AUTH: credentials, database: noDatabaseAccess
    });
    assert.equal(response.status, 401);
  }
});

test("authenticated POST /push reaches the device lookup", async () => {
  let queried = false;
  const response = await worker.fetch(new Request("https://example.com/push", {
    method: "POST", headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ device_key: "missingtestdevice", body: "test" })
  }), {
    BASIC_AUTH: "test:password",
    database: { prepare() { return { bind() { return { async first() { queried = true; return null; } }; } }; } }
  });
  assert.equal(response.status, 400);
  assert.equal(queried, true);
  assert.equal((await response.json()).message, "device token invalid");
});

test("alert receiver mode respects ROOT_PATH without enabling other routes", async () => {
  const env = { ROOT_PATH: "/alerts", BASIC_AUTH: "test:password", database: noDatabaseAccess };
  for (const path of ["/push", "/alerts/ping", "/alerts/info", "/alerts/abcdefghij/body"]) {
    assert.equal((await worker.fetch(new Request(`https://example.com${path}`, { method: "POST" }), env)).status, 404);
  }
  assert.equal((await worker.fetch(new Request("https://example.com/alerts/push", { method: "POST" }), env)).status, 401);
});

for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
  test(`alert receiver mode rejects ${method} /register`, async () => {
    const response = await worker.fetch(new Request("https://example.com/register", {
      method, headers: { authorization }
    }), { BASIC_AUTH: "test:password", database: noDatabaseAccess });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
  });
}

test("POST /register still requires auth and a registration code", async () => {
  const env = { BASIC_AUTH: "test:password", database: noDatabaseAccess };
  for (const headers of [{}, { authorization }]) {
    const response = await worker.fetch(new Request("https://example.com/register", {
      method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}"
    }), env);
    assert.equal(response.status, 401);
  }
});
